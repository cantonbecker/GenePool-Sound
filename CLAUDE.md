# GenePool Sound — CLAUDE.md

## What This Project Is

**"Darwin's Chorus"** — a browser-based artificial life simulation that generates real-time generative music using the Web Audio API. It is a fork/extension of Jeffrey Ventrella's [GenePool Swimbots](http://swimbots.com) (Commons Clause licensed), significantly expanded with a sophisticated sound layer by Canton Becker.

The concept: evolving digital creatures called **swimbots** live, eat, reproduce, and die in a simulated pool. Every biological event (birth, death, eating, mating) triggers sounds — vocal formant synthesis for utterances, sample playback for events — turning natural selection into an evolving musical composition. The project is titled "Darwin's Chorus."

## Core Architecture

### Entry Point
- `index.html` — loads all scripts, instantiates `GenePool`, sets up the canvas

### Simulation Layer (`simulation/`)
| File | Purpose |
|------|---------|
| `GenePool.js` | Top-level simulation controller; simulation start modes, main loop |
| `Pool.js` | The 8000×8000 virtual world; boundary/collision, rendering |
| `Swimbot.js` | Individual creature: physics, behavior, rendering coordination |
| `Brain.js` | Finite state machine (resting → looking for mate → pursuing mate → looking for food → pursuing food → fleeing predator, etc.) |
| `Genotype.js` | 256-gene genome; 25 named presets (Darwin, Wallace, Mendel, Turing, Margulis, Dawkins, etc.); mutation/crossover |
| `Embryology.js` | Gene→phenotype translation (body part dimensions, frequencies, phases, colors, branch angles, etc.) |
| `SwimbotRenderer.js` | Canvas drawing of segmented swimbot bodies |
| `SwimbotTypes.js` | Constants: attraction types, body part indices, timer constants |
| `FoodBit.js` | Food pellets swimbots eat to gain energy |
| `Camera.js` | Zoom/pan viewport into the large pool |
| `ViewTracking.js` | Camera following logic |
| `PhyloTree.js` | Tracks species emergence and extinction over time |
| `FamilyTree.js` | Individual lineage tracking |
| `Obstacle.js` | Environmental obstacles |
| `MathConstants.js` | Shared math constants (ZERO, ONE, ONE_HALF, etc.) |
| `Parameters.js` | All performance/tuning constants (MAX_SWIMBOTS=300, INITIAL_NUM_SWIMBOTS=150, food rates, audio mixer defaults, etc.) |
| `Utility.js` | Shared utility functions |
| `Vector2D.js` | 2D vector math |
| `Sound.js` | **The sound system** — event dispatch, utterance scheduling, tonal system (see below) |
| `UtteranceRenderer.js` | Particle/ripple visual effects when a swimbot "speaks". Central colored puff + one ripple per MIDI note (`emitNote(id, note)`), throttled by `MIN_CYCLES_BETWEEN_RIPPLES` so staccato bursts don't flood the particle pool. Each ripple's bumps/size/lifespan/brightness reflect that note's own pitch. |
| `Touch.js` | Touch input handling |

### Synth Layer (`synth/`)
| File | Purpose |
|------|---------|
| `Synth.js` | **SwimbotSynth** module — Web Audio engine: vocal formant synthesis, sample playback, crossfade loops, reverb convolver (see `WEBAUDIO.md`) |
| `demo.html` | Original self-contained formant-synth proof of concept; hear the formant chain in isolation, no swimbot plumbing |
| `testbed.html` | **Utterance workbench** — loads the real simulation stack (Genotype, Embryology, Sound.js, SwimbotSynth), composes a real utterance from a chosen preset genome (or fresh random swimbot), and plays it through an actual formant voice. Live mixer + CC knob sliders and a sustained-note repeater. Use this for iterating on formant DSP without launching the full app. |
| `sounds-birth/` | 3 one-shot WAV samples for birth events (`birth.wav`, `birth-filtered.wav`, `birth-phased.wav`) |
| `sounds-death/` | 5 one-shot WAV samples for death events |
| `sounds-eat/` | Pool of eat samples; the catalog currently preloads just `tuned-click.wav` (other WAVs in the folder are unreferenced spares for future variety) |
| `sounds-spawn/` | 9 one-shot WAV samples used in the q*bert-style two-syllable spawn vocalization |
| `sounds-presets/` | UI sounds: 5 preset-launch samples (`start-q/w/e/r/t`) + `pop-start.wav` |
| `sounds-loops/` | 3 background loop WAVs: `bell-drone`, `reaktor-drone`, `sample-lake-bacalar` (all crossfade-looped) |
| `impulse-responses/` | Convolution reverb IRs (EMT 140 variants, echo hall, tunnel) |

