# GenePool Sound — Web Audio Engine

All audio in Darwin's Chorus is produced by the browser's Web Audio API. The `SwimbotSynth` module (`synth/Synth.js`) is the sole audio engine — there is no external hardware or software dependency. The formant voice design was originally prototyped as a reconstruction of a Reaktor vocal formant patch; those Reaktor references remain in comments as historical context for the DSP design choices.

**Relevant files:**
- `synth/Synth.js` — the entire synthesizer (`SwimbotSynth` module)
- `simulation/Sound.js` — event dispatch; triggers voices and samples via `SwimbotSynth.*` calls
- `simulation/GenePool.js` — computes stereo pan value before calling `doUtterance()`
- `simulation/Parameters.js` — audio mixer defaults (`WEB_AUDIO_VOLUME`, `WEB_VOLUME_*`, `WEB_MAXIMUM_VOICES`)
- `synth/demo.html` — original standalone proof-of-concept; pure formant synth in isolation, no swimbot/genome plumbing
- `synth/testbed.html` — full utterance workbench. Loads the real simulation stack (`Genotype`, `Embryology`, `Sound.js`, `SwimbotSynth`), generates an utterance from a chosen preset genome (or random), plays it through a real formant voice, and exposes live mixer + CC knob controls plus a sustained-note repeater for tuning the synth without launching the full app

---

## How It All Connects

```
GenePool.js                     Sound.js                        Synth.js (SwimbotSynth)
───────────                     ────────                        ───────────────────────
swimbot eats          ──→  doSwimbotSoundEvent(EAT)    ──→  playSample('eat-NN')
swimbot born          ──→  doSwimbotSoundEvent(BIRTH)  ──→  playSample('birth-NN')
swimbot dies          ──→  doSwimbotSoundEvent(DEATH)  ──→  playSample('death-NN')
swimbot utters        ──→  doUtterance(utterVars)      ──→  createVoice() + playVoiceNote() + handleCC()
every SOUND_UPDATE    ──→  setGlobalParameters()       ──→  setReverbWet() + startLoop() + setReverbIR()
simulation switch     ──→  (via GenePool.js)           ──→  stopAll()
```

All samples and impulse responses are preloaded into memory at startup (`_preloadAllSamples`, `_preloadAllIRs`). Playback is instantaneous — no network requests after initialization.

---

## Architecture

### Lifetime scopes

| Scope | Nodes | Created | Released |
|-------|-------|---------|---------|
| Singleton | `AudioContext`, `masterGain`, `reverbBus`, `reverbConvolver`, `reverbWetGain`, `_utteranceSum`, `_utteranceVolume`, utterance limiter (`DynamicsCompressor` + makeup gain) | `SwimbotSynth.initialize()` | App lifetime |
| Per-utterance | `preEmphasis`, `formantFilters[3]`, `formantGains[3]`, `formantMixer`, `trebleFilter`, `StereoPannerNode` | `SwimbotSynth.createVoice()` | `voice.dispose()` on `'done'` step |
| Per-note | `OscillatorNode`, envelope `GainNode` | `SwimbotSynth.playVoiceNote()` | `osc.onended` callback |
| Per-sample | `BufferSource`, `GainNode` | `SwimbotSynth.playSample()` | `source.onended` callback |
| Per-loop | `BufferSource`, fade `GainNode` → shared `mixGain` | `_launchLoopCopy()` | `source.onended` callback |

### Signal chain (per utterance)

Each note builds three pitched oscillators (saw / triangle / sine) blended via CC17 in an equal-power crossfade, plus an optional CC14-driven noise burst routed through a pitch-tracked bandpass. All paths converge at `preEmphasis` and share the same formant chain.

