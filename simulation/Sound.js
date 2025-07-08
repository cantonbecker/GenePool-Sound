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
const SOUND_EVENT_TYPE_EAT  	=  0;
const SOUND_EVENT_TYPE_BIRTH	=  1;
const SOUND_EVENT_TYPE_DEATH	=  2;
const SOUND_EVENT_TYPE_UTTER	=  3;
const NUM_SOUND_EVENT_TYPES	=  4;

const BASE_MIDI_NOTE = 48; // C3
const INTERVAL_SCALE = [0, 2, 4, 7, 9]; // pentatonic

const MIDI_CHANNEL_EAT = 0;
const MIDI_CHANNEL_BIRTH = 1;
const MIDI_CHANNEL_DEATH = 2;

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
		console.log( "sound: setGlobalParameters: " + p0 + " " + p1 + " " + p2 + " " + p3);
		
		_parameter_0 = p0;
		_parameter_1 = p1;
		_parameter_2 = p2;
		_parameter_3 = p3; // camera zoom, ranges from about 500 to 8000
		
		// use camera zoom to set global reverb mix for eating sounds (minimum 5)
		let _parameter_3_scaled = Math.max(5, Math.min(127, Math.round((_parameter_3 - 500) * 127 / (3000 - 500))));
		if (midiOutput) {
			sendCC(21, _parameter_3_scaled, MIDI_CHANNEL_EAT);
			sendCC(21, _parameter_3_scaled, MIDI_CHANNEL_BIRTH);
			sendCC(21, _parameter_3_scaled, MIDI_CHANNEL_DEATH);
			console.log( "CC 21: " + _parameter_3_scaled);
		}
	}

	//------------------------------------------------
	this.playSoundEvent = function( type, position, id )
	{
		
		let printString = "play sound: type = ";
		let midiChannel = 0; // 0-15
		let midiNote = 32;
		let midiVelocity = 127;
		let noteLength = 500;
		
		if ( type === SOUND_EVENT_TYPE_NULL ) { 
			printString += "null";
		} else if ( type === SOUND_EVENT_TYPE_EAT ) { 
			let midiChannel = MIDI_CHANNEL_EAT;
			let maxDegrees = INTERVAL_SCALE.length * 2;  // 2 octaves of our scale
			let idToDegrees = id % maxDegrees;
			let octave = Math.floor(idToDegrees / INTERVAL_SCALE.length);
			let degree = idToDegrees % INTERVAL_SCALE.length;
			let midiNote = BASE_MIDI_NOTE + (octave * 12) + INTERVAL_SCALE[degree];
			let controlValue = id % 100; // control of about 0-100
			if (midiOutput) {
				sendCC(14, controlValue, midiChannel);
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
			}
			printString += "EAT note " + midiNote + " w/CC 14 " + controlValue;
		} else if ( type === SOUND_EVENT_TYPE_BIRTH ) {
			let midiChannel = MIDI_CHANNEL_BIRTH;
			let maxDegrees = INTERVAL_SCALE.length * 3;  // 2 octaves of our scale
			let idToDegrees = id % maxDegrees;
			let octave = Math.floor(idToDegrees / INTERVAL_SCALE.length);
			let degree = idToDegrees % INTERVAL_SCALE.length;
			let midiNote = BASE_MIDI_NOTE + (octave * 12) + INTERVAL_SCALE[degree];
			printString += "BIRTH note " + midiNote;
			if (midiOutput) {
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
			}
		} else if ( type === SOUND_EVENT_TYPE_DEATH ) {
			let midiChannel = MIDI_CHANNEL_DEATH;
			let midiNote = 64;
			let noteLength = 1000;
			printString += "DEATH";
			if (midiOutput) {
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
			}
		} else if ( type === SOUND_EVENT_TYPE_UTTER ) { 
			let midiChannel = MIDI_CHANNEL_DEATH;
			let midiNote = 76 + Math.floor(Math.random() * 12) + 1;;
			let noteLength = 2000;
			printString += "UTTER";
			if (midiOutput) {
				sendNote(midiNote, midiVelocity, noteLength, midiChannel);
			}
		} // end if sound types
		 
		printString += "; position = " + position.x.toFixed(2) + ", " + position.y.toFixed(2);
		printString += "; id = " + id;
		 
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

}