### UI Layer (`js/`)
| File | Purpose |
|------|---------|
| `ui.js` | Developer panel, preset buttons, gene tweakers, camera nav controls, Audio tab mixer, pointer lock / fullscreen |
| `info.js` | In-app info/tutorial text (28 pages) |
| `saveLoad.js` | Save/load swimbots and pools (file and preset modes) |
| `graph.js` | Population graph (basic beige style, in the Graph panel) |
| `swimbotStats.js` | **Swimbot Statistics** overlay — canvas-based histograms for utterance genes, scatter plot, pitch-class bar chart, dual-axis population history. `SwimbotStats` IIFE with auto-refresh (default 2s). All charts reset on preset launch. |
| `utteranceLogger.js` | PNG snapshot logger for the stats panel — saves canvas charts to disk on a timer |

---

## The Sound System

Sound is what makes this fork unique. Everything runs through the Web Audio API — no external MIDI hardware or software required. The system has two layers:

### SwimbotSynth (`synth/Synth.js`)

The audio engine. A self-contained IIFE module exposing the `SwimbotSynth` global. Three playback systems plus a shared convolution reverb:

- **Vocal formant synthesis** — per-utterance filter chains (see *Formant Voice* below) driven by gene-generated note/CC sequences. Each simultaneous swimbot gets its own independent chain.
- **Sample playback** — preloads all WAV samples at startup. `playSample(name, opts)` for overlapping one-shots (birth, death, eat, spawn, UI). Fire-and-forget `BufferSource` nodes that clean themselves up via `onended`.
- **Crossfade loops** — background ambience via `startLoop()`. Since samples aren't seamless, copies overlap with 3-second crossfades (normalized 0→1→0 per-copy envelopes through a shared `mixGain` node for real-time volume control). One logical loop at a time.
- **Convolution reverb** — shared `ConvolverNode` with all IRs preloaded into `_irBuffers`. Swappable per-simulation via `setReverbIR(name)` (instant — no fetch). Voices and samples feed the reverb pre-panner so the reverb image stays centered.
- **Voice throttling** — `WEB_MAXIMUM_VOICES` caps simultaneous formant chains; excess `createVoice()` calls return `null` and the utterance plays silently. The Audio panel shows `active / max` with a red tint when throttling kicks in.

Full signal-chain diagrams and public-API reference in **`WEBAUDIO.md`**.

#### Formant Voice — the utterance instrument

`SwimbotSynth.createVoice(panValue, swimbotID)` returns `{ preEmphasis, handleCC, dispose }`. Sound.js holds one voice per utterance for the whole sequence, then calls `dispose()` at the `'done'` step.

**Per-voice signal chain** (allocated by `_createVoice`):

```
                                                         ┌─ panner ─→ masterGain  (panned dry out)
preEmphasis(HPF~60Hz) → [F1 BPF→gain]                    │
                      → [F2 BPF→gain] → formantMixer → trebleFilter(highshelf @3.2 kHz)
                      → [F3 BPF→gain]                    │
                                                         └─→ reverbBus  (pre-pan, centered wet send)
```

