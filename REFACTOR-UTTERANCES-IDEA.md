# Refactor Idea — Consolidate Utterance Timers Into a Single Scheduler

## The problem

Every utterance currently schedules its whole sequence up front as a swarm of
independent `setTimeout` callbacks. In `Sound.js doUtterance()`:

```js
for (const step of utterVariablesObj.utterSequence) {
    setTimeout(() => { … fire one note/cc/done … }, step.delay);
}
```

A single song is typically a dozen-to-several-dozen steps (notes + a CC roughly
every 15 ms + one `done`). So one swimbot uttering = tens of timers. The `RADIAL`
preset deliberately makes ~30 bots utter at once → **hundreds to low-thousands of
timers queued in a burst**, all firing their callbacks on the single main JS
thread, interleaved with the simulation tick, canvas rendering, and input
handling. That contention is what locks up the audio and visuals.

Two findings make this worse than it looks:

1. **`WEB_MAXIMUM_VOICES` does not help.** The voice cap only short-circuits the
   three `if (voice)` lines (audio-node work, which mostly runs off-thread on the
   Web Audio rendering thread anyway). The `setTimeout` loop, the ripple
   `onNoteEmit`, and the `NOTE_HISTOGRAM`/`NOTE_COUNT`/`MOD_COUNT` bumps still run
   for every throttled "silent" voice. Clamping voices to 3 leaves the timer
   storm fully intact.

2. **Out-of-view bots still schedule timers.** `doUtterance` is called
   unconditionally at `GenePool.js:1875` (outside the `if (isInView)` block). An
   off-screen utterance skips audio and ripples but *still* schedules its full
   timer sequence purely to bump stat counters inside each callback.

### Latent bug to fix along the way

`getUtterSequence()` (`Swimbot.js:1408`) returns `_phenotype.utterSequence` **by
reference**, and `doUtterance` writes back into it:

```js
step.velocity = Math.max(20, step.velocity - UTTER_ATTENUATION);
```

This permanently mutates the bot's stored song — every utterance while zoomed out
ratchets that bot's note velocities down toward 20 and they never recover. The
refactor must compute the attenuated velocity into a local and never write back to
the shared step.

---

## Goal & design principles

- Replace N-timers-per-utterance with **one central queue walked once per frame**.
- Make "silent" and off-screen utterances nearly free.
- Give the system **breathing room**: when too much is happening at once, shed
  load gracefully (cap concurrency / events per frame) instead of letting timer
  callbacks starve the sim and render loop.
- **Do not change the utterance contract** (`{delay,type,note,velocity,duration,
  cc,value}`, absolute-ms `delay`, sorted ascending, exactly one `done`). The
  generator (`generateUtterancePhenotypes`) and the synth (`Synth.js`) stay
  untouched. Only *how we consume the sequence* changes.

> Note on "thread": JS is single-threaded on the main side. We are not spawning a
> worker thread — we are replacing a flood of timer callbacks with a single
> per-frame walk of an in-memory queue. (Web Worker and Web-Audio-lookahead
> alternatives are discussed at the end and intentionally not recommended for the
> stated goal.)

---

## Recommended architecture: a per-frame utterance pump

### 1. State (owned by `Sound.js`)

```js
let _activeUtterances = [];   // live utterance records; one per sounding/visible bot

// record shape:
// {
//   voice,        // formant voice handle, or null (throttled / silent)
//   seq,          // reference to the bot's utterSequence (read-only here)
//   cursor,       // index of next unfired step
//   startTime,    // performance.now() captured at enqueue
//   onNoteEmit,   // ripple callback, or null when off-screen
//   audible,      // voice !== null  (priority hint)
// }
```

### 2. `doUtterance` becomes *enqueue*, not *schedule*

