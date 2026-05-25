//--------------------------------------------------------------------------
//
//    This file is part of GenePool Swimbots — "Darwin's Chorus"
//    Copyright (c) 2026 by Canton Becker - All Rights Reserved.
//
//    SwimbotSynth — the Web Audio engine for all sound in Darwin's Chorus.
//    Exposes a single global `SwimbotSynth` IIFE module.
//
//    Three playback systems:
//      1. Vocal formant synthesis (swimbot utterances) — per-voice filter chains
//      2. One-shot sample playback (birth, death, eat events)
//      3. Crossfade loop playback (background ambience)
//    Plus a shared convolution reverb with swappable impulse responses.
//
//    The formant voice design was originally prototyped from a Reaktor
//    "swimbot Vowels.ens" patch (see synth/demo.html for the proof-of-concept).
//
//    Architecture
//    ────────────
//    Shared (singleton):  AudioContext, masterGain, reverbBus, reverbConvolver,
//                         reverbWetGain, preloaded sample/IR buffers
//    Per-utterance:       preEmphasis, formantFilters[3], formantGains[3],
//                         formantMixer, trebleFilter, StereoPannerNode
//                         (created by createVoice(), released by voice.dispose())
//    Per-note:            OscillatorNode + envelope GainNode  (auto-released)
//    Per-sample:          BufferSource + GainNode  (auto-released via onended)
//    Per-loop-copy:       BufferSource + fade GainNode → shared mixGain
//
//    See WEBAUDIO.md for the full signal chain diagrams and public API docs.
//
//--------------------------------------------------------------------------

"use strict";

// ── Formant synth constants (from synth/demo.html) ──
// Breakpoints are pitch values at mouth positions: 0% / 33% / 66% / 100%
const WA_FORMANT_CURVES    = [
	[52.5, 77.5, 75.8, 52.5],    // F1
	[96.9, 92.9, 85.8, 79.8],    // F2
	[103.4, 98.4, 97.6, 95.6],   // F3
];
const WA_CURVE_POS         = [0, 0.33, 0.66, 1.0];
const WA_FORMANT_BASE_RES  = [0.93, 0.96, 0.98];   // base resonance → Q
const WA_FORMANT_BASE_GAIN = [1.0, 0.55, 0.3];      // relative filter mix levels

// Reverb settings
const WA_REVERB_WET_INIT = 0.13; // initial wet gain (overridden by zoom in setGlobalParameters)
const WA_REVERB_DEFAULT  = 'bright4';
const WA_REVERB_CATALOG  = {
	bright4: 'synth/impulse-responses/emt_140_bright_4.wav',
	bright5: 'synth/impulse-responses/emt_140_bright_5.wav',
	dark4:   'synth/impulse-responses/emt_140_dark_4.wav',
	medium4: 'synth/impulse-responses/emt_140_medium_4.wav',
	echohall: 'synth/impulse-responses/large-long-echo-hall.wav',
	tunnel: 'synth/impulse-responses/portage_creek_tunnel_alaska.wav',
};

