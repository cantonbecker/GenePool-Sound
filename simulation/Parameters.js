const SWIMBOT_VERSION			= '2025-09-30 FC2';

/*** PERFORMANCE TWEAKERS ***/
// don't allow user or any simulation to grow pool beyond this many living swimbots
const MAX_SWIMBOTS = 300;

// MIDI audio throttling for when we approach MAX_SWIMBOTS
// e.g. 0 to disable throttling, or .25 to throttle channels up to 25% at MAX_SWIMBOTS
const THROTTLE_MIDI_WHEN_LOADED = .40;

// Animation throttling to reduce simultaneous utterance *animations*
const MAX_PARTICLES = 200; // global max ripples shared by ALL concurrent utterances
const MAX_UTTERANCES_TO_RENDER_DEFAULT = 120; // hung MIDI notes? try reducing this!
var MAX_UTTERANCES_TO_RENDER = MAX_UTTERANCES_TO_RENDER_DEFAULT; // in case we want to adjust it dynamically

const DEBUGGING_NOISY_CONSOLE_MODE = false; // show lots more messages
const DEBUGGING_UTTERANCE_EVENT_HORIZON = false; // let's see how far we can be heard
const USE_CIRCULAR_VIEW			= true;
const USER_INACTION_TIME_OUT	= 60 * 5; 	// switch to AUTOPILOT preset when user hasn't touched interface in this many seconds. set to 0 to disable.
var AUTOPILOT_MODE = false; // Ideally, this should be incorporated into viewTracking, but this will do for now.
const PRESET_COOLDOWN_MS = 600; 	// prevent visitors from mashing on preset loading buttons too fast which causes MIDI hangs
var CIRCULAR_BOUNCE_RADIUS		= 3750; // bounce swimbots this far away from the center (4000=max)
const AUTOPILOT_VOLUME_REDUCTION = .75; // percentage decrease in volume when we enter autopilot
const UI_UPDATE_PERIOD = 5000; // decrease when using graphs to debug


// KYOTO 2025 VERSION (Mac Mini 2018 i9)
// initial bots and food are concentrated in a smaller area to give them a better chance of finding each other
// increase max age to compensate for more difficult utterance-based mate finding and fewer mates
// lower food regeneration period for faster food drops
// 9/21: 45000/400/450/20 always succeeds, very occasional rabbit foxing

const DEFAULT_GARDEN_OF_EDEN_RADIUS 		= 1750;
const INITIAL_NUM_SWIMBOTS 					= 150;

const MAX_MAXIMUM_AGE       					= 45000;		// 40000
const INITIAL_NUM_FOODBITS   					= 450; 		// 450
const MAX_FOODBITS           					= 450; 		// 500
const DEFAULT_FOOD_REGENERATION_PERIOD  	= 20; 		// 30

const MIN_FOOD_REGENERATION_PERIOD      	= 1;
const MAX_FOOD_REGENERATION_PERIOD      	= 200;



// ORIGINAL VERSION
/*
const DEFAULT_GARDEN_OF_EDEN_RADIUS = 2000;
const INITIAL_NUM_SWIMBOTS =  500; // original version
const INITIAL_NUM_FOODBITS   = 1000; // original version
const MAX_SWIMBOTS = 2000;
const MAX_MAXIMUM_AGE       	= 40000;
const MAX_FOODBITS           = 2000;
const DEFAULT_FOOD_REGENERATION_PERIOD  = 20;
const MIN_FOOD_REGENERATION_PERIOD      = 1;
const MAX_FOOD_REGENERATION_PERIOD      = 200;
*/


const GARDEN_OF_EDEN_RADIUS 						= DEFAULT_GARDEN_OF_EDEN_RADIUS;
const DEFAULT_CHILD_ENERGY_RATIO					= ONE_HALF;
const MIN_CHILD_ENERGY_RATIO           		= ZERO;
const MAX_CHILD_ENERGY_RATIO             		= ONE;
const MIN_SWIMBOT_HUNGER_THRESHOLD      		= ZERO;