**Per-note** (`_playVoiceNote(voice, note, velocity, durationMs)` — internal; called via `playVoiceNote`):
- **Pitched sources**: three `OscillatorNode`s — sawtooth, triangle, sine — built per note and blended via CC17 in an equal-power three-station crossfade (0 = pure saw, 0.5 ≈ triangle, 1 = pure sine; only two adjacent stations are active at any value). Each routes through its own per-note `GainNode` envelope → `voice.preEmphasis`.
- **Noise source** (only when CC14 noiseMix > 0.001): a shared white-noise `BufferSource` (looped, created once at init in `_noiseBuffer`) → per-note `BandpassFilter` (centre clamped to `freq × 4` between 180 Hz and 6 kHz, Q = 0.8 + 5 × `f2ResNorm`) → short envelope (3 ms attack / 18 ms sustain / 8 ms release) → `voice.preEmphasis`. The noise is pitch-tracked to the current note and threaded through the same formant chain as the pitched sources.
- Frequency: `noteToFrequency(note - 12)`. The `-12` is intentional — formant curves are calibrated for that transposed range.
- Envelope (pitched): 200 ms linear attack → sustain for `durationMs` → 50 ms linear release. Hard-coded in `_playVoiceNote`.
- Amplitude: master `amp = (velocity/127) × WEB_AUDIO_VOLUME × WEB_VOLUME_UTTERANCE × 4.0 × wetComp` where `wetComp = 1.15 - _currentWetLevel`. The ×4.0 compensates for narrow bandpass attenuation; `wetComp` boosts dry / cuts wet so loudness stays stable across zoom-driven reverb changes. `amp` is then split into pitched (`sawAmp = amp × cos(noiseMix × π/2)`) and noise (`amp × √noiseMix × 7.5 × (0.55 + 0.9 × f3GainNorm)`) energies.

**CC routing** — `voice.handleCC(cc, value)`. Each handler closes over only this voice's nodes:
- **CC 14 — Noise Mix**: crossfades a pitch-tracked white-noise burst into the formant chain. Stored as `ccState.noiseMix` (0–1); applied per note inside `_playVoiceNote` rather than as a live AudioParam. 0 = pitched only, 127 = noise dominant (sawtooth contribution ducks to zero via the cos curve).
- **CC 15 — Mouth** (the main vowel control): drives all three formant frequencies through piecewise-linear curves (`WA_FORMANT_CURVES`, derived from a Reaktor *"swimbot Vowels.ens"* patch). 15 ms smoothing via `setTargetAtTime`.
- **CC 16 — Size**: high-shelf treble boost at 3.2 kHz, 0–10 dB above value 80; below that, flat.
- **CC 17 — Tone**: pitched-oscillator mix — equal-power crossfade across saw → triangle → sine. Stored in `ccState.oscMix`; applied per note inside `_playVoiceNote`.
- **CC 19 — F2 Resonance**: F2 bandpass Q via `resToQ` (Q=2 wide → Q=25 narrow). Input is clamped to ≤70 before normalising.
- **CC 20 — F3 Gain**: scales the third formant's mix gain.

`dispose()` disconnects every per-voice node and decrements `_activeVoices`. Always invoked at the `'done'` step.

**Public API surface relevant to utterance work:**
- `initialize()`, `isReady()` — boot
- `createVoice(panValue, swimbotID)` → voice handle (or `null` if throttled)
- `playVoiceNote(voice, noteNumber, velocity, durationMs)` — schedule a note now
- `playSample(name, options)` — one-shots
- `startLoop(name, options)` / `stopLoop()` — background ambience
- `setReverbWet(level)` / `setReverbIR(name)` — reverb control
- `getActiveVoices()` / `getLoadingStatus()` — diagnostics

### Sound Coordinator (`simulation/Sound.js`)

The dispatch layer. Connects simulation events to the synth engine and owns the utterance-sequence generator.

- **`doSwimbotSoundEvent(type, eventIndex?)`** — plays one-shot samples for eat/birth/death/spawn/launch events, selecting randomly from the sample pool for each category, with note-shift varispeed (`semitones` option to `playSample`) drawn from the current `NOTE_INTERVAL_SET`. BIRTH applies a zoom-attenuation curve (0.90 zoomed in → 0.50 zoomed out). EAT uses `reverbSend: 3.0` so eating sounds sit much wetter than other events. SPAWN plays a quieter birth seed plus two back-to-back random spawn samples 220 ms apart.
- **`doUtterance(utterVariablesObj, callerFunction)`** — the utterance playback engine. Steps:
  1. Creates one voice via `SwimbotSynth.createVoice(panValue, swimbotID)` (only if in-view + `SOUND_OUTPUT_UTTER`; otherwise `voice = null` and audio is skipped but stats still accumulate).
  2. Walks `utterVariablesObj.utterSequence` and schedules a `setTimeout(..., step.delay)` for each event. The whole sequence is queued up-front; timing is browser-`setTimeout`-driven (jitter visible under load — see *Bridging audio to visuals* below).
  3. On `'note'`: applies `UTTER_ATTENUATION` (zoom-based velocity cut), calls `playVoiceNote(voice, step.note, step.velocity, step.duration)`, then fires `utterVariablesObj.onNoteEmit?.(step.note)` for the ripple bridge, then updates `NOTE_HISTOGRAM` / `NOTE_COUNT`.
  4. On `'cc'`: routes to `voice.handleCC(step.cc, step.value)` (see CC routing above), updates `MOD_COUNT`.
  5. On `'done'`: calls `voice.dispose()` — releases the formant chain. There's exactly one `'done'` per sequence, placed `lastNote.delay + lastNote.duration + 300ms` after the final note to allow envelope release.
