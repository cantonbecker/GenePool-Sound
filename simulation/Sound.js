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
var LAST_VOLUME = 0;

const SOUND_EVENT_TYPE_NULL	= -1
const SOUND_EVENT_TYPE_EAT  	=  1;
const SOUND_EVENT_TYPE_BIRTH	=  2;
const SOUND_EVENT_TYPE_DEATH	=  3;
const SOUND_EVENT_TYPE_SPAWN	=  4;
const SOUND_EVENT_TYPE_LAUNCH	=  5;

// in several places of the code we slice the genes by index just to pull out utterance-related genes
const UTTERANCE_GENES_SLICE_START = 112;
const UTTERANCE_GENES_SLICE_END = 119; // inclusive

// INITIAL TONAL CENTER
var MIDI_BASE_NOTE = 41; // A1 = 33 | A2 = 45 | A3 = 57 | A440 = 69

// Our tonal center is not fixed! Every so often, the entire universe shifts one step the the right along the circle of 5ths
// the shorter this time, the more overlapping generations of tonal centers. (Too short and it will be utter cacophony)
// Let's look for a middle ground where there are periods of slight discomfort (e.g. generations of three tonal centers
// simultaneously occupying the pool) followed by periods of tranquility (e.g. only two tonal centers.)

const SECONDS_BETWEEN_BACKGROUND_RETRIGGER_DEFAULT = 15; // extra background loops default to this repeat time in seconds
const SECONDS_BETWEEN_UNIVERSAL_NOTE_SHIFT_DEFAULT = (3 * 60); // enable this to have the background tone gradually drift around the default intervals
var UNIVERSAL_NOTE_SHIFT = 0; // remembers our current shift

// How many different spawn sounds do we have? (starting from C1)
const SPAWN_SOUND_VARIATIONS 	=	9;

// MIDI channels are 1-16 (not zero indexed!)
const MIDI_OUTPUT_NONDIAGETIC = 'IAC Driver Bus 1';
const MIDI_CHANNEL_EAT 			= 1;
const MIDI_CHANNEL_BIRTH 		= 2;
const MIDI_CHANNEL_DEATH 		= 3;
const MIDI_CHANNEL_ONESHOTS	= 13; // no reverb, used for spawn and simulation launch sounds
const MIDI_CHANNEL_BACKGROUND = 14; // looping backgrounds
const DEFAULT_BACKGROUND_NOTE	= 48; // lake bacalar dusk insects loop
const MIDI_CHANNEL_ATMOSPHERE = 15; // synthesized drone
const MIDI_CHANNEL_SYSTEM 		= 16; // e.g. Overall volume & MIDI panic to GP

