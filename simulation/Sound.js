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

const DEBUGGING_UTTERANCE_EVENT_HORIZON = true; // let's see how far we can be heard
const SOUND_UPDATE_PERIOD =  5; 	// every this many _clock iterations, update global audio parameters (like overall reverb/zoom level)
var APPROX_MS_PER_CLOCK = 20; 	// used to scale utterDuration to absolute time. if the simulation speed changes, we might adjust this.
var SOUND_UPDATE_COUNTER = 0;

const SOUND_EVENT_TYPE_NULL	= -1
const SOUND_EVENT_TYPE_EAT  	=  1;
const SOUND_EVENT_TYPE_BIRTH	=  2;
const SOUND_EVENT_TYPE_DEATH	=  3;

// INITIAL TONAL CENTER
var MIDI_BASE_NOTE = 41; // A1 = 33 | A2 = 45 | A3 = 57 | A440 = 69

// Our tonal center is not fixed! Every so often, the entire universe shifts one step the the right along the circle of 5ths
// the shorter this time, the more overlapping generations of tonal centers. (Too short and it will be utter cacophony)
// Let's look for a middle ground where there are periods of slight discomfort (e.g. generations of three tonal centers
// simultaneously occupying the pool) followed by periods of tranquility (e.g. only two tonal centers.)

const MINUTES_BETWEEN_UNIVERSAL_BASE_NOTE_SHIFT = 3;

// MIDI channels are 1-16 (not zero indexed!)
const MIDI_CHANNEL_EAT = 1;
const MIDI_CHANNEL_BIRTH = 2;
const MIDI_CHANNEL_DEATH = 3;
const MIDI_CHANNEL_ATMOSPHERE = 16;


var RECENT_NOTES_DB = []; // Each item: { note: MIDI number, time: Date.now() }

var WEB_AUDIO_VOLUME = .25; // volume for JS audio fallback 0-1
// we more or less round-robin through these channels when uttering.
// (each time we utter, we select the channel used longest ago)

var MIDI_CHANNELS_FOR_UTTERING = [
	{	channel: 5,	lastUsed: 0 },
	{	channel: 6,	lastUsed: 0 },
	{	channel: 7,	lastUsed: 0 },
	{	channel: 8,	lastUsed: 0 },
	{	channel: 9,	lastUsed: 0 },
	{	channel: 10, lastUsed: 0 },
	{	channel: 11, lastUsed: 0 },
	{	channel: 12, lastUsed: 0 },
	{	channel: 13, lastUsed: 0 },
	{	channel: 14, lastUsed: 0 }
];

// var MIDI_CHANNELS_FOR_UTTERING = [ {	channel: 5,	lastUsed: 0 }]; // test a single channel

const MIN_WAIT_BETWEEN_MIDI_UTTERANCES = 2000; // throttle: we don't ask any individual uttering channel to utter more often than this

// these are here in case we want to selectively disable some sounds during testing
var SOUND_OUTPUT_UTTER 	= true;
var SOUND_OUTPUT_EAT 		= true;
var SOUND_OUTPUT_BIRTH 	= true;
var SOUND_OUTPUT_DEATH 	= true;
var SOUND_OUTPUT_ATMOSPHERE 	= true;


const MIDI_NOTE_INTERVAL_SETS = [
    { name: "minor pentatonic", 		intervals: [-9, -7, -5, -2, 0, +3, +5, +7, +10] },
    { name: "pentatonic", 				intervals: [-10, -8, -5, -3, 0, +2, +4, +7, +9] },
	 { name: "5ths", 						intervals: [-24, -17, -12, -5, 0, +7, +12, +19, +24] },
	 { name: "octaves", 					intervals: [-24, -12, -24, -12, 0, +12, +24, +12, +24] }
];

// startup idiot check
for (const set of MIDI_NOTE_INTERVAL_SETS) {
    if (set.intervals.length !== 9) {
        throw new Error(`MIDI_NOTE_INTERVAL_SETS: set named "${set.name}" has an incorrect number of intervals (${set.intervals.length}) -- should be 9.`);
    }
}

const GLOBAL_MIN_REVERB = 10; // 0-127
const GLOBAL_MAX_REVERB = 80;

/* Markov Chain Inter-onset Interval States:
	When we randomly choose a short/medium/long note, it will randomly choose from these ranges/bands.
	For more typically rhythmic phrases, set identical min/max for each length so each length is identical
*/

const SHORTEST_NOTE_MS = 40;

const SEQUENCE_DURATION_STATES = [
	{ name: 'short',  min: 80,  max: 80 }, 	// needs to be longer than SHORTEST_NOTE_MS 
	{ name: 'medium', min: 160, max: 160 },   // 120ms is an 8th note at 125 BPM
	{ name: 'long',   min: 320, max: 640 }    // 240ms is a quarter note at 125 BPM, 480 is a half note at 125 BPM
];

//	3 x 3 probability matrix of how likely it is we will transition from one state to another.
//	Each set of numbers needs to add up to 1 (100%).

