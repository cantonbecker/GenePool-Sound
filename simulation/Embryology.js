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

//----------------------------
//  constants
//----------------------------
//const NUM_CATEGORIES = 3;
const NUM_CATEGORIES = 4;

//-------------------------------------
//  gene limits
//-------------------------------------
const MIN_LENGTH            =  3.0; 
const MAX_LENGTH            =  27.0; 
const MIN_WIDTH             =  0.5;
const MIN_SPLINED           =  0; 
const MAX_SPLINED           =  1; 
const MIN_END_CAP_SPLINE    =  0.5; 
const MAX_END_CAP_SPLINE    =  4.0; 

//const MAX_WIDTH             =  5.0; 
const MAX_WIDTH             =  7.0; 


const MIN_FREQUENCY         =  0.02;
const MAX_FREQUENCY         =  0.2;
const MIN_AMP               = -60.0;
const MAX_AMP               =  60.0;
const MIN_PHASE             =  -1.0;
const MAX_PHASE             =   1.0;	
const MIN_COLOR             =   ZERO;
const MAX_COLOR             =   ONE;
const MIN_BRANCH_PERIOD     =   1;
const MAX_BRANCH_PERIOD     =   4;	
const MIN_BRANCH_ANGLE      =  -90.0;
const MAX_BRANCH_ANGLE      =   90.0;
const MIN_BRANCH_NUMBER     =   0;
const MAX_BRANCH_NUMBER     =   3;
const MIN_BRANCH_SHIFT      =   0;
const MAX_BRANCH_SHIFT      =   6;
const MIN_BRANCH_REFLECT    =   0;
const MAX_BRANCH_REFLECT    =   3;
const MIN_BRANCH_CATEGORY   =   0;
const MAX_BRANCH_CATEGORY   =   NUM_CATEGORIES - 1;
const MIN_CUT_OFF           =   MIN_PARTS;
const MAX_CUT_OFF           =   MAX_PARTS - 1;
const MIN_SEQUENCE_COUNT    =   MIN_PARTS;
const MAX_SEQUENCE_COUNT    =   5;
	
const GREATEST_POSSIBLE_SWIMBOT_MASS = MAX_PARTS * MAX_LENGTH * MAX_WIDTH
const GREATEST_POSSIBLE_SWIMBOT_LENGTH	= MAX_PARTS * MAX_LENGTH;

const MIN_UTTER_PERIOD 	 = 100;  // in clock time
const MAX_UTTER_PERIOD 	 = 500; // in clock time
const MIN_UTTER_DURATION = 60;  	// in clock time ( watch out if this is less than BRAIN_SENSORY_UPDATE_PERIOD!!! )
const MAX_UTTER_DURATION = 90; // in clock time (never larger than MIN_UTTER_PERIOD, otherwise risks non-stop uttering)

