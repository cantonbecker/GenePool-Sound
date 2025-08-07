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


//const NUM_GENES = 100;
const NUM_GENES = 256;

//const MUTATION_RATE   = 0.0;
//const MUTATION_RATE	= 0.01; // original
//const MUTATION_RATE	= 0.05;
//const MUTATION_RATE	= 0.2;
//const MUTATION_RATE   = 1.0;

//const CROSSOVER_RATE	= 0.2;
const MIN_GENE_VALUE	= 0;

//const NON_REPRODUCING_JUNK_DNA_LIMIT = 0.9; 


const PRESET_GENOTYPE_DARWIN    =  0;
const PRESET_GENOTYPE_WALLACE   =  1;
const PRESET_GENOTYPE_MENDEL    =  2;
const PRESET_GENOTYPE_TURING    =  3;
const PRESET_GENOTYPE_MARGULIS  =  4;
const PRESET_GENOTYPE_WILSON    =  5;
const PRESET_GENOTYPE_DAWKINS   =  6;
const PRESET_GENOTYPE_DENNETT   =  7;

/*
const PRESET_GENOTYPE_THING     =  8;
const PRESET_GENOTYPE_CRAZY     =  9;
const PRESET_GENOTYPE_OTTO      = 10;
const PRESET_GENOTYPE_SQUIRM    = 11;
const PRESET_GENOTYPE_WHIPPER   = 12;
const PRESET_GENOTYPE_FAST      = 13;
const PRESET_GENOTYPE_BLIP      = 14;
*/


