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


//------------------------------------------
function Camera()
{
	const FRICTION   			=  8.0;
	const BUTTON_FORCE          =  0.3;
	const DRAG_FORCE            =  0.03;
    const PAN_OVERSHOOT_PUSH 	=  0.7;
    const SCALE_OVERSHOOT_PUSH	=  0.7;
    const MINIMUM_SCALE 		=  500.0;
    
	function ScaleShift()
	{
		this.active		= false;
		this.clock		= 0;
		this.duration 	= ZERO;
		this.startScale = ZERO;
		this.endScale 	= ZERO;
    }    
    
	function PositionShift()
	{
		this.active			= false;
		this.clock			= 0;
		this.duration 		= ZERO;
		this.startPosition 	= new Vector2D();
		this.endPosition 	= new Vector2D();
    }    
    
	//------------------------------------------
	// members
	//------------------------------------------
	let _position  		    = new Vector2D();
	let _velocity  		    = new Vector2D();
	let _vectorUtility      = new Vector2D();
	let _positionShift		= new PositionShift();
	let _scaleShift			= new ScaleShift();
	let _scaleDelta 	    = ZERO;
	let _scale      	    = ONE;
	let _previousScale      = ONE;  // used by isZooming() to detect per-frame scale changes
    let _aspectRatio        = ONE;
	let _left	    	    = ZERO;
	let _right	    	    = ZERO;
	let _top	    	    = ZERO;
	let _bottom	    	    = ZERO;
	let _seconds		    = ZERO;
	let _secondsDelta	    = ZERO;
	
	//--------------------------------
	this.update = function( seconds )
	{
        //-------------------------------------------
        // Snapshot scale before any changes this frame. This is compared
        // against _scale at the end of the frame by isZooming() to detect
        // whether the camera zoomed during this update tick. We capture it
        // here at the top so that all zoom sources are caught: user scroll,
        // button/drag input, programmatic doScaleShift(), and view tracking.
        //-------------------------------------------
        _previousScale = _scale;

        //-------------------------------------------
        // friction
        //-------------------------------------------
        let f = ONE - FRICTION  * _secondsDelta;

        if ( f < ZERO )
        {
            _velocity.clear();
            _scaleDelta = ZERO;				
        }
        else if ( f < ONE )
        {
            _velocity.scale(f);
            _scaleDelta *= (f);
        }

        //-----------------------------
        // update position and scale
        //-----------------------------
        _position.add( _velocity );
        _scale += _scaleDelta;

        //----------------------
        // calculate frame
        //----------------------
        calculateFrame();

        //----------------------
        // apply constraints
        //----------------------
        applyConstraints();
        
        //----------------------------
        // position shift
        //-----------------------------
		if ( _positionShift.active )
		{
			_positionShift.clock ++;									
			if ( _positionShift.clock > _positionShift.duration )
			{
				_positionShift.active = false;
			}
			else
			{			
				let fraction = ONE_HALF - ONE_HALF * Math.cos( ( _positionShift.clock / _positionShift.duration ) * Math.PI );
				_velocity.setToDifference( _positionShift.endPosition, _position );
				_velocity.scale( fraction * 0.1 );
			}
		}        

        //--------------------------
        // scale shift
        //--------------------------
		if ( _scaleShift.active )
		{
			_scaleShift.clock ++;				
			if ( _scaleShift.clock > _scaleShift.duration )
			{
				_scaleShift.active = false;
			}
			else
			{
				let fraction = ONE_HALF - ONE_HALF * Math.cos( _scaleShift.clock / _scaleShift.duration * Math.PI );
				_scale = Math.round(_scaleShift.startScale + ( _scaleShift.endScale - _scaleShift.startScale ) * fraction);
			}
			// console.log(`Shift clock @ ${_scaleShift.clock} scale @ ${_scale}`);
		}        

		//-----------------------------------
		// update seconds
		//-----------------------------------
		_secondsDelta = seconds - _seconds;
		_seconds = seconds;
	}



	//----------------------------------------------
	this.addForce = function( force, scaleForce )
	{
        _velocity.x = force.x;
        _velocity.y = force.y;
        
        _scaleDelta = scaleForce;
    }
	

	//--------------------------------------
	this.setAspectRatio = function(a)
	{	
        //console.log( "setAspectRatio" );
	
	    _aspectRatio = a;

        //---------------------
        // important
        //---------------------
        calculateFrame();
        
        //---------------------
        // apply constraints
        //---------------------
        applyConstraints();        
	}

	//-------------------------
	function calculateFrame()
	{	
        _right  = _position.x + _scale * ONE_HALF * _aspectRatio;
        _left   = _position.x - _scale * ONE_HALF * _aspectRatio;

		_top    = _position.y + _scale * ONE_HALF;
		_bottom	= _position.y - _scale * ONE_HALF;
	}

	//------------------------------------------------
	this.doScaleShift = function( toScale, duration )
	{	
		_scaleShift.active	 	= true;
		_scaleShift.clock	 	= 0;
		_scaleShift.startScale 	= _scale;
		_scaleShift.duration 	= duration;
		_scaleShift.endScale 	= toScale;
	}

	//--------------------------------------------------------
	this.doPositionShift = function( toPosition, duration )
	{		
		_positionShift.active	 		= true;
		_positionShift.clock	 		= 0;
		_positionShift.startPosition	= _position;
		_positionShift.duration 		= duration;
		_positionShift.endPosition.copyFrom( toPosition );
	}

	//---------------------------------
	// Cancel in case these are active
	//---------------------------------
	this.stopShift = function()
	{	
		_scaleShift.active 		= false;
		_positionShift.active 	= false;
	}

	//--------------------------
	function applyConstraints()
	{	
		//-------------------------------------------
		// constrain scale
		//-------------------------------------------
        let scaleOvershoot = _scale - POOL_WIDTH;
        if ( scaleOvershoot > ZERO )
        {
            _scale -= scaleOvershoot * SCALE_OVERSHOOT_PUSH;
        }

        let scaleUndershoot = _scale - MINIMUM_SCALE;
        if ( scaleUndershoot < ZERO )
        {
            _scale -= scaleUndershoot * SCALE_OVERSHOOT_PUSH;
        }

		//-------------------------------------------
		// constrain position
		//-------------------------------------------
		_vectorUtility.x = _position.x - POOL_X_CENTER;
		_vectorUtility.y = _position.y - POOL_Y_CENTER;
		
		let distance = _vectorUtility.getMagnitude();
		
		let max = POOL_WIDTH * ONE_HALF - _scale * 0.4;
		if ( distance > max )
		{
			_position.addScaled( _vectorUtility, ( distance - max ) / distance * -PAN_OVERSHOOT_PUSH );
		}

        let rightOverShoot  = _right  - POOL_RIGHT;
        let leftOverShoot   = _left   + POOL_LEFT;
        let topOverShoot    = _top    - POOL_BOTTOM;
        let bottomOverShoot = _bottom + POOL_TOP;

        if ( rightOverShoot > ZERO  )
        {
            _position.x -= rightOverShoot * PAN_OVERSHOOT_PUSH; 
            calculateFrame();
        }
        if ( leftOverShoot < ZERO  )
        {
            _position.x -= leftOverShoot * PAN_OVERSHOOT_PUSH; 
            calculateFrame();
        }

        if ( topOverShoot > ZERO  )
        {
            _position.y -= topOverShoot * PAN_OVERSHOOT_PUSH; 
            calculateFrame();
        }
        if ( bottomOverShoot < ZERO  )
        {
            _position.y -= bottomOverShoot * PAN_OVERSHOOT_PUSH; 
            calculateFrame();
        }
	}

	//----------------------------------------------------------------------------------------
	// controls
	//----------------------------------------------------------------------------------------
	this.panLeft    = function() { _velocity.x -= _scale * BUTTON_FORCE * _secondsDelta; }
	this.panRight   = function() { _velocity.x += _scale * BUTTON_FORCE * _secondsDelta; }
	this.panDown    = function() { _velocity.y += _scale * BUTTON_FORCE * _secondsDelta; }
	this.panUp      = function() { _velocity.y -= _scale * BUTTON_FORCE * _secondsDelta; }
	this.zoomIn     = function() { _scaleDelta -= _scale * BUTTON_FORCE * _secondsDelta; }
	this.zoomOut    = function() { _scaleDelta += _scale * BUTTON_FORCE * _secondsDelta; }

	//----------------------------
	this.drag = function( x, y )
	{	
		_velocity.x -= x * _scale * DRAG_FORCE * _secondsDelta;
		_velocity.y -= y * _scale * DRAG_FORCE * _secondsDelta;
		
		//---------------------------------------------------------------
		// as the scale approaches the whole pool, the drag gets 
		// more dampened, until it is fully dampened at the limit.
		//---------------------------------------------------------------
		let limit = POOL_WIDTH * 0.4;

		if ( _scale > limit )
		{
		    if ( _scale > POOL_WIDTH )
		    {
		        _scale = POOL_WIDTH;
		    }

		    let dampening = ONE - ( ( _scale - limit ) / ( POOL_WIDTH - limit ) );
		    		    
		    // console.log( dampening );
		    
		    _velocity.x *= dampening;
		    _velocity.y *= dampening;
		}
    }
    
	//--------------------------------------
	this.setPosition = function( position )
	{	
		_positionShift.active = false;
		_position.copyFrom( position );
		_velocity.clear();

        //---------------------
        // important
        //---------------------
        calculateFrame();
	}

	//---------------------------------
	this.setScale = function( scale )
	{	
		_scaleShift.active = false;
		_scale = scale;
		_scaleDelta = ZERO;

        //---------------------
        // important
        //---------------------
        calculateFrame();
	}
	
	//-------------------------------------
	this.setScaleToMax = function()
	{	
        _position.setXY( POOL_LEFT + _scale * ONE_HALF, POOL_TOP + _scale * ONE_HALF );
	    _velocity.clear()
	
		this.setScale( POOL_RIGHT - POOL_LEFT );
		
		/*
		_scale = POOL_RIGHT - POOL_LEFT;
	    _scaleDelta = ZERO;
        _position.setXY( POOL_LEFT + _scale * ONE_HALF, POOL_TOP + _scale * ONE_HALF );
	    _velocity.clear()

        //---------------------
        // important
        //---------------------
        calculateFrame();
        */
        
	}

	//---------------------------
	this.getPosition = function()
	{	
	    _vectorUtility.x = _position.x;
	    _vectorUtility.y = _position.y;
	
		return _vectorUtility;
	}	

	//---------------------------
	this.getScale = function()
	{
        return _scale;
	}

	//-----------------------------------------------------------------------
	// isZooming: returns true if the camera scale changed meaningfully
	// this frame. Used by GenePool to temporarily lower the LOD threshold
	// during zoom, preventing expensive HIGH LOD bezier rendering from
	// causing frame drops and audio hangs while the view is in motion.
	//
	// The "> 2.0" dead zone (out of a ~500–8000 scale range) is needed
	// because Camera uses friction-based deceleration: after the user
	// releases a zoom control, _scaleDelta decays gradually toward zero
	// over several seconds, causing _scale to keep changing by tiny
	// imperceptible sub-pixel amounts. Without this threshold, isZooming()
	// would stay true for ~3 seconds after release, keeping the LOD
	// artificially low long after the zoom motion is visually done.
	//-----------------------------------------------------------------------
	this.isZooming = function()
	{
        return Math.abs( _scale - _previousScale ) > 2.0;
	}
	
	//---------------------------
	this.getXDimension = function()
	{	
        return _scale * _aspectRatio;
	}
	
	//---------------------------
	this.getYDimension = function()
	{	
		return _scale;
	}

	//------------------------------------------------
	this.getWithinView = function( position, buffer )
	{
		if ( USE_CIRCULAR_VIEW )
		{
			let distance = position.getDistanceTo( _position );
			if ( distance < ( _scale * ONE_HALF ) + buffer )
			{
				return true;
			}
		}
		else
		{
			if (( position.x < _right  + buffer )
			&&  ( position.x > _left   - buffer )
			&&  ( position.y < _top    + buffer )
			&&  ( position.y > _bottom - buffer ))
			{
				return true;
			}
		}

		return false;
	}
	
}