//--------------------
function Embryology()
{	    

let testNoEel = true;

    //-------------------------
    function CategoryValues()
    {	   	
        this.sequenceCount  = ZERO;
        
        //geometry and color
        this.startWidth         = ZERO;
        this.endWidth           = ZERO;
        this.startLength        = ZERO;
        this.endLength          = ZERO;
        this.startRed           = ZERO;
        this.startGreen         = ZERO;
        this.startBlue          = ZERO;
        this.endRed             = ZERO;
        this.endGreen           = ZERO;
        this.endBlue            = ZERO;
        this.splined            = ZERO;
        this.endCapSpline       = ZERO;
        
        // motion
        this.amp                = ZERO;
        this.phase              = ZERO;
        this.turnAmp            = ZERO;
        this.turnPhase          = ZERO;
        this.branchAmp          = ZERO;
        this.branchPhase        = ZERO;
        this.branchTurnAmp      = ZERO;
        this.branchTurnPhase    = ZERO;
        
        //branching
        this.branchPeriod       = ZERO;
        this.branchAngle        = ZERO;
        this.branchNumber       = ZERO;
        this.branchShift        = ZERO;
        this.branchCategory     = ZERO;
        this.branchReflect      = ZERO;
 	}
	    
	//-------------------------------------------------------------
	// variables
	//-------------------------------------------------------------
    let _normalizedGenes        = new Array( NUM_GENES ); 
    let _geneNames              = new Array( NUM_GENES ); 
    let _branchStatus           = new Array( MAX_PARTS ); 
    let _categoryValues         = new Array( NUM_CATEGORIES ); 
    let _partIndex              = ZERO;
    let _generating             = false;
    let _frequency              = ZERO;
    let _numGenesUsed           = 0;
    let _numGenesPerCategory    = 0;
    let _cutOff                 = 0;
    let preferredFoodTypeGene   = 0;
    let digestibleFoodTypeGene  = 0;
    
	this.getPreferredFoodTypeGene   = function() { return preferredFoodTypeGene;    }
	this.getDigestibleFoodTypeGene  = function() { return digestibleFoodTypeGene;   }

    for (let g=0; g<NUM_GENES; g++)
    {
        _geneNames[g] = "junk";
    }
    
         
	//----------------------------------------------------
	// generate phenotype from genotype
	//----------------------------------------------------
	this.generatePhenotypeFromGenotype = function( genotype )
	{
        //--------------------------------
        // create new phenotype...
        //--------------------------------
		let phenotype = new Phenotype();
		
	    //-----------------------------------
	    // create categories array
	    //-----------------------------------
		for (let c=0; c<NUM_CATEGORIES; c++)
		{
		    _categoryValues[c] = new CategoryValues();
		}

	    //-----------------------------------
	    // initialize branch status
	    //-----------------------------------
		for (let p=0; p<MAX_PARTS; p++)
		{
		    _branchStatus[p] = false;
		}

	    //--------------------------------------------------------
	    // convert the gene values from byte to normalized
	    //--------------------------------------------------------
		for (let g=0; g<NUM_GENES; g++)
		{
            _normalizedGenes[g] = genotype.getGeneValue(g) / BYTE_SIZE;
		    assert( _normalizedGenes[g] >= ZERO, "normalizedGenes[g] >= ZERO" );
		    assert( _normalizedGenes[g] <= ONE,  "normalizedGenes[g] <= ONE"  );
		}

        //------------------------------------------------------------
        // get the ranges...
        //------------------------------------------------------------
        let sequenceCountRange      = MAX_SEQUENCE_COUNT    - MIN_SEQUENCE_COUNT;
        let widthRange              = MAX_WIDTH             - MIN_WIDTH;
        let lengthRange             = MAX_LENGTH            - MIN_LENGTH;
        let ampRange                = MAX_AMP               - MIN_AMP;
        let frequencyRange          = MAX_FREQUENCY         - MIN_FREQUENCY;
        let phaseRange              = MAX_PHASE             - MIN_PHASE;
        let colorRange              = MAX_COLOR             - MIN_COLOR;
        let periodRange             = MAX_BRANCH_PERIOD     - MIN_BRANCH_PERIOD;
        let branchAngleRange        = MAX_BRANCH_ANGLE      - MIN_BRANCH_ANGLE;
        let branchNumberRange       = MAX_BRANCH_NUMBER     - MIN_BRANCH_NUMBER;
        let branchShiftRange        = MAX_BRANCH_SHIFT      - MIN_BRANCH_SHIFT;
        let branchCategoryRange     = MAX_BRANCH_CATEGORY   - MIN_BRANCH_CATEGORY;
        let branchReflectRange      = MAX_BRANCH_REFLECT    - MIN_BRANCH_REFLECT;
        let cutOffRange             = MAX_CUT_OFF           - MIN_CUT_OFF;
        let splinedRange            = MAX_SPLINED           - MIN_SPLINED;
        let endCapSplineRange       = MAX_END_CAP_SPLINE    - MIN_END_CAP_SPLINE;

        //---------------------------------
        // apply genes
        //---------------------------------
		let g = -1;
        
        g++; _frequency = MIN_FREQUENCY + frequencyRange    * _normalizedGenes[g];  _geneNames[g] = "frequency";
        g++; _cutOff    = MIN_CUT_OFF   + cutOffRange       * _normalizedGenes[g];  _geneNames[g] = "cutoff";
        
		for (let c=0; c<NUM_CATEGORIES; c++)
		{
		    _numGenesPerCategory = 0;
            g++; _categoryValues[c].startRed        = MIN_COLOR             + colorRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "start red";
            g++; _categoryValues[c].startGreen      = MIN_COLOR             + colorRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "start green";
            g++; _categoryValues[c].startBlue	    = MIN_COLOR             + colorRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "start blue";
            g++; _categoryValues[c].endRed	        = MIN_COLOR             + colorRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "end red";
            g++; _categoryValues[c].endGreen        = MIN_COLOR             + colorRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "end green";
            g++; _categoryValues[c].endBlue         = MIN_COLOR             + colorRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "end blue";
            g++; _categoryValues[c].startWidth      = MIN_WIDTH             + widthRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "start width";
            g++; _categoryValues[c].endWidth        = MIN_WIDTH             + widthRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "end width";
            g++; _categoryValues[c].startLength     = MIN_LENGTH            + lengthRange           * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "start length";
            g++; _categoryValues[c].endLength       = MIN_LENGTH            + lengthRange           * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "end length";

            g++; _categoryValues[c].amp             = MIN_AMP               + ampRange              * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "amplitude";
            g++; _categoryValues[c].phase           = MIN_PHASE             + phaseRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "phase";
            g++; _categoryValues[c].turnAmp         = MIN_AMP               + ampRange              * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "turn amplitude";
            g++; _categoryValues[c].turnPhase       = MIN_PHASE             + phaseRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "turn phase";
            g++; _categoryValues[c].branchAmp       = MIN_AMP               + ampRange              * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch amplitude";
            g++; _categoryValues[c].branchPhase     = MIN_PHASE             + phaseRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch phase";
            g++; _categoryValues[c].branchTurnAmp   = MIN_AMP               + ampRange              * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch turn amplitude";
            g++; _categoryValues[c].branchTurnPhase = MIN_PHASE             + phaseRange            * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch turn phase";

            g++; _categoryValues[c].sequenceCount   = MIN_SEQUENCE_COUNT    + sequenceCountRange    * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "sequence count";
            g++; _categoryValues[c].branchPeriod    = MIN_BRANCH_PERIOD     + periodRange           * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch period";
            g++; _categoryValues[c].branchAngle     = MIN_BRANCH_ANGLE      + branchAngleRange      * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch angle";
            g++; _categoryValues[c].branchNumber    = MIN_BRANCH_NUMBER     + branchNumberRange     * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch number";
            g++; _categoryValues[c].branchShift     = MIN_BRANCH_SHIFT      + branchShiftRange      * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch shift";
            g++; _categoryValues[c].branchCategory  = MIN_BRANCH_CATEGORY   + branchCategoryRange   * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch category";
            g++; _categoryValues[c].branchReflect   = MIN_BRANCH_REFLECT    + branchReflectRange    * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "branch reflect";
            
            g++; _categoryValues[c].splined         = MIN_SPLINED           + splinedRange          * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "splined";
            g++; _categoryValues[c].endCapSpline    = MIN_END_CAP_SPLINE    + endCapSplineRange     * _normalizedGenes[g]; _numGenesPerCategory ++;  _geneNames[g] = "end cap spline";
         
            //---------------------------------------------------------------------------------------------
            // make these integers
            //---------------------------------------------------------------------------------------------
            _categoryValues[c].sequenceCount    = Math.floor( ZERO  + _categoryValues[c].sequenceCount  );
            _categoryValues[c].branchPeriod     = Math.floor( ZERO  + _categoryValues[c].branchPeriod   );
            _categoryValues[c].branchNumber     = Math.floor( ONE   + _categoryValues[c].branchNumber   );
            _categoryValues[c].branchShift      = Math.floor( ZERO  + _categoryValues[c].branchShift    );
            _categoryValues[c].branchCategory   = Math.floor( ZERO  + _categoryValues[c].branchCategory );
            _categoryValues[c].branchReflect    = Math.floor( ONE   + _categoryValues[c].branchReflect  );
            _categoryValues[c].splined          = Math.round( ZERO  + _categoryValues[c].splined        );
        }

        //-----------------------------------------------------------------------------------------
        // add genes for food type preference and digestibility:
        //
        // by default, swimbots are all born with a preferrence for 0 (green), but if numFoodTypes 
        // is set to 2, then they are born with a genetically-determined preferrence.
        //-----------------------------------------------------------------------------------------
        phenotype.preferredFoodType  = 0;
        phenotype.digestibleFoodType = 0;

        g++;  
        preferredFoodTypeGene = g; 
        _geneNames[g] = "preferred food type";
        if ( globalTweakers.numFoodTypes === 2 ) 
        {
            phenotype.preferredFoodType = Math.floor( _normalizedGenes[g] * 2 );     
        }   

        g++;  
        digestibleFoodTypeGene = g; 
        _geneNames[g] = "digestible food type";
        if ( globalTweakers.numFoodTypes === 2 ) 
        {
            phenotype.digestibleFoodType = Math.floor( _normalizedGenes[g] * 2 );     
        }   

        //-----------------------------------------------------------------------------------------
        // add genes for utterance:
        //
        //  
        // 
        //-----------------------------------------------------------------------------------------
        
        g++;  
        _geneNames[g] = "utter period";
        phenotype.utterPeriod = MIN_UTTER_PERIOD + Math.floor( _normalizedGenes[g] * ( MAX_UTTER_PERIOD - MIN_UTTER_PERIOD ) );     
        // phenotype.utterPeriod = 300;
        
        g++;  
        _geneNames[g] = "utter duration";        
		  phenotype.utterDuration = MIN_UTTER_DURATION + Math.floor( _normalizedGenes[g] * ( MAX_UTTER_DURATION - MIN_UTTER_DURATION ) );     
        // phenotype.utterDuration = 5;
        

        //------------------------------------------------------------------------------------------------
        // *** generate the markov-chained utterance sequence ***
        // when a swimbot is born, its unique and individual life-long MIDI "song" is composed
        // and its utterance-related phenotypes (utterHighNote, utterNoteCount, etc.) are determined ...
        //------------------------------------------------------------------------------------------------
        
		  const rng = aleaPRNG(_normalizedGenes.toString()); // initialize the random number generator with the entire genetic sequence
		  const utterSequenceLength = phenotype.utterDuration * APPROX_MS_PER_CLOCK; // range of 5-100 = 150ms-3000ms

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
        let octaveNoteShift = 24 + (12 * (Math.floor(rng() * 3)));  // our song will be 2, 3, or 4 octaves above the MIDI base note

        // how much mod wheel wiggling should there be between notes? (Increase the exponent to further weigh towards zero)
        let chanceOfModulation = rng() ** 3;

        // Markov Chain time! Pick initial Interval State (note)
        let lastInt = Math.floor(rng() * MIDI_NOTE_INTERVALS.length); // pick starting interval

        // Now pick the initial Inter-Onset Interval (duration)
        let lastIOI = Math.floor(rng() * SEQUENCE_DURATION_STATES.length); // might be short, medium, or long initial note
        if (utterSequenceLength < 750) lastIOI = 0; // override for short utterances. they should ALWAYS start with a short note (zero index to Interval State)
        
        // initialize mod CC with a random value at time 0
        let initialModVal = Math.floor((rng() ** 3) * 128); // 0-127, weighed towards lower end        
        sequenceData.push({
            delay: 0,  // in ms
            type: 'cc',
            cc: 1,
            value: initialModVal
        });
        
        let sequenceTime = 10; // first note to happen 10ms after we set the initial mod CC
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
        
        // store all our utterance and sequence-related phenotype data
        phenotype.utterNoteSpan = recordNotesUsed.length; // how many different pitches did we use?
        phenotype.utterHighNote = recordHighNote; // highest pitch performed
        phenotype.utterLowNote = recordLowNote; // lowest pitch performed
        phenotype.utterNoteCount = recordNoteCount; // how many individual notes?
        phenotype.utterModCount = recordModCount; // how many control events (e.g. modwheel spinnings)?
        phenotype.utterSequence = sequenceData;

        console.log('*** A SWIMBOT IS BORN! ***', phenotype);

		/*
        g++;  
		_geneNames[g] = "utter energy";        
		phenotype.utterEnergy = MIN_UTTER_ENERGY + _normalizedGenes[g] * ( MAX_UTTER_ENERGY - MIN_UTTER_ENERGY );     
        */
        
     	/*
         let clampAmount = 5;
		if ( phenotype.utterDuration > phenotype.utterPeriod + clampAmount ) // if utter duration is too long and would overlap our utter period
		{
			phenotype.utterDuration = phenotype.utterPeriod - clampAmount;
		}

      */
		/*
     	let clampAmount = 5;
     	if ( phenotype.utterPeriod < clampAmount )
     	{
	     	phenotype.utterDuration = clampAmount - 1;
     	}
     	else 
     	{		
			let clampedDuration = phenotype.utterPeriod - 3;
			if ( phenotype.utterDuration > clampedDuration )
			{
				phenotype.utterDuration = clampedDuration;
			}
		}
		*/
		
		
        /*
        let preferredFoodType  = 0;
        let digestibleFoodType = 0;
        
        if ( globalTweakers.numFoodTypes === 2 )
        {            
            preferredFoodType  = Math.floor( _normalizedGenes[g] * 2 ); 
            digestibleFoodType = Math.floor( _normalizedGenes[g] * 2 ); 
        }

        g++;  phenotype.preferredFoodType  = preferredFoodType;  preferredFoodTypeGene  = g; _geneNames[g] = "preferred food type";
        g++;  phenotype.digestibleFoodType = digestibleFoodType; digestibleFoodTypeGene = g; _geneNames[g] = "digestible food type";
        */
        
        
        
        //---------------------------------------
        // important: set _numGenesUsed
        //---------------------------------------
        _numGenesUsed = g + 1;

        //---------------------------------------
        // make sure this is kosher
        //---------------------------------------
        //console.log( "num genes used = " + _numGenesUsed + " out of " + NUM_GENES );
		assert( _numGenesUsed < NUM_GENES, "embryology: _numGenesUsed < NUM_GENES" );
        
        //---------------------------------
        // set the frequency...
        //---------------------------------
        phenotype.frequency = _frequency;
        
        //----------------------------------------------
        // generate the first sequence...
        //----------------------------------------------
        _partIndex = ROOT_PART;
        let startCategory = 0;
        
testNoEel = true;
//console.log( "--------------");
        this.generateBodySequence( phenotype, _partIndex, ZERO, startCategory, ONE );  
testNoEel = false;  
    
    
    
    
        //----------------------------------------------
        // generate the rest of the body...
        //----------------------------------------------
        _generating = true;
        while ( _generating )
        {          
            for (let p=0; p<MAX_PARTS; p++)
            {
                _generating = false; // this might get set back to true in generateBodySequence
                
                //----------------------------------------------
                // branching...
                //----------------------------------------------
                if ( _branchStatus[p] )
                {        
                    _branchStatus[p] = false; // this might get set back to true in generateBodySequence
                    
                    let partCategory = phenotype.parts[p].category;              
                    
                    let c = _categoryValues[ partCategory ].branchCategory;
                    let reflect = ONE;

                    //--------------------------------------------
                    // grow branch 
                    //--------------------------------------------
                    if ( _categoryValues[c].branchNumber === 1 )
                    {
                        reflect = ONE; 
                        this.generateBodySequence( phenotype, p, _categoryValues[c].branchAngle, c, reflect );   
                    }
                    else
                    {
                        //---------------------------------------------------------------
                        // fan out branch angle across the range of branches....
                        //---------------------------------------------------------------
                        for (let b=0; b<_categoryValues[c].branchNumber; b++)
                        {
                            reflect = ONE; 
                            if ( b % _categoryValues[c].branchReflect === 0 )
                            {
                                reflect = -ONE;
                            }
                            
                            let f = -ONE + ( b / ( _categoryValues[c].branchNumber - 1 ) ) * 2;

                            this.generateBodySequence( phenotype, p, _categoryValues[c].branchAngle * f, c, reflect );    
                        }   
                    }                    
                }
            }
        }
        
        //------------------------------------------------------------------------
        // set num parts (it will have accumulated from generating part sequences)
        //------------------------------------------------------------------------
        phenotype.numParts = _partIndex + 1;
        
        assert( phenotype.numParts > 1, "phenotype.numParts > 1"  );

		//-----------------------------------------------------
		// re-order the parts for more sensible rendering 
		//-----------------------------------------------------
//this.fixPartOrdering( phenotype );

		//----------------------
		// return phenotype
		//----------------------
        return phenotype;
    }
    
    
    
	//-----------------------------------------------
	// re-order the body parts for proper rendering
	//-----------------------------------------------
	this.fixPartOrdering = function( phenotype )
	{
	    //--------------------------------------------------------------------------
	    //  copy the parts array into a backup array and call it "testParts"
	    //--------------------------------------------------------------------------
	    let fixed     = new Array();
	    let testParts = new Array();
	    
	    
	    phenotype.parts[2].red   = 1.0;
	    phenotype.parts[2].green = 1.0;
	    phenotype.parts[2].blue  = 0.5;

        for (let p=1; p<phenotype.numParts; p++)
		{
		    fixed[p] = false;
            testParts[p] = new Part();
		    copyPart( phenotype.parts[p], testParts[p] );
        }
	    
	    //---------------------------
	    // start with part 1
	    //---------------------------
        let currentParentIndex = 1;
	    fixed[ currentParentIndex ] = true;

//console.log( "" );		    
//console.log( "" );		    

	    //-----------------------------------------------------
	    // loop through the rest of the parts to replace them 
	    // with the copy...possibly in a different order)
	    //-----------------------------------------------------
        for (let p=1; p<phenotype.numParts; p++)
		{
//let r = phenotype.numParts - p;		    
//console.log( phenotype.numParts + ", " + p + ", " + r );		    
//copyPart( testParts[r], phenotype.parts[p] );
	
copyPart( testParts[p], phenotype.parts[p] );
	
	
	        /*
            //------------------------------------------------------
            // we need to loop through testParts to see if any 
            // part is a child of testParts[ currentParentIndex ]
            //------------------------------------------------------
            for (let o=1; o<phenotype.numParts; o++)
            {	     
                if ( testParts[o].parent === currentParentIndex )
                {
                    if ( ! fixed[o] )
                    {
                        if ( ! _branchStatus[o] )
                        {
                            copyPart( testParts[p], phenotype.parts[p] );
                            fixed[o] = true;
                            currentParentIndex = o;
                        }
                    }
                }
            }
            */
        }
    }
    
    
    
    
	//--------------------------------------
	// copy part
	//--------------------------------------
    function copyPart( from, to )
    {
        to.category			= from.category;
        to.position			= from.position;        
        to.velocity			= from.velocity;
        to.previousMid 		= from.previousMid;
        to.midPosition 		= from.midPosition;
        to.perpendicular	= from.perpendicular;
        to.bendingAngle		= from.bendingAngle;
        to.currentAngle		= from.currentAngle;

// do not use this
//to.parent = from.parent;

        to.mass				= from.mass;
        to.length			= from.length;
        to.width			= from.width;
        to.angle		    = from.angle;
        //to.branchAngle		= from.branchAngle;
        to.frequency		= from.frequency;
        to.amp			    = from.amp;
        to.phase		    = from.phase;
        to.turnAmp		    = from.turnAmp;
        to.turnPhase	    = from.turnPhase;
        to.momentFactor		= from.momentFactor;
        to.red				= from.red;
        to.green			= from.green;
        to.blue				= from.blue;
        to.splined          = from.splined;
        to.endCapSpline     = from.endCapSpline;
        to.numDecendents	= from.numDecendents;
        
        for (let d=0; d<MAX_PARTS; d++)
        {
            to.decendent[d] = from.decendent[d]; 
        }  
    }
    
    
	//---------------------------------------------------------------------------------
	// generate body sequence
	//---------------------------------------------------------------------------------
	this.generateBodySequence = function( phenotype, parent, branchAngle, c, reflect )
	{
        for (let i=0; i<_categoryValues[c].sequenceCount; i++)
        {
            if ( _partIndex < _cutOff )
            {        
                //-------------------------
                // increment _partIndex  
                //-------------------------
                _partIndex ++;               
                assert( _partIndex < MAX_PARTS, "_partIndex < MAX_PARTS" );
                
                phenotype.parts[ _partIndex ].child = NULL_INDEX; //default
            
                //-------------------------------------------------------
                // the first part is a branchpoint from the parent  
                //-------------------------------------------------------
                if ( i === 0 )
                {
                    phenotype.parts[ _partIndex ].branch    = true;
                    phenotype.parts[ _partIndex ].parent    = parent;
                    phenotype.parts[ _partIndex ].angle     = branchAngle; 
                    phenotype.parts[ _partIndex ].amp       = _categoryValues[c].branchAmp;
                    phenotype.parts[ _partIndex ].phase     = _categoryValues[c].branchPhase * _partIndex; 
                    phenotype.parts[ _partIndex ].turnAmp   = _categoryValues[c].branchTurnAmp;
                    phenotype.parts[ _partIndex ].turnPhase = _categoryValues[c].branchTurnPhase * _partIndex;   
                }
                else
                {
                    let parent = _partIndex - 1;
                    phenotype.parts[ parent ].child = _partIndex;
                
                    phenotype.parts[ _partIndex ].branch    = false;
                    phenotype.parts[ _partIndex ].parent    = parent;
                    phenotype.parts[ _partIndex ].angle     = ZERO;
                    phenotype.parts[ _partIndex ].amp       = _categoryValues[c].amp;
                    phenotype.parts[ _partIndex ].phase     = _categoryValues[c].phase * _partIndex; 
                    phenotype.parts[ _partIndex ].turnAmp   = _categoryValues[c].turnAmp;
                    phenotype.parts[ _partIndex ].turnPhase = _categoryValues[c].turnPhase;   
                }


                
if ( testNoEel )
{
    //console.log( "testNoEel" );
    phenotype.parts[ _partIndex ].turnAmp   = ZERO;
    phenotype.parts[ _partIndex ].turnPhase = ZERO;   
}
        
                //-----------------------------------------------
                // apply reflection on amp
                //-----------------------------------------------
                phenotype.parts[ _partIndex ].amp *= reflect;
                
                //---------------------------------------------------
                // set some other attributes  
                //---------------------------------------------------
                phenotype.parts[ _partIndex ].category      = c;
                phenotype.parts[ _partIndex ].frequency     = phenotype.frequency;
                phenotype.parts[ _partIndex ].splined       = _categoryValues[c].splined;
                phenotype.parts[ _partIndex ].endCapSpline  = _categoryValues[c].endCapSpline;
 
                //----------------------------------------------------
                // set attributes that interpolate over the sequence
                //----------------------------------------------------
                let fraction = ZERO;
                
                if ( _categoryValues[c].sequenceCount > 1 )
                {
                    fraction = i / ( _categoryValues[c].sequenceCount - 1 );     
                }
                        
                phenotype.parts[ _partIndex ].width  = _categoryValues[c].startWidth  + fraction * ( _categoryValues[c].endWidth  - _categoryValues[c].startWidth   );
                phenotype.parts[ _partIndex ].length = _categoryValues[c].startLength + fraction * ( _categoryValues[c].endLength - _categoryValues[c].startLength  );   
                phenotype.parts[ _partIndex ].red    = _categoryValues[c].startRed    + fraction * ( _categoryValues[c].endRed    - _categoryValues[c].startRed     );
                phenotype.parts[ _partIndex ].green  = _categoryValues[c].startGreen  + fraction * ( _categoryValues[c].endGreen  - _categoryValues[c].startGreen   );
                phenotype.parts[ _partIndex ].blue   = _categoryValues[c].startBlue   + fraction * ( _categoryValues[c].endBlue   - _categoryValues[c].startBlue    );
                
			    assert( phenotype.parts[ _partIndex ].length > ZERO, "In Embryology: phenotype.parts[ _partIndex ].length > ZERO" );
			    assert( phenotype.parts[ _partIndex ].width  > ZERO, "In Embryology: phenotype.parts[ _partIndex ].width  > ZERO" );              

                //---------------------------------------------------------------------------------
                // determine if there is a branching
                //---------------------------------------------------------------------------------
                let mod = ( i + _categoryValues[c].branchShift ) % _categoryValues[c].branchPeriod;
               
                if ( mod === 0 )
                {
                    _generating = true;
        		    _branchStatus[ _partIndex ] = true;
                }
            }   
        }
    }

   
	//--------------------------------
	// get num categories
	//--------------------------------
	this.getNumGeneCategories = function()
	{
	    return NUM_CATEGORIES;
	}
    
	//--------------------------------
	// get num genes used
	//--------------------------------
	this.getNumGenesUsed = function()
	{
	    return _numGenesUsed;
	}
    
	//--------------------------------
	// get num genes per category
	//--------------------------------
	this.getNumGenesPerCategory = function()
	{
	    return _numGenesPerCategory;
	}
    
   
	//--------------------------------
	// get gene name
	//--------------------------------
	this.getGeneName = function(g)
	{
	    return _geneNames[g];
	}
    
    
    
} // function Embryology()





	  
       
