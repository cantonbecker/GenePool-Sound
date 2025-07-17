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

const SOUND_UPDATE_PERIOD =  30; 	// every this many _clock iterations, update global audio parameters (like overall reverb/zoom level)
var APPROX_MS_PER_CLOCK = 20; 		// used to scale utterDuration to absolute time. if the simulation speed changes, we might adjust this.

const SOUND_EVENT_TYPE_NULL	= -1
const SOUND_EVENT_TYPE_EAT  	=  1;
const SOUND_EVENT_TYPE_BIRTH	=  2;
const SOUND_EVENT_TYPE_DEATH	=  3;

// Define your MIDI channels as 1-16 (not zero indexed)
const MIDI_BASE_NOTE = 48; // C3
const MIDI_CHANNEL_EAT = 1;
const MIDI_CHANNEL_BIRTH = 2;
const MIDI_CHANNEL_DEATH = 3;

const MIDI_CHANNEL_UTTER_START = 8; // first MIDI channel to round robin through
const MIDI_CHANNEL_UTTER_END = 12; // last MIDI channel to round robin through
var MIDI_CHANNEL_UTTER_LAST = 0; // remembers which channel we last used

const MIDI_CHANNEL_GLOBAL = 16;
const MIN_WAIT_BETWEEN_MIDI_UTTERANCES = 3000 / (MIDI_CHANNEL_UTTER_END - MIDI_CHANNEL_UTTER_START);

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
// const MIDI_NOTE_INTERVALS = [-10, -8, -5, -3, 0, +2, +4, +7, +9];

// Minor pentatonic
const MIDI_NOTE_INTERVALS = [-9, -7, -5, -2, 0, +3, +5, +7, +10];

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

// bell-curveish around the middle note
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


