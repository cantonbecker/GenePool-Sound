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

const SOUND_UPDATE_PERIOD =  30; // frame counter (not clock time)

const SOUND_EVENT_TYPE_NULL	= -1
const SOUND_EVENT_TYPE_EAT  	=  1;
const SOUND_EVENT_TYPE_BIRTH	=  2;
const SOUND_EVENT_TYPE_DEATH	=  3;
const SOUND_EVENT_TYPE_UTTER	=  4;

// Define your MIDI channels as 1-16 (not zero indexed)
const BASE_MIDI_NOTE = 48; // C3
const MIDI_CHANNEL_EAT = 1;
const MIDI_CHANNEL_BIRTH = 2;
const MIDI_CHANNEL_DEATH = 3;
// we will round robin through the utter midi channels
const MIDI_CHANNEL_UTTER_START = 8;
const MIDI_CHANNEL_UTTER_END = 9;
var midi_channel_utter_last = null;

const MIDI_CHANNEL_GLOBAL = 16;
const MIN_WAIT_BETWEEN_MIDI_UTTERANCES = 2000;

/* Markov Chain Inter-onset Interval States:
	When we randomly choose a short/medium/long note, it will randomly choose from these ranges/bands.
*/
const SEQUENCE_DURATION_STATES = [
  { name: 'short',  min: 30,  max: 60 },   // short notes will range from 30 to 60 ms
  { name: 'medium', min: 100, max: 250 },
  { name: 'long',   min: 300, max: 500 }
];


/*	3 x 3 probability matrix of how likely it is we will transition from one state to another.
	Each set of numbers needs to add up to 1 (100%).
*/
const IOI_DURATION_PROBABILITY_MATRIX = [
  [0.8, 0.1, 0.1],  // currently short? chances of staying short | switching medium | switching long 
  [0.6, 0.2,  0.2 ],  // currently medium? chances of switching short | staying medium | switching long
  [0.1, 0.6,  0.3 ]	// currently long? chances of switching short | switching medium | staying long
];
// Pentatonic
const MIDI_NOTE_INTERVALS = [-10, -8, -5, -3, 0, +2, +4, +7, +9];

// Minor pentatonic
// const MIDI_NOTE_INTERVALS = [-9, -7, -5, -2, 0, +3, +5, +7, +10];

// Whole-tone
// const MIDI_NOTE_INTERVALS = [-10, -8, -6, -4, 0, +2, +4, +6, +8];

// Chromatic cluster
// const MIDI_NOTE_INTERVALS = [-4, -3, -2, -1, 0, +1, +2, +3, +4];


// 9 x 9 probability matrix which roughly favor small steps, with a chance to repeat (trill) or leap
// each set of numbers needs to add up to 1
/*
const IOI_MIDI_NOTE_PROBABILITY_MATRIX = [
  [0.10, 0.15, 0.20, 0.25, 0.10, 0.10, 0.05, 0.03, 0.02],
  [0.05, 0.10, 0.20, 0.30, 0.10, 0.10, 0.10, 0.03, 0.02],
  [0.04, 0.10, 0.20, 0.30, 0.20, 0.10, 0.03, 0.02, 0.01],
  [0.03, 0.07, 0.10, 0.30, 0.30, 0.10, 0.05, 0.03, 0.02],
  [0.02, 0.05, 0.10, 0.30, 0.30, 0.10, 0.10, 0.02, 0.01], // middle interval
  [0.02, 0.03, 0.05, 0.10, 0.30, 0.30, 0.10, 0.07, 0.03],
  [0.01, 0.02, 0.03, 0.10, 0.20, 0.30, 0.20, 0.10, 0.04],
  [0.02, 0.03, 0.05, 0.10, 0.10, 0.10, 0.20, 0.30, 0.10],
  [0.02, 0.05, 0.10, 0.20, 0.20, 0.15, 0.10, 0.10, 0.08]
];
*/

const IOI_MIDI_NOTE_PROBABILITY_MATRIX = [
  /* from -5 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from -3 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from -2 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from -1 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from  0 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from +1 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from +2 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from +3 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02],
  /* from +5 */ [0.02, 0.04, 0.08, 0.16, 0.40, 0.16, 0.08, 0.04, 0.02]
];

