# GenePool Sound — Web Audio Engine

All audio in Darwin's Chorus is produced by the browser's Web Audio API. The `SwimbotSynth` module (`synth/Synth.js`) is the sole audio engine — there is no external hardware or software dependency. The formant voice design was originally prototyped as a reconstruction of a Reaktor vocal formant patch; those Reaktor references remain in comments as historical context for the DSP design choices.

**Relevant files:**
- `synth/Synth.js` — the entire synthesizer (`SwimbotSynth` module)
- `simulation/Sound.js` — event dispatch; triggers voices and samples via `SwimbotSynth.*` calls
- `simulation/GenePool.js` — computes stereo pan value before calling `doUtterance()`
- `simulation/Parameters.js` — audio mixer defaults (`WEB_AUDIO_VOLUME`, `WEB_VOLUME_*`, `WEB_MAXIMUM_VOICES`)
- `synth/demo.html` — standalone proof-of-concept; the original source for the formant design

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
| Singleton | `AudioContext`, `masterGain`, `reverbBus`, `reverbConvolver`, `reverbWetGain` | `SwimbotSynth.initialize()` | App lifetime |
| Per-utterance | `preEmphasis`, `formantFilters[3]`, `formantGains[3]`, `formantMixer`, `trebleFilter`, `StereoPannerNode` | `SwimbotSynth.createVoice()` | `voice.dispose()` on `'done'` step |
| Per-note | `OscillatorNode`, envelope `GainNode` | `SwimbotSynth.playVoiceNote()` | `osc.onended` callback |
| Per-sample | `BufferSource`, `GainNode` | `SwimbotSynth.playSample()` | `source.onended` callback |
| Per-loop | `BufferSource`, fade `GainNode` → shared `mixGain` | `_launchLoopCopy()` | `source.onended` callback |

### Signal chain (per utterance)

```
OscillatorNode (sawtooth, noteNumber-12)
  → envelope GainNode  (attack 200ms, release 50ms)
    → preEmphasis  (highpass 60 Hz, Q=0.4)
      → formantFilter[0] (bandpass) → formantGain[0]  ↘
      → formantFilter[1] (bandpass) → formantGain[1]  → formantMixer
      → formantFilter[2] (bandpass) → formantGain[2]  ↗
          → trebleFilter (highshelf 3200 Hz, CC16-driven)
              → StereoPannerNode  ──────────────→ masterGain → destination  (panned dry)
              → reverbBus (shared) → reverbConvolver → reverbWetGain → destination  (centered wet)
```

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
- The `StereoPannerNode` is after the formant chain but *before* `masterGain`, so each voice has independent stereo placement.
- The reverb tap comes from `trebleFilter` *before* the panner, routed through the shared `reverbBus`. All voices are summed pre-pan before entering the reverb, so the reverb image is always centered.
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
| 15 | Mouth | Morphs all three formant frequencies through the breakpoint curves (15ms smoothing) |
| 16 | Size | Treble boost: 0–10 dB highshelf above 3200 Hz (active above CC=95 midpoint) |
| 19 | Lvl2Q | F2 filter resonance (Q=2–25) |
| 20 | Level3 | F3 gain (0–2× base gain) |

Each utterance's voice has its own independent CC state — 20 simultaneous swimbots means 20 independent formant chains, so no voice clobbers another's vowel shape.

---

## Reverb

A single `ConvolverNode` shared by all voices and samples. Impulse responses are real WAV recordings (EMT 140 plate reverb variants, echo hall, tunnel) preloaded at startup. The active IR can be swapped per-simulation via `SwimbotSynth.setReverbIR(name)` — instant buffer swap, no fetch.

### IR catalog (`WA_REVERB_CATALOG` in `Synth.js`)

Each simulation preset selects its own IR in `determineCurrentMusicParameters()`.

### Zoom-driven wet/dry

`Sound.setGlobalParameters()` calls `SwimbotSynth.setReverbWet(level)` on every update. The level is computed from `minReverb`/`maxReverb` (0–127 range, mapped to 0–1), then **halved** internally so reverb depth stays subtle. The wet level is tracked in `_currentWetLevel` for amplitude compensation (see below).

---

## Volume & Amplitude

### Audio Mixer (UI)

The **Audio** tab provides a master volume slider and per-category mix sliders. All defaults are set in `Parameters.js`:

| Global | Default | Controls |
|--------|---------|----------|
| `WEB_AUDIO_VOLUME` | 0.50 | Master volume (scaled ×0.75 by slider) |
| `WEB_VOLUME_UTTERANCE` | 1.0 | Vocal formant synthesis level |
| `WEB_VOLUME_BIRTH` | 1.0 | Birth/spawn sample level |
| `WEB_VOLUME_DEATH` | 1.0 | Death sample level |
| `WEB_VOLUME_EAT` | 0.5 | Eating sample level |
| `WEB_VOLUME_LOOP` | 0.75 | Background loop level |
| `WEB_MAXIMUM_VOICES` | 32 | Max simultaneous formant chains |

### Per-note utterance amplitude

`(velocity / 127) × WEB_AUDIO_VOLUME × WEB_VOLUME_UTTERANCE × 4.0 × wetComp`
- `4.0` compensates for the narrow-bandpass formant filter attenuation
- `wetComp = 1.15 − _currentWetLevel` — inverse wet/dry compensation

### Per-sample amplitude

`categoryVolume × WEB_AUDIO_VOLUME` — applied at `BufferSource` gain node creation time.

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

`WEB_MAXIMUM_VOICES` (adjustable via Audio tab slider, default 32) caps how many simultaneous formant chains can exist. `_activeVoices` is incremented in `_createVoice()` and decremented in `dispose()`. If the cap is reached, `_createVoice()` returns `null` and the voice count display turns red.

---

## Public API (`SwimbotSynth`)

| Method | Called from | Purpose |
|--------|-------------|---------|
| `initialize()` | `Sound.initialize()` | Creates AudioContext, masterGain, reverb; preloads all IRs and samples; returns bool |
| `isReady()` | `Sound.*` | True if AudioContext exists |
| `createVoice(panValue, swimbotID)` | `Sound.doUtterance()` | Builds one formant chain; returns voice object or null if capped |
| `playVoiceNote(voice, note, vel, dur)` | `Sound.doUtterance()` | Plays one sawtooth note through voice's chain |
| `playSample(name, options)` | `Sound.doSwimbotSoundEvent()` | Plays a one-shot sample (`{volume, rate, reverb}`) |
| `startLoop(name, options)` | `Sound.setGlobalParameters()` | Starts/updates a crossfade loop (`{volume, rate, reverb}`) |
| `stopLoop()` | `Sound.setGlobalParameters()` | Fades out and stops the active loop |
| `stopAll()` | `GenePool.js` (on sim switch) | Stops loop, resets voice count |
| `setReverbWet(level)` | `Sound.setGlobalParameters()` | Updates reverb wet gain (halved internally) |
| `setReverbIR(name)` | `determineCurrentMusicParameters()` | Swaps convolver to a preloaded IR (no-op if already active) |
| `getActiveVoices()` | UI status panel | Returns current voice count |
| `getLoadingStatus()` | UI status panel | Returns IR/sample load progress, current IR, current loop, reverb wet level |

---

## Tuning Notes

- The oscillator is transposed down one octave (`noteNumber - 12`) because the formant breakpoint curves were calibrated for that frequency range in the original Reaktor patch design.
- Envelope attack is 200ms and release 50ms — deliberately slow to create legato, vocal quality.
- `synth/demo.html` is a fully self-contained test page; open it in a browser to hear the formant synth in isolation.