```
Pitched oscillators (3-station equal-power crossfade via CC17 / oscMix)
  • saw     ┐
  • triangle├─→ env GainNode (200ms attack, 50ms release) ─┐
  • sine    ┘   amplitude derived from sawAmp = amp·cos(noiseMix·π/2)
                                                            │
Noise (only when CC14 / noiseMix > 0.001)                  │
  BufferSource (looped white noise) → BandpassFilter        │
    (freq = clamp(freq·4, 180, 6000), Q = 0.8 + 5·f2ResNorm)│
    → noiseEnv (3ms attack, 18ms sustain, 8ms release)      │
                                                            │
                                                            ▼
                                                preEmphasis (HPF 60 Hz, Q 0.4)
                                                            │
                          ┌─ formantFilter[0] (bandpass) → formantGain[0] ┐
                          ├─ formantFilter[1] (bandpass) → formantGain[1] ├─→ formantMixer
                          └─ formantFilter[2] (bandpass) → formantGain[2] ┘
                                                            │
                                       trebleFilter (highshelf 3200 Hz, CC16-driven)
                                                            │
                                                  StereoPannerNode (per-voice)
                                                            │
                                                            ▼
                          _utteranceSum  ◀── (all live voices sum here)
                                                            │
                       ┌────────────────────────────────────┴───────────────────┐
                       │ limiter ON                                  limiter OFF  │
            DynamicsCompressor → makeup GainNode                    (direct)      │
                       └────────────────────────────────────┬───────────────────┘
                                                            ▼
                                          _utteranceVolume  (= WEB_AUDIO_VOLUME × WEB_VOLUME_UTTERANCE)
                                                            │
                                                            ├─→ masterGain → destination          (panned dry)
                                                            └─→ reverbBus (shared) → reverbConvolver → reverbWetGain → destination  (wet)
```

Practical implication: when CC14 noise mix is high, the sawtooth contribution drops (cos curve) and a short, percussive noise burst is added per note; when CC17 sweeps toward 127, the pitched output morphs from saw → triangle → sine via equal-power stations.

**Utterance submix (`_utteranceSum` → limiter → `_utteranceVolume`):** every live voice sums into `_utteranceSum`, which feeds an optional brickwall limiter and then `_utteranceVolume`. Two consequences: (1) the limiter only ever touches utterances — background loops and one-shot samples bypass it (they go straight to `masterGain`), so utterance bursts can't duck/"huff" the loop; (2) the master + utterance volume faders are applied *post-limiter* on `_utteranceVolume`, so they stay effective even while the limiter is compressing. See *Loudness Normalization & Limiter* below.

### Signal chain (one-shot samples)

```
BufferSource → GainNode (category vol × master vol) → masterGain → destination
                                                    → reverbBus (optional)
```

### Signal chain (background loops)

```
BufferSource → fade GainNode (0→1→0 normalized) ─┐
BufferSource → fade GainNode (0→1→0 normalized) ─┤→ mixGain (adjustable) → masterGain → destination
  (overlapping copies during crossfade)           │                       → reverbBus (optional)
```

**Key design decisions:**
- The `StereoPannerNode` is after the formant chain but *before* `_utteranceSum`, so each voice has independent stereo placement.
- The utterance reverb send is taken *post-fader* from `_utteranceVolume` (after the panner, limiter, and volume), so the reverb of an utterance is limited and faded exactly like its dry signal. (Historically the send was pre-pan from `trebleFilter` for a centered reverb image; that was changed when the limiter moved onto the utterance submix.)
- Background loops use a crossfade strategy: since the WAV samples have natural fade-in/fade-out (not seamless zero-crossing loops), a new copy is launched before the current one ends, with 3-second overlapping fades. All copies route through a shared `mixGain` node so volume can be adjusted in real time.

---

## Formant Synthesis

The voice imitates a vowel-morph synth. Three bandpass filters with frequencies driven by piecewise-linear curves (`_ctrlShp2`) reconstruct F1, F2, F3 formants. The original design was prototyped from a Reaktor "swimbot Vowels.ens" patch.

### Formant breakpoints (pitch values at mouth positions 0% / 33% / 66% / 100%)

| Formant | 0% | 33% | 66% | 100% |
|---------|-----|-----|-----|------|
| F1 | 52.5 | 77.5 | 75.8 | 52.5 |
| F2 | 96.9 | 92.9 | 85.8 | 79.8 |
| F3 | 103.4 | 98.4 | 97.6 | 95.6 |

