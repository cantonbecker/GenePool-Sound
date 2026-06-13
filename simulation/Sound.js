//--------------------------------------------------------------------------
//                                                                        
//    This file is part of GenePool Swimbots.                             
//    Copyright (c) 2025 by Jeffrey Ventrella - All Rights Reserved.      
//                                                                        
//    See the README file or go to swimbots.com for full license details.           
//    You may use, distribute, and modify this code only under the terms  
//    of the "Commons Clause" license (commonsclause.com).                
//                                                                        
//    This software is intended for education, game design, and research. 
//                                                                        
// -------------------------------------------------------------------------- 

"use strict";

const SOUND_UPDATE_PERIOD =  10; 	// every this many _clock iterations, update global audio parameters (like overall reverb/zoom level)
var APPROX_MS_PER_CLOCK = 20; 	// used to scale utterDuration to absolute time. if the simulation speed changes, we might adjust this.
var SOUND_UPDATE_COUNTER = 0;
var UTTERANCE_COMPOSING_COUNTER = 0;
var CURRENT_INTERVAL_SET_NAME = '';
var _autopilotVolumeApplied = false;
var _autopilotVolumeStored = 0;

const SOUND_EVENT_TYPE_NULL		= -1
const SOUND_EVENT_TYPE_EAT  	=  1;
const SOUND_EVENT_TYPE_BIRTH	=  2;
const SOUND_EVENT_TYPE_DEATH	=  3;
const SOUND_EVENT_TYPE_SPAWN	=  4;
const SOUND_EVENT_TYPE_LAUNCH	=  5;

// Maps SimulationStartMode index to preset launch sample name
const LAUNCH_SAMPLES = ['start-q', 'start-w', 'start-e', 'start-r', 'start-t'];

// in several places of the code we slice the genes by index just to pull out utterance-related genes
const UTTERANCE_GENES_SLICE_START = 112;
const UTTERANCE_GENES_SLICE_END = 119; // inclusive

// INITIAL TONAL CENTER
var BASE_NOTE = 41; // A1 = 33 | A2 = 45 | A3 = 57 | A440 = 69

// Our tonal center is not fixed! Every so often, the entire universe shifts one step the the right along the circle of 5ths
// the shorter this time, the more overlapping generations of tonal centers. (Too short and it will be utter cacophony)
// Let's look for a middle ground where there are periods of slight discomfort (e.g. generations of three tonal centers
// simultaneously occupying the pool) followed by periods of tranquility (e.g. only two tonal centers.)

const SECONDS_BETWEEN_UNIVERSAL_NOTE_SHIFT_DEFAULT = 0; // enable this to have the background tone gradually drift around the default intervals
var UNIVERSAL_NOTE_SHIFT = 0; // remembers our current shift, see constant SECONDS_BETWEEN_UNIVERSAL_NOTE_SHIFT_DEFAULT

const DEFAULT_BACKGROUND_LOOP = 'bg-lake-bacalar';

const MODULATION_SPEED_MS = 15; // how often CC modulation events are inserted into utterance sequences (ms)

// Decaying histogram: 12 pitch-class bins + mod counter. Decayed periodically
// so values reflect recent activity without unbounded array growth.
var NOTE_HISTOGRAM = new Int32Array(12);
var NOTE_COUNT = 0;
var MOD_COUNT  = 0;

// these are here in case we want to selectively disable some sounds during testing
var SOUND_OUTPUT_UTTER 			= true;
var SOUND_OUTPUT_EAT 			= true;
var SOUND_OUTPUT_BIRTH 			= true;
var SOUND_OUTPUT_DEATH 			= true;
var SOUND_OUTPUT_ATMOSPHERE 	= true;
var SOUND_OUTPUT_SPAWN		 	= true;
var SOUND_OUTPUT_LAUNCH			= true;

var UTTER_ATTENUATION = 0; // stores current attenuation level
var CURRENT_ZOOM_PERCENTAGE = 0; // 0 = zoomed all the way in, 1 = zoomed all the way out. updated each tick in setGlobalParameters

const MINIMUM_UTTER_VELOCITY = 30 // 0-127 don't let any swimbot individual note go quieter than this
const MAXIMUM_UTTER_VELOCITY = 125 // 0-127 don't let any swimbot individual note go quieter than this
const MIN_REVERB_DEFAULT = 30; // 0-127
const MAX_REVERB_DEFAULT = 90; 


// different simulations use different interval sets
const NOTE_INTERVAL_SETS = [
    { name: "minor pentatonic", 		intervals: [-9, -7, -5, -2, 0, +3, +5, +7, +10] },
    { name: "pentatonic", 				intervals: [-10, -8, -5, -3, 0, +2, +4, +7, +9] },
	 { name: "5ths", 						intervals: [-24, -17, -12, -5, 0, +7, +12, +19, +24] },
	 { name: "octaves", 					intervals: [-24, -12, -24, -12, 0, +12, +24, +12, +24] },
	 { name: "whole tone", 			intervals: [-8, -6, -4, -2, 0, +2, +4, +6, +8] },
	 { name: "12tone", 			intervals: 	   [-4, -3, -2, -1, 0, +1, +4, +5, +7] }
];

// look up a set from NOTE_INTERVAL_SETS by name
function getNoteIntervalSetFor(name) {
  // case-insensitive match by name
  const found = NOTE_INTERVAL_SETS.find(
    set => set.name.toLowerCase() === name.toLowerCase()
  );
  // if found, return it. otherwise default to first.
  if (!found) console.log(`getNoteIntervalSet couldn't find '${name}', defaulting to first set`);
  return found || NOTE_INTERVAL_SETS[0];
}


/* Markov Chain Inter-onset Interval States:
	When we randomly choose a short/medium/long note, it will randomly choose from these ranges/bands.
	For more typically rhythmic phrases, set identical min/max for each length so each length is identical
*/
const SHORTEST_NOTE_MS_DEFAULT = 35;

const DEFAULT_SEQUENCE_DURATION_STATES = [
	{ name: 'short',  min: 50,  max: 80 }, 	// needs to be longer than SHORTEST_NOTE_MS_DEFAULT 
	{ name: 'medium', min: 120, max: 160 },   // 120ms is an 8th note at 125 BPM
	{ name: 'long',   min: 240, max: 320 }    // 240ms is a quarter note at 125 BPM, 480 is a half note at 125 BPM
];

//	3 x 3 probability matrix of how likely it is we will transition from one state to another.
//	Each set of numbers needs to add up to 1 (100%).

const IOI_DURATION_PROBABILITY_MATRIX = [
  [0.6, 0.3, 0.1],  		// currently short? chances of staying short | switching medium | switching long 
  [0.2, 0.5, 0.3 ],		// currently medium? chances of switching short | staying medium | switching long
  [0.1, 0.6, 0.3 ]		// currently long? chances of switching short | switching medium | staying long
];

