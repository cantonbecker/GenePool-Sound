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

const BASE_MIDI_NOTE = 48; // C3
const INTERVAL_SCALE = [0, 2, 4, 7, 9]; // pentatonic

const MIDI_CHANNEL_EAT = 0;
const MIDI_CHANNEL_BIRTH = 1;
const MIDI_CHANNEL_DEATH = 2;
const MIDI_CHANNEL_UTTER = 7;
const MIDI_CHANNEL_GLOBAL = 15;

var last_utterance_time = 0;
const MIN_WAIT_BETWEEN_UTTERANCES = 500;
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
		let midiChannel = 0; // 0-15
		let midiNote = 32;
		let midiVelocity = 127;
		let noteLength = 500;
		
		if ( type === SOUND_EVENT_TYPE_NULL ) { 
			printString += "NULL ";
		} else if ( type === SOUND_EVENT_TYPE_EAT ) { 
			printString += "EAT";
			if (midiOutput && isInView) {
				let midiChannel = MIDI_CHANNEL_EAT;
				let maxDegrees = INTERVAL_SCALE.length * 2;  // 2 octaves of our scale
				let idToDegrees = id % maxDegrees;
				let octave = Math.floor(idToDegrees / INTERVAL_SCALE.length);
				let degree = idToDegrees % INTERVAL_SCALE.length;
				let midiNote = BASE_MIDI_NOTE + (octave * 12) + INTERVAL_SCALE[degree];
				let controlValue = id % 100; // control of about 0-100
				sendCC(14, controlValue, midiChannel);
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
				printString += " MIDI note " + midiNote + " w/CC 14 " + controlValue;
			}
		} else if ( type === SOUND_EVENT_TYPE_BIRTH) {
			printString += "BIRTH";
				if (midiOutput && isInView) {
				let midiChannel = MIDI_CHANNEL_BIRTH;
				let maxDegrees = INTERVAL_SCALE.length * 3;  // 2 octaves of our scale
				let idToDegrees = id % maxDegrees;
				let octave = Math.floor(idToDegrees / INTERVAL_SCALE.length);
				let degree = idToDegrees % INTERVAL_SCALE.length;
				let midiNote = BASE_MIDI_NOTE + (octave * 12) + INTERVAL_SCALE[degree];
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
			printString += composeAndPlayUtterance(id, isInView, swimbot);
		} // end if sound types
		 
		// printString += "; position = " + position.x.toFixed(2) + ", " + position.y.toFixed(2);
		 
		console.log( printString );

    }

	//------------------------------------------------
	function sendNote(noteNumber, velocity, durationMs, midiChannel) {
		const noteOn = 0x90 | midiChannel;
		const noteOff = 0x80 | midiChannel;
		midiOutput.send([noteOn, noteNumber, velocity]);
		setTimeout(() => {
			midiOutput.send([noteOff, noteNumber, 0]);
		}, durationMs);
	}
	
	function sendCC(controllerNumber, value, midiChannel) {
		const cc = 0xB0 | midiChannel;
		midiOutput.send([cc, controllerNumber, value]);
	}

	function composeAndPlayUtterance(id, isInView, swimbot) {
		const midiChannel = MIDI_CHANNEL_UTTER;  // or derive dynamically
		const baseNote = BASE_MIDI_NOTE + 12 + (( id % 3 ) * 12);   // starting point
		const baseMod = (id % 64);   // starting point
		const accentMod = (id % 63);
		const velocity = 90 + (id % 35);
		const noteDuration = 50 + ((id % 3) * 25);
		const tempoModifier = .5 + ((id % 4 ) * .5);
		const startTime = Date.now();
		const maxDegrees = INTERVAL_SCALE.length * 3;
		const idToDegrees = id % maxDegrees;
		const octave = Math.floor(idToDegrees / INTERVAL_SCALE.length);
		const degree = idToDegrees % INTERVAL_SCALE.length;
		const specialMidiNote = BASE_MIDI_NOTE + (octave * 12) + INTERVAL_SCALE[degree];
	
		let playAudio = false; // special conditions have to be met for us to actually play sound
		if (Date.now() - last_utterance_time > MIN_WAIT_BETWEEN_UTTERANCES && midiOutput && isInView) {
			last_utterance_time = Date.now();
			playAudio = true;
			console.log ('*** Beginning MIDI utterance for swimbot ' + id + ' ***');
		}
	
		// static melody & CC sequence
		const midiSequence = [
			{ delay: 0,    type: 'note', note: baseNote + 0, velocity, duration: noteDuration * 2 },
			{ delay: 50 * tempoModifier,  type: 'cc',   cc: 1, value: baseMod },
			{ delay: 100 * tempoModifier,  type: 'note', note: specialMidiNote - 2, velocity, duration: noteDuration },
			{ delay: 150 * tempoModifier,  type: 'cc',   cc: 1, value: baseMod + accentMod },
			{ delay: 200 * tempoModifier,  type: 'note', note: specialMidiNote, velocity, duration: noteDuration },
			{ delay: 500 * tempoModifier, type: 'note', note: baseNote + 2, velocity, duration: noteDuration },
			{ delay: 550 * tempoModifier, type: 'cc',   cc: 1, value: baseMod },
			{ delay: 600 * tempoModifier, type: 'note', note: baseNote + 9, velocity, duration: noteDuration * 4 },
			{ delay: 800 * tempoModifier, type: 'done' }
		];
	
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
			return (' MIDI sequence on channel ' + midiChannel);
		} else {
			return (' (Silent)');
		}
	} // end function composeAndPlayUtterance()

}