- **`setGlobalParameters(p0, p1, p2, p3, rendering)`** — called every `SOUND_UPDATE_PERIOD` ticks. Maps camera zoom (`p3`, ~500–8000) to `CURRENT_ZOOM_PERCENTAGE`, drives `UTTER_ATTENUATION`, sets reverb wet via `SwimbotSynth.setReverbWet()`, manages background loop start/stop, drifts the tonal center on the circle-of-fifths, and decays `NOTE_HISTOGRAM` periodically.
- **`generateUtterancePhenotypes(genes, geneNames, utterPeriod, utterDuration)`** — Markov-chain composer; called from `Embryology.js` at birth. Genes seed `aleaPRNG` so songs are deterministic and heritable. Returns `{ sequenceData, recordNotesUsed, recordHighNote, recordLowNote, recordNoteCount, recordModCount }`. See *Utterance Generation* below.

#### Utterance Sequence Format (the contract)

The output of `generateUtterancePhenotypes` and the input to `doUtterance` is a flat, time-sorted array of typed events. Any change to the synth must preserve this contract:

```js
sequenceData = [
  { delay: 10,   type: 'cc',   cc: 14, value: 96 },   // initial CC setup (CC14, 15, 16, 17, 19, 20)
  { delay: 20,   type: 'cc',   cc: 15, value: 64 },
  …
  { delay: 70,   type: 'note', note: 53, velocity: 95, duration: 120 },
  { delay: 145,  type: 'cc',   cc: 15, value: 78 },   // mid-sequence modulation
  { delay: 200,  type: 'note', note: 55, velocity: 102, duration: 80 },
  …
  { delay: 2480, type: 'done' }                       // exactly one; triggers voice.dispose()
]
```

- `delay` is **absolute ms from utterance start**, not delta. Already sorted ascending before return.
- `note` is MIDI 0–127. Synth transposes `-12` internally.
- `velocity` is 0–127. Synth divides by 127 then multiplies by mixer/master gains.
- `duration` is **ms**, controls the gain-envelope sustain length (not the time until the next note).
- `cc` values currently emitted: 14 (noise mix), 15 (mouth), 16 (size), 17 (tone), 19 (F2 res), 20 (F3 gain). All six are now routed through `voice.handleCC` and affect the sound — see CC routing above.
- The initial CC block in `generateUtterancePhenotypes` seeds the voice's tone *before* the first note. After the random initial roll, three small "adjustment" blocks apply: (1) CC14 quantized into none/little/lot bins; (2) when CC17 < 60 the voice is forced to pure sawtooth with CC14 zeroed and a guaranteed `CC15 + CC16 ≥ 100` re-roll so the formant chain isn't inaudibly thin; (3) for non-sawtooth voices, no such CC15+CC16 floor is enforced — they may sometimes land thin.

#### Bridging audio to visuals

For in-view swimbots, `GenePool.js` attaches `utterVariablesObj.onNoteEmit = note => _utteranceRenderer.emitNote(s, note)` *before* calling `doUtterance`. Each scheduled `setTimeout('note')` step then calls this callback at the moment the note actually plays, so per-note ripples track the audio (subject to `setTimeout` jitter). The renderer's `MIN_CYCLES_BETWEEN_RIPPLES` throttle prevents staccato bursts from flooding the particle pool.

#### Utterance Generation (genes → music)

Six utterance-related genes drive the composer:

