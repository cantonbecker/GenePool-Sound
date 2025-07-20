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

const SOUND_UPDATE_PERIOD =  5; 	// every this many _clock iterations, update global audio parameters (like overall reverb/zoom level)
var APPROX_MS_PER_CLOCK = 20; 	// used to scale utterDuration to absolute time. if the simulation speed changes, we might adjust this.
var SOUND_UPDATE_COUNTER = 0;

const SOUND_EVENT_TYPE_NULL	= -1
const SOUND_EVENT_TYPE_EAT  	=  1;
const SOUND_EVENT_TYPE_BIRTH	=  2;
const SOUND_EVENT_TYPE_DEATH	=  3;

// MIDI channels are 1-16 (not zero indexed!)
const MIDI_BASE_NOTE = 45; // A1 = 33 | A2 = 45 | A3 = 57 | A440 = 69
const MIDI_CHANNEL_EAT = 1;
const MIDI_CHANNEL_BIRTH = 2;
const MIDI_CHANNEL_DEATH = 3;
const MIDI_CHANNEL_GLOBAL = 16;


// we more or less round-robin through these channels when uttering.
// (each time we utter, we select the channel used longest ago)


const MIDI_CHANNELS_FOR_UTTERING = [
	{	channel: 7,	lastUsed: 0 },
	{	channel: 8,	lastUsed: 0 },
	{	channel: 9,	lastUsed: 0 },
	{	channel: 10, lastUsed: 0 },
	{	channel: 11, lastUsed: 0 },
	{	channel: 12, lastUsed: 0 },
	{	channel: 13, lastUsed: 0 },
	{	channel: 14, lastUsed: 0 }
];

const MIN_WAIT_BETWEEN_MIDI_UTTERANCES = 1500; // throttle: we don't ask any individual uttering channel to utter more often than this


/*
const MIDI_CHANNELS_FOR_UTTERING = [
	{	channel: 8,	lastUsed: 0 },
];
*/



// these are here in case we want to selectively disable some sounds during testing
var MIDI_OUTPUT_UTTER 	= true;
var MIDI_OUTPUT_EAT 		= true;
var MIDI_OUTPUT_BIRTH 	= true;
var MIDI_OUTPUT_DEATH 	= true;
var MIDI_OUTPUT_GLOBAL 	= true;


const MIDI_NOTE_INTERVAL_SETS = [
    { name: "pentatonic", 				intervals: [-10, -8, -5, -3, 0, +2, +4, +7, +9] },
    { name: "minor pentatonic", 		intervals: [-9, -7, -5, -2, 0, +3, +5, +7, +10] },
    { name: "whole-tone", 				intervals: [-10, -8, -6, -4, 0, +2, +4, +6, +8] },
    { name: "chromatic cluster", 	intervals: [-4, -3, -2, -1, 0, +1, +2, +3, +4] },
	 { name: "5ths", 						intervals: [-24, -17, -12, -5, 0, +7, +12, +19, +24] },
	 { name: "octaves", 					intervals: [-24, -12, -24, -12, 0, +12, +24, +12, +24] }
];

// Pick one of the above for the global / non-diagetic sound interval set, used for things like birth/death/eating
const GLOBAL_INTERVAL_SET_NAME = 'minor pentatonic';
console.log('*** STARTING UP WITH MIDI INTERVAL SET ' + GLOBAL_INTERVAL_SET_NAME + ' ***');

const GLOBAL_NOTE_INTERVALS = MIDI_NOTE_INTERVAL_SETS.find(set => set.name === GLOBAL_INTERVAL_SET_NAME).intervals;
assert(	GLOBAL_NOTE_INTERVALS.length === 9,
  			"Sound.js: GLOBAL_NOTE_INTERVALS should have exactly 9 intervals. Current: [" + GLOBAL_NOTE_INTERVALS.join(", ") + "]"
);

const GLOBAL_MIN_REVERB = 10; // 0-127
const GLOBAL_MAX_REVERB = 80;