const IOI_DURATION_PROBABILITY_MATRIX = [
  [0.8, 0.1, 0.1],  		// currently short? chances of staying short | switching medium | switching long 
  [0.6, 0.2, 0.2 ],		// currently medium? chances of switching short | staying medium | switching long
  [0.1, 0.6, 0.3 ]		// currently long? chances of switching short | switching medium | staying long
];

// 9 x 9 probability matrix which roughly favor small steps, with a chance to repeat (trill) or leap
// each set of numbers needs to add up to 1 (100%). Default is bell-curve like around middle note

/*
const IOI_MIDI_NOTE_PROBABILITY_MATRIX = [ // BELL CURVE
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from -4
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from -3
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from -2
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from -1
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from 0
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from +1
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from +2
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02], // from +3
  [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02]  // from +4
];
*/

/*
const IOI_MIDI_NOTE_PROBABILITY_MATRIX = [ // SHARP BELL CURVE
  [0.80, 0.15, 0.03, 0.01, 0.005, 0.003, 0.001, 0.0005, 0.0005], // from -4
  [0.15, 0.70, 0.10, 0.03, 0.01, 0.005, 0.003, 0.001, 0.001], // from -3
  [0.03, 0.10, 0.65, 0.15, 0.05, 0.01, 0.005, 0.003, 0.002], // from -2
  [0.01, 0.03, 0.15, 0.60, 0.15, 0.07, 0.015, 0.007, 0.003], // from -1
  [0.005, 0.01, 0.05, 0.15, 0.50, 0.15, 0.05, 0.01, 0.005], // from 0
  [0.003, 0.007, 0.015, 0.07, 0.15, 0.60, 0.15, 0.03, 0.01], // from +1
  [0.002, 0.003, 0.005, 0.01, 0.05, 0.15, 0.65, 0.10, 0.03], // from +2
  [0.001, 0.001, 0.003, 0.005, 0.01, 0.03, 0.10, 0.70, 0.15], // from +3
  [0.0005, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.03, 0.15, 0.80]  // from +4
];
*/