| Gene | Range | Effect |
|------|-------|--------|
| `utter duration` | 0–255 | Length of the sequence in clock ticks; `× APPROX_MS_PER_CLOCK` (20ms) ⇒ ~150–3000 ms total |
| `utter spin` | 0–255 | Octave shift: indexes into `[0, 12, 12, 12, 24, 24, 24, 24, 24, 24, 36, 36, 36, 36, 48, 48]` — bell-curveish, fewer basses/sopranos |
| `utter charm` | 0–255 | Markov-matrix mutation factor (0–20, weighted low) — how far the IOI/note probability tables drift from the preset's defaults |
| `utter strangeness` | 0–255 | Chance of jumping ±a fifth on the tonal center (cubic-weighted), chance of mutating intervals |
| `utter flavor` | 0–255 | Note-length scaling — high flavor lengthens all three IOI bands (short/medium/long), pushing toward legato |
| (RNG seed) | — | The genes themselves, sliced `[112, 119)`, are stringified and passed to `aleaPRNG` so the same genome always produces the same song |

Per-sequence randomization on top of the above:
- **Note length style** picked from `['legato', 'staccato', 'staccato', 'complex', 'complex', 'complex']` — controls whether each note's `duration` equals `shortestNoteMs`, fills the inter-onset gap, or varies.
- **Modulation strength + chance**: every `MODULATION_SPEED_MS = 15ms` from the first note onward, an RNG roll may insert a `cc` event tweaking a `variable: true` control. With current settings, the modulated controls are CC15 (mouth), CC16 (size), CC19 (F2 resonance), and CC20 (F3 gain). Each twiddle is ±`modulationStrength` from the control's initial value, bouncing off `variableWidth` walls.
- **Interval rotation**: the active interval set is rotated by `0..2` positions so swimbots don't all start on the same note. Both the previous force-set overrides (`numberOfIntervalRotations = 0` and `mutationFactor = 1`) are currently commented out in `generateUtterancePhenotypes` — the gene-derived values are now in effect.

### Audio Mixer (UI)

The **Audio** tab in the developer panel provides:
- Master volume slider
- Per-category mix sliders: utterances, birth, spawn, death, eating, background loop (birth and spawn are separate channels)
- Max simultaneous voices slider (1–64)
- Live status: active voices, current reverb IR + wet level, active loop, sample/IR loading progress
- Link to open the **Swimbot Statistics** overlay (detailed charts, pitch histogram, population history)

Mixer defaults are set in `Parameters.js` (`WEB_AUDIO_VOLUME`, `WEB_VOLUME_*`, `WEB_MAXIMUM_VOICES`).

### Tonal System
- Base note: `BASE_NOTE = 41` (F2)
- Tonal center drifts around the circle of 5ths every `SECONDS_BETWEEN_UNIVERSAL_NOTE_SHIFT_DEFAULT` seconds via `UNIVERSAL_NOTE_SHIFT` (0 = disabled by default; presets can override)
- Six interval sets in `NOTE_INTERVAL_SETS`: `minor pentatonic`, `pentatonic`, `5ths`, `octaves`, `whole tone`, `12tone` — chosen per preset
- IOI duration bands in `DEFAULT_SEQUENCE_DURATION_STATES`: short `60–80ms`, medium `140–210ms`, long `280–420ms`. Transitioned via `IOI_DURATION_PROBABILITY_MATRIX` (3×3 Markov). `utter flavor` can multiplicatively lengthen all three bands.
- Note transitions via `IOI_NOTE_PROBABILITY_MATRICES` (9×9 — `bell`, `sharp`, `super`, …) — picks the next step in the rotated interval set relative to the previous step
- Per-simulation overrides in `determineCurrentMusicParameters()` — each preset can specify its own interval set, note-probability matrix, IOI duration states, reverb IR, background loop, and `shortestNoteMs`

