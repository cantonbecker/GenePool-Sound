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
| `UtteranceRenderer.js` | Particle/ripple visual effects when a swimbot "speaks" |
| `Touch.js` | Touch input handling |

### Synth Layer (`synth/`)
| File | Purpose |
|------|---------|
| `Synth.js` | **SwimbotSynth** module — Web Audio engine: vocal formant synthesis, sample playback, crossfade loops, reverb convolver (see `WEBAUDIO.md`) |
| `demo.html` | Standalone proof-of-concept for the formant synth (open in browser to test in isolation) |
| `sounds-birth/` | 16 one-shot WAV samples for birth events |
| `sounds-death/` | 2 one-shot WAV samples for death events |
| `sounds-eat/` | 3 one-shot WAV samples for eating events |
| `sounds-loops/` | Background loop WAVs (bell drone, lake bacalar ambience) |
| `impulse-responses/` | Convolution reverb IRs (EMT 140 variants, echo hall, tunnel) |

### UI Layer (`js/`)
| File | Purpose |
|------|---------|
| `ui.js` | Developer panel, preset buttons, gene tweakers, camera nav controls, Audio tab mixer, pointer lock / fullscreen |
| `info.js` | In-app info/tutorial text (28 pages) |
| `saveLoad.js` | Save/load swimbots and pools (file and preset modes) |
| `graph.js` | Population graphs for debugging |

---

## The Sound System

Sound is what makes this fork unique. Everything runs through the Web Audio API — no external MIDI hardware or software required. The system has two layers:

### SwimbotSynth (`synth/Synth.js`)

The audio engine. A self-contained IIFE module exposing the `SwimbotSynth` global. Handles:

- **Vocal formant synthesis** — per-utterance filter chains (3 bandpass formants + treble boost + stereo panner) driven by gene-generated note/CC sequences. Each simultaneous swimbot gets its own independent chain.
- **Sample playback** — preloads all WAV samples at startup. `playSample()` for overlapping one-shots (birth, death, eat). Fire-and-forget `BufferSource` nodes.
- **Crossfade loops** — background ambience via `startLoop()`. Since samples aren't seamless, copies overlap with 3-second crossfades (normalized 0→1→0 per-copy envelopes through a shared mix gain node for real-time volume control).
- **Convolution reverb** — shared `ConvolverNode` with preloaded IR library. Swappable per-simulation via `setReverbIR()`. Voices feed reverb pre-panner so the reverb image stays centered.
- **Voice throttling** — `WEB_MAXIMUM_VOICES` caps simultaneous formant chains.

Full architecture documented in **`WEBAUDIO.md`**.

### Sound Coordinator (`simulation/Sound.js`)

The dispatch layer. Connects simulation events to the synth engine:

- **`doSwimbotSoundEvent(type)`** — plays one-shot samples for eat/birth/death/spawn events, selecting randomly from the sample pool for each category.
- **`doUtterance(utterVariablesObj)`** — schedules a gene-generated note/CC sequence through a formant voice chain. Applies zoom-based attenuation.
- **`setGlobalParameters()`** — called every `SOUND_UPDATE_PERIOD` ticks. Updates reverb wet level from zoom, manages background loop, drifts the tonal center.
- **`generateUtterancePhenotypes()`** — Markov-chain note sequence generator. Called from `Embryology.js` at birth. Genes seed the RNG to produce deterministic, heritable "songs."

### Audio Mixer (UI)

The **Audio** tab in the developer panel provides:
- Master volume slider
- Per-category mix sliders: utterances, birth/spawn, death, eating, background loop
- Max simultaneous voices slider (1–64)
- Live status: active voices, current reverb IR + wet level, active loop, sample/IR loading progress

Mixer defaults are set in `Parameters.js` (`WEB_AUDIO_VOLUME`, `WEB_VOLUME_*`, `WEB_MAXIMUM_VOICES`).

### Tonal System
- Base note: `BASE_NOTE = 41` (F2)
- Tonal center drifts around the circle of 5ths every ~3 minutes (`UNIVERSAL_NOTE_SHIFT`)
- Six note interval sets: minor pentatonic, pentatonic, 5ths, octaves, whole tone, 12-tone
- Markov chain inter-onset intervals: short (60–80ms), medium (140–210ms), long (configurable)
- Per-simulation overrides in `determineCurrentMusicParameters()` — each preset can specify its own interval set, reverb IR, background loop, and timing

### Sound Events
- `SOUND_EVENT_TYPE_EAT`, `BIRTH`, `DEATH`, `SPAWN`, `LAUNCH`
- Background loops: bell drone, Lake Bacalar ambience (crossfade-looped)
- Each simulation preset can override reverb IR, loop selection, reverb range, interval set

---

## Key Constants & Tuning (Parameters.js)

```
Version:          2026-03-19 WEB
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
- The `PROTOTYPING_SOUND = true` flag exists in `Swimbot.js`
- `gpRandom()` wraps `Math.random()` with a commented-out seeded PRNG (aleaPRNG) for future reproducibility

## TO DO

### Performance: camera zoom causes frame drops and audio hangs
We built a Performance Debugging panel (`js/perfDebug.js`) with per-tick timing probes and toggles to disable individual subsystems (utterance audio, event samples, background loop, reverb, utterance rendering, swimbot rendering, food rendering, O(n²) mate scan, force LOW LOD). After systematic testing, **the only toggle that made a measurable difference was "Force LOW LOD"**. This means:
- The O(n²) mate-detection scan is NOT the bottleneck (despite being 90K distance checks/tick)
- Web Audio voice count is NOT the bottleneck
- Sample playback, reverb, background loops — none of these matter
- **The culprit is HIGH LOD swimbot rendering** — the full bezier spline rendering in `SwimbotRenderer.js` (lines ~164–299) which kicks in when camera scale drops below `LEVEL_OF_DETAIL_THRESHOLD = 3000`
- The fix needs to happen in `SwimbotRenderer.js` — either optimize the HIGH LOD bezier path, add an intermediate LOD level, or raise the threshold so HIGH LOD only activates when very few swimbots are visible