Base resonances: `[0.93, 0.96, 0.98]` → Q via `2 + r×23` (Q≈22–24).
Mix gains: F1=1.0, F2=0.55, F3=0.3.

### CC mapping (per-voice, applied via `voice.handleCC(cc, value)`)

| CC | Name | Effect |
|----|------|--------|
| 14 | Noise Mix | Crossfades a pitch-tracked white-noise burst into the formant chain (0 = pure pitched, 127 = pitched osc duck off, noise dominant). Stored in `ccState.noiseMix`; applied on each `_playVoiceNote` rather than as a live AudioParam. |
| 15 | Mouth | Morphs all three formant frequencies through the breakpoint curves (15ms smoothing). |
| 16 | Size | Treble boost: 0–10 dB highshelf above 3200 Hz. Input is clamped to ≥32, mapped to 0–1; boost activates above value 80 (the upper half of that mapped range). |
| 17 | Tone | Pitched-oscillator mix: 0 = pure sawtooth, 64 ≈ triangle, 127 = pure sine. Equal-power crossfade across three stations. Stored in `ccState.oscMix`. |
| 19 | F2 Resonance | F2 bandpass Q via `_resToQ` (Q=2 wide → Q=25 narrow). Value is clamped to ≤70 before normalising. |
| 20 | F3 Gain | Scales `formantGains[2]` to `norm × WA_FORMANT_BASE_GAIN[2] × 2` (0 → silent F3, 127 → 2× the base mix). |

Each utterance has its own independent CC state. With the default `WEB_MAXIMUM_VOICES = 25`, up to 25 swimbots can have independent formant chains simultaneously; beyond that, `createVoice()` returns `null` and the utterance plays silently (see Voice Throttling).

---

## Reverb

A single `ConvolverNode` shared by all voices and samples. Impulse responses are real WAV recordings (EMT 140 plate reverb variants, echo hall, tunnel) preloaded at startup. The active IR can be swapped per-simulation via `SwimbotSynth.setReverbIR(name)` — instant buffer swap, no fetch.

### IR catalog (`WA_REVERB_CATALOG` in `Synth.js`)

Each simulation preset selects its own IR in `determineCurrentMusicParameters()`.

### Zoom-driven wet/dry

`Sound.setGlobalParameters()` maps camera zoom to a value between `minReverb` and `maxReverb` (0–127 range), divides by 127, and passes the resulting 0–1 level to `SwimbotSynth.setReverbWet(level)`. The synth stores it in `_currentWetLevel` and writes it directly to `reverbWetGain.gain` via `setTargetAtTime` — no internal halving. The tracked level is also read by `_playVoiceNote` to apply inverse wet/dry amplitude compensation (see below).

Per-sample, `playSample({ reverb: true, reverbSend })` inserts a dedicated send gain (default 1.0) between the sample's gain node and the shared `reverbBus`, *multiplying* on top of the global zoom-driven wet level. e.g. eating sounds use `reverbSend: 3.0` so they remain wetter at any zoom than birth/death.

---

## Volume & Amplitude

### Audio Mixer (UI)

The **Audio** tab provides a master volume slider and per-category mix sliders. All defaults are set in `Parameters.js`:

| Global | Default | Controls |
|--------|---------|----------|
| `WEB_AUDIO_VOLUME` | 0.90 | Master volume (scaled ×0.75 by slider) — applied post-limiter on `_utteranceVolume` for utterances, and at gain-node creation for samples/loops |
| `WEB_VOLUME_UTTERANCE` | 0.90 | Vocal formant synthesis level (post-limiter, on `_utteranceVolume`) |
| `WEB_VOLUME_BIRTH` | 0.45 | Birth sample level |
| `WEB_VOLUME_SPAWN` | 0.35 | Spawn (q*bert) sample level — separate channel from Birth |
| `WEB_VOLUME_DEATH` | 0.45 | Death sample level |
| `WEB_VOLUME_EAT` | 0.30 | Eating sample level |
| `WEB_VOLUME_LOOP` | 0.55 | Background loop level |
| `WEB_VOLUME_UI` | 0.70 | UI sounds (preset launch) |
| `WEB_MAXIMUM_VOICES` | 25 | Max simultaneous formant chains |