// Sample catalog — all samples are preloaded at startup
const WA_SAMPLE_CATALOG = {
	// One-shots: birth
	'birth-01': 'synth/sounds-birth/birth.wav',
	'birth-02': 'synth/sounds-birth/birth-filtered.wav',
	'birth-03': 'synth/sounds-birth/birth-phased.wav',
	// One-shots: death
	'death-01': 'synth/sounds-death/death-01.wav',
	'death-02': 'synth/sounds-death/death-02.wav',
	'death-03': 'synth/sounds-death/death-03.wav',
	'death-04': 'synth/sounds-death/death-04.wav',
	'death-05': 'synth/sounds-death/death-05.wav',
	// One-shots: eat
	'eat-01': 'synth/sounds-eat/tuned-click.wav',
	// Loops
	'bg-bell-drone': 'synth/sounds-loops/bell-drone.wav',
	'bg-reaktor-drone': 'synth/sounds-loops/reaktor-drone.wav',
	'bg-lake-bacalar': 'synth/sounds-loops/sample-lake-bacalar.wav',

	// UI: preset launch sounds
	'start-q': 'synth/sounds-presets/start-q.wav',
	'start-w': 'synth/sounds-presets/start-w.wav',
	'start-e': 'synth/sounds-presets/start-e.wav',
	'start-r': 'synth/sounds-presets/start-r.wav',
	'start-t': 'synth/sounds-presets/start-t.wav',
	'pop':     'synth/sounds-presets/pop-start.wav',

	'spawn-01': 'synth/sounds-spawn/spawn-01.wav',
	'spawn-02': 'synth/sounds-spawn/spawn-02.wav',
	'spawn-03': 'synth/sounds-spawn/spawn-03.wav',
	'spawn-04': 'synth/sounds-spawn/spawn-04.wav',
	'spawn-05': 'synth/sounds-spawn/spawn-05.wav',
	'spawn-06': 'synth/sounds-spawn/spawn-06.wav',
	'spawn-07': 'synth/sounds-spawn/spawn-07.wav',
	'spawn-08': 'synth/sounds-spawn/spawn-08.wav',
	'spawn-09': 'synth/sounds-spawn/spawn-09.wav',
};
const WA_BIRTH_SAMPLES = Object.keys(WA_SAMPLE_CATALOG).filter(k => k.startsWith('birth-'));
const WA_DEATH_SAMPLES = Object.keys(WA_SAMPLE_CATALOG).filter(k => k.startsWith('death-'));
const WA_EAT_SAMPLES   = Object.keys(WA_SAMPLE_CATALOG).filter(k => k.startsWith('eat-'));
const WA_SPAWN_SAMPLES = Object.keys(WA_SAMPLE_CATALOG).filter(k => k.startsWith('spawn-'));

// ── SwimbotSynth module ───────────────────────────────────────────────────────