```js
this.doUtterance = function (u, callerFunction) {
    if (!SwimbotSynth.isReady() || _runningFast) return;

    const playAudio = u.swimbotInView && SOUND_OUTPUT_UTTER;

    // ---- Fast path: no audio AND no visuals → stats only, no record, no timers.
    // (This is every off-screen utterance — the bulk of RADIAL's load.)
    if (!playAudio && !u.onNoteEmit) {
        _tallyStatsOnly(u.utterSequence);   // single tight loop over the steps
        return;
    }

    const voice = playAudio
        ? SwimbotSynth.createVoice(u.panValue, u.swimbotID)   // may return null (cap)
        : null;

    // Concurrency cap — refuse to enqueue beyond UTTER_MAX_CONCURRENT.
    if (_activeUtterances.length >= UTTER_MAX_CONCURRENT) {
        if (voice) voice.dispose();
        _tallyStatsOnly(u.utterSequence);   // still count it for the stats panel
        return;
    }

    _activeUtterances.push({
        voice,
        seq:        u.utterSequence,
        cursor:     0,
        startTime:  performance.now(),
        onNoteEmit: u.onNoteEmit || null,
        audible:    voice !== null,
    });
};
```

`_tallyStatsOnly` walks the sequence once and increments `NOTE_HISTOGRAM` /
`NOTE_COUNT` / `MOD_COUNT` exactly as the old per-step callbacks did — but with
zero timers and zero deferral. Off-screen utterances collapse from "tens of
timers" to "one synchronous loop."

### 3. The pump — walked once per frame

```js
this.tickUtterances = function (now) {       // now = performance.now()
    let eventsThisFrame = 0;

    for (let i = _activeUtterances.length - 1; i >= 0; i--) {
        const a = _activeUtterances[i];
        const elapsed = now - a.startTime;

        // Fire every step whose absolute delay has come due since last frame.
        while (a.cursor < a.seq.length && a.seq[a.cursor].delay <= elapsed) {
            const step = a.seq[a.cursor++];
            _fireStep(a, step);
            if (++eventsThisFrame >= UTTER_EVENTS_PER_FRAME_BUDGET) break;
        }

        // Retire when the sequence is exhausted.
        if (a.cursor >= a.seq.length) {
            if (a.voice) a.voice.dispose();
            _activeUtterances.splice(i, 1);
        }

        if (eventsThisFrame >= UTTER_EVENTS_PER_FRAME_BUDGET) break; // breathing room
    }
};
```

`_fireStep(a, step)` is the body of the old `setTimeout` callback, minus the
shared-array mutation:

```js
function _fireStep(a, step) {
    if (step.type === 'note') {
        const vel = UTTER_ATTENUATION
            ? Math.max(20, step.velocity - UTTER_ATTENUATION)   // local, no write-back
            : step.velocity;
        if (a.voice) SwimbotSynth.playVoiceNote(a.voice, step.note, vel, step.duration);
        if (a.onNoteEmit) a.onNoteEmit(step.note);
        NOTE_HISTOGRAM[step.note % 12]++;
        NOTE_COUNT++;
    } else if (step.type === 'cc') {
        if (a.voice) a.voice.handleCC(step.cc, step.value);
        MOD_COUNT++;
    }
    // 'done' needs no work here — disposal happens when the cursor exhausts seq.
}
```

### 4. Where to hook the pump

One call per frame inside `GenePool.js this.update()`, unconditional (cheap when
the queue is empty), placed *before* the EMA tick-time measurement at
`GenePool.js:1714` so the pump's cost feeds the existing adaptive-LOD signal:

```js
_sound.tickUtterances(performance.now());
```

Driving the queue off `performance.now()` deltas (not frame counts) keeps notes
firing at their correct wall-clock offsets even when frame duration varies.

---

## Timing model & quantization

- Steps fire at the first frame boundary at/after their `delay`. At 60 fps that's
  ≤16 ms of jitter; under load frames are longer, so notes fire a little late —
  but **in order**, and the system never blocks. `WEBAUDIO.md` / `CLAUDE.md`
  already note that the old `setTimeout` path jitters under load, so this is no
  worse and is now *bounded and self-throttling* instead of unbounded contention.
- Because we compare against `now - startTime` (absolute), drift does not
  accumulate across a sequence — each step is scheduled against the utterance's
  own origin, not the previous step.

---

## Breathing room — the headline feature

Two simple caps, both new constants in `Parameters.js`:

| Constant | Meaning | Effect when exceeded |
|---|---|---|
| `UTTER_MAX_CONCURRENT` | Max simultaneous active utterance records | New utterances are tallied for stats but not enqueued (no audio/ripples). A *cohort* cap, unlike the per-voice `WEB_MAXIMUM_VOICES`. |
| `UTTER_EVENTS_PER_FRAME_BUDGET` | Max note/cc events fired per frame across all utterances | Remaining due steps wait for the next frame (slightly late, never dropped silently). Bounds the per-frame spike. |