### Per-note utterance amplitude

`(velocity / 127) × makeup × wetComp` — the per-note gain into the formant chain.
- `makeup` is the Layer-1 feed-forward loudness normalization (see *Loudness Normalization & Limiter*), replacing the old fixed `×4.0`.
- `wetComp = 1.15 − _currentWetLevel` — inverse wet/dry compensation.
- **No user faders here.** `WEB_AUDIO_VOLUME` / `WEB_VOLUME_UTTERANCE` are applied later on `_utteranceVolume` (post-limiter), so the limiter sees a consistent, normalized level and the faders always work.

### Per-sample amplitude

`categoryVolume × WEB_AUDIO_VOLUME` — applied at `BufferSource` gain node creation time. (Samples bypass the utterance limiter entirely.)

---

## Loudness Normalization & Limiter

Two layers keep utterances at a roughly constant perceived loudness and stop the rare piercing / speaker-overloading note (caused by a note's harmonic coinciding with a formant filter's center frequency). Both are utterance-only and cost almost no CPU.

### Layer 1 — per-note feed-forward normalization (`_playVoiceNote`)

Before scheduling a note, `_estimateNoteWeightedRMS()` walks the note's first ~16 harmonics (blended saw/triangle/sine per CC17), passes each through the *current* formant magnitude response (`_bandpassMag` from the live center freqs / Q / gains), A-weights it (`_loudnessWeight`, emphasizing the ear's 2–4 kHz danger band), and sums to a weighted RMS. The per-note gain is then:

`makeup = clamp(WEB_UTTER_LOUDNESS_TARGET / weightedRMS, WEB_UTTER_MAKEUP_MIN, WEB_UTTER_MAKEUP_MAX)`

so a note aimed at a resonant coincidence (high weighted RMS) is turned *down*, and a thin note is turned up — every note targets the same loudness instead of sharing a fixed `×4.0`. To make this estimate possible, `ccState` stores the current mouth position (`mouthCC`) alongside `oscMix`, `f2ResNorm`, `f3GainNorm`. Tunables: `WEB_UTTER_LOUDNESS_TARGET`, `WEB_UTTER_MAKEUP_MIN/MAX` in `Parameters.js`.

### Layer 2 — brickwall limiter on the utterance submix

A single `DynamicsCompressorNode` (hard knee, ratio 20, 3 ms attack) sits *inside* the utterance submix: `_utteranceSum → comp → makeup gain → _utteranceVolume`. It catches whatever Layer 1 misses (mid-note formant sweeps, phase-summation error, voice stacking). Because it's on the utterance bus only, it never touches loops or samples.

- Toggle: `WEB_OUTPUT_LIMITER_ACTIVE` (`true`/`false`). When off, `_utteranceSum` connects straight to `_utteranceVolume`.
- Tunables: `WEB_LIMITER_THRESHOLD_DB`, `WEB_LIMITER_RELEASE`, `WEB_LIMITER_MAKEUP`.
- Control surface: the Audio tab (on/off checkbox + threshold/release/makeup dropdowns) and `synth/testbed.html` (on/off toggle + sliders), both via `SwimbotSynth.setCeilingMode()` / `applyCeilingParams()`.

---

## Stereo Panning

Each utterance receives a `panValue` computed in `GenePool.js` immediately before `doUtterance()` is called:

```javascript
const camLeft  = _camera.getPosition().x - _camera.getXDimension() * ONE_HALF;
const normX    = (swimbotPosition.x - camLeft) / _camera.getXDimension();
panValue       = clamp(normX * 2 - 1, -0.75, +0.75);
```

- Left edge of viewport → -0.75 (75% left)
- Center of viewport → 0
- Right edge of viewport → +0.75 (75% right)