const IOI_MIDI_NOTE_PROBABILITY_MATRIX = [ // REALLY SHARP BELL CURVE
  //         -4      -3      -2      -1       0      +1      +2      +3      +4
  [0.93,   0.06,   0.009, 0.001, 0,     0,     0,     0,     0   ], // from -4
  [0.06,   0.90,   0.03,  0.009, 0.001, 0,     0,     0,     0   ], // from -3
  [0.009,  0.03,   0.85,  0.03,  0.009, 0.001, 0,     0,     0   ], // from -2
  [0.001,  0.009,  0.03,  0.80,  0.15,  0.009, 0.001, 0,     0   ], // from -1
  [0.001,  0.004,  0.01,  0.015, 0.95,  0.015, 0.01,  0.004, 0.001], // from  0
  [0,      0.001,  0.009, 0.15,  0.80,  0.03,  0.009, 0.001, 0   ], // from +1
  [0,      0,      0.001, 0.009, 0.009, 0.03,  0.85,  0.03,  0.009], // from +2
  [0,      0,      0,     0.001, 0.001, 0.009, 0.03,  0.90,  0.06 ], // from +3
  [0,      0,      0,     0,     0.001, 0.009, 0.06,  0.93,  0.06 ]  // from +4
];



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

	let midiAccess = null;
	let midiOutput = null;

	// WEB AUDIO API FALLBACK
	let audioCtx = null;
	let masterGain = null;
	
	//--------------------------------
	this.initialize = function()
	{		
		console.log( "sound.initialize!" );
		// request MIDI
		if (navigator.requestMIDIAccess) {
			navigator.requestMIDIAccess()
				.then(onMIDISuccess, onMIDIFailure);
		} else {
			console.warn("Web MIDI API not supported. Will attempt to use Web Audio API fallback.");
		}

		// *** WEB AUDIO API FALLBACK INITIALIZATION ***
		try {
			audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			masterGain = audioCtx.createGain();
			masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime); // Set master volume to 30% to prevent clipping
			masterGain.connect(audioCtx.destination);
			console.log("Web Audio API ready.");
		} catch (e) {
			console.error("Web Audio API is not supported in this browser. No audio will be played.");
			audioCtx = null;
		}
		// *** END NEW ***
	}

	function onMIDISuccess(access) {
		midiAccess = access;
		console.log("MIDI ready. Available outputs:");

		let idx = 0;
		for (let output of midiAccess.outputs.values()) {
			console.log(`[${idx}] ${output.name}`);
			idx++;
		}

		// just pick first output for now, or you could prompt the user
		midiOutput = Array.from(midiAccess.outputs.values())[0];
		if (!midiOutput) {
			console.error("No MIDI outputs found.");
		} else {
			console.log(`Selected output: ${midiOutput.name}`);
		}
	}

	function onMIDIFailure() {
		console.error("Could not access MIDI, so will rely on basic JS audio.");
	}

	
	//----------------------------------------------------
	this.setGlobalParameters = function( p0, p1, p2, p3 )
	{
		// console.log( "sound: setGlobalParameters: " + p0 + " " + p1 + " " + p2 + " " + p3);
		
		_parameter_0 = p0;
		_parameter_1 = p1;
		_parameter_2 = p2;
		_parameter_3 = p3; // camera zoom, ranges from about 500 to 8000

		SOUND_UPDATE_COUNTER +=1;
		let soundUpdatesPerMinute = Math.round(60000 / (SOUND_UPDATE_PERIOD * APPROX_MS_PER_CLOCK)); // how many counter clicks equals about a minute?

		// use camera zoom to set global reverb mix for eating sounds (minimum 5)
		let _p3_scaled = Math.max(GLOBAL_MIN_REVERB, Math.min(GLOBAL_MAX_REVERB, Math.round((_parameter_3 - 500) * GLOBAL_MAX_REVERB / (3000 - 500))));
		let _p3_scaled_inverse = GLOBAL_MAX_REVERB - _p3_scaled;
		
		// FREQUENT GLOBAL ATMOSPHERIC UPDATES
		if (doingMidiOutput() && SOUND_OUTPUT_ATMOSPHERE) {
			sendCC(21, _p3_scaled, MIDI_CHANNEL_ATMOSPHERE); // dry/wet global reverb level
			sendCC(20, Math.max(_p3_scaled, 60), MIDI_CHANNEL_ATMOSPHERE); // cutoff metaphysical function B (rhythmic background)

			// DRONE: controls 16 & 17 of metaphysical function B reaktor are pitch knobs that should match our base note
			let controlAdjustment16 = MIDI_BASE_NOTE -6 ;
			sendCC(16, controlAdjustment16, MIDI_CHANNEL_ATMOSPHERE); // 5th histogram section A of metaphysical function B (rhythmic background)
			let controlAdjustment17 = MIDI_BASE_NOTE +6 ;
			sendCC(17, controlAdjustment17, MIDI_CHANNEL_ATMOSPHERE); // 5th histogram section A of metaphysical function B (rhythmic background)

		}
		
		// every minute, tweak background sound just for variation
		if (doingMidiOutput() && SOUND_UPDATE_COUNTER % soundUpdatesPerMinute === 0) {			
			
			let controlAdjustment18 = (Math.floor(Math.random() * (6)) * 16) + 32; // 32 to 96 in steps of 16
			sendCC(18, controlAdjustment18, MIDI_CHANNEL_ATMOSPHERE); // 5th histogram section A of metaphysical function B (rhythmic background)
			
			let controlAdjustment19 = (Math.floor(Math.random() * (4)) * 25) + 25; // one of 25, 50, 75, or 100
			sendCC(19, controlAdjustment19, MIDI_CHANNEL_ATMOSPHERE); // 4th histogram section A of metaphysical function B (twanginess?)
		}


		// THE UNIVERSE moves along the circle of 5ths. Every so many minutes, we modulate all new births accordingly.
		// Remember that a swimbot's utterance is burned into its phenotype forever, so this doesn't impact living bots.
		if (SOUND_UPDATE_COUNTER % (soundUpdatesPerMinute * MINUTES_BETWEEN_UNIVERSAL_BASE_NOTE_SHIFT) === 0) {
			MIDI_BASE_NOTE = MIDI_BASE_NOTE + 7; // up a 5th ...
			if (MIDI_BASE_NOTE > 47) MIDI_BASE_NOTE = MIDI_BASE_NOTE - 12; // ... but staying within the 3rd octave
			console.log ("*** UNIVERSE SHIFTED MIDI_BASE_NOTE to " + MIDI_BASE_NOTE + " ***");
		}

		if (SOUND_UPDATE_COUNTER % 10 === 0) {
			const { histogram, totalNotes, tableHTML } = getPitchHistogram();
			document.getElementById('saveLoadPanel').innerHTML = tableHTML;
		}


	}

	//------------------------------------------------------------------------------------------------------
	// doSwimbotSoundEvent is used for non-diegetic sounds, e.g. eating, being born, dying
	this.doSwimbotSoundEvent = function( type, swimbotPosition, swimbotID )
	{
		let printString = "doSwimbotSoundEvent() type=";
		
		if ( type === SOUND_EVENT_TYPE_EAT ) {
			printString += 'EAT';
			if (doingMidiOutput() && SOUND_OUTPUT_EAT) {
				let midiChannel = MIDI_CHANNEL_EAT;
				let midiNote = Math.floor(Math.random() * (12)) + MIDI_BASE_NOTE; // note in a one octave range
				let controlValue = Math.floor(Math.random() * (40)) + 50; // control of about 50-90
				sendCC(14, controlValue, midiChannel);
				sendNoteMIDI(midiNote, 127, 100, midiChannel);
				printString += " sent MIDI note " + midiNote + " w/CC 14 " + controlValue;
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH) {
			printString += 'BIRTH';
			if (doingMidiOutput() && SOUND_OUTPUT_BIRTH) {
				let midiChannel = MIDI_CHANNEL_BIRTH;
				let midiNote = MIDI_BASE_NOTE + (Math.floor(Math.random() * 3) * 12);
				sendNoteMIDI(midiNote, 127, 1000, midiChannel);
				printString += " sent MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH) {
			printString += 'DEATH';
			if (doingMidiOutput() && SOUND_OUTPUT_DEATH) {
				let midiChannel = MIDI_CHANNEL_DEATH;
				let midiNote = MIDI_BASE_NOTE + (Math.floor(Math.random() * 3) * 12);
				sendNoteMIDI(midiNote, 127, 1000, midiChannel);
				printString += " sent MIDI note " + midiNote;
			}
		} // end if sound types
		 
		// printString += "; swimbotPosition = " + swimbotPosition.x.toFixed(2) + ", " + swimbotPosition.y.toFixed(2);
 		// console.log( printString );
		return false;
    }

	 // GenePool.js decides when a swimbot should utter, at which point
	 // doUtterance() is called with an object describing its utterance phenotypes
	 // e.g. utterVariablesObj.swimbotInView, utterVariablesObj.utterSequence... 

	// *** MODIFIED: Added Web Audio API fallback logic ***
	this.doUtterance = function (utterVariablesObj, callerFunction) {
		const rightNow = Date.now();
		const useMidi = doingMidiOutput();
		const useWebAudio = !useMidi && audioCtx !== null;
		let playAudio = false;
		let midiChannel;

		// Step 1: Decide if we can and should play audio for this utterance.
		if (useMidi) {
			// MIDI Path: Check if utterance is enabled, in view, and channel is not throttled.
			if (utterVariablesObj.swimbotInView && SOUND_OUTPUT_UTTER) {
				let oldestMIDIchannel = MIDI_CHANNELS_FOR_UTTERING[0];
				for (let i = 1; i < MIDI_CHANNELS_FOR_UTTERING.length; i++) {
					if (MIDI_CHANNELS_FOR_UTTERING[i].lastUsed < oldestMIDIchannel.lastUsed) {
						oldestMIDIchannel = MIDI_CHANNELS_FOR_UTTERING[i];
					}
				}
				const min_wait_slop = Math.floor(Math.random() * 250);
				if (Date.now() - oldestMIDIchannel.lastUsed > (MIN_WAIT_BETWEEN_MIDI_UTTERANCES + min_wait_slop)) {
					playAudio = true;
					oldestMIDIchannel.lastUsed = rightNow;
					midiChannel = oldestMIDIchannel.channel; // Update its lastUsed timestamp

				}
			}
		} else if (useWebAudio) {
			// Web Audio Path: Simpler check, just needs to be in view. No channel throttling.
			if (utterVariablesObj.swimbotInView) {
				playAudio = true;
			}
		}

		// Step 2: Schedule all events from the sequence.
		for (const step of utterVariablesObj.utterSequence) {
			setTimeout(() => {
				// The 'done' event is crucial for simulation state and must always be handled.
				if (step.type === 'done') {
					callerFunction.setDoneUtteringSound(utterVariablesObj.swimbotID);
					return;
				}

				// If we determined we shouldn't play audio, ignore note/cc events.
				if (!playAudio) return;

				// Handle the audible events.
				if (step.type === 'note') {
					if (useMidi) {
						sendNoteMIDI(step.note, step.velocity, step.duration, midiChannel);
					} else { // Fallback to Web Audio
						playNoteWebAudio(step.note, step.velocity, step.duration);
					}
					RECENT_NOTES_DB.push({ note: step.note % 12, time: Date.now() });
				} else if (step.type === 'cc') {
					if (useMidi) { // CC events are ignored for Web Audio fallback.
						sendCC(step.cc, step.value, midiChannel);
					}
				}
			}, step.delay);
		}
		return false;
	}

	function doingMidiOutput() {
		return midiOutput ? true : false;
	}


	/*** WEB AUDIO FALLBACK (Added July 29, 2025) ***/

	function midiNoteToFrequency(midiNote) {
		return 440 * Math.pow(2, (midiNote - 69) / 12);
	}

	/**
	 * Plays a single note using the Web Audio API.
	 * Creates a simple synth voice with an oscillator and a gain envelope.
	 * @param {number} noteNumber The MIDI note number to play.
	 * @param {number} velocity The note velocity (0-127), affects volume.
	 * @param {number} durationMs The duration of the note in milliseconds.
	 */
	 
	function playNoteWebAudio(noteNumber, velocity, durationMs) {
		if (!audioCtx || !masterGain) return;
	
		if (audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
	
		const osc = audioCtx.createOscillator();
		const noteGain = audioCtx.createGain();
	
		const freq = midiNoteToFrequency(noteNumber);
		const gainValue = (velocity / 127) * WEB_AUDIO_VOLUME; // Peak volume
		const now = audioCtx.currentTime;
		const durationSec = durationMs / 1000;
	
		osc.type = 'square'; // or sine, or square, or triangle
		osc.frequency.setValueAtTime(freq, now);
	
		// --- Gated ADSR Envelope Parameters ---
		const attackTime = 0.01;  // 10ms
		const decayTime = 0.05;   // 50ms
		const releaseTime = 0.01; // 10ms, for a crisp ending
		const sustainLevel = gainValue * 0.8; // Sustain at 80% of peak
	
		const noteEndTime = now + durationSec;
		const sustainStartTime = now + attackTime + decayTime;
		const releaseStartTime = noteEndTime - releaseTime;
	
		// Use this envelope only if the note is long enough for attack, decay, and release
		if (releaseStartTime > sustainStartTime) {
			// 1. Attack: From 0 to peak volume
			noteGain.gain.setValueAtTime(0, now);
			noteGain.gain.linearRampToValueAtTime(gainValue, now + attackTime);
	
			// 2. Decay: From peak down to sustain level
			noteGain.gain.linearRampToValueAtTime(sustainLevel, sustainStartTime);
	
			// 3. Sustain: Pin the gain to the sustain level. It will hold here
			// until the release phase begins.
			noteGain.gain.setValueAtTime(sustainLevel, releaseStartTime);
			
			// 4. Release: Ramp down to 0 at the very end.
			noteGain.gain.linearRampToValueAtTime(0, noteEndTime);
	
		} else {
			// If the note is too short, just do a simple sharp attack and decay.
			noteGain.gain.setValueAtTime(0, now);
			noteGain.gain.linearRampToValueAtTime(gainValue, now + attackTime);
			noteGain.gain.linearRampToValueAtTime(0, noteEndTime);
		}
	
		osc.connect(noteGain);
		noteGain.connect(masterGain);
	
		osc.start(now);
		// Stop the oscillator precisely when the note and its release envelope end.
		osc.stop(noteEndTime);
	}

	// Actually send a MIDI note on (and schedule a note off) to the IAC bus. 
	function sendNoteMIDI(noteNumber, velocity, durationMs, midiChannel) {
		let zeroIndexMidiChannel = midiChannel - 1; 
		const noteOn = 0x90 | zeroIndexMidiChannel;
		const noteOff = 0x80 | zeroIndexMidiChannel;
		midiOutput.send([noteOn, noteNumber, velocity]);
		setTimeout(() => {
			midiOutput.send([noteOff, noteNumber, 0]);
		}, durationMs);
	}
	
	// Actually send a MIDI control value
	function sendCC(controllerNumber, value, midiChannel) {
		let zeroIndexMidiChannel = midiChannel - 1; 
		const cc = 0xB0 | zeroIndexMidiChannel;
		midiOutput.send([cc, controllerNumber, value]);
	}
	
} // *** end class/object Sound () ***








/**
 * generateUtterancePhenotypes
 * ---------------------------
 * Given gene values, gene names, and utterance timing parameters,
 * generates a musically structured sequence of MIDI-like events (notes and CCs)
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
	let idx; // our generic index which we re-use a lot
	const rng = aleaPRNG(genes.toString()); // initialize the random number generator with the entire genetic sequence
	// const rng = aleaPRNG('always the same');

	// WHAT IS MY MIDI BASE NOTE?
	let myMIDIBaseNote = MIDI_BASE_NOTE;

	/* WHAT NOTES ARE WE ALLOWED TO PLAY? */

	// One option is that we can swap out our interval scale
	/*
	const pickIntervalIndex = Math.floor(rng() * MIDI_NOTE_INTERVAL_SETS.length);
	const pickIntervalSet = MIDI_NOTE_INTERVAL_SETS[pickIntervalIndex];
	const MIDI_intervalName = pickIntervalSet.name;
	var myNoteIntervals = pickIntervalSet.intervals;
	console.log('Picked ' + MIDI_intervalName);
	*/
	// const myNoteIntervalSet = MIDI_NOTE_INTERVAL_SETS[Math.floor(rng() * 4)];

	// WHAT IS OUR SCALE?
	const myNoteIntervalSet = MIDI_NOTE_INTERVAL_SETS[0]; // maybe in a future composition we migrate from one scale to another?
	const myIntervalSetName = myNoteIntervalSet.name;
	let myNoteIntervals = myNoteIntervalSet.intervals.slice(); // GOTCHA! If you don't slice() you will be modifying the global somehow... slice forces a copy.


/*
for (let i = 0; i < _geneNames.length; i++) { 
    if (_geneNames[i].includes('utter')) console.log(_geneNames[i], genes[i]);
}
// console.log('Genes: ' + genes.toString());
*/

	idx = _geneNames.indexOf('utter duration');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter duration' from genes")
	const utterDurationVal = genes[idx]; // 0-255
	
	const utterSequenceLength = utterDuration * APPROX_MS_PER_CLOCK; // range of 5-100 = 150ms-3000ms
	console.log("utter duration is " + utterDurationVal + " which maps to " + utterDuration + " clocks, approx. " + utterSequenceLength + "ms");

	// USE UTTER STRANGENESS GENE TO DETERMINE DEVIANT SWIMBOTS THAT JUMP THE CIRCLE OF 5ths EARLY
	// the universe cycles through the 5ths slowly, but sometimes (rarely) a swimbot will jump early
	idx = _geneNames.indexOf('utter strangeness');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter strangeness' from genes")
	const utterStrangeness = genes[idx]; // 0-255
	const chanceOfJumpingFifths = (utterStrangeness/255) ** 12; // heavily weighted towards "nope"
	console.log("utter strangeness is " + utterStrangeness + " and our probability of jumping 5ths is " + (chanceOfJumpingFifths * 100).toFixed(2) + "%");
	if (rng() < chanceOfJumpingFifths) {
		if (rng() > .5) { // are we going to jump up or down?
			myMIDIBaseNote = myMIDIBaseNote + 7;
			console.log("-> Rolled to jump UP a fifth!");
		} else {
			myMIDIBaseNote = myMIDIBaseNote -5;
			console.log("-> Rolled to jump DOWN a fifth!");
		}
	} 
	
	// USE UTTER SPIN GENE TO DETERMINE OUR OCTAVE
	// what octave do we sing in? bell-curveish with fewer basses and sopranos
	idx = _geneNames.indexOf('utter spin');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter spin' from genes")
	const utterSpin = genes[idx]; // 0-255
	const octaveShiftOptions = [0,12,12,12,24,24,24,24,24,24,36,36,36,36,36,48];
	idx = Math.floor(utterSpin / 255 * (octaveShiftOptions.length - 1));
	let myOctaveNoteShift = octaveShiftOptions[idx];
	console.log("utter spin is " + utterSpin + " which corresponds to octave +" + myOctaveNoteShift/12);

	// USE UTTER CHARM TO DETERMINE HOW MUCH WE MUTATE OUR RHYTHMS
	// 0-10: mutationFactor determines how many times our music note and duration markov chain matrices will be mutated, weighted towards less
	idx = _geneNames.indexOf('utter charm');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'utter charm' from genes")
	const utterCharm = genes[idx]; // 0-255
	const mutationFactorOptions = [0,0,0,0,0,0,,1,1,1,2,2,5,8,10,20]; // mostly no mutation, or a little bit, a few outliers
	idx = Math.floor(utterCharm / 255 * (mutationFactorOptions.length - 1));
	let mutationFactor = mutationFactorOptions[idx];
	console.log("utter charm is " + utterCharm + ", which encourages us to mutate our rhythm and interval probabilities " + mutationFactor + "/10 times.");
	
	// numberOfIntervalRotations adjusts how far away our *starting* note might drift from the center note
	// we don't use a gene to determine this, all swimbots have an equal inclination/disinclination in this regard
	// * 0 means "always start on the center"
	// * 1 means "start at the center note, or up to one interval away"
	// * 5 means "start as the center note, or any of the possible 5 intervals"
	const numberOfIntervalRotations = Math.floor(rng() * 3);


	
	// IMPORTANT! To make sure everyone doesn't start on the same note, we randomly rotate the intervals
	// for example, this:		[-10, -8, -5, -3, 0, +2, +4, +7, +9];
	// might turn into this:	[+7, +9, -10, -8, -5, -3, 0, +2, +4]; (rotated two positions)
	for (let i = 0; i < numberOfIntervalRotations; i++) {
		myNoteIntervals.unshift(myNoteIntervals.pop());
	}
		
	// console.log ("myNoteIntervals based on " + myIntervalSetName + " are " + myNoteIntervals);

	/*** Assign duration and note probability matrices ***/
	let myDurationProbabilities = IOI_DURATION_PROBABILITY_MATRIX;
	let myNoteProbabilities = IOI_MIDI_NOTE_PROBABILITY_MATRIX; // make a copy we can mess with

	/*** Mutate our markov tables? if so how much? ***/
	for (let i = 0; i < mutationFactor; i++) { // the more times we mutate it, the more we stray from the default bell-curve
		myDurationProbabilities = createMutatedMatrix(myDurationProbabilities, rng, 0.2);
		myNoteProbabilities = createMutatedMatrix(myNoteProbabilities, rng, 0.2);
	}
	
	/*
   logProbabilityMatrix('Original Note Probability Matrix:', IOI_MIDI_NOTE_PROBABILITY_MATRIX);
   logProbabilityMatrix('Mutated x' + mutationFactor + ' Note Probability Matrix:', myNoteProbabilities);
	*/
	 
	let sequenceTime = 0; // keep track of our timeline for composing (in ms)
	
	const sequenceData = [];
	
	// these vars will keep a record of the phenotypical attributes of our new MIDI sequence
	let recordNotesUsed = [], recordHighNote = 0, recordLowNote = 127, recordNoteCount = 0, recordModCount = 0;
		
	// how long are our notes?
	const noteLengthOptions = ['click', 'legato', 'complex'];
	const noteLengthStyle = noteLengthOptions[Math.floor(rng() * noteLengthOptions.length)];
	
	// how strong should our mod wheel wiggling be, and how often should we do it?
	const modulationStrength = Math.floor(rng() * 16) * 4; // how fast to twist knobs
	const modChanceOptions = [0,0,0,.2,.2,.2,.5,.5,.5,.5,.5,.7,.7,.7,1,1,1]; // weighed towards middle and high chance of wiggle
	let chanceOfModulation = modChanceOptions[Math.floor(rng() * modChanceOptions.length)];


		
	// Markov Chain time! Pick an initial Interval State (note)
	// in most cases, we choose the middle-most note of the interval set, because that's the one that's stickiest
	// and hardest to drift from. Encourages repeated single-note morse-code type utterances.
	let lastInt = 4;
		
	// Now pick the initial Inter-Onset Interval (duration)
	let lastIOI = Math.floor(rng() * SEQUENCE_DURATION_STATES.length); // might be short, medium, or long initial note
	// if (utterSequenceLength < 750) lastIOI = 0; // override for short utterances. they should ALWAYS start with a short note (zero index to Interval State)
		

	// SET UP THE SYNTHESIZER AT THE BEGINNING OF THE UTTERANCE		
	// initialize synthesizer controls with a range of min to max.
	// 'variable' means yes you can twiddle this knob during the sequence
	// in which case the variableWidth is how much you can twiddle it
	let myControls = [
		{ cc: 14, min: 94,	max: 97,		initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up' }, 	// wave
		{ cc: 15, min: 0,		max: 127,	initalVal: 0,	variable: true,	variableWidth: 127,	lastVal: 0,	lastDir: 'up' }, 	// "mouth"
		{ cc: 16, min: 32,	max: 127,	initalVal: 0,	variable: true,	variableWidth: 96,	lastVal: 0,	lastDir: 'up'  }, // "size"
		{ cc: 17, min: 70,	max: 95,		initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  }, 	// "tone" 
		{ cc: 19, min: 0,		max: 70,		initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  },	// "level 2" resonance
		{ cc: 20, min: 0,		max: 127,	initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  } // "level 3"
	];
	
	for (let setting of myControls) {
		const range = setting.max - setting.min + 1;
		let myCCval = Math.floor(rng() * range) + setting.min;
		setting.initalVal = myCCval; // remember our initial home position
		setting.lastVal = myCCval; // this will also be our last known position
		if (rng() > .5) setting.lastDir = 'down'; // randomly override initial spin direction
	}
	
	// VOCAL SYNTH IS TOO QUIET IF CC15 plus CC16 DON'T ADD UP TO AT LEAST 100, so reroll those values if necessary:
	let cc15, cc16;
	do {
		cc15 = Math.floor(rng() * (myControls[0].max - myControls[0].min + 1)) + myControls[0].min;
		cc16 = Math.floor(rng() * (myControls[1].max - myControls[1].min + 1)) + myControls[1].min;
	} while (cc15 + cc16 < 100);
	
	myControls[0].initalVal = myControls[0].lastVal = cc15;
	myControls[1].initalVal = myControls[1].lastVal = cc16;

	// Now that we picked our synth settings, queue them up in the sequence itself to initialize the synth
	for (let setting of myControls) {
		sequenceTime += 10; // add 10ms
		sequenceData.push({
			delay: sequenceTime,
			type: 'cc',
			cc: setting.cc,
			value: setting.initalVal
		});
	}

	
	
	sequenceTime += 10; // wait 10ms before composing main utterance
	while (sequenceTime < utterSequenceLength) {
		// pick next inter-onset interval
		let p = rng(), cumulativeProb = 0, nextIOI;
		for (let i = 0; i < SEQUENCE_DURATION_STATES.length; i++) {
			cumulativeProb += myDurationProbabilities[lastIOI][i];
			if (p < cumulativeProb) { nextIOI = i; break; }
		}
		// fallback if rounding/FP left nextIOI undefined
		if (nextIOI === undefined) nextIOI = SEQUENCE_DURATION_STATES.length - 1;
	
		const band = SEQUENCE_DURATION_STATES[nextIOI];
		const interOnsetIntervalMs = band.min + Math.round(rng() * (band.max - band.min));
	
		// HOW LONG SHOULD THIS NOTE PLAY?
		let thisNoteDuration = SHORTEST_NOTE_MS; // default AKA 'click'
		if (noteLengthStyle == 'legato') {
			thisNoteDuration = Math.max(SHORTEST_NOTE_MS, interOnsetIntervalMs - (SHORTEST_NOTE_MS * 2)); // leave some space between notes
		} else if (noteLengthStyle == 'complex') {
			thisNoteDuration = Math.max(SHORTEST_NOTE_MS, interOnsetIntervalMs * Math.floor(rng()));
		}
	
		// ——— pick next interval state ———
		p = rng(); cumulativeProb = 0; let nextIntState;
		for (let i = 0; i < myNoteIntervals.length; i++) {
			cumulativeProb += myNoteProbabilities[lastInt][i];
			if (p < cumulativeProb) { nextIntState = i; break; }
		}
		if (nextIntState === undefined) nextIntState = myNoteIntervals.length - 1;
		const thisNoteShift = myNoteIntervals[nextIntState];
		let thisNoteNumber = myMIDIBaseNote + myOctaveNoteShift + thisNoteShift;
		
		// record some phenotypical info
		if (thisNoteNumber > recordHighNote) recordHighNote = thisNoteNumber; // we hit our highest note yet
		if (thisNoteNumber < recordLowNote) recordLowNote = thisNoteNumber; // we hit our lowest note yet
		if (!recordNotesUsed.includes(thisNoteNumber)) recordNotesUsed.push(thisNoteNumber); // we used a new note
	
		// push event into sequencer
		sequenceData.push({
			delay:    sequenceTime,  // in ms
			type:     'note',
			note:     thisNoteNumber,
			velocity: 80 + Math.round(rng() * 40),
			duration: thisNoteDuration
		});
		recordNoteCount ++;
		
		// push in random MIDI mod expressions
		
		if (rng() < chanceOfModulation) {
			// 1. Filter controls to those with variable: true
			const variableControls = myControls.filter(c => c.variable);
		
			// 2. Randomly pick one
			const idx = Math.floor(rng() * variableControls.length);
			const setting = variableControls[idx];
		
			// 3. Calculate modulation range
			const halfWidth = setting.variableWidth / 2;
			const ccMin = Math.max(setting.min, setting.initalVal - halfWidth);
			const ccMax = Math.min(setting.max, setting.initalVal + halfWidth);
		
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
				delay: sequenceTime + 10,  // in ms
				type: 'cc',
				cc: setting.cc,
				value: ccVal
			});
			recordModCount += modulationStrength;
		}
	
		// advance time & states
		sequenceTime += interOnsetIntervalMs;
		lastIOI = nextIOI;
		lastInt = nextIntState;
	} // end while sequenceTime < utterSequenceLength
	
	// insert final 'done' event. This is important because even when a swimbot is uttering out of camera view
	// (when it's silent to our ears) we use 'done' to schedule the end of the utterance period.
	sequenceData.push({ delay: sequenceTime, type: 'done' });

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
	console.log ("UTTERANCE COMPOSED: myMIDIBaseNote=" + myMIDIBaseNote + " octave=" + (myOctaveNoteShift/12) + " mutationFactor=" + mutationFactor + " noteLengthStyle=" + noteLengthStyle + " chanceOfModulation=" + chanceOfModulation + " modulationStrength=" + modulationStrength + " recordNoteCount=" + recordNoteCount + " recordModCount=" + recordModCount);
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

function pruneOldNotes() {
    const now = Date.now();
    const cutoff = now - 60000; // 60 seconds ago
    // Remove old notes from the start (assuming notes arrive in order)
    while (RECENT_NOTES_DB.length && RECENT_NOTES_DB[0].time < cutoff) {
        RECENT_NOTES_DB.shift();
    }
}

function getPitchHistogram() {
	pruneOldNotes();
	let totalNotes = 0;
	const histogram = [
		{ noteNumber: 0, noteName: 'C', noteCount: 0 },
		{ noteNumber: 1, noteName: 'C#', noteCount: 0 },
		{ noteNumber: 2, noteName: 'D', noteCount: 0 },
		{ noteNumber: 3, noteName: 'D#', noteCount: 0 },
		{ noteNumber: 4, noteName: 'E', noteCount: 0 },
		{ noteNumber: 5, noteName: 'F', noteCount: 0 },
		{ noteNumber: 6, noteName: 'F#', noteCount: 0 },
		{ noteNumber: 7, noteName: 'G', noteCount: 0 },
		{ noteNumber: 8, noteName: 'G#', noteCount: 0 },
		{ noteNumber: 9, noteName: 'A', noteCount: 0 },
		{ noteNumber: 10, noteName: 'A#', noteCount: 0 },
		{ noteNumber: 11, noteName: 'B', noteCount: 0 }];
	
	for (const { note } of RECENT_NOTES_DB) {
		totalNotes += 1;
      histogram[note].noteCount += 1;
	}
		
	const maxHeight = 14; // 14 colored bar rows, 1 label row
	let maxCount = 0;
	
	// Find the maximum count to scale the bars
	for (const { noteCount } of histogram) {
		if (noteCount > maxCount) maxCount = noteCount;
	}
	if (maxCount === 0) maxCount = 1; // Prevent division by zero
	
	// Build table rows, from top to bottom
	let tableHTML = '<table><tbody style="font-size: 10px; text-align:center;"><tr><th colspan="11">' + totalNotes + ' notes in last minute</th></tr>';
	for (let row = 0; row < maxHeight; row++) {
		tableHTML += '<tr>';
		for (const { noteCount } of histogram) {
			const barHeight = Math.round((noteCount / maxCount) * maxHeight);
			// Rows go from top (0) to bottom (maxHeight-1), so check if this cell should be colored
			if (maxHeight - row <= barHeight) {
					tableHTML += '<td style="width:11px;height:11px;background:#4b8fff;"></td>';
			} else {
					tableHTML += '<td style="width:11px;height:11px;background:#eee;"></td>';
			}
		}
		tableHTML += '</tr>';
	}
	// Now add the labels row at the bottom, coloring if any notes are present
	tableHTML += '<tr>';
	for (const { noteName, noteCount } of histogram) {
		if (noteCount > 0) {
			tableHTML += `<td style="padding:0; background:#28b245; color:#fff; font-weight:bold;">${noteName}</td>`;
		} else {
			tableHTML += `<td style="padding:0; background:#fff; color:#444;">${noteName}</td>`;
		}
	}
	tableHTML += '</tr>';	
	tableHTML += '</tbody></table>';	

	return { totalNotes, histogram, tableHTML }; // return as an object
}