var LAST_UTTERANCE_TIME = 0;
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

	//------------------------------------------------------------------------------------------------------
	// doSwimbotSoundEvent is used for non-diegetic sounds, e.g. eating, being born, dying
	this.doSwimbotSoundEvent = function( type, swimbotPosition, swimbotID )
	{
		let printString = "doSwimbotSoundEvent() type=";
		
		if ( type === SOUND_EVENT_TYPE_EAT ) {
			printString += 'EAT';
			if (midiOutput) {
				let midiChannel = MIDI_CHANNEL_EAT;
				let midiNote = Math.floor(Math.random() * (12)) + MIDI_BASE_NOTE; // note in a one octave range
				let controlValue = Math.floor(Math.random() * (40)) + 50; // control of about 50-90
				sendCC(14, controlValue, midiChannel);
				sendNote(midiNote, 127, 100, midiChannel);
				printString += " sent MIDI note " + midiNote + " w/CC 14 " + controlValue;
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH) {
			printString += 'BIRTH';
			if (midiOutput) {
				let midiChannel = MIDI_CHANNEL_BIRTH;
				let maxDegrees = MIDI_NOTE_INTERVALS.length * 3;  // 2 octaves of our scale
				let idToDegrees = swimbotID % maxDegrees;
				let degree = idToDegrees % MIDI_NOTE_INTERVALS.length;
				let octave = Math.floor(idToDegrees / MIDI_NOTE_INTERVALS.length);
				let midiNote = MIDI_BASE_NOTE + (octave * 12) + MIDI_NOTE_INTERVALS[degree];
				sendNote(midiNote, 127, 1000, midiChannel);
				printString += " sent MIDI note " + midiNote;
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH) {
			printString += 'DEATH';
			if (midiOutput) {
				let midiChannel = MIDI_CHANNEL_DEATH;
				let maxDegrees = MIDI_NOTE_INTERVALS.length * 3;  // 2 octaves of our scale
				let idToDegrees = swimbotID % maxDegrees;
				let degree = idToDegrees % MIDI_NOTE_INTERVALS.length;
				let octave = Math.floor(idToDegrees / MIDI_NOTE_INTERVALS.length);
				let midiNote = MIDI_BASE_NOTE + (octave * 12) + MIDI_NOTE_INTERVALS[degree];
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
		var midiChannel;
		// special conditions have to be met for us to actually play sound
		let playAudio = false;
		if (Date.now() - LAST_UTTERANCE_TIME > MIN_WAIT_BETWEEN_MIDI_UTTERANCES && midiOutput && utterVariablesObj.swimbotInView) {
			playAudio = true;
			LAST_UTTERANCE_TIME = Date.now();
			// pick a MIDI channel to utter on (round robin through the MIDI channels we've set up for uttering)
			MIDI_CHANNEL_UTTER_LAST +=1;
			if (MIDI_CHANNEL_UTTER_LAST > MIDI_CHANNEL_UTTER_END || MIDI_CHANNEL_UTTER_LAST < MIDI_CHANNEL_UTTER_START) {
				MIDI_CHANNEL_UTTER_LAST = MIDI_CHANNEL_UTTER_START;
			}
			midiChannel = MIDI_CHANNEL_UTTER_LAST;
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




function generateUtterancePhenotypes(_normalizedGenes, _geneNames, utterDuration, utterPeriod) {
	console.log('_geneNames', _geneNames);
  const rng = aleaPRNG(_normalizedGenes.toString()); // initialize the random number generator with the entire genetic sequence
  const utterSequenceLength = utterDuration * APPROX_MS_PER_CLOCK; // range of 5-100 = 150ms-3000ms

  let sequenceTime = 0; // keep track of our timeline for composing (in ms)

  const sequenceData = [];
  // sequenceData will hold our generated sequence, something like this:
  /* 
      [
          { delay: 0, type: 'note', note: 44, velocity: 127, duration: 1000 },
          { delay: 500, type: 'cc', cc: 1, value: 96 },
          { delay: 1000, type: 'done' }
      ];
  */

  // these vars will keep a record of the phenotypical attributes of our new MIDI sequence
  let recordNotesUsed = [], recordHighNote = 0, recordLowNote = 127, recordNoteCount = 0, recordModCount = 0;

  // is our swimbot a baritone or a soprano?
  let octaveNoteShift = 32 + (12 * (Math.floor(rng() * 3)));  // octaves above the MIDI base note

  // how much mod wheel wiggling should there be between notes? (Increase the exponent to further weigh towards zero)
  let chanceOfModulation = rng() ** 4;

  // Markov Chain time! Pick initial Interval State (note)
  let lastInt = Math.floor(rng() * MIDI_NOTE_INTERVALS.length); // pick starting interval

  // Now pick the initial Inter-Onset Interval (duration)
  let lastIOI = Math.floor(rng() * SEQUENCE_DURATION_STATES.length); // might be short, medium, or long initial note
  if (utterSequenceLength < 750) lastIOI = 0; // override for short utterances. they should ALWAYS start with a short note (zero index to Interval State)
  

  // program synth (CC 18) with a random value
  sequenceTime += 10; // add 10ms
  sequenceData.push({
      delay: sequenceTime,
      type: 'cc',
      cc: 18,
      value: Math.floor(rng() * 127) // 0-127, equal weight
  });
  
  
  // program synth (CC 19) with a random value
  sequenceTime += 10; // add 10ms
  sequenceData.push({
      delay: sequenceTime,
      type: 'cc',
      cc: 19,
      value: 20 + Math.floor((rng() ** 2) * 64) // 0-64, weighed towards lower end
  });

  // program synth (CC 20) with a random value
  sequenceTime += 10; // add 10ms
  sequenceData.push({
      delay: sequenceTime,
      type: 'cc',
      cc: 20,
      value: Math.floor((rng() ** 2) * 64) // 0-64, weighed towards lower end
  });
  
  // initialize mod CC (1) with a random value
  sequenceTime += 10; // add 10ms
  sequenceData.push({
      delay: sequenceTime,
      type: 'cc',
      cc: 1,
      value: Math.floor((rng() ** 3) * 128) // 0-127, weighed towards lower end
  });
  
  sequenceTime += 10; // wait 10ms before composing main utterance
  while (sequenceTime < utterSequenceLength) {
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
      const thisNoteDuration = Math.max( Math.round(interOnsetIntervalMs * (1 + rng() * 1)), 50 );
  
      // ——— pick next interval state ———
      p = rng(); cumulativeProb = 0; let nextIntState;
      for (let i = 0; i < MIDI_NOTE_INTERVALS.length; i++) {
          cumulativeProb += IOI_MIDI_NOTE_PROBABILITY_MATRIX[lastInt][i];
          if (p < cumulativeProb) { nextIntState = i; break; }
      }
      if (nextIntState === undefined) nextIntState = MIDI_NOTE_INTERVALS.length - 1;
      const thisNoteShift = MIDI_NOTE_INTERVALS[nextIntState];
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
          let modVal = Math.floor(rng()*128); // equal weighted random 0-127
          sequenceData.push({
              delay: sequenceTime + 10,  // in ms
              type: 'cc',
              cc: 1,
              value: modVal
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

  let recordNoteSpan = recordNotesUsed.length;
  
  // return our object of phenotypes
  let utterancePhenotypeObj = { sequenceData, recordNoteSpan, recordHighNote, recordLowNote, recordNoteCount, recordModCount};
  return (utterancePhenotypeObj);
}