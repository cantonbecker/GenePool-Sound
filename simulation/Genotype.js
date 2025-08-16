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
            // Aug 8 2025, leaf-bug type thing after 1.5 million cycles w/ sound preferences
            _genes = [216,70,112,149,102,80,119,85,33,143,128,0,193,167,176,128,224,242,167,138,81,0,251,60,92,206,244,26,241,80,134,219,137,109,44,113,95,100,228,55,21,95,200,191,236,86,103,198,142,89,7,185,225,164,36,100,211,150,26,178,95,59,229,8,147,221,73,9,9,82,241,244,17,119,85,28,173,100,4,125,74,221,54,77,123,137,84,243,173,72,181,100,40,82,160,169,180,156,19,91,47,170,107,187,208,108,3,171,191,75,149,219,92,198,192,152,200,184,74,84,35,196,0,161,114,243,213,176,143,15,0,246,184,207,105,62,248,60,86,175,204,31,128,208,103,0,182,254,76,226,131,123,101,7,128,99,235,118,40,57,184,205,39,168,10,254,49,134,122,68,126,252,188,78,223,185,150,0,66,0,11,7,175,232,3,169,36,179,56,200,0,113,137,240,118,45,15,224,57,8,239,180,78,226,231,63,225,167,238,248,12,8,176,63,138,130,0,83,233,212,167,238,233,18,166,128,31,180,118,18,0,12,55,142,21,172,194,1,177,227,156,41,105,254,185,55,241,155,149,107,72,165,77,224,6,157];
        }
        else if ( i === PRESET_GENOTYPE_WALLACE )
        {
            _genes = [146, 181, 28, 193, 4, 113, 62, 24, 192, 0, 8, 158, 247, 16, 174, 94, 77, 238, 1, 27, 190, 68, 79, 47, 32, 56, 162, 249, 251, 109, 88, 189, 127, 248, 236, 133, 235, 131, 48, 84, 243, 217, 166, 102, 14, 49, 100, 232, 196, 105, 142, 194, 156, 143, 123, 94, 12, 216, 179, 40, 170, 212, 27, 56, 229, 43, 117, 223, 157, 108, 221, 141, 98, 235, 109, 63, 81, 221, 64, 38, 7, 48, 86, 14, 250, 114, 206, 19, 135, 183, 131, 38, 124, 105, 180, 118, 246, 125, 208, 232, 142, 44, 102, 253, 186, 215, 45, 128, 77, 144, 121, 251, 106, 51, 189, 187, 74, 208, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // three legged
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
            // super smooth worm swimmer after 8 million cycles
            _genes = 
            [242,38,197,191,55,35,73,111,127,32,11,249,237,30,85,191,104,218,249,123,163,195,180,75,59,54,41,202,25,114,153,47,180,52,27,128,223,178,196,183,165,78,66,54,209,50,186,53,242,138,45,65,146,95,202,65,159,99,124,173,36,82,102,56,14,173,123,16,249,114,17,160,20,119,29,105,192,105,59,151,72,118,213,214,62,147,121,52,138,140,155,174,160,153,6,236,145,131,112,95,66,180,110,129,95,173,109,33,204,233,60,102,52,188,174,254,216,75,93,0,197,33,80,225,8,241,135,65,164,250,6,17,36,104,237,165,89,244,158,158,123,150,207,104,164,74,13,68,7,104,193,16,99,183,15,40,188,120,62,172,249,121,109,232,69,147,209,88,206,239,27,35,147,229,45,60,138,179,138,154,51,147,250,187,65,226,193,64,238,124,94,205,179,170,184,140,138,243,7,209,212,99,195,175,130,237,103,251,96,109,4,77,202,62,0,39,204,170,56,118,4,136,152,131,108,160,251,247,92,83,163,153,216,99,178,135,148,203,192,173,55,4,165,142,66,188,37,75,255,0,250,39,91,236,184,148];
                     
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
[218,98,225,220,217,72,92,173,200,32,10,46,73,122,88,238,191,209,216,144,167,14,159,231,46,102,30,255,46,223,244,107,253,189,130,76,4,247,141,78,19,83,252,30,21,4,144,21,21,18,214,146,179,239,255,255,217,49,0,6,173,146,20,46,205,190,173,143,226,126,101,14,109,99,38,57,51,97,113,68,151,151,50,129,210,193,140,5,200,21,176,20,134,13,134,241,56,148,154,198,6,140,39,50,76,92,37,40,28,12,255,255,92,198,192,52,200,184,74,84,104,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
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


 
 