var last_utterance_time = 0;
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
		
		// use camera zoom to set global reverb mix for eating sounds (minimum 5)
		let _parameter_3_scaled = Math.max(5, Math.min(127, Math.round((_parameter_3 - 500) * 127 / (3000 - 500))));
		if (midiOutput) {
			sendCC(21, _parameter_3_scaled, MIDI_CHANNEL_GLOBAL);
			// console.log( "Global CC 21: " + _parameter_3_scaled);
		}
	}

	//------------------------------------------------
	this.considerSoundEvent = function( type, swimbot, isInView )
	{
		let position = swimbot.getPosition();
		let id = swimbot.getIndex();
		let printString = "considerSoundEvent() for swimbot no. " + id;
		if (type) {
			printString += " type = ";
		} else {
			printString += " (no type???)";
		}
		let midiChannel = 1; // 1-16
		let midiNote = 32;
		let midiVelocity = 127;
		let noteLength = 500;
		
		if ( type === SOUND_EVENT_TYPE_NULL ) { 
			printString += "NULL ";
		} else if ( type === SOUND_EVENT_TYPE_EAT ) { 
			printString += "EAT";
			if (midiOutput && isInView) {
				let midiChannel = MIDI_CHANNEL_EAT;
				let maxDegrees = MIDI_NOTE_INTERVALS.length * 2;  // 2 octaves of our scale
				let idToDegrees = id % maxDegrees;
				let octave = Math.floor(idToDegrees / MIDI_NOTE_INTERVALS.length);
				let degree = idToDegrees % MIDI_NOTE_INTERVALS.length;
				let midiNote = BASE_MIDI_NOTE + (octave * 12) + MIDI_NOTE_INTERVALS[degree];
				let controlValue = id % 100; // control of about 0-100
				sendCC(14, controlValue, midiChannel);
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
				printString += " MIDI note " + midiNote + " w/CC 14 " + controlValue;
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH) {
			printString += "BIRTH";
				if (midiOutput && isInView) {
				let midiChannel = MIDI_CHANNEL_BIRTH;
				let maxDegrees = MIDI_NOTE_INTERVALS.length * 3;  // 2 octaves of our scale
				let idToDegrees = id % maxDegrees;
				let octave = Math.floor(idToDegrees / MIDI_NOTE_INTERVALS.length);
				let degree = idToDegrees % MIDI_NOTE_INTERVALS.length;
				let midiNote = BASE_MIDI_NOTE + (octave * 12) + MIDI_NOTE_INTERVALS[degree];
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
				printString += " MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH) {
			printString += "DEATH";
			if (midiOutput && isInView) {
				let midiChannel = MIDI_CHANNEL_DEATH;
				let midiNote = 64;
				let noteLength = 1000;
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
				printString += " MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_UTTER) {
			printString += "UTTER";
			printString += doUtterance(id, isInView, swimbot);
		} // end if sound types
		 
		// printString += "; position = " + position.x.toFixed(2) + ", " + position.y.toFixed(2);
		 
		console.log( printString );

    }

	function doUtterance(id, isInView, swimbot) {
		var midiChannel;
		const utterLengths = [500, 1000, 1500, 4000];
		const thisLength = utterLengths[Math.floor(Math.random() * utterLengths.length)];

		let playAudio = false; // special conditions have to be met for us to actually play sound
		let midiSequence;
		if (Date.now() - last_utterance_time > MIN_WAIT_BETWEEN_MIDI_UTTERANCES && midiOutput && isInView) {
			last_utterance_time = Date.now();
			playAudio = true;
			// round robin through the MIDI channels we've set up for uttering
			midi_channel_utter_last +=1;
			if (midi_channel_utter_last > MIDI_CHANNEL_UTTER_END || midi_channel_utter_last < MIDI_CHANNEL_UTTER_START) {
				midi_channel_utter_last = MIDI_CHANNEL_UTTER_START;
			}
			midiChannel = midi_channel_utter_last;
			console.log ('*** Beginning MIDI utterance for swimbot ' + id + ' ***');
			// midiSequence = generateUtteranceSequence(id, thisLength);
			midiSequence = generateUtteranceSequence(id % 10, thisLength); // test only a few variations
			console.log(midiSequence);
		} else {
			midiSequence = [
				{ delay: thisLength, type: 'done' }
			];
		}
		
		// schedule each step
		for (const step of midiSequence) {		
			setTimeout(() => {
				if (step.type === 'note') {
					if (playAudio) sendNote(step.note, step.velocity, step.duration, midiChannel);
				} else if (step.type === 'cc') {
					if (playAudio) sendCC(step.cc, step.value, midiChannel);
				} else if (step.type === 'done') {
					swimbot.setDoneUttering(); // always do this, regardless of MIDI status or whether we're in view
					// console.log('setDoneUttering for swimbot ' + id);
					if (playAudio) console.log ('*** Ended MIDI utterance for swimbot ' + id + ' ***');
	
				}
			}, step.delay);
		} // end for each step
		if (playAudio) {
			return (' MIDI sequence on channel ' + midiChannel + ' length ' + thisLength);
		} else {
			return (' Silent length ' + thisLength);
		}
	} // end function doUtterance()
		
	/**
	* @param {number} id         – deterministic seed
	* @param {number} durationMs – total length in ms
	* @returns {Array}           – [{delay, note, velocity, duration}, …, {delay, type:'done'}]
	*/

	/* returns an sequence like:
		[
			{ delay: 0, type: 'note', note: 44, velocity: 127, duration: 1000 },
			{ delay: 500, type: 'cc', cc: 1, value: 96 },
			{ delay: 1000, type: 'done' }
		];
	*/
		
	function generateUtteranceSequence(id, durationMs) {
		// create a deterministic RNG seeded by id and durationMs
		const rng = aleaPRNG(id.toString());
		
		// pick initial IOI‐state and interval‐state “randomly” but reproducibly
		let lastIOI = Math.floor(rng() * SEQUENCE_DURATION_STATES.length); // might be short, medium, or long initial note
		if (durationMs < 750) lastIOI = 0; // but if utterance is short, always start with a short note
		let lastInt = Math.floor(rng() * MIDI_NOTE_INTERVALS.length); // pick starting interval

		// how likely are we to fool around with the mod wheel between notes? (Increase the exponent to further weigh towards zero)
		let chanceOfModulation = rng() ** 3;
		// sequenceData will hold our generated sequence
		const sequenceData = [];
		// initialize mod CC with a random value at time 0
		
		let initialModVal = Math.floor((rng() ** 3) * 128); // 0-127, weighed towards lower end

		sequenceData.push({
			delay: 0,  // in ms
			type: 'cc',
			cc: 1,
			value: initialModVal
		});

		let sequenceTime = 10; // first note to happen 10ms after we set the initial mod CC
		while (sequenceTime < durationMs) {
			// pick next inter-onset interval
			let p = rng(), cumulativeProb = 0, nextIOI;
			for (let i = 0; i < SEQUENCE_DURATION_STATES.length; i++) {
				cumulativeProb += IOI_DURATION_PROBABILITY_MATRIX[lastIOI][i];
				if (p < cumulativeProb) { nextIOI = i; break; }
			}
			// fallback if rounding/FP left nextIOI undefined
			if (nextIOI === undefined) nextIOI = SEQUENCE_DURATION_STATES.length - 1;
		
			const band = SEQUENCE_DURATION_STATES[nextIOI];
			const interOnsetIntervalMs = band.min + Math.round(rng() * (band.max - band.min));
		
			// stretch durations to 100–200% of the gap, with a floor of 50ms
			const noteDur = Math.max( Math.round(interOnsetIntervalMs * (1 + rng() * 1)), 50 );
		
			// ——— pick next interval state ———
			p = rng(); cumulativeProb = 0; let nextIntState;
			for (let i = 0; i < MIDI_NOTE_INTERVALS.length; i++) {
				cumulativeProb += IOI_MIDI_NOTE_PROBABILITY_MATRIX[lastInt][i];
				if (p < cumulativeProb) { nextIntState = i; break; }
			}
			if (nextIntState === undefined) nextIntState = MIDI_NOTE_INTERVALS.length - 1;
			const semis = MIDI_NOTE_INTERVALS[nextIntState];
		
			// ——— emit note event ———
			sequenceData.push({
				delay:    sequenceTime,  // in ms
				type:     'note',
				note:     BASE_MIDI_NOTE + 24 + semis + (12 * (id % 3)),
				velocity: 80 + Math.round(rng() * 40),
				duration: noteDur
			});
			
			// push in random mod expressions
			if (rng() < chanceOfModulation) {
				let modVal = Math.floor(rng()*128); // equal weighted random 0-127
				sequenceData.push({
					delay: sequenceTime + 10,  // in ms
					type: 'cc',
					cc: 1,
					value: modVal
				});
			}
		
			// advance time & states
			sequenceTime += interOnsetIntervalMs;
			lastIOI = nextIOI;
			lastInt = nextIntState;
		}
		
		// final done event
		sequenceData.push({ delay: sequenceTime, type: 'done' });
		return sequenceData;
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



	// console.log (generateUtteranceSequence(44, 5000));

}