//-------------------
function Genotype()
{
	//------------------------------------------------
	// create array of genes and initialize to 0
	//------------------------------------------------
	let _genes = new Array( NUM_GENES ); 
	
    for (let g=0; g<NUM_GENES; g++)
    {
        _genes[g] = 0;             
    }

	//--------------------------------
	// randomize genes
	//--------------------------------
	this.randomize = function()
	{	    
        //----------------------------------------------
        // each gene is a non-negative integer < 256
        //----------------------------------------------
		for (let g=0; g<NUM_GENES; g++)
		{
			_genes[g] = Math.floor( gpRandom() * BYTE_SIZE );
            assert( _genes[g] < BYTE_SIZE, "Genotype: randomize: _genes[g] < BYTE_SIZE" );  
            assertInteger( _genes[g], "Genotype:randomize; assertInteger( _genes[g]" );	
		}
	}
		
	//------------------------------------------
	// set all genes to one value
	//------------------------------------------
	this.setAllGenesToOneValue = function(v)
	{	    
		for (let g=0; g<NUM_GENES; g++)
		{
			_genes[g] = v;
            assert( _genes[g] < BYTE_SIZE, "Genotype:setAllGenesToOneValue: _genes[g] < BYTE_SIZE" );  	
            assertInteger( _genes[g], "Genotype:setAllGenesToOneValue; assertInteger( _genes[g]" );	
		}		
	}

	
	//------------------------------------------
	// set all genes to zero
	//------------------------------------------
	this.clear = function(v)
	{	    
		for (let g=0; g<NUM_GENES; g++)
		{
			_genes[g] = 0;  			
		}		
	}
	
    //-------------------------------
	this.getGeneValue = function(g)
	{ 
	    //console.log( _genes[g] );

        assertInteger( _genes[g], "Genotype:getGeneValue; assertInteger( _genes[g]" );	
	
        return _genes[g];
    }  
 
    //-------------------------------
	this.getGeneName = function(g)
	{ 
        return "not implemented yet!";
    }  
 
    //-------------------------------
	this.getGenes = function()
	{ 
        return _genes;
    }
 
    //-----------------------------------
    this.setGenes = function(g)
	{ 
        for (let i=0; i<NUM_GENES; i++)
        {
            assertInteger( g[i], "Genotype:setGenes: assertInteger: g[i]" );
        }

        _genes = g;
    }

    //-----------------------------------
	this.setGeneValue = function( g, v )
	{ 
        assert( v < BYTE_SIZE, "Genotype:setGeneValue: v < BYTE_SIZE");
        assertInteger( v, "Genotype:setGeneValue; assertInteger, v" );	

        _genes[g] = v;
    } 
    
    
    //------------------------------------------------
	this.copyFromGenotype = function( otherGenotype )
	{ 
        for (let g=0; g<NUM_GENES; g++)
        {        
            _genes[g] = otherGenotype.getGeneValue(g);
            assert( _genes[g] < BYTE_SIZE, "Genotype:copyFromGenotype: assert _genes[g] < BYTE_SIZE" );
            assertInteger( _genes[g], "Genotype:copyFromGenotype; assertInteger, _genes[g]" );	        
        }
    }    
    
	//--------------------------------
	// set to Froggy, but *each with a unique utterance
	//--------------------------------
	this.setToFroggy = function()
	{ 
        let g = -1;
        
        // g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE ); // frequency
        g++; _genes[g] = 255; // set gene 0 to 255
        g++; _genes[g] =  70; // set gene 1 to 70 cutOff        
        
        for (let c=0; c<3; c++)
        {
            let category    = 0;
            let redTest     = 0;
            let startWidth  = 160;
            let endLength   = 200;
        
            if ( c === 0 )
            {
                category    = 200;
                redTest     = 255;
                startWidth  = 255;
                endLength   = 0;
            }  
        
            //-----------------------------------------
            // order matters!!!
            //-----------------------------------------
            g++; _genes[g] =  80;       //start red
            g++; _genes[g] = 150;       //start green
            g++; _genes[g] =  20;       //start blue
            g++; _genes[g] =  80;       //end red
            g++; _genes[g] = 150;       //end green
            g++; _genes[g] =  20;       //end blue            
            g++; _genes[g] = startWidth;//startWidth      
            g++; _genes[g] =  80;       //endWidth        
            g++; _genes[g] = 100;       //startLength     
            g++; _genes[g] = endLength; //endLength                 
            
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //amp             
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //phase      
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //turnAmp         
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //turnPhase       
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //branchAmp             
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //branchPhase      
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //branchTurnAmp         
            g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE );  //branchTurnPhase       
            
            g++; _genes[g] = 0;         //sequenceCount       
            g++; _genes[g] = 0;         //branchPeriod    
            g++; _genes[g] = 180;       //branchAngle     
            g++; _genes[g] = 100;       //branchNumber    
            g++; _genes[g] = 0;         //branchShift                 
            g++; _genes[g] = category;  //branchCategory  
            g++; _genes[g] = 0;         //branchReflect               
            
            g++; _genes[g] = 255;       //splined   
            g++; _genes[g] = 100;       //end cap spline 
        }
        
        // now set totally random utterance genes, which are at indices 112-118
        for (let idx=112; idx <= 118; idx++) {
            _genes[idx] = Math.floor(gpRandom() * BYTE_SIZE); 
        }
        
    } // end froggies


	//--------------------------------
	// set to preset
	//--------------------------------
	this.setToPreset = function(i)
	{ 	
	    if ( i === PRESET_GENOTYPE_DARWIN )
        {
            
            _genes = [221,119,52,33,67,152,215,148,178,16,90,96,24,228,117,196,63,226,175,42,189,188,177,128,231,92,193,72,96,174,59,125,130,71,45,246,137,237,225,87,179,130,178,25,221,61,90,200,57,185,107,126,58,79,161,175,125,36,88,100,72,123,43,34,22,251,26,194,105,75,99,131,154,33,0,163,244,93,132,10,126,240,253,18,122,82,226,208,139,163,228,191,184,202,109,231,66,133,24,208,3,222,132,72,228,212,147,195,115,7,103,103,128,128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,218,0,152,0,229,0,0,0,0,0,0,0,0,0,61,0,0,0,0,0,0,0,0,0,226,0,0,0,0,0,0,0,75,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,66,0,0,0,0,0,0,0,0,0,230,0,0,0,0,141,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,77,0];
        }
        else if ( i === PRESET_GENOTYPE_WALLACE )
        {
            _genes = [225,255,16,20,193,39,82,165,61,249,85,179,186,20,221,200,134,112,90,134,71,187,231,246,94,189,30,187,191,67,113,239,116,137,212,7,38,123,17,40,157,140,131,135,159,180,31,123,171,77,150,192,87,39,103,245,56,23,4,64,105,192,4,49,252,99,192,7,137,242,2,92,23,129,175,192,78,68,130,139,4,81,214,152,50,209,72,212,54,187,223,1,64,217,239,20,203,159,202,223,41,131,61,10,35,186,93,222,235,99,248,146,128,76,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,215,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,155,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,144,0,0,0,0,0,0,0,0,0,55,0,27,220,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,112,216,0,0,228,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,0];
        }
        else if ( i === PRESET_GENOTYPE_MENDEL )
        {
            _genes = 
            [198,173,57,44,87,12,12,141,51,179,80,108,25,19,59,58,227,71,123,55,230,169,17,157,175,28,127,1,175,228,228,88,150,151,205,44,54,154,58,95,175,67,121,47,109,241,174,223,190,67,76,167,166,136,128,125,209,92,154,206,157,125,97,156,228,20,248,207,218,120,146,154,117,5,217,158,85,129,128,193,179,28,28,63,158,179,178,153,138,21,115,85,176,210,181,20,129,62,199,246,69,58,206,88,70,86,28,129,14,250,128,128,128,200,130,131,255,128,128,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];            
        }
        else if ( i === PRESET_GENOTYPE_TURING )
        {
            _genes =  
            [218,98,60,220,217,72,92,173,200,32,10,46,73,122,88,238,191,209,216,144,167,14,159,231,46,102,30,75,46,149,205,255,253,189,130,76,4,247,141,78,19,83,252,30,21,4,144,21,21,18,214,146,179,239,96,255,217,49,72,6,173,146,20,46,205,190,173,143,226,126,101,14,109,99,38,57,51,97,113,68,151,151,50,129,210,193,140,5,200,21,176,20,134,13,134,241,56,148,154,198,6,140,39,50,76,92,37,40,28,12,155,155,255,200,16,250,130,250,250,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
               
        }
        else if ( i === PRESET_GENOTYPE_MARGULIS )
        {
            _genes = 
            [203,235,23,212,52,201,247,135,215,55,173,210,191,18,40,161,227,183,212,47,115,36,62,209,54,87,101,236,253,99,148,160,130,226,25,48,25,79,159,199,149,190,77,44,30,52,200,160,22,168,126,30,209,227,12,76,119,112,96,82,171,113,157,115,228,38,115,206,111,144,63,204,139,171,90,85,122,19,228,125,52,10,229,205,42,72,6,37,210,74,113,63,154,49,249,96,68,211,0,81,236,209,143,168,160,139,177,232,248,160,37,228,103,150,160,238,5,209,71,44,199,150,4,80,121,193,237,227,48,183,75,53,245,12,45,216,192,51,42,141,156,3,32,218,47,210,42,248,73,216,251,130,143,195,199,106,72,84,183,50,184,134,121,98,248,166,102,189,100,155,105,10,65,190,239,40,21,16,229,45,17,224,44,200,35,88,148,52,133,156,63,154,31,212,71,142,213,74,102,180,56,141,35,170,254,44,162,128,243,138,212,210,248,6,72,49,228,77,144,144,94,191,57,19,81,208,20,125,200,208,82,220,213,129,234,187,23,25,207,35,118,193,198,30,171,209,242,224,139,98,184,115,70,38,57,3];
                     
        }
        else if ( i === PRESET_GENOTYPE_WILSON )
        {
            _genes =      

[218,157,11,41,198,87,90,87,243,211,164,9,193,77,153,218,202,123,99,239,20,189,98,79,91,251,108,242,93,57,100,104,70,206,8,73,126,222,195,14,64,231,95,218,126,173,0,199,52,87,24,84,151,200,175,178,207,237,81,184,187,199,23,5,65,241,52,44,169,87,69,51,180,136,244,159,181,96,38,160,218,245,17,166,1,104,154,187,155,109,140,95,147,100,143,238,83,189,146,44,152,128,82,33,248,77,3,241,209,214,178,189,11,245,255,185,233,4,201,227,183,55,0,210,178,0,0,240,114,183,0,245,47,218,22,0,74,88,150,96,0,0,79,32,202,246,51,150,56,32,83,253,0,148,254,254,27,229,0,106,12,128,39,49,61,177,0,0,0,174,204,157,0,0,104,222,20,0,0,173,72,232,0,8,0,0,179,48,31,0,204,14,218,0,248,113,0,167,62,0,148,0,0,217,0,245,123,55,241,90,251,0,0,208,0,91,0,222,115,149,0,251,0,182,5,58,0,157,0,240,60,0,233,5,138,226,0,0,148,0,0,195,0,115,0,107,0,161,70,0,0,244,0,22,22,238]; // after 12 hours            
            
        }
        else if ( i === PRESET_GENOTYPE_DAWKINS )
        {
            _genes = [67,157,11,41,198,207,222,87,243,211,164,129,193,71,153,218,202,123,35,221,18,189,98,79,91,251,108,173,60,59,169,35,87,206,139,194,126,222,132,83,241,231,80,91,114,173,0,199,52,57,24,188,35,200,175,24,207,237,81,121,123,199,23,130,65,241,52,44,200,250,69,51,180,136,244,159,181,96,38,53,211,39,155,166,1,104,154,187,232,72,101,95,147,100,143,238,83,189,146,44,152,81,82,28,59,77,3,10,209,107,178,54,11,245,255,185,223,4,74,227,174,55,0,210,178,0,0,110,41,100,0,4,0,27,251,0,0,88,217,27,0,0,153,78,75,14,51,133,2,38,83,253,0,38,12,254,18,229,0,0,249,128,199,64,59,247,0,165,0,174,220,182,0,12,77,0,28,0,143,167,178,240,0,31,129,0,253,18,108,71,178,254,218,37,227,35,0,147,62,0,148,0,0,0,0,85,123,55,241,90,0,0,0,23,0,10,0,222,29,149,0,251,0,182,70,240,0,157,0,240,246,0,233,5,43,104,0,155,0,146,44,255,0,109,192,94,237,75,0,0,14,244,0,248,22,238]; // after 12 hours
        }        
        else if ( i === PRESET_GENOTYPE_DENNETT )
        {
            _genes =             
[218,98,225,220,217,72,92,173,200,32,10,46,73,122,88,238,191,209,216,144,167,14,159,231,46,102,30,255,46,223,244,107,253,189,130,76,4,247,141,78,19,83,252,30,21,4,144,21,21,18,214,146,179,239,255,255,217,49,0,6,173,146,20,46,205,190,173,143,226,126,101,14,109,99,38,57,51,97,113,68,151,151,50,129,210,193,140,5,200,21,176,20,134,13,134,241,56,148,154,198,6,140,39,50,76,92,37,40,28,12,255,255,92,128,192,1,100,64,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
        }              
    }

//use this...
/*        

*/        
        
    //--------------------------------------------------------
	this.setAsOffspring = function( parent_0, parent_1 )
	{ 	
	    //console.log( parent_0 );
	    //console.log( parent_1 );
	    
	    /*
	    console.log( "----------------------------");
	    console.log( "setAsOffspring");
	    console.log( "----------------------------");

        for (let g=0; g<NUM_GENES; g++)
        {
            console.log( parent_0.genes[g] + ", " + parent_1.genes[g] );
        }
	    */
	    
        //-------------------------------------------
        // start with random parent either 1 or 2
        //-------------------------------------------
        let parent = 0;
        if ( gpRandom() < ONE_HALF )
        {
            parent = 1;
        }

        //-------------------------------------------
        // scan genes
        //-------------------------------------------
        for (let g=0; g<NUM_GENES; g++ )
        {
            //-----------------------------------
            // crossover - switch to other parent 
            //-----------------------------------
            if ( gpRandom() < CROSSOVER_RATE )
            {
                if ( parent === 0 )
                {
                    parent =  1;
                }
                else 
                {
                    parent = 0;
                }
            }

            //-----------------------------------
            // copy parent gene to child gene 
            //-----------------------------------
            if ( parent === 0 ) 
            {
                assert ( parent_0.getGeneValue(g) >= 0,         "Genotype: setAsOffspring: parent_0.getGeneValue(g) >= 0" );
                assert ( parent_0.getGeneValue(g) < BYTE_SIZE,  "Genotype: setAsOffspring: parent_0.getGeneValue(g) < BYTE_SIZE" );
                assertInteger( parent_0.getGeneValue(g),        "Genotype: setAsOffspring: assertInteger: parent_0.getGeneValue(g)" );	

                _genes[g] = parent_0.getGeneValue(g);
            }
            else 
            {
                assert ( parent_1.getGeneValue(g) >= 0,         "Genotype: setAsOffspring: parent_1.getGeneValue(g) >= 0" );
                assert ( parent_1.getGeneValue(g) < BYTE_SIZE,  "Genotype: setAsOffspring: parent_1.getGeneValue(g) < BYTE_SIZE" );
                assertInteger( parent_1.getGeneValue(g),        "Genotype: setAsOffspring: assertInteger: parent_1.getGeneValue(g)" );	
                
                _genes[g] = parent_1.getGeneValue(g);
            }
            
            assertInteger( _genes[g], "Genotype: setAsOffspring: assertInteger: _genes[g]" );	

            //-----------------------------------
            // mutation
            //-----------------------------------
            if ( gpRandom() < MUTATION_RATE ) 
            {
                this.mutateGene(g);
            }
            
            assert ( _genes[g] >= 0, "_genes[g] >=   0" );
            assert ( _genes[g] < BYTE_SIZE, "_genes[g] < BYTE_SIZE" );
            assertInteger( _genes[g], "Genotype: setAsOffspring: AFTER MUTATION...assertInteger: _genes[g]" );	
        }
    }
     

   
    //-----------------------------
	this.mutateGene = function(g)
	{	
        assertInteger( _genes[g], "Genotype: at the start of mutateGene" );
        	
        assert ( _genes[g] >= 0, "mutateGene: _genes[g] >=   0" );
        assert ( _genes[g] < BYTE_SIZE, "mutateGene: _genes[g] < BYTE_SIZE" );
 	

	    //console.log( "mutate gene " + g );
	    
        let amplitude = Math.floor( gpRandom() * gpRandom() * BYTE_SIZE );
        //console.log( "amplitude = " + amplitude );
    
        //-------------------------------------
        // keep it an integer!!!
        //-------------------------------------
        amplitude = Math.round( amplitude );

        assert( amplitude >= 0, "mutateGene:amplitude >= 0" );
        assert( amplitude < BYTE_SIZE, "mutateGene:amplitude < BYTE_SIZE" );

        if ( gpRandom() > ONE_HALF )
        {
            let before = _genes[g];
            _genes[g] += amplitude;
            
            if ( _genes[g] >= BYTE_SIZE ) 
            {
                _genes[g] -= BYTE_SIZE;
            }
            
            //console.log( "gene " + g + " mutated by " + amplitude + "; the value changed from " + before + " to " + _genes[g] );
        }
        else 
        {
            _genes[g] -= amplitude;

            if ( _genes[g] < 0 ) 
            {
                _genes[g] += BYTE_SIZE;
            }
        }

	
        assertInteger( _genes[g], "Genotype: mutateGene" );	
	
        
        assert ( _genes[g] >= 0, "Genotype: mutateGene:_genes[g] >=   0" );
        assert ( _genes[g] < BYTE_SIZE, "Genotype: mutateGene:_genes[g] < BYTE_SIZE" );
    }

   
    //-----------------------------
	this.zap = function( amount )
	{ 
        for (let g=0; g<NUM_GENES; g++ )
        {
            if ( gpRandom() < amount )
            {
                this.mutateGene(g);
            }
        }
    }
}


 
 