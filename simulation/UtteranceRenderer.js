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
	const MAX_PARTICLES		= 30;
	const MAX_NOTE_COUNT	= 20;
	const MIN_NOTE_RANGE	= 32;
	const MAX_NOTE_RANGE	= 99;

	function Particle()
	{	
		this.position 	= new Vector2D();
		this.width		= ZERO;
		this.height 	= ZERO;
		this.age		= 0;
	}
		 
	function Utterance()
	{	
		this.id					= -1;
		this.active				= false;
		this.position 			= new Vector2D();
		this.startPosition 		= new Vector2D();
		this.clock	 			= 0;
		this.duration 			= 0;
		this.modCount			= 0;
		this.noteCount			= 0;
		this.highNote			= 0;
		this.lowNote			= 0;
		this.numParticles 		= 0;
		this.particleCounter	= 0;
		this.particles 	  		= new Array();
	}
	
	//--------------------------------
	// variables
	//--------------------------------
	let _utterance = new Array();
	let _particleImage = new Image();

    _particleImage.src = 'images/sound-particle.png';   

	for (let u=0; u<MAX_UTTERANCES; u++)
	{
		_utterance[u] = new Utterance();

		for (let p=0; p<MAX_PARTICLES; p++)
		{
			_utterance[u].particles[p] = new Particle();
		}
	}

	//----------------------------------
	this.clearAllUtterances = function()
	{
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			_utterance[u].position.clear();
			_utterance[u].id	 	= -1;
			_utterance[u].active 	= false;
			_utterance[u].duration 	= 0;
			_utterance[u].modCount 	= 0;
			_utterance[u].clock		= 0;				
			_utterance[u].highNote	= 0;
			_utterance[u].lowNote	= 0;
		}
	}
   
	//--------------------------------
	this.startUtterance = function
	( 
		id,
		position, 
		duration,
		highNote,
		lowNote,
		noteCount,
		modCount,
	)
	{	
		let searching = true;
		let u = 0;
		
		while ( searching )
		{
			if ( u >= MAX_UTTERANCES - 1 )
			{
				searching = false;
			}
			else 
			{
				if ( ! _utterance[u].active )
				{
					_utterance[u].position.copyFrom( position );
					_utterance[u].id	 	= id;
					_utterance[u].active 	= true;
					_utterance[u].clock		= 0;				
					_utterance[u].duration	= duration;
					_utterance[u].highNote	= highNote;
					_utterance[u].lowNote	= lowNote;
					_utterance[u].noteCount	= noteCount;
					_utterance[u].modCount	= modCount;
					_utterance[u].startPosition.copyFrom( _utterance[u].position );
					
					//------------------------------					
					// prepare particles				
					//------------------------------
					_utterance[u].numParticles = _utterance[u].noteCount;
					_utterance[u].particleCounter = 0;
					
					if ( _utterance[u].numParticles > MAX_PARTICLES )
					{
						_utterance[u].numParticles = MAX_PARTICLES;
					}
					
					for (let p=0; p<_utterance[u].numParticles; p++)
					{
						_utterance[u].particles[p].position.copyFrom( _utterance[u].position );
						_utterance[u].particles[p].width  = ZERO;
						_utterance[u].particles[p].height = ZERO;
						_utterance[u].particles[p].age 	  = 0;
					}

					searching = false;
				}
			}
						
			u ++;
		}
	}

	//---------------------------
	this.stop = function(id)
	{
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			if ( _utterance[u].id === id )
			{					
				_utterance[u].active = false;
				return;
			}
		}		
	}
	
	//----------------------------------------------
	this.updatePosition = function( id, position )
	{
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			if ( _utterance[u].id === id )
			{
				_utterance[u].position.copyFrom( position );
				return;
			}
		}		
	}
	
	//---------------------------------
	this.updateAndRender = function()
	{
		for (let u=0; u<MAX_UTTERANCES; u++)
		{
			if ( _utterance[u].active )
			{
				let averageNote = ( _utterance[u].lowNote + _utterance[u].highNote ) * ONE_HALF;
				let pitch = ( averageNote - MIN_NOTE_RANGE ) / ( MAX_NOTE_RANGE - MIN_NOTE_RANGE );
				
					 if ( pitch < ZERO ) { pitch = ZERO; }
				else if ( pitch > ONE  ) { pitch = ONE;  }
				
				_utterance[u].clock ++;
			
				let timeFraction = _utterance[u].clock / _utterance[u].duration;

				//-----------------------------------------------------------------
				// colored start puff
				//-----------------------------------------------------------------
				let red 	= pitch;
				let green 	= pitch;
				let blue 	= 1 - pitch;
				let alpha 	= 0.2 - timeFraction * 0.2;
				
				if ( alpha < 0 ) { alpha = 0; } 
				
				red 	= Math.floor( 50 + red		* 200 );
				green 	= Math.floor( 50 + green 	* 200 );
				blue 	= Math.floor( 50 + blue 	* 200 );

				if ( red 	< 0 ) { red 	= 0; } else if ( red 	> 255 ) { red 	= 255; }
				if ( green 	< 0 ) { green 	= 0; } else if ( green 	> 255 ) { green = 255; }
				if ( blue 	< 0 ) { blue 	= 0; } else if ( blue 	> 255 ) { blue 	= 255; }

				canvas.fillStyle = "rgba( " + red + ", " + green + ", " +  blue + ", " + alpha + " )";	
								
				let num = 10;
				for (let i=0; i<num; i++)
				{
					let ra = _utterance[u].clock * 1 * (i/num); 
					
					canvas.beginPath();
					canvas.arc( _utterance[u].startPosition.x, _utterance[u].startPosition.y, ra, 0, PI2, false );
					canvas.fill();
					canvas.closePath();
				}				
				
				//-------------------------------------------------
				// periodically launch particles
				//-------------------------------------------------			
				//if ( _utterance[u].clock % 0 === 0 )
				{
					_utterance[u].particleCounter ++;
					if ( _utterance[u].particleCounter > _utterance[u].numParticles )
					{
						_utterance[u].particleCounter = 0;
					}
	
					_utterance[u].particles[ _utterance[u].particleCounter ].position.copyFrom( _utterance[u].position );
					_utterance[u].particles[ _utterance[u].particleCounter ].age = 0;
				}				
				
				//-------------------------------------------------
				// particles
				//-------------------------------------------------			
				for (let p=0; p<_utterance[u].numParticles; p++)
				{
					let fraction = p / _utterance[u].numParticles;
					
					_utterance[u].particles[p].age ++;

					//--------------------------------------------------------
					// width and height
					//--------------------------------------------------------
					let scaleScale = 0.3 + _utterance[u].particles[p].age * 0.007;
					
					scaleScale * ( ONE - pitch );
					
					_utterance[u].particles[p].width  = 200 * fraction * scaleScale;
					_utterance[u].particles[p].height = 170 * fraction * scaleScale;

					_utterance[u].particles[p].width  +=  5.0 * Math.sin( _utterance[u].particles[p].age * 0.5 + fraction * 10 );
					_utterance[u].particles[p].height +=  5.0 * Math.cos( _utterance[u].particles[p].age * 0.8  );


					//--------------------------------------------------------
					// alpha
					//--------------------------------------------------------
					canvas.globalAlpha = ONE;
					let y = 0.8;
					if ( timeFraction > y )
					{
						canvas.globalAlpha -= ( timeFraction - y ) / ( ONE - y );
					}
					
					canvas.globalAlpha *= 0.4;
					

					canvas.drawImage
					( 
						_particleImage, 
						_utterance[u].particles[p].position.x - _utterance[u].particles[p].width  * ONE_HALF, 
						_utterance[u].particles[p].position.y - _utterance[u].particles[p].height * ONE_HALF, 
						_utterance[u].particles[p].width, 
						_utterance[u].particles[p].height 
					);                     
				}

				// make sure to set this back! 
				canvas.globalAlpha = ONE;

				//-----------------------------------------------------------------
				// view horizon debug
				//-----------------------------------------------------------------
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




