//--------------------------------------------------------------------------
//                                                                        
//    This file is part of GenePool Swimbots.                             
//    Copyright (c) 2021 by Jeffrey Ventrella - All Rights Reserved.      
//                                                                        
//    See the README file or go to swimbots.com for full license details.           
//    You may use, distribute, and modify this code only under the terms  
//    of the "Commons Clause" license (commonsclause.com).                
//                                                                        
//    This software is intended for education, game design, and research. 
//                                                                        
// -------------------------------------------------------------------------- 
"use strict";

function UtteranceRenderer()
{
	const MAX_UTTERANCES 	= 100;
	const MAX_PARTICLES		= 20;
	const UTTER_RADIUS		= 70;
	
	function Utterance()
	{	
		this.id			= -1;
		this.active		= false;
		this.position 	= new Vector2D();
		this.clock	 	= 0;
		this.duration 	= 0;
		this.modCount	= 0;
		this.noteCount	= 0;
		this.notes		= 0;
		this.highNote	= 0;
		this.lowNote	= 0;
		this.sequence	= 0;
		
		this.particles = new Array();
	}
	
	//--------------------------------
	// variables
	//--------------------------------
	let _utterance = new Array();

	for (let i=0; i<MAX_UTTERANCES; i++)
	{
		_utterance[i] = new Utterance();

		for (let p=0; p<MAX_PARTICLES; p++)
		{
			_utterance[i].particles[p] = new Vector2D();
		}
	}


	//----------------------------------
	this.clearAllUtterances = function()
	{
		for (let i=0; i<MAX_UTTERANCES; i++)
		{
			_utterance[i].position.clear();
			_utterance[i].id	 	= -1;
			_utterance[i].active 	= false;
			_utterance[i].duration 	= 0;
			_utterance[i].modCount 	= 0;
			_utterance[i].clock		= 0;				
			_utterance[i].notes		= 0;
			_utterance[i].highNote	= 0;
			_utterance[i].lowNote	= 0;
			_utterance[i].sequence	= 0;
		}
   }
   
	//--------------------------------
	this.startUtterance = function
	( 
		id,
		position, 
		duration,
		notes,
		highNote,
		lowNote,
		noteCount,
		modCount,
		sequence	
	)
	{	
		let searching = true;
		let i = 0;
		
		while ( searching )
		{
			if ( i >= MAX_UTTERANCES - 1 )
			{
				searching = false;
			}
			else 
			{
				if ( ! _utterance[i].active )
				{
					_utterance[i].position.copyFrom( position );
					_utterance[i].id	 	= id;
					_utterance[i].active 	= true;
					_utterance[i].clock		= 0;				
					_utterance[i].duration	= duration;
					_utterance[i].notes		= notes;
					_utterance[i].highNote	= highNote;
					_utterance[i].lowNote	= lowNote;
					_utterance[i].noteCount	= noteCount;
					_utterance[i].modCount	= modCount;
					_utterance[i].sequence	= sequence;

					searching = false;
				}
			}
						
			i ++;
		}
	}


	//---------------------------
	this.stop = function(id)
	{
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			//if ( _utterance[u].active )
			{
				if ( _utterance[u].id === id )
				{					
					_utterance[u].active = false;
				}
			}		
		}
	}
	
	//----------------------------------------------
	this.updatePosition = function( id, position )
	{
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			//if ( _utterance[u].active )
			{
				if ( _utterance[u].id === id )
				{
					_utterance[u].position.copyFrom( position );
				}
			}		
		}
	}
	
	//---------------------------------
	this.updateAndRender = function()
	{
		let noteRangeMin = 32;
		let noteRangeMax = 99;
		 
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			if ( _utterance[u].active )
			{
				_utterance[u].clock ++;
			
				let timeFraction = _utterance[u].clock / _utterance[u].duration;
			
				let rr = _utterance[u].clock * 3;
				
				if ( rr > UTTER_RADIUS ) { rr = UTTER_RADIUS; }
				
				
				//UTTER_RADIUS * ( 0.5 - 0.5 * Math.cos( timeFraction * Math.PI ) );
			
/*
_utterance[i].notes		= notes;
_utterance[i].highNote	= highNote;
_utterance[i].lowNote	= lowNote;
_utterance[i].noteCount	= noteCount;
_utterance[i].modCount	= modCount;
_utterance[i].sequence	= sequence;
*/


//console.log( "_utterance[u].modCount = " + _utterance[u].modCount );

				
				let red 	= ( _utterance[u].highNote - noteRangeMin ) / ( noteRangeMax - noteRangeMin );
				let green 	= _utterance[u].modCount / 255;
				let blue 	= _utterance[u].lowNote / 120;
				let alpha 	= 0.7 - timeFraction * 2;
				
				if ( alpha < 0 ) { alpha = 0; } 
				
				red 	= Math.floor( 100 + red		* 155 );
				green 	= Math.floor( 100 + green 	* 155 );
				blue 	= Math.floor( 100 + blue 	* 155 );

				if ( red 	< 0 ) { red 	= 0; } else if ( red 	> 255 ) { red 	= 255; }
				if ( green 	< 0 ) { green 	= 0; } else if ( green 	> 255 ) { green = 255; }
				if ( blue 	< 0 ) { blue 	= 0; } else if ( blue 	> 255 ) { blue 	= 255; }
				
				let num = 6;
				for (let i=0; i<num; i++)
				{
					let ra = rr * (i/num); 
					
					canvas.fillStyle = "rgba( " + red + ", " + green + ", " +  blue + ", " + alpha + " )";	
					canvas.beginPath();
					canvas.arc( _utterance[u].position.x, _utterance[u].position.y, ra, 0, PI2, false );
					canvas.fill();
					canvas.closePath();

					canvas.beginPath();
					canvas.arc( _utterance[u].position.x, _utterance[u].position.y, ra * 0.7, 0, PI2, false );
					canvas.fill();
					canvas.closePath();

					canvas.beginPath();
					canvas.arc( _utterance[u].position.x, _utterance[u].position.y, ra * 0.3, 0, PI2, false );
					canvas.fill();
					canvas.closePath();
				}
				
				let res = 20;
				let angle = 0.2 + _utterance[u].noteCount * 0.02;
					
				for (let i=0; i<res; i++)
				{
					let frac = i / res;
			
					let s = 0.5 + 0.5 * Math.sin( frac * 5 + _utterance[u].clock * _utterance[u].lowNote * 0.2 );
					let arc = frac * angle + 0.4 * s;
				
					let wobble = 0.5 + 0.5 * Math.cos( _utterance[u].clock * 3 * frac * 0.1) * 5;
		
					let radius = UTTER_RADIUS * frac + wobble;

					alpha = 0.4 + 0.4 * Math.sin( frac * 5 + _utterance[u].clock * _utterance[u].modCount * 2 );
				
					canvas.lineWidth = 1;
					canvas.strokeStyle = "rgba( " + green + ", " + blue + ", " +  red + ", " + alpha + " )";	
				
					canvas.beginPath();
					canvas.arc( _utterance[u].position.x, _utterance[u].position.y, radius, -arc, arc, false );
					canvas.stroke();

					canvas.beginPath();
					canvas.arc( _utterance[u].position.x, _utterance[u].position.y, radius, Math.PI -arc, Math.PI + arc, false );
					canvas.stroke();
				}	
				

let aa = 0.3;
let mm = 0.7;

if ( timeFraction > mm )
{
	aa = 0.3 - ( timeFraction - mm ) / ( 1.0 - mm );
}

let a1 = aa * 0.7;

let rippleRadius = UTTER_RADIUS * timeFraction;
canvas.lineWidth = 5;
canvas.strokeStyle = "rgba( 100, 150, 200, " + a1 + " )";	
canvas.beginPath();
canvas.arc( _utterance[u].position.x, _utterance[u].position.y, rippleRadius, 0, PI2, false );
canvas.stroke();
canvas.closePath();

rippleRadius = UTTER_RADIUS * 0.3 + UTTER_RADIUS * timeFraction * 0.5;
canvas.lineWidth = 3;
canvas.strokeStyle = "rgba( 100, 150, 200, " + aa + " )";	
canvas.beginPath();
canvas.arc( _utterance[u].position.x, _utterance[u].position.y, rippleRadius, 0, PI2, false );
canvas.stroke();
canvas.closePath();

				

				if ( DEBUGGING_UTTERANCE_EVENT_HORIZON ) // set in Sound.js
				{
					canvas.lineWidth = 1;
					canvas.strokeStyle = "rgba( 200, 255, 200, 0.5 )";	
					canvas.beginPath();
					canvas.arc( _utterance[u].position.x, _utterance[u].position.y, SWIMBOT_VIEW_RADIUS, 0, PI2, false );
					canvas.stroke();
					canvas.closePath();
				}	
			}
		}
	}
}