// DEFUNCT MULTIPLE FOOD BIT STUFF
const MAX_FOODBITS_PER_TYPE  						= 500;
const DEFAULT_NUM_FOOD_TYPES 						= 1;
// FOOD_TYPE_OFFSET is the proportion of energy a swimbot gets from food if 
// it is not its prefered food source. So if swimbots usually get 50 energy points, 
// a swimbot that does not have the right digestion (gene values) for that type
// of food will only get 35 energy points if the FOOD_TYPE_OFFSET is set to 0.7
const FOOD_TYPE_OFFSET 								= 0.2;
//const FOOD_TYPE_MUTATION_RATE = 0.99; // essentially 1: makes it so newborn foodbits can be either type



//----------------------------------------
//  LEVEL OF DETAIL 
//----------------------------------------
const SWIMBOT_LEVEL_OF_DETAIL_DOT  = 0;
const SWIMBOT_LEVEL_OF_DETAIL_LOW  = 1;
const SWIMBOT_LEVEL_OF_DETAIL_HIGH = 2;

const NON_REPRODUCING_JUNK_DNA_LIMIT = 0; // essentially disabled by CB for sonified genepool  
//0.9 appears to be a good threshold for species differences. Any less and it takes way too long
// for species to separate out and any more and the species appear the same to the user.

const SPAWN_FOOD_RANDOMLY_IN_POOL = false;

const MUTATION_RATE = 0.01;
const CROSSOVER_RATE = 0.2;     // I just decided to make this bigger (sept.3.2021) but I should check that it's ok.
const MAX_SWIMBOT_HUNGER_THRESHOLD      = 200;
const DEFAULT_SWIMBOT_HUNGER_THRESHOLD	=  50;

const YOUNG_AGE_DURATION    = 1000; // maggot time frame
const OLD_AGE_DURATION      = 1000; // fading out time frame
const MIN_MAXIMUM_AGE       = YOUNG_AGE_DURATION + OLD_AGE_DURATION;
const DEFAULT_MAXIMUM_AGE   = MAX_MAXIMUM_AGE;

const SWIMBOT_SELECT_RADIUS_SCALAR  = 7.0;

const RENDER_SWIMBOT_AS_DOT     = false;
const SWIMBOT_DOT_RENDER_RADIUS = 20;

// Line 348 of Genotype.js I've modified to:
// let amplitude = Math.floor( gpRandom() * gpRandom() * gpRandom() * BYTE_SIZE );
// gpRandom() is cubed instead of squared. This makes the mutation amplitude lower
// so that mutations don't appear totally random.

// Also changed line 726 of the saveload.js file to:
// for (let n=0; n<familyTree.getNumNodes(); n += 5) 
// so that the family tree only saves every fifth swimbot instead of all of them.
// This "random" subset of swimbots is all it takes to get enough data for meaningful
// analyses and evolutionary trees without slowing down Gene Pool to a stand-still.


//---------------------------------------------------------------------------
// I'm trying something new here: these are global variables that are 
// meant to be adjustible via the ui (and maybe via other components).
//---------------------------------------------------------------------------
function GlobalTweakers()
{
   this.childEnergyRatio       = DEFAULT_CHILD_ENERGY_RATIO;
   this.maximumLifeSpan        = DEFAULT_MAXIMUM_AGE;
	this.foodSpread             = DEFAULT_FOOD_BIT_MAX_SPAWN_RADIUS;
	this.foodBitEnergy          = DEFAULT_FOOD_BIT_ENERGY;
	this.foodRegenerationPeriod = DEFAULT_FOOD_REGENERATION_PERIOD;
	this.hungerThreshold        = DEFAULT_SWIMBOT_HUNGER_THRESHOLD;
	this.numFoodTypes           = DEFAULT_NUM_FOOD_TYPES;
	this.attractionCriterion    = ATTRACTION_SIMILAR_COLOR;
}