Pan is fixed for the lifetime of the voice (set at `createVoice()` time). A swimbot moving mid-utterance does not re-pan.

---

## Voice Throttling

`WEB_MAXIMUM_VOICES` (adjustable via Audio tab slider, default 25) caps how many simultaneous formant chains can exist. `_activeVoices` is incremented in `_createVoice()` and decremented in `dispose()`. If the cap is reached, `_createVoice()` returns `null` and the voice count display turns red.

---

## Public API (`SwimbotSynth`)

| Method | Called from | Purpose |
|--------|-------------|---------|
| `initialize()` | `Sound.initialize()` | Creates AudioContext, masterGain, reverb, the utterance submix (`_utteranceSum`/`_utteranceVolume`) + limiter; preloads all IRs and samples; returns bool |
| `isReady()` | `Sound.*` | True if AudioContext exists |
| `createVoice(panValue, swimbotID)` | `Sound.doUtterance()` | Builds one formant chain; returns voice object or null if capped |
| `playVoiceNote(voice, note, vel, dur)` | `Sound.doUtterance()` | Plays one sawtooth note through voice's chain |
| `playSample(name, options)` | `Sound.doSwimbotSoundEvent()` | Plays a one-shot sample. Options: `{volume, semitones, reverb, reverbSend}` — `semitones` shifts pitch via varispeed; `reverbSend` (default 1.0) multiplies the per-call wet send on top of the global zoom-driven wet level. |
| `startLoop(name, options)` | `Sound.setGlobalParameters()` | Starts/updates a crossfade loop (`{volume, rate, reverb}`) |
| `stopLoop()` | `Sound.setGlobalParameters()` / `GenePool.setRendering(false)` | Fades out and stops the active loop |
| `stopAll()` | `GenePool.js` (on sim switch) | Stops loop, resets voice count |
| `setReverbWet(level)` | `Sound.setGlobalParameters()` | Writes `level` (0–1) directly to `reverbWetGain.gain` with 0.1s smoothing; no internal scaling. |
| `setReverbIR(name)` | `determineCurrentMusicParameters()` | Swaps convolver to a preloaded IR (no-op if already active) |
| `setCeilingMode(mode)` | Audio tab / testbed toggle | `'limiter'` (on) or `'off'` — rebuilds the limiter inside the utterance submix; updates `WEB_OUTPUT_LIMITER_ACTIVE` |
| `applyCeilingParams()` | Audio tab / testbed sliders | Rebuilds the limiter from the current `WEB_LIMITER_*` globals |
| `getCeilingMode()` | UI | Current limiter mode (`'limiter'`/`'off'`) |
| `refreshUtteranceVolume()` | Master/utterance sliders, autopilot | Recomputes `_utteranceVolume.gain` = `WEB_AUDIO_VOLUME × WEB_VOLUME_UTTERANCE` (post-limiter), so both faders take effect live |
| `getActiveVoices()` | UI status panel | Returns current voice count |
| `getLoadingStatus()` | UI status panel | Returns IR/sample load progress, current IR, current loop, reverb wet level |

---

## Tuning Notes

- The pitched oscillators are transposed down one octave (`noteNumber - 12`) because the formant breakpoint curves were calibrated for that frequency range in the original Reaktor patch design.
- Envelope attack is 200ms and release 50ms — deliberately slow to create legato, vocal quality. The noise envelope is much shorter (3ms attack / 18ms sustain / 8ms release) because it's a percussive grit burst, not a sustained tone.
- `synth/demo.html` is the original self-contained formant-synth proof of concept — open in a browser to hear the formant chain in isolation, without any swimbot/genome plumbing.
- `synth/testbed.html` is the *utterance* workbench. It loads the real simulation stack (`Genotype`, `Embryology`, `Sound.js`, `SwimbotSynth`), composes a real utterance from a chosen preset genome (or a fresh random swimbot), and plays it through an actual formant voice. Live mixer + CC knob sliders and a sustained-note repeater let you A/B synth tweaks without launching the full app. This is the page to open when you're iterating on formant DSP changes.