### Sound Events
- `SOUND_EVENT_TYPE_EAT`, `BIRTH`, `DEATH`, `SPAWN`, `LAUNCH`
- BIRTH/DEATH/EAT all pitch-shift the chosen sample by a random interval drawn from the currently active `NOTE_INTERVAL_SET`; BIRTH additionally applies a zoom-attenuation curve (0.90 zoomed in → 0.50 zoomed out). EAT uses a high `reverbSend: 3.0` so eating sounds are noticeably wetter than other events.
- SPAWN (only triggered by `makeNewRandomSwimbot()`) plays a quieter birth-sample seed followed 220 ms later by two different `spawn-*` samples back-to-back — a "q*bert" style two-syllable vocalization.
- Background loops: `bell-drone`, `reaktor-drone`, `sample-lake-bacalar` (all crossfade-looped). The active loop stops immediately when `GenePool.setRendering(false)` is called, and resumes on the next sound-update tick when rendering is re-enabled.
- Each simulation preset can override reverb IR, loop selection, reverb range, and interval set in `determineCurrentMusicParameters()`.

---

## Key Constants & Tuning (Parameters.js)

```
Version:          (see SWIMBOT_VERSION in Parameters.js)
MAX_SWIMBOTS:     300
INITIAL_BOTS:     150
INITIAL_FOOD:     450
POOL_SIZE:        8000 × 8000 (circular bounce at radius 3750)
MAX_AGE:          40000 clock ticks
GENES_PER_BOT:    256
NUM_PRESETS:      25
UI_UPDATE_PERIOD: 1000ms
AUTOPILOT:        activates after 5 minutes of user inactivity
```

