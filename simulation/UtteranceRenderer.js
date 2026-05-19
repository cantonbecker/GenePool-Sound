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

// renamed MAX_UTTERANCES to MAX_UTTERANCES_TO_RENDER and moved to Parameters.js for easier performance tweaking
// moved MAX_PARTICLES to Parameters.js for easier performance tweaking

function UtteranceRenderer()
{
	const MIN_NOTE_RANGE	= 32;
	const MAX_NOTE_RANGE	= 99;
	const MIN_LIFESPAN		= 25;
	const MAX_LIFESPAN		= 100;
	const MIN_BRIGHTNESS	= 0.2;
	const MAX_BRIGHTNESS	= 1.0;
	const GROWTH_RATE 		= 4;

	// Throttle per-note ripples so a staccato burst doesn't flood our available MAX_PARTICLES
	const MIN_CYCLES_BETWEEN_RIPPLES = 3;

	const PITCH_BRIGHTNESS_SCALAR = 12;

	function Particle()
	{	
		this.position 	= new Vector2D();
		this.width		= ZERO;
		this.height 	= ZERO;
		this.brightness = ZERO;
		this.age		= 0;
		this.lifeSpan	= 0;
		this.active		= false;
		this.pitch		= 0;
		
		//--------------------------------------------------------
		this.launch = function( position, lifespan, brightness, pitch )
		{			
			this.position.copyFrom( position );
			this.lifeSpan 	= lifespan;
			this.brightness = brightness;
			this.active 	= true;
			this.age 		= 0;
			this.pitch 		= pitch;

			//----------------------------
			// width and height
			//----------------------------
			//this.width  = 5 * this.age;
			//this.height = 5 * this.age;
		}
		
		//--------------------------------------
		this.update = function()
		{			
			this.age ++;
			
			if ( this.age >= this.lifeSpan )
			{
				this.active = false;
			}

			//----------------------------
			// width and height
			//----------------------------
			this.width = this.height = (GROWTH_RATE * this.age) * (this.pitch * 3);

		}
				
		//--------------------------------------
		this.render = function( timeFraction )
		{
			let ageFraction = this.age / this.lifeSpan;
			
			canvas.globalAlpha = this.brightness * ( ONE - ageFraction );
			canvas.globalAlpha = Math.pow( canvas.globalAlpha, 0.9 ); // lower the power to increase general brightness
				
			//----------------------------------------------------------
			// draw the ripple particle circles procedurally
			//----------------------------------------------------------
			canvas.strokeStyle = "rgb( 255, 255, 255 )";
			canvas.lineWidth = 1;				
			canvas.beginPath();

			// resolution for 'bumps' in each ripple, 1000 = smooth, 100 = rough
			let res = 500;
			
			let min = 0.3;
			
			let numBumps = Math.floor( this.pitch * 40 );
			let bumpSize = this.width * 0.08 * ( this.pitch - min );

			for (let i=0; i<res+1; i++)
			{				
				let angle 	= i/res * Math.PI * 2;
				let bumps	= ZERO;
				
				if ( this.pitch > min )
				{
					bumps = bumpSize * Math.cos( angle * numBumps );
				}
				
				let radius 	= this.width * ONE_HALF + bumps;
				let x 		= this.position.x + radius * Math.cos( angle );
				let y 		= this.position.y + radius * Math.sin( angle );
				
				if ( i === 0 )
				{
					canvas.moveTo( x, y );
				}			
				else
				{
					canvas.lineTo( x, y );
				}			
			}
				
			canvas.stroke();
			canvas.closePath();
			
			/*
			//----------------------------------------------------------
			// draw the ripple particle circles using an image
			//----------------------------------------------------------
			canvas.drawImage
			( 
				_particleImage, 
				this.position.x - this.width  * ONE_HALF, 
				this.position.y - this.height * ONE_HALF, 
				this.width, 
				this.height 
			);  
			*/
			
			canvas.globalAlpha = ONE;
		}
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
		this.pitch		 		= 0;
		this.lastRippleClock	= -MIN_CYCLES_BETWEEN_RIPPLES; // ensures the first note always passes the throttle
	}
	
	//--------------------------------
	// variables
	//--------------------------------
	let _utterances = new Array();
	let _particles  = new Array();
	let _particleCounter = 0;

	let _particleImage = new Image();

    _particleImage.src = 'images/sound-particle-big-blur.png';   

	for (let u=0; u<MAX_UTTERANCES_TO_RENDER; u++)
	{
		_utterances[u] = new Utterance();
	}

	for (let p=0; p<MAX_PARTICLES; p++)
	{
		_particles[p] = new Particle();
	}

	//----------------------------------
	this.clearAllUtterances = function()
	{
		for (let u=0; u<MAX_UTTERANCES_TO_RENDER; u++)
		{
			_utterances[u].position.clear();
			_utterances[u].id	 	= -1;
			_utterances[u].active 	= false;
			_utterances[u].duration 	= 0;
			_utterances[u].modCount 	= 0;
			_utterances[u].clock		= 0;
			_utterances[u].highNote	= 0;
			_utterances[u].lowNote	= 0;
			_utterances[u].lastRippleClock = -MIN_CYCLES_BETWEEN_RIPPLES;
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
			if ( u >= MAX_UTTERANCES_TO_RENDER - 1 )
			{
				searching = false;
			}
			else 
			{
				if ( ! _utterances[u].active )
				{
					_utterances[u].position.copyFrom( position );
					_utterances[u].id	 	= id;
					_utterances[u].active 	= true;
					_utterances[u].clock		= 0;				
					_utterances[u].duration	= duration;
					_utterances[u].highNote	= highNote;
					_utterances[u].lowNote	= lowNote;
					_utterances[u].noteCount	= noteCount;
					_utterances[u].modCount	= modCount;
					_utterances[u].lastRippleClock = -MIN_CYCLES_BETWEEN_RIPPLES;
					_utterances[u].startPosition.copyFrom( _utterances[u].position );

					searching = false;
				}
			}
						
			u ++;
		}
	}

	//---------------------------
	this.stop = function(id)
	{
		for (let u=0; u<MAX_UTTERANCES_TO_RENDER; u++)
		{
			if ( _utterances[u].id === id )
			{					
				_utterances[u].active = false;
				return;
			}
		}		
	}
	
	//----------------------------------------------
	this.updatePosition = function( id, position )
	{
		for (let u=0; u<MAX_UTTERANCES_TO_RENDER; u++)
		{
			if ( _utterances[u].id === id )
			{
				_utterances[u].position.copyFrom( position );
				return;
			}
		}
	}

	//---------------------------------------------------------------
	// emitNote() is called by Sound.js for each MIDI note as it
	// actually fires, so the ripple's pitch (and therefore its
	// bump count, size, lifespan, brightness) reflects that note
	// rather than the utterance's averaged pitch.
	//---------------------------------------------------------------
	this.emitNote = function( id, note )
	{
		for (let u=0; u<MAX_UTTERANCES_TO_RENDER; u++)
		{
			if ( _utterances[u].active && _utterances[u].id === id )
			{
				// throttle: skip if we just emitted a ripple for this swimbot
				if ( _utterances[u].clock - _utterances[u].lastRippleClock < MIN_CYCLES_BETWEEN_RIPPLES )
				{
					return;
				}

				let notePitch = ( note - MIN_NOTE_RANGE ) / ( MAX_NOTE_RANGE - MIN_NOTE_RANGE );
					 if ( notePitch < ZERO ) { notePitch = ZERO; }
				else if ( notePitch > ONE  ) { notePitch = ONE;  }

				let p = this.findInactiveParticle();
				if ( p === NULL_INDEX ) { return; }

				let lifespan = MAX_LIFESPAN - Math.floor( notePitch * 120 );
				if ( lifespan < MIN_LIFESPAN ) { lifespan = MIN_LIFESPAN; }

				let brightness = MIN_BRIGHTNESS + notePitch * notePitch * notePitch * PITCH_BRIGHTNESS_SCALAR;
				if ( brightness > MAX_BRIGHTNESS ) { brightness = MAX_BRIGHTNESS; }

				_particles[p].launch( _utterances[u].position, lifespan, brightness, notePitch );
				_utterances[u].lastRippleClock = _utterances[u].clock;
				return;
			}
		}
	}

	//---------------------------------
	this.updateAndRender = function()
	{
		for (let u=0; u<MAX_UTTERANCES_TO_RENDER; u++)
		{
			if ( _utterances[u].active )
			{
				let averageNote = ( _utterances[u].lowNote + _utterances[u].highNote ) * ONE_HALF;
				_utterances[u].pitch = ( averageNote - MIN_NOTE_RANGE ) / ( MAX_NOTE_RANGE - MIN_NOTE_RANGE );
				
					 if ( _utterances[u].pitch < ZERO ) { _utterances[u].pitch = ZERO; }
				else if ( _utterances[u].pitch > ONE  ) { _utterances[u].pitch = ONE;  }
				
				_utterances[u].clock ++;

				
				//-----------------------------------------
				// start puff
				//-----------------------------------------
				let red 	= _utterances[u].pitch;
				let green 	= _utterances[u].pitch;
				let blue 	= ONE - _utterances[u].pitch;
				let frac	= _utterances[u].clock / _utterances[u].duration;
				let alpha 	= 0.4 - frac * 0.5;

				if ( alpha < ZERO) { alpha = ZERO; } 

				red 	= Math.floor( 100 + red		* 155 );
				green 	= Math.floor( 100 + green 	* 155 );
				blue 	= Math.floor( 100 + blue 	* 155 );

				canvas.fillStyle = "rgba( " + red + ", " + green + ", " +  blue + ", " + alpha + " )";	
				
				let num = 7;
				for (let i=0; i<num; i++)
				{
					let radius = _utterances[u].clock * (i/num); 
	
					canvas.beginPath();
					canvas.arc( _utterances[u].startPosition.x, _utterances[u].startPosition.y, radius, 0, PI2, false );
					canvas.fill();
					canvas.closePath();
				}
				
				// Ripples are now launched per-MIDI-note by emitNote(),
				// which is called from Sound.js as each note actually fires.
				// future option: phenotype.range could impact ripple radius?

			}
		}
		
		//-------------------------------------------------
		// update and render particles
		//-------------------------------------------------	
		this.updateAndRenderParticles();
	}

	//---------------------------------------
	this.findInactiveParticle = function()
	{		
		for (let p=0; p<MAX_PARTICLES; p++)
		{
			if ( !_particles[p].active )
			{
				return p;
			}
		}
		
		return -1;
	}
	
	//------------------------------------------------
	this.updateAndRenderParticles = function()
	{		
		let timeFraction = this.clock / this.duration;
	
		for (let p=0; p<MAX_PARTICLES; p++)
		{
			if ( _particles[p].active )
			{
				let fraction = p / MAX_PARTICLES;
				_particles[p].update();
				_particles[p].render( timeFraction );   
			}
		}
	}	
}