This is the real fix for RADIAL: instead of 30 songs each detonating their timers
simultaneously, the pump meters the work out across frames and caps how many songs
can be live at once — leaving the sim and renderer room to run.

### Priority (optional, phase 2)

When over budget, prefer keeping **audible in-view** utterances responsive over
**silent/off-screen** ones. Since off-screen ones already take the stats-only fast
path and never enter the queue, the queue is implicitly all-audible/visible — so a
single concurrency cap may be enough. Add tiered eviction only if profiling says so.

### Adaptive budget (optional, phase 2)

`GenePool.js` already maintains `_emaTickMs` for adaptive LOD. The
`UTTER_EVENTS_PER_FRAME_BUDGET` could scale down as `_emaTickMs` rises toward
`LOD_FRAME_BUDGET_DROP_MS`, mirroring the existing LOD philosophy (fast shed, slow
restore). Worth doing only if the fixed budget proves too blunt.

### Note-bunching guard (optional)

If a long frame leaves multiple *notes* overdue on one utterance, firing them all
at once makes an unmusical cluster. Optional refinement: per utterance, fire all
due CCs but only the most-recent overdue note, skipping older ones. Keep CCs
last-wins (cheap, harmless). Start without this; add if clusters are audible.

---

## What stays unchanged

- `generateUtterancePhenotypes` and the whole gene→sequence pipeline.
- `Synth.js` (`createVoice` / `playVoiceNote` / `handleCC` / `dispose`) — the pump
  calls the exact same API the timers did.
- `UtteranceRenderer` — still driven by `onNoteEmit`; ripples now originate from
  the pump at frame time instead of from a timer, behaviorally equivalent.
- `doUtterance`'s call site and signature in `GenePool.js`.

---

## Migration phases

1. **Add the scheduler, keep behavior identical.** Introduce `_activeUtterances`,
   rewrite `doUtterance` to enqueue, add `tickUtterances`, wire the one call in
   `update()`. No caps yet (set budget/concurrency very high). Fix the
   velocity-mutation bug here (local `vel`, no write-back). Verify a single bot
   sounds and ripples exactly as before.
2. **Add the stats-only fast path** for `!playAudio && !onNoteEmit`. Verify the
   stats panel still totals the whole pool and off-screen bursts stop scheduling.
3. **Add `UTTER_MAX_CONCURRENT` + `UTTER_EVENTS_PER_FRAME_BUDGET`.** Tune against
   RADIAL until the lockup is gone with acceptable musical density.
4. **(Optional) adaptive budget / note-bunching guard** if needed after profiling.

---

## Edge cases & open questions

- **Bot dies mid-utterance.** Today the timers keep firing into the (eventually
  disposed) voice; `_utteranceRenderer.stop(s)` already runs on death. In the new
  model the record finishes on its own. If we want hard cancellation on death, add
  a `swimbotID` to the record and a `cancelUtterance(id)` the death path calls —
  minor, optional.
- **Restart while uttering.** `_markedForUtteringSound[s]` already prevents
  re-trigger until the bot stops uttering; the queue does not change that.
- **Non-rendering mode.** When `_rendering` is false, `isInView` is always false →
  every utterance takes the stats-only fast path → the queue stays empty and the
  pump is a no-op loop. Correct and cheap.
- **Pump cost feeding `_emaTickMs`.** Intentional — utterance work is real tick
  cost and should influence adaptive LOD.

---

## Alternatives considered (and why not, for now)

- **Web Worker queue.** A real second thread can't touch the Web Audio voices or
  the canvas, and the bottleneck is main-thread *callback contention*, not raw
  compute. A worker would add postMessage overhead without removing the work that
  actually has to happen on the main thread. Over-engineered for this goal.
- **Web Audio lookahead scheduler** (Chris Wilson's "A Tale of Two Clocks":
  schedule audio events slightly ahead against `audioCtx.currentTime`). This is
  the gold standard for *sample-accurate* timing and could layer on top of the
  pump later if we ever want rock-solid rhythm. But our goal here is *load
  shedding*, not sub-frame accuracy, and our notes are created dynamically per
  step — the simple per-frame pump delivers the breathing room with far less
  complexity. Keep this in the back pocket as a future enhancement.