// 9 x 9 probability matrix which roughly favor small steps, with a chance to repeat (trill) or leap
// each set of numbers needs to add up to 1 (100%). Default is bell-curve like around middle note

const IOI_NOTE_PROBABILITY_MATRICES = {
	// -4   -3    -2    -1     0    +1    +2    +3    +4
	bell: [ // BELL CURVE (each row sums to 1.0)
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from -4
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from -3
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from -2
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from -1
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from 0
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from +1
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from +2
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], 					// from +3
	[0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02]  					// from +4
	],
	
	sharp: [ // SHARP BELL CURVE
	[0.80,   0.15,  0.03,  0.01,  0.005, 0.003, 0.001, 0.0005, 0.0005], 	// from -4
	[0.15,   0.70,  0.10,  0.03,  0.01,  0.005, 0.003, 0.001,  0.001 ], 	// from -3
	[0.03,   0.10,  0.65,  0.15,  0.05,  0.01,  0.005, 0.003,  0.002 ], 	// from -2
	[0.01,   0.03,  0.15,  0.60,  0.15,  0.04,  0.010, 0.007,  0.003 ], 	// from -1 
	[0.005,  0.01,  0.05,  0.185, 0.50,  0.185, 0.05,  0.01,   0.005 ], 	// from  0 
	[0.003,  0.007, 0.010, 0.04,  0.15,  0.60,  0.15,  0.03,   0.01  ], 	// from +1
	[0.002,  0.003, 0.005, 0.01,  0.05,  0.15,  0.65,  0.10,   0.03  ], 	// from +2
	[0.001,  0.001, 0.003, 0.005, 0.01,  0.03,  0.10,  0.70,   0.15  ], 	// from +3
	[0.0005, 0.0005,0.001, 0.003, 0.005, 0.01,  0.03,  0.15,   0.80  ]  	// from +4
	],
	
	super: [ // SUPER SHARP BELL CURVE
	[0.93,   0.06,   0.009,  0.001,  0,      0,      0,      0,      0     ], // from -4
	[0.06,   0.90,   0.03,   0.009,  0.001,  0,      0,      0,      0     ], // from -3
	[0.009,  0.03,   0.921,  0.03,   0.009,  0.001,  0,      0,      0     ], // from -2
	[0.001,  0.009,  0.03,   0.80,   0.15,   0.009,  0.001,  0,      0     ], // from -1
	[0.001,  0.004,  0.01,   0.01,   0.95,   0.01,   0.01,   0.004,  0.001 ], // from  0
	[0,      0,      0.001,  0.009,  0.15,   0.80,   0.03,   0.009,  0.001 ], // from +1
	[0,      0,      0,      0.001,  0.009,  0.03,   0.921,  0.03,   0.009 ], // from +2
	[0,      0,      0,      0,      0.001,  0.009,  0.03,   0.90,   0.06  ], // from +3
	[0,      0,      0,      0,      0,      0.001,  0.009,  0.06,   0.93  ]  // from +4
	]
}