## Deployment
- Nova IDE publishing config: deploys to `https://w3code.com/darwins-chorus/`
- Must be served over HTTP/HTTPS (not file://) — `fetch()` is used for all audio samples and impulse responses
- License: Commons Clause (non-commercial use/distribution only)

## Development Notes
- `DEVELOPER_MODE = true` by default (panel visible on launch)
- `DEBUGGING_NOISY_CONSOLE_MODE = false` (set true for verbose logging)
- Version string lives in `Parameters.js` as `SWIMBOT_VERSION`
- Canton modified genotype preset system in Sept 2025 to auto-generate constants from `PRESET_LIST` array
- `gpRandom()` wraps `Math.random()` with a commented-out seeded PRNG (aleaPRNG) for future reproducibility

### Goal Overlay (toggled with `_renderingGoals`)
- Labels above each swimbot show brain state: 👀 looking for mate, ❤️ pursuing mate, 🍏 looking for food, 🍎 pursuing food. Resting / looking-for-prey / pursuing-prey / fleeing-predator states get no label (intentional — we only flag the goal-directed states we care to read at a glance).
- Mate pursuit labels get a **pair-hashed color** so you can visually spot reciprocal pursuits: if swimbot 5 chases 10 AND swimbot 10 chases 5, both labels are the same color. If 5→10 but 10→15, they get different colors. The color comes from hashing the unordered pair `(min, max)` of the two IDs with two primes, mapped to HSL at full saturation / 75% lightness.
- All goal labels render with a semi-transparent black backdrop for contrast against any swimbot color.
- **Utterance-range circles** are drawn around any currently-uttering swimbot while the overlay is on. Radius = the bot's actual `getUtterRange()`. Stroke color = the bot's mass-weighted `getAverageColor()` (same accessor mate-attraction code uses) so each circle visually associates with its owner; muddy phenotypes get muddy circles.

### Swimbot Statistics Panel (`js/swimbotStats.js`)
- Formerly called "Utterance Statistics" / `utteranceStats.js` — renamed March 2026 because the panel now covers more than just utterances (pitch activity, population history).
- The `SwimbotStats` IIFE accumulates population history every second (via `recordPopulation()` called from `updateUI()`), even when the panel is closed. No charts are rendered while closed — only the lightweight array push runs.
- **All charts zero out when a new preset is launched.** `startSimulation()` calls both `_sound.resetHistogram()` (pitch data) and `SwimbotStats.reset()` (population history). The per-swimbot histograms (timing, range, composition) naturally refresh because they pull live data from the new swimbots.
- Population history chart uses **dual Y-axes**: left axis (red) is fixed 0–`MAX_SWIMBOTS`, right axis (green) is fixed 0–`MAX_FOODBITS`. Each line scales to its own axis independently.
- Default auto-refresh is 2 seconds. Options: 0/2/5/30/60s.

## Performance — Adaptive LOD

HIGH LOD bezier rendering in `SwimbotRenderer.js` (~164–298) is the dominant CPU cost: 300 swimbots × ~8 parts × ~7 canvas draw calls. Selection between HIGH and LOW is **fully adaptive**, driven by measured per-tick wall-clock time. Neither camera zoom nor swimbot count is part of the decision.

`GenePool.js` `this.update()` wraps each tick in `performance.now()`, blends the duration into an EMA (`_emaTickMs`), then:
- **Drop HIGH → LOW** the moment `_emaTickMs` exceeds `LOD_FRAME_BUDGET_DROP_MS` (default 14ms). Decision lives in the render block (one-frame reactive).
- **Raise LOW → HIGH** only after `_emaTickMs` stays under `LOD_FRAME_BUDGET_RAISE_MS` (default 8ms) for `LOD_RAISE_CONFIRM_FRAMES` (default 30 ≈ ½ s) consecutive ticks. Decision lives at the end of `update()`.

Asymmetric hysteresis (fast drop, slow raise) plus the 8–14ms dead zone are the structural guarantee against oscillation at the budget boundary. Self-tuning across hardware and population — a 2-swimbot pool on any machine stays at HIGH forever; a 300-swimbot pool on a slow machine settles at LOW.

Tunables (all in `Parameters.js`): `LOD_FRAME_BUDGET_DROP_MS`, `LOD_FRAME_BUDGET_RAISE_MS`, `LOD_EMA_ALPHA`, `LOD_RAISE_CONFIRM_FRAMES`.

Live readout in the pool-status panel: `Tick: X.Xms` (amber when over budget) + `Budget: 8–14ms`. Exposed via `genePool.getEmaTickMs()` and `genePool.getLevelOfDetail()`.

`Camera.isZooming()` has a separate frame-by-frame chatter-resistant latch (`_scaleShift.active || |_scaleDelta| > ε`, with a 15-frame release grace). It is **no longer an input to LOD selection** but remains available for any other consumer.

**Removed (2026-05-26):** the `LEVEL_OF_DETAIL_THRESHOLD` and `LEVEL_OF_DETAIL_THRESHOLD_WHILE_ZOOMING` constants. The motion-aware zoom-threshold approach turned out to be the wrong signal — fixed thresholds were too coarse for low-population zoom and too strict for high-population idle. Adaptive frame-time replaces both.

## To Do

### Expose CC17 "tone" as a phenotype for `getAttractiveness`

Goal: let mate selection in `Swimbot.js getAttractiveness()` factor in the initial CC17 value (pitched-osc waveform: 0=sawtooth, 127=sine) chosen during `generateUtterancePhenotypes`. Because CC17 is RNG-derived from the utterance genes, it's effectively heritable — comparing it would let timbre-similar swimbots find each other (potential speciation by waveform).

Three plumbing hooks:

1. **`simulation/Sound.js` — `generateUtterancePhenotypes`:** after the Adjustment blocks settle `cc17Control.initialVal`, capture it and add to the returned object:
   ```js
   recordUtterTone: cc17Control.initialVal   // 0=pure sawtooth, 127=pure sine
   ```

2. **`simulation/Embryology.js` (~line 372):** copy onto the phenotype:
   ```js
   phenotype.utterTone = utterancePhenotypeObj.recordUtterTone;
   ```

3. **`simulation/SwimbotTypes.js` (~line 219):** declare the field:
   ```js
   this.utterTone = 0; // initial CC17: 0=sawtooth, 127=sine
   ```

Then in `getAttractiveness` (Swimbot.js), compute a similarity term and either fold it into the blended baseline or add a 4th `utterPreference` camp (e.g. `> .8` → "I like timbre-similar mates"):
```js
const toneSimilarity = 1 - Math.abs(_phenotype.utterTone - judge_phenotype.utterTone) / 127;
```

**Design notes:**
- CC17 distribution is bimodal-ish — roughly half of voices land at 0 (sawtooth) due to the `<60 → 0` quantize, the rest spread 60–127. Comparing on raw value effectively splits the population into "sawtooth tribe" vs. "mixed-tone spread." For sharper tribes, quantize to buckets (saw / mid / sine) before comparing.
- Same genome → same RNG seed → same CC17 roll, so timbre preference creates a real heritable feedback loop.

