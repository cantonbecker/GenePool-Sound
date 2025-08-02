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
	// set to Froggy
	//--------------------------------
	this.setToFroggy = function()
	{ 
	    let g = -1;
	    
//g++; _genes[g] = Math.floor( gpRandom() * BYTE_SIZE ); // frequency
g++; _genes[g] = 255;
        g++; _genes[g] =  70; //cutOff        
        
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
    }


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
            [179,142,165,61,72,193,176,10,42,236,27,231,248,14,217,241,130,170,157,216,239,7,76,234,191,81,221,243,127,96,107,97,191,101,18,205,63,215,116,108,229,64,105,89,121,14,54,225,132,74,120,152,133,110,16,51,74,255,206,80,47,174,72,187,209,126,12,41,249,246,221,86,62,22,2,36,160,157,138,255,60,101,189,212,208,227,213,144,210,51,64,157,238,66,17,99,57,171,135,161,136,156,202,121,111,56,212,6,243,89,236,239,125,125,0,0,0,0,195,80,0,0,0,0,0,0,118,0,188,0,0,0,0,0,0,215,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,104,0,0,0,19,0,0,0,0,35,0,0,0,0,0,0,0,0,0,240,0,231,0,0,146,213,0,0,0,0,0,0,0,0,0,0,0,0,183,0,194,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,99,0,251,0,0,0,0,0,0,0,0,0,0,0,17,0,234,0,0,0,0,0,0,0,0,147,0,0,0,0,0,0,0,0];
                     
        }
        else if ( i === PRESET_GENOTYPE_WILSON )
        {
            _genes =      

[155,181,0,238,176,1,41,250,8,149,9,250,143,79,77,91,51,39,250,63,30,157,250,162,170,162,255,148,46,0,193,248,132,25,44,114,29,187,174,254,92,45,197,212,115,204,100,239,41,64,32,225,164,196,99,203,0,205,29,105,17,4,215,9,243,5,80,87,203,114,227,212,99,253,135,233,134,188,145,45,250,196,113,154,162,45,11,154,121,46,240,102,101,126,80,88,55,219,40,240,7,107,151,89,170,172,175,152,101,156,250,50,250,250,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,228,0,0,0,0,0,0,0,0,0,0,0,148,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,240,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,107,0,0,0,0,0,0,0,0,0,24,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,228,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,88,0,0,0,0,0,0,0,0,0,0,0,0,0,250,0,3,0,0,0,0,0,0,0,0,0,0,0,0,242,0];            
            
        }
        else if ( i === PRESET_GENOTYPE_DAWKINS )
        {
            _genes = [225,172,222,194,35,75,132,158,25,62,15,108,50,126,137,106,112,230,90,58,67,180,141,167,24,244,77,222,209,84,107,204,142,164,197,47,16,13,241,199,241,30,224,216,7,26,0,167,130,101,30,55,219,1,165,188,177,100,67,206,216,161,28,88,150,224,237,255,192,239,230,127,30,159,58,149,140,35,76,79,108,221,233,9,61,14,200,101,124,199,127,47,82,242,176,123,31,19,180,245,247,73,127,243,18,25,128,7,213,69,33,28,64,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
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


 
 