//------------------------------------------
function Sound()
{
	//------------------------------------------
	// members
	//------------------------------------------
	let _parameter_0 = ZERO;
	let _parameter_1 = ZERO;
	let _parameter_2 = ZERO;
	let _parameter_3 = ZERO;

	//--------------------------------
	this.resetHistogram = function()
	{
		for (let i = 0; i < 12; i++) NOTE_HISTOGRAM[i] = 0;
		NOTE_COUNT = 0;
		MOD_COUNT  = 0;
	}

	this.initialize = function()
	{
		console.log("*** Sound.initialize() ***");

		// Audio samples are fetched via fetch(), which requires http(s). A file:// origin
		// (double-clicking index.html) will silently fail on every sample load.
		// The splash screen already warns the user in this case, so just bail quietly.
		if (window.location.protocol === 'file:') {
			console.warn("Sound.initialize(): file:// protocol detected — audio disabled.");
			return;
		}

		const ready = SwimbotSynth.initialize();
		if (!ready) {
			alert("Web Audio API is not available. This application requires a modern browser with Web Audio support. Safari and Chrome are good choices.");
		}
	}


	
	//----------------------------------------------------
	this.setGlobalParameters = function( p0, p1, p2, p3, rendering )
	{
		// retrieves interval, shortest note, etc. based on current running simulation
		const musicParameters = determineCurrentMusicParameters ();
		let minReverb = 				musicParameters.minReverb;
		let maxReverb = 				musicParameters.maxReverb;
		let secBetweenUnivNoteShift = 	musicParameters.secBetweenUnivNoteShift;
		let backgroundLoop = 				musicParameters.backgroundLoop;
		CURRENT_INTERVAL_SET_NAME = 		musicParameters.intervalSetName;

		SOUND_UPDATE_COUNTER +=1;
		_parameter_0 = p0;
		_parameter_1 = p1;
		_parameter_2 = p2;
		_parameter_3 = p3; // camera zoom, ranges from about 500 to 8000

		// grab camera zoom and use it for some globals
		const zoomPercentage = Math.min(1, Math.max(0, (_parameter_3 - 500) / 7500));
		CURRENT_ZOOM_PERCENTAGE = zoomPercentage; // expose to doSwimbotSoundEvent for per-event zoom-attenuation
		
		// Apply the ease-out cubic formula: 1 - (1 - x)^3 so we lose volume quickly as we start zooming out
		const easedZoom = 1 - Math.pow(1 - zoomPercentage, 3);
		
		// Calculate the final attenuation
		UTTER_ATTENUATION = Math.round(easedZoom * ZOOM_UTTER_ATTENUATION);

		// RADIAL and BIG_BANG swimbots can be crazy loud, attenuate them as well
		if (_chosenPoolToLoad == 3 || _chosenPoolToLoad == 4) UTTER_ATTENUATION = UTTER_ATTENUATION + LOUD_PRESET_ATTENUATION;
		
		let soundUpdatesPerSecond = Math.round(1000 / (SOUND_UPDATE_PERIOD * APPROX_MS_PER_CLOCK)); // how many counter clicks equals a second?
		const reverbAmount = Math.floor(minReverb + (zoomPercentage * (maxReverb-minReverb)) );

		// Reduce master volume during autopilot
		if (AUTOPILOT_MODE && !_autopilotVolumeApplied) {
			_autopilotVolumeStored = WEB_AUDIO_VOLUME;
			WEB_AUDIO_VOLUME *= (1 - AUTOPILOT_VOLUME_REDUCTION); // e.g. if AUTOPILOT_VOLUME_REDUCTION is .85 then this will reduce volume by a dramatic 85%
			_autopilotVolumeApplied = true;
			const slider = document.getElementById('mixerMaster');
			const valSpan = document.getElementById('mixerMasterVal');
			const notice = document.getElementById('autopilotVolumeNotice');
			if (slider) slider.value = Math.round(WEB_AUDIO_VOLUME / 0.75 * 100);
			if (valSpan) valSpan.textContent = Math.round(WEB_AUDIO_VOLUME / 0.75 * 100);
			if (notice) notice.style.display = 'inline-block';
		} else if (!AUTOPILOT_MODE && _autopilotVolumeApplied) {
			WEB_AUDIO_VOLUME = _autopilotVolumeStored;
			_autopilotVolumeApplied = false;
			const slider = document.getElementById('mixerMaster');
			const valSpan = document.getElementById('mixerMasterVal');
			const notice = document.getElementById('autopilotVolumeNotice');
			if (slider) slider.value = Math.round(WEB_AUDIO_VOLUME / 0.75 * 100);
			if (valSpan) valSpan.textContent = Math.round(WEB_AUDIO_VOLUME / 0.75 * 100);
			if (notice) notice.style.display = 'none';
		}

		// Web Audio: reverb wet level and background loop management
		if (SwimbotSynth.isReady()) {
			SwimbotSynth.setReverbWet(reverbAmount / 127);
			if (backgroundLoop && !_runningFast && rendering) {
				SwimbotSynth.startLoop(backgroundLoop, { volume: 0.2 * WEB_VOLUME_LOOP, reverb: true });
			} else {
				SwimbotSynth.stopLoop();
			}
		}

		// TODO: Web Audio atmospheric drone synth (was MIDI CC-driven drone on channel 15)


		// THE UNIVERSE BACKGROUND HUM moves around to generate interest
		if (secBetweenUnivNoteShift && SOUND_UPDATE_COUNTER % (soundUpdatesPerSecond * secBetweenUnivNoteShift) === 0) {
  	 		const defaultIntervals = NOTE_INTERVAL_SETS[0].intervals; // pentatonic
  			UNIVERSAL_NOTE_SHIFT = defaultIntervals[Math.floor(Math.random() * defaultIntervals.length)];
			console.log ("*** UNIVERSAL BACKGROUND SHIFTED " + UNIVERSAL_NOTE_SHIFT + " ***");
		}

		if (SOUND_UPDATE_COUNTER % 10 === 0) {
			// Decay the histogram so it reflects recent activity, not all-time totals
			for (let i = 0; i < 12; i++) NOTE_HISTOGRAM[i] = Math.floor(NOTE_HISTOGRAM[i] * 0.92);
			NOTE_COUNT = Math.floor(NOTE_COUNT * 0.92);
			MOD_COUNT  = Math.floor(MOD_COUNT * 0.92);
		}
	} /* end setGlobalParameters */

	//------------------------------------------------------------------------------------------------------
	// doSwimbotSoundEvent — plays non-diegetic one-shot samples for biological events
	this.doSwimbotSoundEvent = function( type, eventIndex = false )
	{
		if (!SwimbotSynth.isReady()) return;

		// UI sounds play regardless of fast/rendering mode
		if ( type === SOUND_EVENT_TYPE_LAUNCH ) {
			const sampleName = LAUNCH_SAMPLES[eventIndex];
			if (sampleName) {
				SwimbotSynth.playSample(sampleName, { volume: WEB_VOLUME_UI, reverb: true });
			}
			// 'pop' plays on top of every preset launch sound
			SwimbotSynth.playSample('pop', { volume: WEB_VOLUME_UI, reverb: true });
			return;
		}

		if (_runningFast) return;

		if ( type === SOUND_EVENT_TYPE_EAT ) {
			if (SOUND_OUTPUT_EAT) {
				const pick = WA_EAT_SAMPLES[Math.floor(Math.random() * WA_EAT_SAMPLES.length)];
				const intervals = getNoteIntervalSetFor(CURRENT_INTERVAL_SET_NAME).intervals;
				const semitones = intervals[Math.floor(Math.random() * intervals.length)]; // pick from our current interval options
				SwimbotSynth.playSample(pick, { volume: 0.9 * WEB_VOLUME_EAT, semitones: semitones, reverb: true, reverbSend: 3.0 });
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH ) { // 'natural' birth in the simulation causes this
			if (SOUND_OUTPUT_BIRTH) {
				// first pick a random birth sound
				const pick = WA_BIRTH_SAMPLES[Math.floor(Math.random() * WA_BIRTH_SAMPLES.length)];
				// now pick a random note shift according to our current interval
				const intervals = getNoteIntervalSetFor(CURRENT_INTERVAL_SET_NAME).intervals;
				const semitones = intervals[Math.floor(Math.random() * intervals.length)]; // pick from our current interval options
				// quieter when zoomed out: 0.90 zoomed all the way in → 0.50 zoomed all the way out
				const zoomAttn = 0.90 - (0.40 * CURRENT_ZOOM_PERCENTAGE);
				SwimbotSynth.playSample(pick, { volume: zoomAttn * WEB_VOLUME_BIRTH, semitones: semitones, reverb: true });
			}
		} else if ( type === SOUND_EVENT_TYPE_SPAWN ) { // only invoked when we makeNewRandomSwimbot()
			if (SOUND_OUTPUT_SPAWN) {
				// first play the birth sound, as if this were a natural birth, but QUIETER
				const pick = WA_BIRTH_SAMPLES[Math.floor(Math.random() * WA_BIRTH_SAMPLES.length)];
				// now pick a random note shift according to our current interval
				const intervals = getNoteIntervalSetFor(CURRENT_INTERVAL_SET_NAME).intervals;
				const semitones = intervals[Math.floor(Math.random() * intervals.length)]; // pick from our current interval options
				SwimbotSynth.playSample(pick, { volume: 0.25 * WEB_VOLUME_BIRTH, semitones: semitones, reverb: true });

				// now do a q*bert style vocalization by choosing two random spawn-01 to spawn-09 sounds and playing them back-to-back
				if (WA_SPAWN_SAMPLES.length >= 2) {
					const firstIdx = Math.floor(Math.random() * WA_SPAWN_SAMPLES.length);
					let secondIdx;
					do {
						secondIdx = Math.floor(Math.random() * WA_SPAWN_SAMPLES.length);
					} while (secondIdx === firstIdx); // while forces us to choose different samples
					const firstSample  = WA_SPAWN_SAMPLES[firstIdx];
					const secondSample = WA_SPAWN_SAMPLES[secondIdx];
					SwimbotSynth.playSample(firstSample,  { volume: 0.9 * WEB_VOLUME_SPAWN, reverb: true });
					setTimeout(() => {
						SwimbotSynth.playSample(secondSample, { volume: 0.9 * WEB_VOLUME_SPAWN, reverb: true });
					}, 220); // ~q*bert syllable timing
				}
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH ) {
			if (SOUND_OUTPUT_DEATH) {
				const pick = WA_DEATH_SAMPLES[Math.floor(Math.random() * WA_DEATH_SAMPLES.length)];
				const intervals = getNoteIntervalSetFor(CURRENT_INTERVAL_SET_NAME).intervals;
				const semitones = intervals[Math.floor(Math.random() * intervals.length)]; // pick from our current interval options
				SwimbotSynth.playSample(pick, { volume: 0.9 * WEB_VOLUME_DEATH, semitones: semitones, reverb: true });
			}
		}

		if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("doSwimbotSoundEvent type=" + type);
    }


	// GenePool.js decides when a swimbot should utter, at which point
	// doUtterance() is called with an object describing its utterance phenotypes
	// this will ALSO trigger the visual ripples (eyecandy)
	this.doUtterance = function (utterVariablesObj, callerFunction) {
		if (!SwimbotSynth.isReady() || _runningFast) return;

		// Should we play this utterance?
		const playAudio = utterVariablesObj.swimbotInView && SOUND_OUTPUT_UTTER;

		// Is our swimbot off screen? If so, don't fill up our timer with
		// loads of notes and ripples that will never actually play.
		// Instead just log the stats of what *would* have played for our
		// analysis purposes.
		
		if (!playAudio && !utterVariablesObj.onNoteEmit) {
			for (const step of utterVariablesObj.utterSequence) {
				if (step.type === 'note') {
					NOTE_HISTOGRAM[step.note % 12]++;
					NOTE_COUNT++;
				} else if (step.type === 'cc') {
					MOD_COUNT++;
				}
			}
			return;
		}

		// If we got this far, then our intent is to really do it.
		// Each utterance gets its own formant chain so simultaneous swimbots
		// don't clobber each other's CC state.
		const voice = playAudio ? SwimbotSynth.createVoice(utterVariablesObj.panValue, utterVariablesObj.swimbotID) : null;

		for (const step of utterVariablesObj.utterSequence) {
			setTimeout(() => {
				if (step.type === 'note') {
					// attenuate it (zoom etc.) into a LOCAL — step is shared by
					// reference with the bot's stored song via getUtterSequence(),
					// so writing back would permanently ratchet its velocities down
					let velocity = step.velocity - UTTER_ATTENUATION;

					// clamp it within our min/max bounds
					velocity = Math.max(MINIMUM_UTTER_VELOCITY, velocity); // not below the minimum
					velocity = Math.min(MAXIMUM_UTTER_VELOCITY, velocity); // not above the maximum

					// Sound the note (synth)
					if (voice) SwimbotSynth.playVoiceNote(voice, step.note, velocity, step.duration);
					// Visualize the note (utterance ripple)
					if (utterVariablesObj.onNoteEmit) utterVariablesObj.onNoteEmit(step.note);
					NOTE_HISTOGRAM[step.note % 12]++;
					NOTE_COUNT++;
				} else if (step.type === 'cc') {
					if (voice) voice.handleCC(step.cc, step.value);
					MOD_COUNT++;
				} else if (step.type === 'done') {
					if (voice) voice.dispose();
				}
			}, step.delay);
		}
	}


} // *** end class/object Sound () ***




/**
 * generateUtterancePhenotypes
 * ---------------------------
 * Given gene values, gene names, and utterance timing parameters,
 * generates a musically structured sequence of events (notes and CCs)
 * using Markov chains and gene-influenced random mutation.
 * Tracks features of the generated sequence (notes used, highest/lowest note, etc.).
 * Returns an object containing the sequence data and phenotype stats.
 * Used for simulating swimbot "songs" in a deterministic, gene-driven way.
 * Called exclusively from Embryology.js as part of the birth process.
 *
 * Genes that influence our songs are:
 * "utter spin" 0-255
 * "utter charm" 0-255
 * "utter strangeness" 0-255, and of course
 * "utter duration" 0-255 which is simply how many clock ticks long the utterance should be
 *
 */


function generateUtterancePhenotypes(genes, _geneNames, utterPeriod, utterDuration) {
	// retrieves interval, shortest note, etc. based on current running simulation
	const musicParameters = determineCurrentMusicParameters ();
	let myNoteIntervalSet = musicParameters.intervalSet; // e.g. [-9, -7, -5, -2, 0, +3, +5, +7, +10]
	let myIntervalSetName = musicParameters.intervalSetName;
	let shortestNoteMs = musicParameters.shortestNoteMs;
	let myNoteProbabilities = musicParameters.noteProbabilityMatrix;
	let mySequenceDurationStates = musicParameters.seqDurationStates;

	/*** Assign duration and note probability matrices ***/
	let myDurationProbabilities = IOI_DURATION_PROBABILITY_MATRIX;


	if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("utterPeriod/utterDuration provided as " + utterPeriod + "/" + utterDuration);
	
	let idx; // our generic index which we re-use a lot
	UTTERANCE_COMPOSING_COUNTER ++;

	for (let i = 0; i < _geneNames.length; i++) { 
		if (_geneNames[i].includes('utter') && DEBUGGING_NOISY_CONSOLE_MODE) console.log("gene " + i + " " + _geneNames[i], genes[i]);
	}


   const rng = aleaPRNG(genes.slice(UTTERANCE_GENES_SLICE_START, UTTERANCE_GENES_SLICE_END).toString()); // initialize genes with only uttering-related genes
   // const rng = aleaPRNG('foobar'); // force same seed for everyone
	
	/*** DEMO FUDGE TO CREATE TRIBES. SPLICE IN FIXED GENES FOR SWIMBOT INSTANCES 0-9, but with some variation for utter period  ***/
	/*
	if (UTTERANCE_COMPOSING_COUNTER <= 5) {
			console.log ('*** SPAWNING TRIBE A ***');
			genes.splice(UTTERANCE_GENES_SLICE_START, 7, 	184, 198, 140, 17, 124, 144, 126);
	} else if (UTTERANCE_COMPOSING_COUNTER <= 10) {
			console.log ('*** SPAWNING TRIBE B ***');
			genes.splice(UTTERANCE_GENES_SLICE_START, 7, 	134, 20, 138, 235, 176, 95	, 40);
	}

	if (UTTERANCE_COMPOSING_COUNTER <= 10) {
		// DEMO FUDGE ADD BACK IN A TINY BIT OF VARIATION AFTER THE RNG WAS SEEDED
		let randomSlicePosition = UTTERANCE_GENES_SLICE_START + Math.floor(Math.random() * 4);
		let randomSliceValue1 = Math.floor(Math.random()*255);
		let randomSliceValue2 = Math.floor(Math.random()*255);
		genes.splice(randomSlicePosition, 2, randomSliceValue1, randomSliceValue2);
	}
	// console.log ("Seeding RNG with genes: " + genes.slice(UTTERANCE_GENES_SLICE_START, UTTERANCE_GENES_SLICE_END).toString());

	*/
	
	
	// WHAT IS MY BASE NOTE?
	let myBaseNote = BASE_NOTE;

	// console.log('Genes: ' + genes.toString());


	idx = _geneNames.indexOf('utter duration');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter duration' from genes")
	const utterDurationVal = genes[idx]; // 0-255
	
	const utterSequenceLength = utterDuration * APPROX_MS_PER_CLOCK; // range of 5-100 = 150ms-3000ms
	if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("utter duration is " + utterDurationVal + " which maps to " + utterDuration + " clocks, approx. " + utterSequenceLength + "ms");

	// USE UTTER STRANGENESS GENE TO DETERMINE DEVIANT SWIMBOTS THAT JUMP THE CIRCLE OF 5ths EARLY, OR USE DIFFERENT INTERVAL SETS
	// the universe cycles through the 5ths slowly, but sometimes (rarely) a swimbot will jump early
	idx = _geneNames.indexOf('utter strangeness');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter strangeness' from genes")
	const utterStrangeness = genes[idx]; // 0-255
	const chanceOfJumpingFifths = (utterStrangeness/255) ** 5; // heavily weighted towards "nope"
	if (rng() < chanceOfJumpingFifths) {
		if (rng() > .5) { // are we going to jump up or down?
			myBaseNote = myBaseNote + 7;
			if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("-> Rolled to jump UP a fifth!");
		} else {
			myBaseNote = myBaseNote -5;
			if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("-> Rolled to jump DOWN a fifth!");
		}
	}
	
	const chanceOfUnusualInterval = (utterStrangeness/255) ** 8; // heavily weighted towards default interval set
	if (rng() < chanceOfUnusualInterval) {
		if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("-> Rolled to tweak intervals for '" + myNoteIntervalSet.name + "'!");
		// TK - tweak them intervals!
	}

	if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("utter strangeness is " + utterStrangeness + ", so probability of jumping 5ths was " + (chanceOfJumpingFifths * 100).toFixed(2) + "% and mutating interval was " + (chanceOfUnusualInterval * 100).toFixed(2) + "%");

	// USE UTTER FLAVOR GENE TO ADJUST OUR NOTE LENGTHS
	idx = _geneNames.indexOf('utter flavor');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter flavor' from genes")
	const utterFlavor = genes[idx]; // 0-255
	const chanceOfLengtheningNotes = (utterFlavor/255); // unweighted 0-1

	if (rng() < chanceOfLengtheningNotes) {
		mySequenceDurationStates[0].min *= 1.5; // short notes are 1.5x longer
		mySequenceDurationStates[0].max *= 1.5;
		mySequenceDurationStates[1].min *= 2; // medium notes are 2x longer
		mySequenceDurationStates[1].max *= 2;
		mySequenceDurationStates[2].min = mySequenceDurationStates[1].max; // long notes are 1x-2x as long as the longest medium notes 
		mySequenceDurationStates[2].max = mySequenceDurationStates[2].min * 2;
		if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("-> Utter flavor rolled to increase sequence duration states (longer notes)");
	}
	
	// USE UTTER SPIN GENE TO DETERMINE OUR OCTAVE
	// what octave do we sing in? bell-curveish with fewer basses and sopranos
	idx = _geneNames.indexOf('utter spin');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter spin' from genes")
	const utterSpin = genes[idx]; // 0-255
	// const octaveShiftOptions = [12,12,12,24,24,24,24,24,24,36,36,36,36,48,48,48
	const octaveShiftOptions = [	12,12,	24,24,24,	36,36,36,36,	48,48,	60];
		
	idx = Math.floor(utterSpin / 255 * (octaveShiftOptions.length - 1));
	let myOctaveNoteShift = octaveShiftOptions[idx];
	if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("utter spin is " + utterSpin + " which corresponds to octave +" + myOctaveNoteShift/12);

	// USE UTTER CHARM TO DETERMINE HOW MUCH WE MUTATE OUR RHYTHMS
	// 0-10: mutationFactor determines how many times our music note and duration markov chain matrices will be mutated, weighted towards less
	idx = _geneNames.indexOf('utter charm');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter charm' from genes")
	const utterCharm = genes[idx]; // 0-255
	const mutationFactorOptions = [0,0,0,0,0,0,,1,1,1,2,2,5,8,10,20]; // mostly no mutation, or a little bit, a few outliers
	idx = Math.floor(utterCharm / 255 * (mutationFactorOptions.length - 1));
	let mutationFactor = mutationFactorOptions[idx];
	if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("utter charm is " + utterCharm + ", which encourages us to mutate our rhythm and interval probabilities " + mutationFactor + "/10 times.");
	
	// numberOfIntervalRotations adjusts how far away our *starting* note might drift from the center note
	// we don't use a gene to determine this, all swimbots have an equal inclination/disinclination in this regard
	// * 0 means "always start on the center"
	// * 1 means "start at the center note, or up to one interval away"
	// * 5 means "start as the center note, or any of the possible 5 intervals"
	var numberOfIntervalRotations = Math.floor(rng() * 3);


// numberOfIntervalRotations = 0;
	
	// IMPORTANT! To make sure everyone doesn't start on the same note, we randomly rotate the intervals
	// for example, this:		[-10, -8, -5, -3, 0, +2, +4, +7, +9];
	// might turn into this:	[+7, +9, -10, -8, -5, -3, 0, +2, +4]; (rotated two positions)
	for (let i = 0; i < numberOfIntervalRotations; i++) {
		myNoteIntervalSet.unshift(myNoteIntervalSet.pop());
	}
	
// mutationFactor = 1;

	/*** Mutate our markov tables? if so how much? ***/
	for (let i = 0; i < mutationFactor; i++) { // the more times we mutate it, the more we stray from the default bell-curve
		myDurationProbabilities = createMutatedMatrix(myDurationProbabilities, rng, 0.2);
		myNoteProbabilities = createMutatedMatrix(myNoteProbabilities, rng, 0.2);
	}
	
	/*
   logProbabilityMatrix('Original Note Probability Matrix:', musicParameters.noteProbabilityMatrix);
   logProbabilityMatrix('Mutated x' + mutationFactor + ' Note Probability Matrix:', myNoteProbabilities);
	*/
	 
	let sequenceTime = 0; // keep track of our timeline for composing (in ms)
	
	const sequenceData = [];
	
	// these vars will keep a record of the phenotypical attributes of our new note sequence
	let recordNotesUsed = [], recordHighNote = 0, recordLowNote = 127, recordNoteCount = 0, recordModCount = 0;
		
	// how long are our notes?
	const noteLengthOptions = ['staccato','legato','complex','complex']; // weighted towards favorites
	let noteLengthStyle = noteLengthOptions[Math.floor(rng() * noteLengthOptions.length)];		
		
	// how strong should our mod wheel wiggling be, and how often should we do it?
	const modulationStrength = Math.floor((rng() * 16) * 4); // how fast to twist knobs
	const modChanceOptions = [0,0,0.05,0.10,0.15,0.20,0.30]; // weighed towards some and lots of wiggle

	let chanceOfModulation = modChanceOptions[Math.floor(rng() * modChanceOptions.length)];
		
	// Markov Chain time! Pick an initial Interval State (note)
	// in most cases, we choose the middle-most note of the interval set, because that's the one that's stickiest
	// and hardest to drift from. Encourages repeated single-note morse-code type utterances.
	let lastInt = 4;
		
	// Now pick the initial Inter-Onset Interval (duration)
	let lastIOI = Math.floor(rng() * mySequenceDurationStates.length); // might be short, medium, or long initial note
	// if (utterSequenceLength < 750) lastIOI = 0; // override for short utterances. they should ALWAYS start with a short note (zero index to Interval State)
		

	// SET UP THE SYNTHESIZER AT THE BEGINNING OF THE UTTERANCE		
	// initialize synthesizer controls with a range of min to max.
	// 'variable' means yes our sequence may twiddle this knob as part of sequencing
	// in which case the variableWidth is how much you can twiddle it
	let myControls = [
		{ cc: 14, min: 0,		max: 127,	initialVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up' }, 	// "noise mix"
		{ cc: 15, min: 0,		max: 127,	initialVal: 0,	variable: true,	variableWidth: 127,	lastVal: 0,	lastDir: 'up' }, 	// "mouth"
		{ cc: 16, min: 40,	max: 100,	initialVal: 0,	variable: true,	variableWidth: 60,	lastVal: 0,	lastDir: 'up'  }, // "size"
		{ cc: 17, min: 0,		max: 127,	initialVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  }, // "tone" — pitched osc mix: 0=sawtooth, 127=sine
		{ cc: 19, min: 32,	max: 64,		initialVal: 0,	variable: true,	variableWidth: 32,		lastVal: 0,	lastDir: 'up'  },	// "F2 resonance"
		{ cc: 20, min: 20,	max: 100,	initialVal: 0,	variable: true,	variableWidth: 64,		lastVal: 0,	lastDir: 'up'  } 	// "F3 gain"
	];
	
	// walk through myControls and pick an initial setting for each
	for (let setting of myControls) {
		const range = setting.max - setting.min + 1;
		let myCCval = Math.floor((rng() * range) + setting.min);
		setting.initialVal = myCCval; // remember our initial home position
		setting.lastVal = myCCval; // this will also be our last known position
		if (rng() > .5) setting.lastDir = 'down'; // randomly override initial spin direction
	}
		
	// Adjustment 1: Quantize CC14 noise mix, usually we don't want noise, but sometimes we like a LOT
	const cc14Control = myControls.find(c => c.cc === 14);
	if (cc14Control.initialVal < 90) { // any roll under gets no noise at all 
		cc14Control.initialVal = 0;
	} else if ( cc14Control.initialVal >= 90 && cc14Control.initialVal < 110) { // these get a little noise
		cc14Control.initialVal = 45;
	} else { // and rarely we apply a LOT
		cc14Control.initialVal = 115;
	}

	// Adjustment 2: Quantize CC17 tone mix leaning towards our original sawtooth voice style
	const cc15Control = myControls.find(c => c.cc === 15); // mouth
	const cc16Control = myControls.find(c => c.cc === 16); // size
	const cc17Control = myControls.find(c => c.cc === 17); // tone
	if (cc17Control.initialVal < 60) { // any roll under 60 gets a pure sawtooth, no other tones mixed in
		cc17Control.initialVal = 0; // pure sawtooth
		cc14Control.initialVal = 0; // also back out any noise we might have mixed in
		// and in this case, also tweak our mouth and size
		let cc15tweak, cc16tweak;
		do {
			cc15tweak = Math.floor(rng() * (cc15Control.max - cc15Control.min + 1)) + cc15Control.min;
			cc16tweak = Math.floor(rng() * (cc16Control.max - cc16Control.min + 1)) + cc16Control.min;
		} while (cc15tweak + cc16tweak < 100);
		cc15Control.initialVal = cc15Control.lastVal = cc15tweak;
		cc16Control.initialVal = cc16Control.lastVal = cc16tweak;	
	}
	

	// Now that we picked our synth settings, queue them up in the sequence itself to initialize the synth
	for (let setting of myControls) {
		sequenceTime += 10; // add 10ms
		sequenceData.push({
			delay: sequenceTime,
			type: 'cc',
			cc: setting.cc,
			value: setting.initialVal
		});
	}

	
	sequenceTime += 10; // wait 10ms before composing main utterance
	while (sequenceTime < utterSequenceLength) {
		// pick next inter-onset interval
		let p = rng(), cumulativeProb = 0, nextIOI;
		for (let i = 0; i < mySequenceDurationStates.length; i++) {
			cumulativeProb += myDurationProbabilities[lastIOI][i];
			if (p < cumulativeProb) { nextIOI = i; break; }
		}
		// fallback if rounding/FP left nextIOI undefined
		if (nextIOI === undefined) nextIOI = mySequenceDurationStates.length - 1;
	
		const band = mySequenceDurationStates[nextIOI];
		const interOnsetIntervalMs = band.min + Math.round(rng() * (band.max - band.min));
	
		// HOW LONG SHOULD THIS NOTE PLAY?
		let thisNoteDuration = shortestNoteMs;
		
		if (noteLengthStyle == 'staccato') { // short note
			thisNoteDuration = shortestNoteMs; // default AKA 'staccato'
	   } else if (noteLengthStyle == 'legato') { // as long as possible
			thisNoteDuration = Math.max(shortestNoteMs, interOnsetIntervalMs - (shortestNoteMs * 1.5)); // leave some space between notes
		} else if (noteLengthStyle == 'complex') { // anywhere in between, random
			thisNoteDuration = Math.max(shortestNoteMs, interOnsetIntervalMs * Math.floor(rng())); 
		}
	
		// ——— pick next interval state ———
		p = rng(); cumulativeProb = 0; let nextIntState;
		for (let i = 0; i < myNoteIntervalSet.length; i++) {
			cumulativeProb += myNoteProbabilities[lastInt][i];
			if (p < cumulativeProb) { nextIntState = i; break; }
		}
		if (nextIntState === undefined) nextIntState = myNoteIntervalSet.length - 1;
		const thisNoteShift = myNoteIntervalSet[nextIntState];
		let thisNoteNumber = myBaseNote + myOctaveNoteShift + thisNoteShift + UNIVERSAL_NOTE_SHIFT;
		
		// record some phenotypical info
		if (thisNoteNumber > recordHighNote) recordHighNote = thisNoteNumber; // we hit our highest note yet
		if (thisNoteNumber < recordLowNote) recordLowNote = thisNoteNumber; // we hit our lowest note yet
		if (!recordNotesUsed.includes(thisNoteNumber % 12)) recordNotesUsed.push(thisNoteNumber % 12); // we used a new note (%12 means ignore octave)
	
		// push event into sequencer
		sequenceData.push({
			delay:    sequenceTime,  // in ms
			type:     'note',
			note:     thisNoteNumber,
			velocity: 80 + Math.round(rng() * 40),
			duration: thisNoteDuration
		});
		recordNoteCount ++;
					
		// advance time & states
		sequenceTime += interOnsetIntervalMs;
		lastIOI = nextIOI;
		lastInt = nextIntState;
	} // end while sequenceTime < utterSequenceLength
	
	// insert final 'done' event — must wait for the last note's envelope release to finish
	const lastNote  = sequenceData.filter(e => e.type === 'note').pop();
	const doneDelay = lastNote ? lastNote.delay + lastNote.duration + 300 : sequenceTime; // 300ms release padding
	sequenceData.push({ delay: doneDelay, type: 'done' });


	// Now walk through sequenceData and insert random modulation events.
	// don't insert any random events prior to the first type:note that appears in the sequence
	// 1. Find the first 'note' event to determine the modulation starting time
	let firstNoteIdx = sequenceData.findIndex(ev => ev.type === 'note');
	let firstNoteTime = sequenceData[firstNoteIdx].delay;
	
	// 2. Find the final end time (last 'done' or last delay)
	let lastDelay = sequenceData.reduce((max, ev) => Math.max(max, ev.delay), 0);

	// 3. For every MODULATION_SPEED_MS step from firstNoteTime up to lastDelay, consider a modulation event
	for (let t = firstNoteTime; t <= lastDelay; t += MODULATION_SPEED_MS) {
		if (rng() < chanceOfModulation) {
			// 1. Filter controls to those with variable: true
			const variableControls = myControls.filter(c => c.variable);
			if (!variableControls.length) continue; // nothing to modulate

			// 2. Randomly pick one
			const idx = Math.floor(rng() * variableControls.length);
			const setting = variableControls[idx];

			// 3. Calculate modulation range
			const halfWidth = setting.variableWidth / 2;
			const ccMin = Math.max(setting.min, setting.initialVal - halfWidth);
			const ccMax = Math.min(setting.max, setting.initialVal + halfWidth);

			// 4. Modulate value up or down depending on lastDir
			let ccVal, newDir = setting.lastDir;
			if (setting.lastDir === 'up') {
				ccVal = setting.lastVal + modulationStrength;
				if (ccVal > ccMax) {
					ccVal = ccMax;
					newDir = 'down';
				}
			} else { // lastDir is 'down'
				ccVal = setting.lastVal - modulationStrength;
				if (ccVal < ccMin) {
					ccVal = ccMin;
					newDir = 'up';
				}
			}

			// 5. Update lastVal and lastDir
			setting.lastVal = ccVal;
			setting.lastDir = newDir;

			// 6. Push the event
			sequenceData.push({
				delay: t,  // current moment in ms
				type: 'cc',
				cc: setting.cc,
				value: Math.floor(ccVal)
			});
			recordModCount += modulationStrength;
		} // end modulation insertion
	}

	// Idiot check, make absolutely sure our sequence is in order to keep sequence chronological, otherwise playback will break!
	sequenceData.sort((a, b) => a.delay - b.delay);


	// in the end, sequenceData will hold our generated sequence, something like this:
	/* 
		[
			{ delay: 0, type: 'note', note: 44, velocity: 127, duration: 1000 },
			{ delay: 500, type: 'cc', cc: 1, value: 96 },
			{ delay: 1000, type: 'done' }
		];
	*/
		
	// return our object of phenotypes
	let utterancePhenotypeObj = { sequenceData, recordNotesUsed, recordHighNote, recordLowNote, recordNoteCount, recordModCount};
	if (DEBUGGING_NOISY_CONSOLE_MODE) {
		console.log ("UTTERANCE COMPOSED: myBaseNote=" + myBaseNote + " octave=" + (myOctaveNoteShift/12) + " mutationFactor=" + mutationFactor + " noteLengthStyle=" + noteLengthStyle + " chanceOfModulation=" + chanceOfModulation + " modulationStrength=" + modulationStrength + " recordNoteCount=" + recordNoteCount + " recordModCount=" + recordModCount, sequenceData);
		console.log ("UTTERANCE COMPOSITION NOTES USED " + recordNotesUsed);
	}
	return (utterancePhenotypeObj);
}

/**
 * Creates a mutated copy of a probability matrix with two-decimal precision.
 * It transfers a small amount between two elements and then applies a sum-preserving
 * rounding method to ensure all row probabilities sum to 1.
 *
 * @param {number[][]} sourceMatrix The original probability matrix.
 * @param {function} rng A function that returns a random number between 0 and 1.
 * @param {number} maxDelta the maximum change in probability we might mutate between the two cells we pick
 * @returns {number[][]} The new, mutated, and rounded matrix.
 */
function createMutatedMatrix(sourceMatrix, rng, maxDelta = 0.1) {
    // Create a deep copy to work on, leaving the original unchanged.
    const newMatrix = JSON.parse(JSON.stringify(sourceMatrix));

    for (const row of newMatrix) { // iterate through rows, and try to mutate *each row*
        if (row.length < 2) continue; // Can't transfer with fewer than 2 elements.

        // 1. Pick two different indices at random (so if this is a 9x9 table, we're only going to be messing with two values)
        let i = Math.floor(rng() * row.length);
        let j;
        do {
            j = Math.floor(rng() * row.length);
        } while (j === i);

        // 2. Randomly decide which direction to transfer probability.
        if (rng() < 0.5) {
            // Transfer from i to j
            const delta = rng() * Math.min(row[i], maxDelta);
            row[i] -= delta;
            row[j] += delta;
        } else {
            // Transfer from j to i
            const delta = rng() * Math.min(row[j], maxDelta);
            row[j] -= delta;
            row[i] += delta;
        }
    }
    return newMatrix;
}

function logProbabilityMatrix(label, matrix) {
    console.log(label);
    for (const row of matrix) {
        // Format each number as a string with 3 decimals, zero-padded.
        const formatted = row.map(num => num.toFixed(3).padStart(5, '0'));
        console.log('  [', formatted.join(', '), ']');
    }
}




/***************************************************************
	determineCurrentMusicParameters()
	Specifies note intervals and other parameters that influence
	utterance generation and general sonic parameters.
	_chosenPoolToLoad is our current simulation, normally 0-5.
	NOTE_INTERVAL_SETS has our stable of interval sets.
****************************************************************/

function determineCurrentMusicParameters () {
	// set / reestablish defaults
	let mySet = getNoteIntervalSetFor('minor pentatonic'); // default set
	let minReverb = MIN_REVERB_DEFAULT;
	let maxReverb = MAX_REVERB_DEFAULT;
	let secBetweenUnivNoteShift = SECONDS_BETWEEN_UNIVERSAL_NOTE_SHIFT_DEFAULT;
	let shortestNoteMs = SHORTEST_NOTE_MS_DEFAULT;
	let noteProbabilityMatrix = structuredClone(IOI_NOTE_PROBABILITY_MATRICES['super']); // default to bell curve instead of 'sharp' or 'super'
	let backgroundLoop = DEFAULT_BACKGROUND_LOOP;
	let seqDurationStates = structuredClone(DEFAULT_SEQUENCE_DURATION_STATES);
	
	/* seqDurationStates default is something like
	{ name: 'short',  min: 60,  max: 80 }, 	// needs to be longer than SHORTEST_NOTE_MS_DEFAULT 
	{ name: 'medium', min: 140, max: 210 },   // 120ms is an 8th note at 125 BPM
	{ name: 'long',   min: 280, max: 420 }    // 240ms is a quarter note at 125 BPM, 480 is a half note at 125 BPM
	*/
	
	/*** BLANK POOL ***/
	if (_chosenPoolToLoad == 0) {
		backgroundLoop = 'bg-lake-bacalar'; 							// no background loop
		mySet = getNoteIntervalSetFor('minor pentatonic');
		// mySet = getNoteIntervalSetFor('octaves');
		SwimbotSynth.setReverbIR('bright4');
		minReverb = Math.floor(MIN_REVERB_DEFAULT * 1.1); // a little more reverb
	/*** INVASION ***/
	} else if (_chosenPoolToLoad == 1) {
		// minReverb = Math.floor(MAX_REVERB_DEFAULT * .75); // lots of reverb
		mySet = getNoteIntervalSetFor('octaves');
		secBetweenUnivNoteShift = 10; 				// shorter shifts
		shortestNoteMs = 90; 							// shortest notes will be 90ms
		seqDurationStates[0].min = 100; 				// lengthen 'short' min to 100ms
		seqDurationStates[0].max = 140; 				// lengthen 'short' max to 140mx
		backgroundLoop = 'bg-bell-drone';
		SwimbotSynth.setReverbIR('bright4');

	/*** FLOCKS ***/
	} else if (_chosenPoolToLoad == 2) {
		backgroundLoop = 'bg-bell-drone';
		mySet = getNoteIntervalSetFor('pentatonic');
		noteProbabilityMatrix = structuredClone(IOI_NOTE_PROBABILITY_MATRICES['bell']); // evener note distribution
		SwimbotSynth.setReverbIR('echohall');

	/*** RADIAL ***/
	} else if (_chosenPoolToLoad == 3) {
		shortestNoteMs = 35; 							// shortest notes will be 90ms
		noteProbabilityMatrix = structuredClone(IOI_NOTE_PROBABILITY_MATRICES['sharp']); // evener note distribution
		mySet = getNoteIntervalSetFor('12tone');
		backgroundLoop = 'bg-reaktor-drone';
		SwimbotSynth.setReverbIR('tunnel');
		maxReverb = Math.floor(MIN_REVERB_DEFAULT * 1.25); // much less max reverb when zoomed out
	/*** BIG BANG ***/
	} else if (_chosenPoolToLoad == 4) {
		mySet = getNoteIntervalSetFor('pentatonic');
		secBetweenUnivNoteShift = 60 * 2; 			// shorter shifts
		SwimbotSynth.setReverbIR('bright4');
		maxReverb = Math.floor(MAX_REVERB_DEFAULT * .8); // less reverb
		
	/*** AUTOPILOT ***/
	} else if (_chosenPoolToLoad == 5) {
		mySet = getNoteIntervalSetFor('octaves');
		backgroundLoop = 'bg-lake-bacalar';
		minReverb = Math.floor(MAX_REVERB_DEFAULT * .7); // loads of reverb
		SwimbotSynth.setReverbIR('dark4');
	}
	
	// build up our musicParameters object and return it
	let musicParameters = {
			shortestNoteMs:				shortestNoteMs,
			minReverb:					minReverb,
			maxReverb:					maxReverb,
			backgroundLoop:				backgroundLoop,
			secBetweenUnivNoteShift:	secBetweenUnivNoteShift,
			intervalSet:				mySet.intervals.slice(),		// e.g. [-9, -7, -5, -2, 0, +3, +5, +7, +10]. // slice to detach from original
			intervalSetName: 			mySet.name,							// e.g. 'minor pentatonic'
			noteProbabilityMatrix:		noteProbabilityMatrix,
			seqDurationStates:			seqDurationStates
		};
	return musicParameters;
}











// --- startup sanity checks ---
function sanityCheckMusicConfig() {
  // 1) Interval sets: shape + types (+ center 0)
  if (!Array.isArray(NOTE_INTERVAL_SETS) || NOTE_INTERVAL_SETS.length === 0) {
    throw new Error("NOTE_INTERVAL_SETS must be a non-empty array.");
  }

  NOTE_INTERVAL_SETS.forEach((set, i) => {
    if (!set || typeof set.name !== "string" || !Array.isArray(set.intervals)) {
      throw new Error(`NOTE_INTERVAL_SETS[${i}] must be { name: string, intervals: number[] }`);
    }
    if (set.intervals.length !== 9) {
      throw new Error(`NOTE_INTERVAL_SETS: set "${set.name}" has ${set.intervals.length} intervals; expected 9.`);
    }
    // Require numeric (integers ok), and root at center index 4
    set.intervals.forEach((iv, j) => {
      if (typeof iv !== "number" || !Number.isFinite(iv)) {
        throw new Error(`NOTE_INTERVAL_SETS "${set.name}" intervals[${j}] is not a finite number.`);
      }
    });
    if (set.intervals[4] !== 0) {
      throw new Error(`NOTE_INTERVAL_SETS "${set.name}" must have 0 at center (index 4).`);
    }
  });

  // 2) Probability matrices: 9x9, non-negative, each row sums to ~1
  const EPS = 1e-6;
  const matrices = IOI_NOTE_PROBABILITY_MATRICES;
  if (typeof matrices !== "object" || matrices == null) {
    throw new Error("IOI_NOTE_PROBABILITY_MATRICES must be an object of named matrices.");
  }

  for (const [name, M] of Object.entries(matrices)) {
    if (!Array.isArray(M) || M.length !== 9) {
      throw new Error(`Matrix "${name}" must have 9 rows; got ${Array.isArray(M) ? M.length : typeof M}.`);
    }
    M.forEach((row, r) => {
      if (!Array.isArray(row) || row.length !== 9) {
        throw new Error(`Matrix "${name}" row ${r} must have 9 columns; got ${Array.isArray(row) ? row.length : typeof row}.`);
      }
      let sum = 0;
      row.forEach((p, c) => {
        if (typeof p !== "number" || !Number.isFinite(p)) {
          throw new Error(`Matrix "${name}" row ${r} col ${c} is not a finite number.`);
        }
        if (p < 0) {
          throw new Error(`Matrix "${name}" row ${r} col ${c} is negative (${p}).`);
        }
        sum += p;
      });
      if (Math.abs(sum - 1) > EPS) {
        throw new Error(`Matrix "${name}" row ${r} sums to ${sum.toFixed(6)} (expected 1).`);
      }
    });
  }

  // Optional: freeze to prevent accidental mutation at runtime
  // Object.freeze(NOTE_INTERVAL_SETS);
  // Object.freeze(IOI_NOTE_PROBABILITY_MATRICES);

  console.log("Music config sanity OK");
}

// Call once at startup
sanityCheckMusicConfig();