var SwimbotSynth = (function () {

	let audioCtx        = null;
	let masterGain      = null;
	let reverbConvolver = null;
	let reverbWetGain   = null;
	let reverbBus       = null; // pre-pan sum bus — voices feed this so reverb is always centered
	let _currentIRName   = null; // tracks which IR is active so repeated calls are no-ops
	let _currentWetLevel = WA_REVERB_WET_INIT; // tracked so _playVoiceNote can apply inverse compensation
	let _activeVoices    = 0;                  // count of voices currently alive (incremented in createVoice, decremented in dispose)
	const _irBuffers     = {};                 // preloaded AudioBuffers keyed by catalog name
	const _sampleBuffers = {};                 // preloaded AudioBuffers keyed by sample name
	let _activeLoop      = null;               // { name, baseVol, rate, useReverb, timer, copies[], mixGain }
	let _irTotal         = Object.keys(WA_REVERB_CATALOG).length;
	let _irLoaded        = 0;
	let _sampleTotal     = Object.keys(WA_SAMPLE_CATALOG).length;
	let _sampleLoaded    = 0;
	let _noiseBuffer     = null;               // reusable white-noise source for CC14 noise mix

	// ── Utility ──────────────────────────────────────────────────────────────

	function noteToFrequency(noteNumber) {
		return 440 * Math.pow(2, (noteNumber - 69) / 12);
	}

	// Piecewise linear interpolation — matches Reaktor's Ctrl.Shp 2 module
	function _ctrlShp2(breakpoints, t) {
		for (let i = 0; i < WA_CURVE_POS.length - 1; i++) {
			if (t <= WA_CURVE_POS[i + 1]) {
				const seg = (t - WA_CURVE_POS[i]) / (WA_CURVE_POS[i + 1] - WA_CURVE_POS[i]);
				return breakpoints[i] + seg * (breakpoints[i + 1] - breakpoints[i]);
			}
		}
		return breakpoints[breakpoints.length - 1];
	}

	function _resToQ(r) { return 2 + r * 23; } // 0 → Q=2 (wide), 1 → Q=25 (narrow)

	function _createNoiseBuffer() {
		const length = audioCtx.sampleRate * 2;
		const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		return buffer;
	}

	// ── Shared reverb (one ConvolverNode for all voices) ─────────────────────

	function _initReverb() {
		reverbConvolver = audioCtx.createConvolver();
		reverbConvolver.normalize = true; // let the browser normalize the IR to prevent clipping
		reverbWetGain = audioCtx.createGain();
		reverbWetGain.gain.value = WA_REVERB_WET_INIT;
		// Dry path:  masterGain → destination (panned, already wired)
		// Wet path:  reverbBus → convolver → wetGain → destination (pre-pan sum, always centered)
		reverbBus = audioCtx.createGain();
		reverbBus.gain.value = 1.0;
		reverbBus.connect(reverbConvolver);
		reverbConvolver.connect(reverbWetGain);
		reverbWetGain.connect(audioCtx.destination);
		_preloadAllIRs();
	}

	// Fetch + decode every IR in WA_REVERB_CATALOG at startup, stash in _irBuffers.
	// The default IR is assigned to the convolver as soon as it's ready.
	function _preloadAllIRs() {
		Object.entries(WA_REVERB_CATALOG).forEach(([name, url]) => {
			fetch(url)
				.then(response => {
					if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
					return response.arrayBuffer();
				})
				.then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
				.then(audioBuffer => {
					_irBuffers[name] = audioBuffer;
					_irLoaded++;
					console.log(`SwimbotSynth: IR preloaded "${name}" (${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels}ch) [${_irLoaded}/${_irTotal}]`);
					// Assign the default IR as soon as it arrives
					if (name === WA_REVERB_DEFAULT && reverbConvolver && !_currentIRName) {
						reverbConvolver.buffer = audioBuffer;
						_currentIRName = name;
					}
				})
				.catch(err => {
					console.error(`SwimbotSynth: failed to load IR "${name}":`, err);
				});
		});
	}

	// Swap the convolver to a preloaded IR by catalog name. Instant — no fetch.
	// No-op if the requested IR is already active.
	function _setReverbIR(name) {
		if (name === _currentIRName) return;
		const buf = _irBuffers[name];
		if (!buf) {
			console.warn(`SwimbotSynth: IR "${name}" not loaded yet — keeping current IR`);
			return;
		}
		if (reverbConvolver) {
			reverbConvolver.buffer = buf;
			_currentIRName = name;
			console.log(`SwimbotSynth: switched reverb IR to "${name}"`);
		}
	}

	// ── Sample preloading ────────────────────────────────────────────────────

	function _preloadAllSamples() {
		Object.entries(WA_SAMPLE_CATALOG).forEach(([name, url]) => {
			fetch(url)
				.then(response => {
					if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
					return response.arrayBuffer();
				})
				.then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
				.then(audioBuffer => {
					_sampleBuffers[name] = audioBuffer;
					_sampleLoaded++;
				})
				.catch(err => {
					console.error(`SwimbotSynth: failed to load sample "${name}":`, err);
				});
		});
	}

	// ── One-shot sample playback ─────────────────────────────────────────────
	// options:
	//   volume:     0–1
	//   semitones:  pitch shift in semitones (varispeed)
	//   reverb:     bool — route a wet copy to the shared reverb bus
	//   reverbSend: per-call wet send multiplier (default 1.0). Multiplies on
	//               top of the global zoom-driven reverb wet level, so a value
	//               of 2.0 = twice as wet as a normal sample at the same zoom.

	function _playSample(name, options) {
		if (!audioCtx || !masterGain) return;
		const buf = _sampleBuffers[name];
		if (!buf) return;
		if (audioCtx.state === 'suspended') audioCtx.resume();
		const opts = options || {};
		const vol        = (opts.volume     !== undefined) ? opts.volume     : 1.0;
		const semitones  = (opts.semitones  !== undefined) ? opts.semitones  : 0;
		const rate       = Math.pow(2, semitones / 12);
		const useReverb  = (opts.reverb     !== undefined) ? opts.reverb     : false;
		const reverbSend = (opts.reverbSend !== undefined) ? opts.reverbSend : 1.0;

		const source = audioCtx.createBufferSource();
		source.buffer = buf;
		source.playbackRate.value = rate;

		const gain = audioCtx.createGain();
		gain.gain.value = vol * WEB_AUDIO_VOLUME; // category vol × master vol
		source.connect(gain);
		gain.connect(masterGain);

		let sendGain = null;
		if (useReverb && reverbBus) {
			sendGain = audioCtx.createGain();
			sendGain.gain.value = reverbSend;
			gain.connect(sendGain);
			sendGain.connect(reverbBus);
		}

		source.start();
		source.onended = () => {
			try { gain.disconnect(); } catch(e) {}
			if (sendGain) { try { sendGain.disconnect(); } catch(e) {} }
		};
	}

	// ── Looping sample playback (crossfade strategy) ────────────────────────
	// Samples have natural fade-in / fade-out (not seamless zero-crossing loops).
	// To loop them we overlap copies: when the current copy nears its end, we
	// fade it out and start a fresh copy that fades in, creating a smooth crossfade.
	// Only one logical loop plays at a time. Calling with the same name is a no-op.

	const LOOP_CROSSFADE_SEC = 3.0; // duration of the crossfade overlap

	function _startLoop(name, options) {
		if (_activeLoop && _activeLoop.name === name) {
			// Already playing — just update the mix gain (responds to slider changes)
			const opts = options || {};
			const vol = (opts.volume !== undefined) ? opts.volume : _activeLoop.baseVol;
			_activeLoop.baseVol = vol;
			if (_activeLoop.mixGain) {
				_activeLoop.mixGain.gain.setTargetAtTime(vol * WEB_AUDIO_VOLUME, audioCtx.currentTime, 0.05);
			}
			return;
		}
		_stopLoop();
		if (!audioCtx || !masterGain) return;
		const buf = _sampleBuffers[name];
		if (!buf) return;
		if (audioCtx.state === 'suspended') audioCtx.resume();
		const opts = options || {};
		const baseVol = (opts.volume !== undefined) ? opts.volume : 1.0;

		// Shared mix gain node: per-copy fades are normalized 0→1→0,
		// and this node controls overall loop volume (adjustable in real time).
		const mixGain = audioCtx.createGain();
		mixGain.gain.value = baseVol * WEB_AUDIO_VOLUME;
		mixGain.connect(masterGain);
		if ((opts.reverb !== undefined ? opts.reverb : false) && reverbBus) {
			mixGain.connect(reverbBus);
		}

		_activeLoop = {
			name:      name,
			baseVol:   baseVol,
			rate:      (opts.rate   !== undefined) ? opts.rate   : 1.0,
			useReverb: (opts.reverb !== undefined) ? opts.reverb : false,
			timer:     null,
			copies:    [],
			mixGain:   mixGain
		};
		_launchLoopCopy();
	}

	// Launch one copy of the current loop sample with a normalized 0→1→0 fade envelope.
	// The actual volume is controlled by the shared mixGain node.
	function _launchLoopCopy() {
		if (!_activeLoop) return;
		const buf = _sampleBuffers[_activeLoop.name];
		if (!buf) return;
		const rate = _activeLoop.rate;
		const dur  = buf.duration / rate; // effective playback duration
		const xf   = Math.min(LOOP_CROSSFADE_SEC, dur * 0.25); // cap crossfade at 25% of duration
		const now  = audioCtx.currentTime;

		const source = audioCtx.createBufferSource();
		source.buffer = buf;
		source.playbackRate.value = rate;

		// Per-copy fade envelope: normalized 0 → 1 → 0
		const fade = audioCtx.createGain();
		fade.gain.setValueAtTime(0, now);
		fade.gain.linearRampToValueAtTime(1, now + xf);
		const fadeOutStart = now + dur - xf;
		fade.gain.setValueAtTime(1, fadeOutStart);
		fade.gain.linearRampToValueAtTime(0, fadeOutStart + xf);

		source.connect(fade);
		fade.connect(_activeLoop.mixGain); // → mixGain → masterGain/reverbBus

		source.start();

		const copy = { source, fade };
		_activeLoop.copies.push(copy);

		source.onended = () => {
			try { fade.disconnect(); } catch(e) {}
			if (_activeLoop) {
				const idx = _activeLoop.copies.indexOf(copy);
				if (idx !== -1) _activeLoop.copies.splice(idx, 1);
			}
		};

		// Schedule next copy so its fade-in overlaps this copy's fade-out
		const nextIn = Math.max(0, (dur - xf)) * 1000; // ms
		_activeLoop.timer = setTimeout(() => {
			_launchLoopCopy();
		}, nextIn);
	}

	function _stopLoop() {
		if (!_activeLoop) return;
		clearTimeout(_activeLoop.timer);
		const now = audioCtx.currentTime;
		// Fade the shared mix gain to zero, then disconnect everything
		_activeLoop.mixGain.gain.cancelScheduledValues(now);
		_activeLoop.mixGain.gain.setValueAtTime(_activeLoop.mixGain.gain.value, now);
		_activeLoop.mixGain.gain.linearRampToValueAtTime(0, now + 0.5);
		const loop = _activeLoop;
		_activeLoop = null;
		setTimeout(() => {
			for (const copy of loop.copies) {
				try { copy.source.stop(); } catch(e) {}
				try { copy.fade.disconnect(); } catch(e) {}
			}
			try { loop.mixGain.disconnect(); } catch(e) {}
		}, 600);
	}

	// ── Per-utterance formant voice factory ──────────────────────────────────
	// Returns { preEmphasis, handleCC(cc, value), dispose() }.
	// Each doUtterance() call creates one independent formant chain so that
	// simultaneous swimbots never clobber each other's CC15/16/19/20 state.

	function _updateVoiceCountUI(throttled) {
		const el = document.getElementById('audioVoiceCount');
		if (!el) return;
		el.textContent = _activeVoices + ' / ' + WEB_MAXIMUM_VOICES;
		el.style.color = throttled ? '#c00' : '#333';
	}

	function _createVoice(panValue, swimbotID) {
		if (!audioCtx || !masterGain) return null;
		if (_activeVoices >= WEB_MAXIMUM_VOICES) {
			// too many voices right now! don't add this one
			_updateVoiceCountUI(true);
			return null;
		}
		_activeVoices++;
		if (audioCtx.state === 'suspended') audioCtx.resume();

		// Pre-emphasis: gentle highpass (~Reaktor differentiator)
		const preEmphasis = audioCtx.createBiquadFilter();
		preEmphasis.type = 'highpass';
		preEmphasis.frequency.value = 60;
		preEmphasis.Q.value = 0.4;

		// Three formant bandpass filters
		const formantFilters = [];
		const formantGains   = [];
		for (let i = 0; i < 3; i++) {
			const f = audioCtx.createBiquadFilter();
			f.type = 'bandpass';
			f.Q.value = _resToQ(WA_FORMANT_BASE_RES[i]);
			const g = audioCtx.createGain();
			g.gain.value = WA_FORMANT_BASE_GAIN[i];
			f.connect(g);
			preEmphasis.connect(f);
			formantFilters.push(f);
			formantGains.push(g);
		}

		// Formant mixer
		const formantMixer = audioCtx.createGain();
		formantMixer.gain.value = 1.0;
		formantGains.forEach(g => g.connect(formantMixer));

		// Treble boost (activated by CC16 / Size)
		const trebleFilter = audioCtx.createBiquadFilter();
		trebleFilter.type = 'highshelf';
		trebleFilter.frequency.value = 3200;
		trebleFilter.gain.value = 0;
		formantMixer.connect(trebleFilter);

		// Stereo panner — sits between trebleFilter and masterGain, one per utterance
		const panner = audioCtx.createStereoPanner();
		panner.pan.value = (panValue !== undefined) ? panValue : 0;
		trebleFilter.connect(panner);
		panner.connect(masterGain);    // panned → dry output
		trebleFilter.connect(reverbBus); // pre-pan → centered reverb feed

		const ccState = {
			noiseMix: 0,
			f2ResNorm: WA_FORMANT_BASE_RES[1],
			f3GainNorm: 0.5
		};

		// Initialise formant frequencies to neutral mouth position
		_applyFormantFreqs(formantFilters, 0);

		// CC handlers — close over THIS voice's nodes only
		function handleCC(cc, value) {
			switch (cc) {
				case 14: // Noise mix: 0=sawtooth formant voice, 127=pitch-tracked noise only
					ccState.noiseMix = Math.max(0, Math.min(127, value)) / 127;
					break;
				case 15: // Mouth → all three formant frequencies
					_applyFormantFreqs(formantFilters, value);
					break;
				case 16: { // Size → treble boost (0–10 dB)
					const norm    = (Math.max(32, value) - 32) / (127 - 32);
					const boostDb = norm > 0.5 ? (norm - 0.5) * 2 * 10 : 0;
					trebleFilter.gain.setTargetAtTime(boostDb, audioCtx.currentTime, 0.02);
					break;
				}
				case 19: { // F2 resonance
					const norm = Math.min(value, 70) / 70;
					ccState.f2ResNorm = norm;
					formantFilters[1].Q.setTargetAtTime(_resToQ(norm), audioCtx.currentTime, 0.02);
					break;
				}
				case 20: { // F3 gain
					const norm = value / 127;
					ccState.f3GainNorm = norm;
					formantGains[2].gain.setTargetAtTime(norm * WA_FORMANT_BASE_GAIN[2] * 2, audioCtx.currentTime, 0.02);
					break;
				}
			}
		}

		_updateVoiceCountUI(false);

		// Release all nodes when utterance ends
		function dispose() {
			_activeVoices = Math.max(0, _activeVoices - 1);
			_updateVoiceCountUI(false);
			try {
				panner.disconnect();
				trebleFilter.disconnect();
				formantMixer.disconnect();
				formantGains.forEach(g => g.disconnect());
				formantFilters.forEach(f => f.disconnect());
				preEmphasis.disconnect();
			} catch (e) { /* already disconnected */ }
		}

		return { preEmphasis, noiseInput: preEmphasis, ccState, handleCC, dispose };
	}

	// Apply CC15 mouth position (0–127) to a voice's formant filter set
	function _applyFormantFreqs(formantFilters, mouthCC) {
		const t  = Math.max(0, Math.min(127, mouthCC)) / 127;
		const tc = 0.015; // 15ms smoothing — matches CC modulation update rate
		WA_FORMANT_CURVES.forEach((curve, i) => {
			const pitch = _ctrlShp2(curve, t);
			const hz    = noteToFrequency(pitch);
			formantFilters[i].frequency.setTargetAtTime(hz, audioCtx.currentTime, tc);
		});
	}

	// Play one note through a voice's formant chain
	// WEB_AUDIO_VOLUME and WEB_VOLUME_UTTERANCE are globals set by the Audio tab mixer
	function _playVoiceNote(voice, noteNumber, velocity, durationMs) {
		if (!audioCtx || !voice) return;

		const now    = audioCtx.currentTime;
		const freq   = noteToFrequency(noteNumber - 12); // -12: formant curves calibrated for this range
		// Inverse wet/dry compensation: dry signal gets a small boost, wet gets a small cut.
		// At wet=0 → ×1.15, at wet≈0.15 → ×1.0, at wet≈0.3 → ×0.85  (±15% range)
		const wetComp = 1.15 - _currentWetLevel;
		const amp    = (velocity / 127) * WEB_AUDIO_VOLUME * WEB_VOLUME_UTTERANCE * 4.0 * wetComp; // compensates for narrow-BP formant filter attenuation
		const durSec = durationMs / 1000;
		const envA   = 0.200;	// 200ms attack
		const envR   = 0.050;	// 50ms release
		const noiseDurSec 		= 0.018;
		const noiseAttackSec		= 0.003;
		const noiseReleaseSec	= 0.008;
		const noiseFormantDrive = 7.5;

		const noiseMix = voice.ccState ? Math.max(0, Math.min(1, voice.ccState.noiseMix)) : 0;
		const noiseMixResponse = Math.sqrt(noiseMix);
		const sawAmp = amp * Math.cos(noiseMix * Math.PI * 0.5);
		const noiseAmp = amp * noiseMixResponse * noiseFormantDrive * (0.55 + ((voice.ccState ? voice.ccState.f3GainNorm : 0.5) * 0.9));

		let osc = null;
		let oscEnv = null;
		if (sawAmp > 0.0001) {
			osc = audioCtx.createOscillator();
			osc.type = 'sawtooth';
			osc.frequency.value = freq;
			oscEnv = audioCtx.createGain();
			oscEnv.gain.setValueAtTime(0, now);
			oscEnv.gain.linearRampToValueAtTime(sawAmp, now + envA);
			oscEnv.gain.setValueAtTime(sawAmp, now + durSec);
			oscEnv.gain.linearRampToValueAtTime(0, now + durSec + envR);
			osc.connect(oscEnv);
			oscEnv.connect(voice.preEmphasis);
		}

		let noiseSource = null;
		let noiseFilter = null;
		let noiseEnv = null;
		if (noiseMix > 0.001 && _noiseBuffer && voice.noiseInput) {
			const pitchFilterFreq = Math.min(6000, Math.max(180, freq * 4));
			const pitchFilterQ = 0.8 + ((voice.ccState ? voice.ccState.f2ResNorm : 0.5) * 5);

			noiseSource = audioCtx.createBufferSource();
			noiseSource.buffer = _noiseBuffer;
			noiseSource.loop = true;

			noiseFilter = audioCtx.createBiquadFilter();
			noiseFilter.type = 'bandpass';
			noiseFilter.frequency.value = pitchFilterFreq;
			noiseFilter.Q.value = pitchFilterQ;

			noiseEnv = audioCtx.createGain();
			noiseEnv.gain.setValueAtTime(0, now);
			noiseEnv.gain.linearRampToValueAtTime(noiseAmp, now + noiseAttackSec);
			noiseEnv.gain.setValueAtTime(noiseAmp, now + noiseDurSec);
			noiseEnv.gain.linearRampToValueAtTime(0, now + noiseDurSec + noiseReleaseSec);

			noiseSource.connect(noiseFilter);
			noiseFilter.connect(noiseEnv);
			noiseEnv.connect(voice.noiseInput);
		}

		const endTime = now + durSec + envR + 0.05;
		if (osc) {
			osc.start(now);
			osc.stop(endTime);
		}
		if (noiseSource) {
			noiseSource.start(now);
			noiseSource.stop(now + noiseDurSec + noiseReleaseSec + 0.05);
		}
		if (osc) {
			osc.onended = () => {
				try { oscEnv.disconnect(voice.preEmphasis); } catch (e) {}
			};
		}
		if (noiseSource) {
			noiseSource.onended = () => {
				try { noiseSource.disconnect(); } catch (e) {}
				try { noiseFilter.disconnect(); } catch (e) {}
				try { noiseEnv.disconnect(voice.noiseInput); } catch (e) {}
			};
		};
	}

	// ── Public API ───────────────────────────────────────────────────────────

	return {

		// Call once from Sound.initialize(). Returns true if Web Audio is available.
		initialize: function () {
			if (audioCtx) return true; // already initialized
			try {
				audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
				masterGain = audioCtx.createGain();
				masterGain.gain.value = 1.0; // per-note amplitude carries volume via WEB_AUDIO_VOLUME
				masterGain.connect(audioCtx.destination);
				_noiseBuffer = _createNoiseBuffer();
				_initReverb();
				_preloadAllSamples();
				console.log("SwimbotSynth: Web Audio ready.");
				return true;
			} catch (e) {
				console.error("SwimbotSynth: Web Audio API not supported.", e);
				audioCtx = null;
				return false;
			}
		},

		// True when AudioContext was created successfully.
		isReady: function () { return audioCtx !== null; },

		// Create an independent formant chain for one utterance.
		// panValue: -0.75 (hard left) to +0.75 (hard right), 0 = center.
		// swimbotID: used only for the throttle log message.
		createVoice: function (panValue, swimbotID) { return _createVoice(panValue, swimbotID); },

		// Play one note through a voice's formant chain.
		playVoiceNote: function (voice, noteNumber, velocity, durationMs) {
			_playVoiceNote(voice, noteNumber, velocity, durationMs);
		},

		// Set reverb wet level (0–1). Called from Sound.setGlobalParameters() on every zoom update.
		setReverbWet: function (level) {
			_currentWetLevel = level;
			if (reverbWetGain && audioCtx) {
				reverbWetGain.gain.setTargetAtTime(_currentWetLevel, audioCtx.currentTime, 0.1);
			}
		},

		// Swap reverb to a preloaded IR by catalog name (e.g. 'bright4', 'dark4', 'medium4', 'bright5').
		setReverbIR: function (name) { _setReverbIR(name); },

		// Play a one-shot sample. options: { volume: 0–1, semitones: pitch shift (varispeed), reverb: bool, reverbSend: per-call wet multiplier on top of global zoom level }
		playSample: function (name, options) { _playSample(name, options); },

		// Start a looping sample (one at a time). Same name = no-op. Different name = swap.
		startLoop: function (name, options) { _startLoop(name, options); },

		// Stop the current loop.
		stopLoop: function () { _stopLoop(); },

		// Stop all audio: kill active loop, reset voice count.
		// One-shot samples are fire-and-forget (they finish and clean up via onended).
		stopAll: function () {
			_stopLoop();
			_activeVoices = 0;
			_updateVoiceCountUI(false);
		},

		// Returns the current number of active voices.
		getActiveVoices: function () { return _activeVoices; },

		// Returns the underlying AudioContext (for resume on user gesture).
		getAudioContext: function () { return audioCtx; },

		// Returns loading progress for the audio panel status display.
		getLoadingStatus: function () {
			return {
				irLoaded: _irLoaded, irTotal: _irTotal,
				samplesLoaded: _sampleLoaded, samplesTotal: _sampleTotal,
				currentIR: _currentIRName,
				currentLoop: _activeLoop ? _activeLoop.name : null,
				reverbWet: _currentWetLevel
			};
		},

	};

})();