/* Markov Chain Inter-onset Interval States:
	When we randomly choose a short/medium/long note, it will randomly choose from these ranges/bands.
	For more typically rhythmic phrases, set identical min/max for each length so each length is identical
*/
const SEQUENCE_DURATION_STATES = [
	{ name: 'short',  min: 60,  max: 60 },    // 30ms is a 64th note at 125 BPM, 60 is a 32nd
	{ name: 'medium', min: 120, max: 120 },   // 120ms is an 8th note at 125 BPM
	{ name: 'long',   min: 240, max: 480 }    // 240ms is a quarter note at 125 BPM, 480 is a half note at 125 BPM
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
	
	//--------------------------------
	this.initialize = function()
	{		
		console.log( "sound.initialize!" );
		// request MIDI
		if (!navigator.requestMIDIAccess) {
			console.error("Web MIDI API not supported.");
			return;
		}

		navigator.requestMIDIAccess()
			.then(onMIDISuccess, onMIDIFailure);

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
		console.error("Could not access MIDI devices.");
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
		if (doingMidiOutput() && MIDI_OUTPUT_GLOBAL) {
			sendCC(21, _p3_scaled, MIDI_CHANNEL_GLOBAL); // dry/wet global reverb level
			sendCC(20, Math.max(_p3_scaled, 60), MIDI_CHANNEL_GLOBAL); // cutoff metaphysical function B (rhythmic background)
		}
		
		// every minute, tweak background sound just for variation
		if (doingMidiOutput() && SOUND_UPDATE_COUNTER % soundUpdatesPerMinute === 0) {
			let controlAdjustment18 = (Math.floor(Math.random() * (6)) * 16) + 32; // 32 to 96 in steps of 16
			sendCC(18, controlAdjustment18, MIDI_CHANNEL_GLOBAL); // 5th histogram section A of metaphysical function B (rhythmic background)
			
			let controlAdjustment19 = (Math.floor(Math.random() * (4)) * 25) + 25; // one of 25, 50, 75, or 100
			sendCC(19, controlAdjustment19, MIDI_CHANNEL_GLOBAL); // 4th histogram section A of metaphysical function B (twanginess?)
		}
	}

	//------------------------------------------------------------------------------------------------------
	// doSwimbotSoundEvent is used for non-diegetic sounds, e.g. eating, being born, dying
	this.doSwimbotSoundEvent = function( type, swimbotPosition, swimbotID )
	{
		let printString = "doSwimbotSoundEvent() type=";
		
		if ( type === SOUND_EVENT_TYPE_EAT ) {
			printString += 'EAT';
			if (doingMidiOutput() && MIDI_OUTPUT_EAT) {
				let midiChannel = MIDI_CHANNEL_EAT;
				let midiNote = Math.floor(Math.random() * (12)) + MIDI_BASE_NOTE; // note in a one octave range
				let controlValue = Math.floor(Math.random() * (40)) + 50; // control of about 50-90
				sendCC(14, controlValue, midiChannel);
				sendNote(midiNote, 127, 100, midiChannel);
				printString += " sent MIDI note " + midiNote + " w/CC 14 " + controlValue;
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH) {
			printString += 'BIRTH';
			if (doingMidiOutput() && MIDI_OUTPUT_BIRTH) {
				let midiChannel = MIDI_CHANNEL_BIRTH;
				let maxDegrees = GLOBAL_NOTE_INTERVALS.length * 3;  // 2 octaves of our scale
				let idToDegrees = swimbotID % maxDegrees;
				let degree = idToDegrees % GLOBAL_NOTE_INTERVALS.length;
				let octave = Math.floor(idToDegrees / GLOBAL_NOTE_INTERVALS.length);
				let midiNote = MIDI_BASE_NOTE + (octave * 12) + GLOBAL_NOTE_INTERVALS[degree];
				sendNote(midiNote, 127, 1000, midiChannel);
				printString += " sent MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH) {
			printString += 'DEATH';
			if (doingMidiOutput() && MIDI_OUTPUT_DEATH) {
				let midiChannel = MIDI_CHANNEL_DEATH;
				let maxDegrees = GLOBAL_NOTE_INTERVALS.length * 3;  // 2 octaves of our scale
				let idToDegrees = swimbotID % maxDegrees;
				let degree = idToDegrees % GLOBAL_NOTE_INTERVALS.length;
				let octave = Math.floor(idToDegrees / GLOBAL_NOTE_INTERVALS.length);
				let midiNote = MIDI_BASE_NOTE + (octave * 12) + GLOBAL_NOTE_INTERVALS[degree];
				sendNote(midiNote, 127, 1000, midiChannel);
				printString += " sent MIDI note " + midiNote;
			}
		} // end if sound types
		 
		// printString += "; swimbotPosition = " + swimbotPosition.x.toFixed(2) + ", " + swimbotPosition.y.toFixed(2);
 		console.log( printString );
		return false;
    }

	 // GenePool.js decides when a swimbot should utter, at which point
	 // doUtterance() is called with an object describing its utterance phenotypes
	 // e.g. utterVariablesObj.swimbotInView, utterVariablesObj.utterSequence... 

	 this.doUtterance = function (utterVariablesObj, callerFunction ) {
		// special conditions will have to be met for us to actually play sound
		let playAudio = false;
		let rightNow = Date.now();
		
		// pick a MIDI channel to utter on (select the utter MIDI channel used longest ago)
		let oldestMIDIchannel = MIDI_CHANNELS_FOR_UTTERING[0];
		for (let i = 1; i < MIDI_CHANNELS_FOR_UTTERING.length; i++) {
			if (MIDI_CHANNELS_FOR_UTTERING[i].lastUsed < oldestMIDIchannel.lastUsed) {
				oldestMIDIchannel = MIDI_CHANNELS_FOR_UTTERING[i];
			}
		}
		
		// Update its lastUsed timestamp
		let midiChannel = oldestMIDIchannel.channel;
		
		// a lot of things have to be true before we'll actuall utter out to MIDI...
		let min_wait_slop = Math.floor(Math.random() * 250); // prevents our available channels from syncing up
		if (doingMidiOutput() && Date.now() - oldestMIDIchannel.lastUsed >( MIN_WAIT_BETWEEN_MIDI_UTTERANCES + min_wait_slop) && utterVariablesObj.swimbotInView && MIDI_OUTPUT_UTTER) {
			playAudio = true;
			oldestMIDIchannel.lastUsed = rightNow;
			let estimatedUtterLength = utterVariablesObj.utterDuration * APPROX_MS_PER_CLOCK;
			console.log ('*** Beginning ' + estimatedUtterLength + ' ms utterance for swimbot ' + utterVariablesObj.swimbotID + ' on MIDI ch. ' + midiChannel + ' ***');
			console.log (utterVariablesObj);
			// console.log(utterVariablesObj.utterSequence); // dump MIDI
		}

		// now walk through the utter MIDI sequence
		for (const step of utterVariablesObj.utterSequence) {		
			setTimeout(() => {
				if (step.type === 'note') {
					if (playAudio) sendNote(step.note, step.velocity, step.duration, midiChannel);
				} else if (step.type === 'cc') {
					if (playAudio) sendCC(step.cc, step.value, midiChannel);
				} else if (step.type === 'done') { // always do this, even if we're not playing audio	
					callerFunction.setDoneUtteringSound( utterVariablesObj.swimbotID );						
				}
			}, step.delay);
		}
		return (false);
		
	} // end function doUtterance()
		
	function doingMidiOutput() {
		if (midiOutput) {
			return true;
		} else {
      	return false;
		}
	}



	// Actually send a MIDI note on (and schedule a note off) to the IAC bus. 
	function sendNote(noteNumber, velocity, durationMs, midiChannel) {
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
} // end function Sound





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
 */


function generateUtterancePhenotypes(genes, _geneNames, utterPeriod, utterDuration) {

/*
for (let i = 0; i < _geneNames.length; i++) { console.log(_geneNames[i], genes[i]); }
console.log('Genes:',genes);
*/

	const rng = aleaPRNG(genes.toString()); // initialize the random number generator with the entire genetic sequence
	// const rng = aleaPRNG('always the same');
	
	const utterSequenceLength = utterDuration * APPROX_MS_PER_CLOCK; // range of 5-100 = 150ms-3000ms

	// One option is that we can swap out our interval scale
	/*
	const pickIntervalIndex = Math.floor(rng() * MIDI_NOTE_INTERVAL_SETS.length);
	const pickIntervalSet = MIDI_NOTE_INTERVAL_SETS[pickIntervalIndex];
	const MIDI_intervalName = pickIntervalSet.name;
	var myNoteIntervals = pickIntervalSet.intervals;
	console.log('Picked ' + MIDI_intervalName);
	*/
	
	// or just keep our global scale
	var myNoteIntervals = GLOBAL_NOTE_INTERVALS;


	// use our DNA or other phenotype info to mutate some of our markov chain probabilities
	let idx = _geneNames.indexOf('frequency');
	if (idx === -1) throw new Error("generateUtterancePhenotypes unable to extract 'frequency' from genes")
	const geneticFrequency = genes[idx]; // 0-1, more or less how fast it wiggles

	/*** Assign duration and note probability matrices ***/
	let myDurationProbabilities = IOI_DURATION_PROBABILITY_MATRIX;
	let myNoteProbabilities = IOI_MIDI_NOTE_PROBABILITY_MATRIX; // make a copy we can mess with

	/*** Mutate them? ***/
	let mutationFactor = Math.floor((rng() ** 7) * 11);
	for (let i = 0; i < mutationFactor; i++) { // the more times we mutate it, the more we stray from the default bell-curve
		myDurationProbabilities = createMutatedMatrix(myDurationProbabilities, rng, 0.3);
		myNoteProbabilities = createMutatedMatrix(myNoteProbabilities, rng, 0.3);
	}
	
   logProbabilityMatrix('Original Note Probability Matrix:', IOI_MIDI_NOTE_PROBABILITY_MATRIX);
   logProbabilityMatrix('Mutated x' + mutationFactor + ' Note Probability Matrix:', myNoteProbabilities);
	 
	 
	let sequenceTime = 0; // keep track of our timeline for composing (in ms)
	
	const sequenceData = [];
	
	// these vars will keep a record of the phenotypical attributes of our new MIDI sequence
	let recordNotesUsed = [], recordHighNote = 0, recordLowNote = 127, recordNoteCount = 0, recordModCount = 0;
	
	// is our swimbot a baritone or a soprano?
	let octaveNoteShift = 12 * (Math.floor(rng() * 4));  // octaves above the MIDI base note
	
	// how much mod wheel wiggling should there be between notes? (Increase the exponent to further weigh towards zero)
	// let chanceOfModulation = rng() ** 4;
	let chanceOfModulation = .5;
	
	// Markov Chain time! Pick an initial Interval State (note)
	let lastInt = Math.floor(rng() * myNoteIntervals.length); // pick a random starting interval
	
	// Now pick the initial Inter-Onset Interval (duration)
	let lastIOI = Math.floor(rng() * SEQUENCE_DURATION_STATES.length); // might be short, medium, or long initial note
	// if (utterSequenceLength < 750) lastIOI = 0; // override for short utterances. they should ALWAYS start with a short note (zero index to Interval State)
	
	
	// initialize synth controls 15,16,17,19,20 with a random value from 0-127
	const controlNumbers = [15, 16, 17, 19, 20];
	for (let ccNum of controlNumbers) {
		sequenceTime += 10; // add 10ms
		let myCCval = Math.floor(rng() * 127) // 0-127, equal weight;
		sequenceData.push({
			delay: sequenceTime,
			type: 'cc',
			cc: ccNum,
			value: Math.floor(rng() * 127) // 0-127, equal weight
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
	
		// stretch durations to 100–200% of the gap, with a floor of 50ms
		// const thisNoteDuration = Math.max( Math.round(interOnsetIntervalMs * (1 + rng() * 1)), 50 );
		const thisNoteDuration = interOnsetIntervalMs / 2;
	
		// ——— pick next interval state ———
		p = rng(); cumulativeProb = 0; let nextIntState;
		for (let i = 0; i < myNoteIntervals.length; i++) {
			cumulativeProb += myNoteProbabilities[lastInt][i];
			if (p < cumulativeProb) { nextIntState = i; break; }
		}
		if (nextIntState === undefined) nextIntState = myNoteIntervals.length - 1;
		const thisNoteShift = myNoteIntervals[nextIntState];
		let thisNoteNumber = MIDI_BASE_NOTE + octaveNoteShift + thisNoteShift;
		
		// remember some phenotypical info
		if (thisNoteNumber > recordHighNote) recordHighNote = thisNoteNumber; // we hit our highest note yet
		if (thisNoteNumber < recordLowNote) recordLowNote = thisNoteNumber; // we hit our lowest note yet
		if (!recordNotesUsed.includes(thisNoteNumber)) recordNotesUsed.push(thisNoteNumber); // we used a new note
	
		// ——— emit note event ———
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
			let ccVal = Math.floor(rng()*128); // equal weighted random 0-127
			let ccNo = Math.floor(rng()*2) + 15; // cc 15 or 16
			sequenceData.push({
				delay: sequenceTime + 10,  // in ms
				type: 'cc',
				cc: ccNo,
				value: ccVal
			});
			recordModCount ++;
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