var MIDI_CHANNELS_FOR_UTTERING = [
	{	output: 'IAC Driver Bus 2', channel: 1,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 2,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 3,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 4,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 5,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 6,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 7,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 8,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 9,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 10, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 11, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 12, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 13, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 14, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 15, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 2', channel: 16, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 1,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 2,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 3,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 4,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 5,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 6,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 7,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 8,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 9,	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 10, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 11, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 12, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 13, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 14, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 15, 	lastUsed: 0 },
	{	output: 'IAC Driver Bus 3', channel: 16, 	lastUsed: 0 }
];

// when we are approaching our MAX_SWIMBOTS, should we limit our MIDI outputs to throttle CPU?
// set this to 0 or false to disable throttling
// set this to .25 for "throttle channels by 25% when we have reached MAX_SWIMBOTS
const THROTTLE_MIDI_WHEN_LOADED = .5; // throttle by up to 50% when we're at MAX_SWIMBOTS

// var MIDI_CHANNELS_FOR_UTTERING = [ {	channel: 5,	lastUsed: 0 }]; // test a single channel

var RECENT_NOTES_DB = []; // Each item: { note: MIDI number, time: Date.now() }
var RECENT_MODS_DB = [];  // Each item: { time: Date.now() }

var WEB_AUDIO_VOLUME = .25; // volume for JS audio fallback 0-1
// we more or less round-robin through these channels when uttering.
// (each time we utter, we select the channel used longest ago)


const MIN_WAIT_BETWEEN_MIDI_UTTERANCES = 1500; // cooldown: we don't ask any individual uttering channel to utter more often than this
const MODULATION_SPEED_MS = 15; // how fast do we twiddle modulation knobs? smaller number = smoother vocal morphs, but more MIDI data.

// these are here in case we want to selectively disable some sounds during testing
var SOUND_OUTPUT_UTTER 			= true;
var SOUND_OUTPUT_EAT 			= true;
var SOUND_OUTPUT_BIRTH 			= true;
var SOUND_OUTPUT_DEATH 			= true;
var SOUND_OUTPUT_ATMOSPHERE 	= true;
var SOUND_OUTPUT_SPAWN		 	= true;
var SOUND_OUTPUT_LAUNCH			= true;


const MAX_UTTER_ATTENUATION = 40; // when zooming out, we can quiet our swimbots by this much
var UTTER_ATTENUATION = 0; // stores current attenuation level

const MIN_REVERB_DEFAULT = 15; // 0-127
const MAX_REVERB_DEFAULT = 75;


// different simulations use different interval sets
const MIDI_NOTE_INTERVAL_SETS = [
    { name: "minor pentatonic", 		intervals: [-9, -7, -5, -2, 0, +3, +5, +7, +10] },
    { name: "pentatonic", 				intervals: [-10, -8, -5, -3, 0, +2, +4, +7, +9] },
	 { name: "5ths", 						intervals: [-24, -17, -12, -5, 0, +7, +12, +19, +24] },
	 { name: "octaves", 					intervals: [-24, -12, -24, -12, 0, +12, +24, +12, +24] },
	 { name: "whole tone", 			intervals: [-8, -6, -4, -2, 0, +2, +4, +6, +8] }
];

// look up a set from MIDI_NOTE_INTERVAL_SETS by name, as if we had requested  MIDI_NOTE_INTERVAL_SETS[index]	
function getNoteIntervalSetFor(name) {
  // case-insensitive match by name
  const found = MIDI_NOTE_INTERVAL_SETS.find(
    set => set.name.toLowerCase() === name.toLowerCase()
  );
  // if found, return it. otherwise default to first.
  return found || MIDI_NOTE_INTERVAL_SETS[0];
}


/* Markov Chain Inter-onset Interval States:
	When we randomly choose a short/medium/long note, it will randomly choose from these ranges/bands.
	For more typically rhythmic phrases, set identical min/max for each length so each length is identical
*/
const SHORTEST_NOTE_MS_DEFAULT = 35;

const DEFAULT_SEQUENCE_DURATION_STATES = [
	{ name: 'short',  min: 60,  max: 80 }, 	// needs to be longer than SHORTEST_NOTE_MS_DEFAULT 
	{ name: 'medium', min: 140, max: 210 },   // 120ms is an 8th note at 125 BPM
	{ name: 'long',   min: 280, max: 420 }    // 240ms is a quarter note at 125 BPM, 480 is a half note at 125 BPM
];

//	3 x 3 probability matrix of how likely it is we will transition from one state to another.
//	Each set of numbers needs to add up to 1 (100%).

const IOI_DURATION_PROBABILITY_MATRIX = [
  [0.7, 0.2, 0.1],  		// currently short? chances of staying short | switching medium | switching long 
  [0.5, 0.3, 0.2 ],		// currently medium? chances of switching short | staying medium | switching long
  [0.1, 0.4, 0.5 ]		// currently long? chances of switching short | switching medium | staying long
];

// 9 x 9 probability matrix which roughly favor small steps, with a chance to repeat (trill) or leap
// each set of numbers needs to add up to 1 (100%). Default is bell-curve like around middle note

const IOI_MIDI_NOTE_PROBABILITY_MATRICES = {
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

	let midiAccess = null;
	let midiOutput = null;

	let midiOutputsByName = {};

	// WEB AUDIO API FALLBACK
	let audioCtx = null;
	let masterGain = null;
	
	//--------------------------------
	this.initialize = function()
	{		
		console.log( "*** Sound.initialize() ***" );
		let MIDIworking = false;
		if (navigator.requestMIDIAccess) {
		(async () => {
			try {
				const access = await navigator.requestMIDIAccess();
				onMIDISuccess(access);
	      	flashNotice ("😎 MIDI ready.", 1500);
				MIDIworking = true;
				this.doSwimbotSoundEvent(SOUND_EVENT_TYPE_SPAWN, false);
			} catch (err) {
				console.error("Error attempting to initialize MIDI.");
			}
		})();
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
      	if (!MIDIworking) flashNotice ("‼️ No MIDI or fallback Web Audio available ‼️", 5000);
			audioCtx = null;
		}
		// *** END NEW ***
	}


	function onMIDISuccess(access) {
		midiAccess = access;
		midiOutputsByName = {}; // clear/reset
		console.log("MIDI ready. Available outputs:");
	
		let idx = 0;
		for (let output of midiAccess.outputs.values()) {
			console.log(`[${idx}] ${output.name}`);
			// Collect any output whose name matches the pattern "IAC Driver Bus x"
			if (/^IAC Driver Bus \d+$/.test(output.name)) {
					midiOutputsByName[output.name] = output;
			}
			idx++;
		}

		// Test output availability for nondiagetic bus
		if (midiOutputsByName[MIDI_OUTPUT_NONDIAGETIC]) {
			midiOutput = midiOutputsByName[MIDI_OUTPUT_NONDIAGETIC];
			console.log(`nondiagetic MIDI output: ${midiOutput.name}`);
		} else {
			midiOutput = null;
			console.error(`No MIDI output found for MIDI_OUTPUT_NONDIAGETIC: "${MIDI_OUTPUT_NONDIAGETIC}".`);
		}
		
		// Check all unique outputs needed for uttering channels
		const utteringOutputsNeeded = [...new Set(MIDI_CHANNELS_FOR_UTTERING.map(obj => obj.output))];
		for (const outputName of utteringOutputsNeeded) {
			if (!(outputName in midiOutputsByName)) {
				console.error(`MIDI_CHANNELS_FOR_UTTERING refers to unavailable output: "${outputName}".`);
			}
		}	
		     
	}


	
	//----------------------------------------------------
	this.setGlobalParameters = function( p0, p1, p2, p3 )
	{
		// retrieves interval, shortest note, etc. based on current running simulation
		const musicParameters = determineCurrentMusicParameters (); 
		let minReverb = 						musicParameters.minReverb;
		let maxReverb = 						musicParameters.maxReverb;
		let secBetweenUnivNoteShift = 	musicParameters.secBetweenUnivNoteShift;
		let backgroundMIDInote = 			musicParameters.backgroundMIDInote;
		let backgroundRetriggerSec = 		musicParameters.backgroundRetriggerSec;

		SOUND_UPDATE_COUNTER +=1;
		_parameter_0 = p0;
		_parameter_1 = p1;
		_parameter_2 = p2;
		_parameter_3 = p3; // camera zoom, ranges from about 500 to 8000

		// grab camera zoom and use it for some globals
		const zoomPercentage = Math.min(1, Math.max(0, (_parameter_3 - 500) / (8000 - 500)));

		UTTER_ATTENUATION = Math.round(zoomPercentage * MAX_UTTER_ATTENUATION);

		// --- get the correct MIDI output by name ---
		let nondiegeticOutput = midiOutputsByName[MIDI_OUTPUT_NONDIAGETIC]; // Normally 'IAC Driver Bus 1'

		let soundUpdatesPerSecond = Math.round(1000 / (SOUND_UPDATE_PERIOD * APPROX_MS_PER_CLOCK)); // how many counter clicks equals a second?
		
		// FREQUENT GLOBAL ATMOSPHERIC UPDATES
		if (doingMidiOutput() && SOUND_OUTPUT_ATMOSPHERE && nondiegeticOutput) {
			
			// ADJUST GLOBAL VOLUME
			var midiVolume = 90; // 90 = 0db full volume
			if (AUTOPILOT_MODE) midiVolume = Math.round(midiVolume * AUTOPILOT_VOLUME_REDUCTION); // much quieter when on autopilot
			if (midiVolume != LAST_VOLUME) { // so we don't send this unnecessarily
				sendControlMIDI(28, midiVolume, MIDI_CHANNEL_SYSTEM, nondiegeticOutput); // overall Left & Right Volume
				LAST_VOLUME = midiVolume;
			}
			
			// GLOBAL REVERB
			const reverbAmount = Math.floor(minReverb + (zoomPercentage * (maxReverb-minReverb)) );
			sendControlMIDI(21, reverbAmount, MIDI_CHANNEL_ATMOSPHERE, nondiegeticOutput); // dry/wet global reverb level

			// SYNTHESIZED DRONE
			const controlAdjustment15 = Math.floor(90 - Math.floor(zoomPercentage * 60)); // inverted range of 30-90
			sendControlMIDI(15, controlAdjustment15, MIDI_CHANNEL_ATMOSPHERE, nondiegeticOutput); // cutoff section A of meta. function B
			const controlAdjustment16 = MIDI_BASE_NOTE + UNIVERSAL_NOTE_SHIFT - 6 ;
			sendControlMIDI(16, controlAdjustment16, MIDI_CHANNEL_ATMOSPHERE, nondiegeticOutput); // 5th histogram section A of metaphysical function B (rhythmic background)
			const controlAdjustment17 = MIDI_BASE_NOTE + UNIVERSAL_NOTE_SHIFT + 6 ;
			sendControlMIDI(17, controlAdjustment17, MIDI_CHANNEL_ATMOSPHERE, nondiegeticOutput); // 5th histogram section A of metaphysical function B (rhythmic background)
			
			// SAMPLER BACKGROUND -- retrigger every so often
			if (SOUND_UPDATE_COUNTER % (soundUpdatesPerSecond * backgroundRetriggerSec) == 0) {
				let midiChannel = MIDI_CHANNEL_BACKGROUND;
				let midiNote = backgroundMIDInote;
				sendNoteMIDI(midiNote, 127, 5000, midiChannel, nondiegeticOutput); // 5 second note
				if (DEBUGGING_NOISY_CONSOLE_MODE) console.log ("Retriggered background sampler note @ " + SOUND_UPDATE_COUNTER);
			}

		}
		
		// every minute, tweak background sound just for variation
		if (doingMidiOutput() && SOUND_UPDATE_COUNTER % (soundUpdatesPerSecond * 60) === 0 && nondiegeticOutput) {			
			
			let controlAdjustment18 = (Math.floor(Math.random() * (6)) * 16) + 32; // 32 to 96 in steps of 16
			sendControlMIDI(18, controlAdjustment18, MIDI_CHANNEL_ATMOSPHERE, nondiegeticOutput); // 5th histogram section A of metaphysical function B (rhythmic background)
			
			let controlAdjustment19 = (Math.floor(Math.random() * (4)) * 25) + 25; // one of 25, 50, 75, or 100
			sendControlMIDI(19, controlAdjustment19, MIDI_CHANNEL_ATMOSPHERE, nondiegeticOutput); // 4th histogram section A of metaphysical function B (twanginess?)
		}


		// THE UNIVERSE BACKGROUND HUM moves around to generate interest
		if (secBetweenUnivNoteShift && SOUND_UPDATE_COUNTER % (soundUpdatesPerSecond * secBetweenUnivNoteShift) === 0) {
  	 		const defaultIntervals = MIDI_NOTE_INTERVAL_SETS[0].intervals; // pentatonic
  			UNIVERSAL_NOTE_SHIFT = defaultIntervals[Math.floor(Math.random() * defaultIntervals.length)];
			console.log ("*** UNIVERSAL BACKGROUND SHIFTED " + UNIVERSAL_NOTE_SHIFT + " ***");
		}

		if (SOUND_UPDATE_COUNTER % 10 === 0) {
			const { histogram, totalNotes, totalMods, tableHTML } = getPitchHistogram();
			document.getElementById('saveLoadPanel').innerHTML = tableHTML;
		}
	} /* end setGlobalParameters */

	//------------------------------------------------------------------------------------------------------
	// doSwimbotSoundEvent is used for non-diegetic sounds, e.g. eating, being born, dying
	this.doSwimbotSoundEvent = function( type, eventIndex = false )
	{
		let nondiegeticOutput = midiOutputsByName[MIDI_OUTPUT_NONDIAGETIC];
		let soundEventLog = "doSwimbotSoundEvent() type=";
		
		if ( type === SOUND_EVENT_TYPE_EAT ) {
			soundEventLog += 'EAT';
			if (doingMidiOutput() && SOUND_OUTPUT_EAT) {
				let midiChannel = MIDI_CHANNEL_EAT;
				let midiNote = Math.floor(Math.random() * (12)) + MIDI_BASE_NOTE; // note in a one octave range
				let controlValue = Math.floor(Math.random() * (40)) + 50; // control of about 50-90
				sendControlMIDI(14, controlValue, midiChannel, nondiegeticOutput);
				sendNoteMIDI(midiNote, 127, 100, midiChannel, nondiegeticOutput);
				soundEventLog += " sent non-diagetic eat MIDI note " + midiNote + " w/CC 14 " + controlValue;
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH ) {
			soundEventLog += 'BIRTH';
			if (doingMidiOutput() && SOUND_OUTPUT_BIRTH) {
				let midiChannel = MIDI_CHANNEL_BIRTH;
				let midiNote = MIDI_BASE_NOTE + (12*2) + (Math.floor(Math.random() * 3) * 12); // base note octaves 3-5
				sendNoteMIDI(midiNote, 120, 250, midiChannel, nondiegeticOutput);
				soundEventLog += " sent non-diagetic birth MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH ) {
			soundEventLog += 'DEATH';
			if (doingMidiOutput() && SOUND_OUTPUT_DEATH) {
				let midiChannel = MIDI_CHANNEL_DEATH;
				let midiNote = MIDI_BASE_NOTE + (12*2) + (Math.floor(Math.random() * 3) * 12); // base note octaves 3-5
				sendNoteMIDI(midiNote, 127, 1000, midiChannel, nondiegeticOutput);
				soundEventLog += " sent non-diagetic death MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_SPAWN ) { // sequence a Q*bert-style sound: sequence distinct notes from spawn-x.wav samples
			if (doingMidiOutput() && SOUND_OUTPUT_SPAWN) {

				// IMMEDIATELY do a regular birth sound
				this.doSwimbotSoundEvent(SOUND_EVENT_TYPE_BIRTH, false);

				// Add in our Qbert vocalization
				let midiChannel = MIDI_CHANNEL_ONESHOTS;
				const noteDuration = 150; // ms per note
				const base = 36;
				const max  = 36 + SPAWN_SOUND_VARIATIONS - 1;
				const pool = [];
				for (let n = base; n <= max; n++) pool.push(n); // build pool of MIDI notes
				const count = Math.min(1, pool.length); // how many notes do we want to play?
				const picks = [];
				for (let k = 0; k < count; k++) {
					const idx = Math.floor(Math.random() * pool.length);
					picks.push(pool[idx]);
					pool.splice(idx, 1); // remove chosen note so we don't reuse it
				}
				
				// schedule sequential notes
				let qbertDelay = 250;
				for (let i = 0; i < picks.length; i++) {
					const note = picks[i];
					setTimeout(() => {
						sendNoteMIDI(note, 60, noteDuration, midiChannel, nondiegeticOutput);
					}, qbertDelay + (i * (noteDuration + 10)) ); // schedule 10ms apart
				}

				soundEventLog += " sent non-diagetic spawn MIDI sequence ";
			}
		} else if ( type === SOUND_EVENT_TYPE_LAUNCH ) {
			if (doingMidiOutput() && SOUND_OUTPUT_LAUNCH) {
				let midiChannel = MIDI_CHANNEL_ONESHOTS;
				let midiNote = 60 + eventIndex; // spawn sounds begin at C3
				sendNoteMIDI(midiNote, 127, 3000, midiChannel, nondiegeticOutput);
				soundEventLog += " sent non-diagetic launch MIDI note " + midiNote;
			}
		} // end if sound types
		 
 		if (DEBUGGING_NOISY_CONSOLE_MODE) console.log( soundEventLog );
		return false;
    }

	 // GenePool.js decides when a swimbot should utter, at which point
	 // doUtterance() is called with an object describing its utterance phenotypes
	 // e.g. utterVariablesObj.swimbotInView, utterVariablesObj.utterSequence... 

	this.doUtterance = function (utterVariablesObj, callerFunction) {
		const rightNow = Date.now();
		const useMidi = doingMidiOutput();
		const useWebAudio = !useMidi && audioCtx !== null;
		let playAudio = false;
		let midiChannel;
		let midiOutput; // <--- add this
	
		// Step 1: Decide if we can and should play audio for this utterance.
		if (useMidi && !_runningFast) {
			// MIDI Path: Check if utterance is enabled, in view, and channel is not throttled.
			if (utterVariablesObj.swimbotInView && SOUND_OUTPUT_UTTER) {
				let maxUtteranceChannels = MIDI_CHANNELS_FOR_UTTERING.length; // maximum possible utterance channels
				if (THROTTLE_MIDI_WHEN_LOADED) { // THROTTLE_MIDI_WHEN_LOADED is a percentage e.g. .25 
					// as currentNumberSwimbots approaches MAX_SWIMBOTS, throttle maxUtteranceChannels down by as much as THROTTLE_MIDI_WHEN_LOADED
					maxUtteranceChannels = throttleMaxChannels();
				}
				let oldestMIDIchannel = MIDI_CHANNELS_FOR_UTTERING[0];
				for (let i = 1; i < maxUtteranceChannels; i++) {
					if (MIDI_CHANNELS_FOR_UTTERING[i].lastUsed < oldestMIDIchannel.lastUsed) {
						oldestMIDIchannel = MIDI_CHANNELS_FOR_UTTERING[i];
					}
				}
				const min_wait_slop = Math.floor(Math.random() * 250);
				if (Date.now() - oldestMIDIchannel.lastUsed > (MIN_WAIT_BETWEEN_MIDI_UTTERANCES + min_wait_slop)) {
					playAudio = true;
					oldestMIDIchannel.lastUsed = rightNow;
					midiChannel = oldestMIDIchannel.channel; // Update its lastUsed timestamp
					// *** Get the output by name ***
					midiOutput = midiOutputsByName[oldestMIDIchannel.output];
				}
			}
		} else if (useWebAudio && !_runningFast) {
			// Web Audio Path: Simpler check, just needs to be in view. No channel throttling.
			if (utterVariablesObj.swimbotInView) {
					playAudio = true;
			}
		}
	
		// Step 2: Schedule all events from the sequence.
		for (const step of utterVariablesObj.utterSequence) {
			setTimeout(() => {
					// Earlier versions relied on this done to issue a callback, these days we ignore
					if (step.type === 'done') {
						return;
					}
	
					if (!playAudio) return;
	
					if (step.type === 'note') {
						if (UTTER_ATTENUATION) { // are we making our swimbot utterances quieter?
							step.velocity = step.velocity - UTTER_ATTENUATION;
							step.velocity = Math.max(20, step.velocity); // but no lower than 20
						}
						
						if (useMidi && midiOutput) {
							sendNoteMIDI(step.note, step.velocity, step.duration, midiChannel, midiOutput); // pass midiOutput!
						} else if (useWebAudio) {
							playNoteWebAudio(step.note, step.velocity, step.duration);
						}
						RECENT_NOTES_DB.push({ note: step.note % 12, time: Date.now() });
					} else if (step.type === 'cc') {
						if (useMidi && midiOutput) {
							sendControlMIDI(step.cc, step.value, midiChannel, midiOutput); // pass midiOutput!
						}
    				  	RECENT_MODS_DB.push({ time: Date.now() }); // Add this line
					}
			}, step.delay);
		}
		return false;
	}

	function doingMidiOutput() {
		if (midiOutput && !_runningFast) {
			return (true);
		} else {
			return (false);
		}
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

	// Send a MIDI Panic to clear out any stuck notes
	// In Gig Performer, configure Options -> Global MIDI -> Panic for IAC Driver Bus 1, Control change, CC #64, CH 16
	function sendMIDIpanic() {
		let nondiegeticOutput = midiOutputsByName[MIDI_OUTPUT_NONDIAGETIC];
		if (typeof nondiegeticOutput !== "undefined") {
			console.log ("*** SENDING MIDI PANIC ***");
			sendControlMIDI(64, 100, MIDI_CHANNEL_SYSTEM, nondiegeticOutput);	
		}
		return;
	}
	
	this.sendMIDIpanic = sendMIDIpanic; // wrapper so we can call it from outside, e.g. whenever we start a new simulation in GenePool.js startSimulation
	
	// Actually send a MIDI note on (and schedule a note off) to the IAC bus.
	function sendNoteMIDI(noteNumber, velocity, durationMs, midiChannel, midiOutput) {
		// clamp/filter note and warn
		let originalNote = noteNumber; // copy for compare
		noteNumber = Math.round(noteNumber);		
		noteNumber = Math.max(0, noteNumber);
		noteNumber = Math.min(127, noteNumber);
		if (noteNumber != originalNote) console.warn(`*** Had to clamp MIDI note (ch ${midiChannel}) from ${originalNote} to ${noteNumber}`);
		let zeroIndexMidiChannel = midiChannel - 1; 
		const noteOn = 0x90 | zeroIndexMidiChannel;
		const noteOff = 0x80 | zeroIndexMidiChannel;
		midiOutput.send([noteOn, noteNumber, velocity]);
		setTimeout(() => {
			midiOutput.send([noteOff, noteNumber, 0]);
		}, durationMs);
	}
	
	// Actually send a MIDI control value
	function sendControlMIDI(controllerNumber, controlValue, midiChannel, midiOutput) {
		// clamp/filter controlValue and warn
		let originalValue = controlValue; // copy for compare
		controlValue = Math.round(controlValue);		
		controlValue = Math.max(0, controlValue);
		controlValue = Math.min(127, controlValue);
		if (controlValue != originalValue) console.warn(`*** Had to clamp CC no. ${controllerNumber} (ch ${midiChannel}) from ${originalValue} to ${controlValue}`);
		let zeroIndexMidiChannel = midiChannel - 1; 
		const cc = 0xB0 | zeroIndexMidiChannel;
		midiOutput.send([cc, controllerNumber, controlValue]);
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
	
	
	// WHAT IS MY MIDI BASE NOTE?
	let myMIDIBaseNote = MIDI_BASE_NOTE;

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
			myMIDIBaseNote = myMIDIBaseNote + 7;
			if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("-> Rolled to jump UP a fifth!");
		} else {
			myMIDIBaseNote = myMIDIBaseNote -5;
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
	const octaveShiftOptions = [0,12,12,12,24,24,24,24,24,24,36,36,36,36,48,48];
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
	const numberOfIntervalRotations = Math.floor(rng() * 3);


	
	// IMPORTANT! To make sure everyone doesn't start on the same note, we randomly rotate the intervals
	// for example, this:		[-10, -8, -5, -3, 0, +2, +4, +7, +9];
	// might turn into this:	[+7, +9, -10, -8, -5, -3, 0, +2, +4]; (rotated two positions)
	for (let i = 0; i < numberOfIntervalRotations; i++) {
		myNoteIntervalSet.unshift(myNoteIntervalSet.pop());
	}
	
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
	
	// these vars will keep a record of the phenotypical attributes of our new MIDI sequence
	let recordNotesUsed = [], recordHighNote = 0, recordLowNote = 127, recordNoteCount = 0, recordModCount = 0;
		
	// how long are our notes?
	const noteLengthOptions = ['legato','staccato','staccato','complex','complex','complex']; // weighted towards favorites
	let noteLengthStyle = noteLengthOptions[Math.floor(rng() * noteLengthOptions.length)];		
		
	// how strong should our mod wheel wiggling be, and how often should we do it?
	const modulationStrength = Math.floor((rng() * 16) * 4); // how fast to twist knobs
	const modChanceOptions = [0,0,.10,.10,.20,.20,.50,.50,.50,.50]; // weighed towards middle and high chance of wiggle
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
	// 'variable' means yes you can twiddle this knob during the sequence
	// in which case the variableWidth is how much you can twiddle it
	let myControls = [
		{ cc: 14, min: 94,	max: 97,		initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up' }, 	// wave
		{ cc: 15, min: 0,		max: 127,	initalVal: 0,	variable: true,	variableWidth: 127,	lastVal: 0,	lastDir: 'up' }, 	// "mouth"
		{ cc: 16, min: 32,	max: 127,	initalVal: 0,	variable: true,	variableWidth: 96,	lastVal: 0,	lastDir: 'up'  }, // "size"
		{ cc: 17, min: 70,	max: 95,		initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  }, // "tone" 
		{ cc: 19, min: 0,		max: 70,		initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  },	// "level 2" resonance
		{ cc: 20, min: 0,		max: 127,	initalVal: 0,	variable: false,	variableWidth: 0,		lastVal: 0,	lastDir: 'up'  } 	// "level 3"
	];
	
	for (let setting of myControls) {
		const range = setting.max - setting.min + 1;
		let myCCval = Math.floor((rng() * range) + setting.min);
		setting.initalVal = myCCval; // remember our initial home position
		setting.lastVal = myCCval; // this will also be our last known position
		if (rng() > .5) setting.lastDir = 'down'; // randomly override initial spin direction
	}
	
	// VOCAL SYNTH IS TOO QUIET IF CC15 plus CC16 DON'T ADD UP TO AT LEAST 100, so re-roll those values if necessary:
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
		let thisNoteNumber = myMIDIBaseNote + myOctaveNoteShift + thisNoteShift;
		
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
	
	// insert final 'done' event
	sequenceData.push({ delay: sequenceTime, type: 'done' });


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
	// console.log ("UTTERANCE COMPOSED: myMIDIBaseNote=" + myMIDIBaseNote + " octave=" + (myOctaveNoteShift/12) + " mutationFactor=" + mutationFactor + " noteLengthStyle=" + noteLengthStyle + " chanceOfModulation=" + chanceOfModulation + " modulationStrength=" + modulationStrength + " recordNoteCount=" + recordNoteCount + " recordModCount=" + recordModCount, sequenceData);
	// console.log ("UTTERANCE COMPOSITION NOTES USED " + recordNotesUsed);
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

function pruneOldMods() {
    const now = Date.now();
    const cutoff = now - 60000; // 60 seconds ago
    while (RECENT_MODS_DB.length && RECENT_MODS_DB[0].time < cutoff) {
        RECENT_MODS_DB.shift();
    }
}



/***************************************************************
	determineCurrentMusicParameters()
	specifies the MIDI note intervals and other parameters that
	influence utterance generation and general sonic parameters
	_chosenPoolToLoad is our current simulation, normally 0-4
	MIDI_NOTE_INTERVAL_SETS has our stable of interval sets
****************************************************************/

function determineCurrentMusicParameters () {
	// set / reestablish defaults
	let mySet = getNoteIntervalSetFor('minor pentatonic'); // default set
	let minReverb = MIN_REVERB_DEFAULT;
	let maxReverb = MAX_REVERB_DEFAULT;
	let secBetweenUnivNoteShift = SECONDS_BETWEEN_UNIVERSAL_NOTE_SHIFT_DEFAULT;
	let shortestNoteMs = SHORTEST_NOTE_MS_DEFAULT;
	let noteProbabilityMatrix = structuredClone(IOI_MIDI_NOTE_PROBABILITY_MATRICES['super']); // default to bell curve instead of 'sharp' or 'super'
	let seqDurationStates = structuredClone(DEFAULT_SEQUENCE_DURATION_STATES);
	let backgroundMIDInote = DEFAULT_BACKGROUND_NOTE;
	let backgroundRetriggerSec = SECONDS_BETWEEN_BACKGROUND_RETRIGGER_DEFAULT;
	
	seqDurationStates
	/*
	{ name: 'short',  min: 60,  max: 80 }, 	// needs to be longer than SHORTEST_NOTE_MS_DEFAULT 
	{ name: 'medium', min: 140, max: 210 },   // 120ms is an 8th note at 125 BPM
	{ name: 'long',   min: 280, max: 420 }    // 240ms is a quarter note at 125 BPM, 480 is a half note at 125 BPM
	*/
	
	/*** BLANK POOL ***/
	if (_chosenPoolToLoad == 0) {
		backgroundMIDInote = 1; 						// no background loop sound
		mySet = getNoteIntervalSetFor('minor pentatonic');
		
	/*** INVASION ***/
	} else if (_chosenPoolToLoad == 1) {
		minReverb = Math.floor(MAX_REVERB_DEFAULT * .75); // lots of reverb
		mySet = getNoteIntervalSetFor('minor pentatonic');
		secBetweenUnivNoteShift = 10; 				// shorter shifts
		shortestNoteMs = 90; 							// shortest notes will be 90ms
		seqDurationStates[0].min = 100; 				// lengthen 'short' min to 100ms
		seqDurationStates[0].max = 140; 				// lengthen 'short' max to 140mx
		backgroundMIDInote = 36; 						// bell drone
		backgroundRetriggerSec = 12; 					// faster retrigger

	/*** FLOCKS ***/
	} else if (_chosenPoolToLoad == 2) {
		backgroundMIDInote = 36; 						// bell drone
		mySet = getNoteIntervalSetFor('major pentatonic');
		noteProbabilityMatrix = structuredClone(IOI_MIDI_NOTE_PROBABILITY_MATRICES['bell']); // evener note distribution

	/*** RADIAL ***/
	} else if (_chosenPoolToLoad == 3) {
		noteProbabilityMatrix = structuredClone(IOI_MIDI_NOTE_PROBABILITY_MATRICES['bell']); // evener note distribution
		mySet = getNoteIntervalSetFor('whole tone');
		maxReverb = MIN_REVERB_DEFAULT; 		// very little reverb

	/*** BIG BANG ***/
	} else if (_chosenPoolToLoad == 4) {
		mySet = getNoteIntervalSetFor('5ths');
		secBetweenUnivNoteShift = 60 * 2; 			// shorter shifts
		
	/*** AUTOPILOT ***/
	} else if (_chosenPoolToLoad == 5) {
		mySet = getNoteIntervalSetFor('octaves');
		backgroundMIDInote = 36; 						// bell drone
		minReverb = Math.floor(MAX_REVERB_DEFAULT * .95); // loads of reverb
	}
	
	// build up our musicParameters object and return it
	let musicParameters = {
			shortestNoteMs:				shortestNoteMs,
			minReverb:						minReverb,
			maxReverb:						maxReverb,
			backgroundMIDInote:			backgroundMIDInote,
			backgroundRetriggerSec:		backgroundRetriggerSec,
			secBetweenUnivNoteShift:	secBetweenUnivNoteShift,
			intervalSet:					mySet.intervals.slice(),		// e.g. [-9, -7, -5, -2, 0, +3, +5, +7, +10]. // slice to detach from original
			intervalSetName: 				mySet.name,							// e.g. 'minor pentatonic'
			noteProbabilityMatrix:		noteProbabilityMatrix,
			seqDurationStates:			seqDurationStates
		};
	return musicParameters;
}







/* throttleMaxChannels reduces how many synthesizers we are using when our JS is loaded up with swimbots
	at 50% of max swimbots, we don't throttle at all
	then we steeply throttle our channels by up to THROTTLE_MIDI_WHEN_LOADED (e.g. .25 = 25%) 
*/
function throttleMaxChannels() {
	const maxChannels = MIDI_CHANNELS_FOR_UTTERING.length;
	const current = genePool.getNumSwimbots();
	const max = (typeof MAX_SWIMBOTS !== 'undefined' && MAX_SWIMBOTS > 0) ? MAX_SWIMBOTS : (current || 1);
	const u = Math.min(1, Math.max(0, current / max)); // Utilization in [0,1]
	
	// No throttling until swimbots are at 50%; full effect by 100%
	const START = 0.50, END = 1.00;
	
	// Map u∈[START,END] → t∈[0,1], clamp
	const t = Math.min(1, Math.max(0, (u - START) / (END - START)));
	
	// Smoothstep knee s∈[0,1]
	const k = .5; // higher = steeper near 100%
	const s = Math.pow(t, k); // still 0 at 50%, 1 at 100%
	
	// Cap reduction to [0,1]
	const maxReduction = Math.min(Math.max(THROTTLE_MIDI_WHEN_LOADED, 0), 1);
	
	// 1.0 → (1.0 - maxReduction) as load goes from 50%→100%
	const factor = 1 - (maxReduction * s);
	
	let reducedChannelCount = Math.max(1, Math.floor(maxChannels * factor));
	if (maxChannels != reducedChannelCount) {
		if (DEBUGGING_NOISY_CONSOLE_MODE) console.log("Reduced MIDI utterance channels from " + maxChannels + " to " + reducedChannelCount + " because we are at " + current + "/" + max + " swimbots.");
	}
	return (reducedChannelCount);
}

function getPitchHistogram() {
	pruneOldNotes();
   pruneOldMods();
	let totalMods = RECENT_MODS_DB.length;
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
	let tableHTML = '<table><tbody style="font-size: 10px; text-align:center;"><tr><th colspan="11">' + totalNotes + '/' + totalMods + ' notes/mods per min.</th></tr>';
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

	return { histogram, totalNotes, totalMods, tableHTML }; // return as an object
}



// --- startup sanity checks ---
function sanityCheckMusicConfig() {
  // 1) Interval sets: shape + types (+ center 0)
  if (!Array.isArray(MIDI_NOTE_INTERVAL_SETS) || MIDI_NOTE_INTERVAL_SETS.length === 0) {
    throw new Error("MIDI_NOTE_INTERVAL_SETS must be a non-empty array.");
  }

  MIDI_NOTE_INTERVAL_SETS.forEach((set, i) => {
    if (!set || typeof set.name !== "string" || !Array.isArray(set.intervals)) {
      throw new Error(`MIDI_NOTE_INTERVAL_SETS[${i}] must be { name: string, intervals: number[] }`);
    }
    if (set.intervals.length !== 9) {
      throw new Error(`MIDI_NOTE_INTERVAL_SETS: set "${set.name}" has ${set.intervals.length} intervals; expected 9.`);
    }
    // Require numeric (integers ok), and root at center index 4
    set.intervals.forEach((iv, j) => {
      if (typeof iv !== "number" || !Number.isFinite(iv)) {
        throw new Error(`MIDI_NOTE_INTERVAL_SETS "${set.name}" intervals[${j}] is not a finite number.`);
      }
    });
    if (set.intervals[4] !== 0) {
      throw new Error(`MIDI_NOTE_INTERVAL_SETS "${set.name}" must have 0 at center (index 4).`);
    }
  });

  // 2) Probability matrices: 9x9, non-negative, each row sums to ~1
  const EPS = 1e-6;
  const matrices = IOI_MIDI_NOTE_PROBABILITY_MATRICES;
  if (typeof matrices !== "object" || matrices == null) {
    throw new Error("IOI_MIDI_NOTE_PROBABILITY_MATRICES must be an object of named matrices.");
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
  // Object.freeze(MIDI_NOTE_INTERVAL_SETS);
  // Object.freeze(IOI_MIDI_NOTE_PROBABILITY_MATRICES);

  console.log("Music config sanity OK");
}

// Call once at startup
sanityCheckMusicConfig();