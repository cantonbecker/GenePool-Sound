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

	//-----------------------------------
	// color
    // all values should be 0.0 to 1.0
	//-----------------------------------
    function Color( red, green, blue, opacity )
    {
		//	let color = new Color()  (defaults)
        if (red === undefined) {
            this.red     = 1.0;
            this.green   = 1.0;
            this.blue    = 1.0;
            this.opacity = 1.0;
        }
		//	let color = new Color( r, g, b, a )
		else {
            this.red     = red;
            this.green   = green;
            this.blue    = blue;
            this.opacity = opacity;
        }

		this.set = function( red, green, blue, opacity ) {
			this.red     = red;
			this.green   = green;
			this.blue    = blue;
			this.opacity = opacity;
		}

        // css style 'rgba' for HTML canvas rendering
        this.rgba = function() {
           return "rgba( " 
            + Math.floor( this.red   * 255 ) + ", " 
            + Math.floor( this.green * 255 ) + ", " 
            + Math.floor( this.blue  * 255 ) + ", "
            + this.opacity + ")";
        }
    }
    
	//-----------------------------------
	// assert
	//-----------------------------------
	function assert( assertion, string )
	{
		if ( !assertion )
		{
			alert( "assertion failed: " + string );
		} 
	}


	//-----------------------------------
	// assert integer
	//-----------------------------------
	function assertInteger( value, string )
	{
		if ( value - Math.floor( value ) > 0 )
		{
			alert( "assertInteger: value not an integer! - " + string );
		} 
	}
	
	//-----------------------------------
	// getRandomAngleInDegrees
	//-----------------------------------
	function getRandomAngleInDegrees()
	{
		return -180.0 + gpRandom() * 360.0;
	}
		
		
	/*///////////////////////////////////////
	aleaPRNG 1.1
	/////////////////////////////////////////
	Copyright (c) 2017-2020, W. "Mac" McMeans
	LICENSE: BSD 3-Clause License
	https://github.com/macmcmeans/aleaPRNG/blob/master/aleaPRNG-1.1.min.js
	//////////////////////////////////////////*/
	function aleaPRNG(){return function(n){"use strict";var r,t,e,o,a,u=new Uint32Array(3),i="";function c(n){var a=function(){var n=4022871197,r=function(r){r=r.toString();for(var t=0,e=r.length;t<e;t++){var o=.02519603282416938*(n+=r.charCodeAt(t));o-=n=o>>>0,n=(o*=n)>>>0,n+=4294967296*(o-=n)}return 2.3283064365386963e-10*(n>>>0)};return r.version="Mash 0.9",r}();r=a(" "),t=a(" "),e=a(" "),o=1;for(var u=0;u<n.length;u++)(r-=a(n[u]))<0&&(r+=1),(t-=a(n[u]))<0&&(t+=1),(e-=a(n[u]))<0&&(e+=1);i=a.version,a=null}function f(n){return parseInt(n,10)===n}var l=function(){var n=2091639*r+2.3283064365386963e-10*o;return r=t,t=e,e=n-(o=0|n)};return l.fract53=function(){return l()+1.1102230246251565e-16*(2097152*l()|0)},l.int32=function(){return 4294967296*l()},l.cycle=function(n){(n=void 0===n?1:+n)<1&&(n=1);for(var r=0;r<n;r++)l()},l.range=function(){var n,r;return 1===arguments.length?(n=0,r=arguments[0]):(n=arguments[0],r=arguments[1]),arguments[0]>arguments[1]&&(n=arguments[1],r=arguments[0]),f(n)&&f(r)?Math.floor(l()*(r-n+1))+n:l()*(r-n)+n},l.restart=function(){c(a)},l.seed=function(){c(Array.prototype.slice.call(arguments))},l.version=function(){return"aleaPRNG 1.1.0"},l.versions=function(){return"aleaPRNG 1.1.0, "+i},0===n.length&&(window.crypto.getRandomValues(u),n=[u[0],u[1],u[2]]),a=n,c(n),l}(Array.prototype.slice.call(arguments))}
	
	
	function nicknameFromStringHash (input) {
    // Deterministic string hash (djb2)
    function hashString(str) {
        let hash = 5381; // traditional djb2 hash that gives good results
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
        }
        return Math.abs(hash);
    }

    // Some fun, mostly pronounceable syllables
    const syllables = [
        "ba", "be", "bi", "bo", "bu",
        "da", "de", "di", "do", "du",
        "fa", "fe", "fi", "fo", "fu",
        "ga", "ge", "gi", "go", "gu",
        "ka", "ke", "ki", "ko", "ku",
        "la", "le", "li", "lo", "lu",
        "ma", "me", "mi", "mo", "mu",
        "na", "ne", "ni", "no", "nu",
        "pa", "pe", "pi", "po", "pu",
        "ra", "re", "ri", "ro", "ru",
        "sa", "se", "si", "so", "su",
        "ta", "te", "ti", "to", "tu",
        "va", "ve", "vi", "vo", "vu",
        "za", "ze", "zi", "zo", "zu",
        "jo", "ju", "ji", "je", "ja",
        "xo", "xa", "xi", "xe", "xu",
        "qu", "qi", "que", "qui"
    ];

    const hash = hashString(input);

    // Choose syllable count (2 to 4)
    const syllableCount = 2 + (hash % 3); // 2, 3, or 4 syllables

    // Pick syllables, using hash for deterministic "randomness"
    let nickname = "";
    let h = hash;
    for (let i = 0; i < syllableCount; i++) {
        let idx = h % syllables.length;
        nickname += syllables[idx];
        h = Math.floor(h / syllables.length);
    }

    // Capitalize first letter, optional: trim to 6-10 chars for compactness
    nickname = nickname.charAt(0).toUpperCase() + nickname.slice(1);
    if (nickname.length > 10) nickname = nickname.slice(0, 10);

    return nickname;
}
