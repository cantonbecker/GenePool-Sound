const SWIMBOT_VERSION			= '2026-05-27 A';

// KYOTO 2025 VERSION (Mac Mini 2018 i9)
// initial bots and food are concentrated in a smaller area to give them a better chance of finding each other
// increase max age to compensate for more difficult utterance-based mate finding and fewer mates
// lower food regeneration period for faster food drops
// 9/21: 45000/400/450/20 always succeeds, very occasional rabbit foxing

const MAX_UTTER_ATTENUATION = 20; // when zooming out, we can quiet our swimbots by this much (velocity reduction 0-127)
const LOUD_PRESET_ATTENUATION = 10; // a couple of our presets can get really loud so, set *additionally* reduce them by this much (0-127)

// Audio mixer defaults — adjust these to set the startup balance.
// The Audio tab sliders will initialize from these values.
var WEB_AUDIO_VOLUME     = 0.85; // master volume 0–1 (scaled ×0.75 by slider, so 0.50 → 37.5% of max)
var WEB_VOLUME_UTTERANCE = 0.95; // category mix: swimbot vocal utterances
var WEB_VOLUME_BIRTH     = 0.65; // category mix: birth samples
var WEB_VOLUME_SPAWN     = 0.75; // category mix: spawn (q*bert) samples
var WEB_VOLUME_DEATH     = 0.80; // category mix: death samples
var WEB_VOLUME_EAT       = 0.40; // category mix: eating samples
var WEB_VOLUME_LOOP      = 0.80; // category mix: background loop
var WEB_VOLUME_UI        = 0.60; // category mix: UI sounds (preset launch)
var WEB_MAXIMUM_VOICES   = 32; // max simultaneous utterance voices (1–64) IMPACTS PERFORMANCE!

/*** CONSOLE CONTROLS ***/
const ZOOM_CONTROL_SPEED_ADJUSTMENT = 0.75;	// adjust the zoom joystick speed here, e.g. 0.5 = half as fast as default, 1.5 = 1.5x as fast as default
const PRESET_COOLDOWN_MS = 600; 	// prevent visitors from mashing on preset loading buttons too fast

/*** PERFORMANCE TWEAKERS ***/
// don't allow user or any simulation to grow pool beyond this many living swimbots
const MAX_SWIMBOTS = 300;	// 300 is a good number for our Mac Mini Intel live kiosk, big bang will create 85% this many to start with

// Adaptive LOD: measure how long each simulation tick takes (sim + render) and
// switch between HIGH and LOW swimbot detail based on actual cost, not a fixed
// zoom threshold. The system reactively drops to LOW when work exceeds budget
// and only promotes back to HIGH after sustained headroom — self-tuning across
// machines and population sizes. Budget numbers are derived from a 60fps target
// (~16.67ms/frame): drop at ~85% of budget, raise at ~50% (the band prevents
// chatter at the boundary).
const LOD_FRAME_BUDGET_DROP_MS    = 20;	// EMA tick > this  → drop HIGH → LOW LOD immediately (20ms = 50FPS threshold)
const LOD_FRAME_BUDGET_RAISE_MS   = 15;	// EMA tick < this  → start counting toward HIGH LOD promotion
const LOD_EMA_ALPHA               = 0.1;	// ~10-frame effective smoothing window to prevent LOD thrashing
const LOD_RAISE_CONFIRM_FRAMES    = 30;	// mandatory consecutive sub-budget frames required to promote LOW → HIGH

// Animation throttling to reduce simultaneous utterance *animations*
const MAX_PARTICLES = 300; // global max ripples shared by ALL concurrent utterances
const MAX_UTTERANCES_TO_RENDER = 50; // too many animations? try reducing this

// Autopilot controls
var AUTOPILOT_MODE = false; 					// Init until we're inactive
const USER_INACTION_TIME_OUT	= 5*60; 		// switch to AUTOPILOT preset when user hasn't touched interface in this many seconds. Set to 0 to disable.
const AUTOPILOT_VOLUME_REDUCTION = .25; 	// percentage decrease in volume when we enter autopilot
const AUTOPILOT_MIN_POPULATION   = 3;		// if we're in AUTOPILOT and our population is ≤ this, start a brand new autopilot from a random snapshot

// Autopilot camera roaming — picks a new zoom target periodically, choosing
// between two bands: "close" (sit in among the action) and "wide" (pull back
// for an overview). Each band has its own scale range and hold time.
// Hold times are in ticks; ~60 ticks ≈ 1 second of real time.
const AUTOPILOT_WIDE_VIEW_PROBABILITY	= 0.20;		// 0.0 = always close, 1.0 = always wide
const AUTOPILOT_CLOSE_SCALE_MIN			= 400;		// tightest close-up zoom
const AUTOPILOT_CLOSE_SCALE_MAX			= 2500;		// loosest close-up zoom
const AUTOPILOT_CLOSE_HOLD_TICKS			= 520;		// ~8s — time spent at each close-band pick
const AUTOPILOT_WIDE_SCALE_MIN			= 4000;		// least pulled-back overview
const AUTOPILOT_WIDE_SCALE_MAX			= 7500;		// most pulled-back overview
const AUTOPILOT_WIDE_HOLD_TICKS			= 2000;		// ~30s — longer so you get a chance to "just observe"

var CIRCULAR_BOUNCE_RADIUS		= 3750; // bounce swimbots this far away from the center (4000=max)
const UI_UPDATE_PERIOD = 1000; // decrease when using graphs to debug



const DEFAULT_GARDEN_OF_EDEN_RADIUS 		= 2000; // normally 1750
const INITIAL_NUM_SWIMBOTS 					= 150;	// default, most simulation presets override this

const MAX_MAXIMUM_AGE       				= 40000;		// 40000
const INITIAL_NUM_FOODBITS   				= 450; 		// 450
const MAX_FOODBITS           				= 500; 		// 500
const DEFAULT_FOOD_REGENERATION_PERIOD  	= 30; 		// 30

const MIN_FOOD_REGENERATION_PERIOD      	= 1; // for UI slider
const MAX_FOOD_REGENERATION_PERIOD      	= 200;

// Utter constants, all in clock time. To think of these in ms, multiply by APPROX_MS_PER_CLOCK (declared in Sound.js)
const MIN_UTTER_PERIOD 	 = 160;    // min time between utterances
const MAX_UTTER_PERIOD 	 = MIN_UTTER_PERIOD * 4;   // max time between utterances
const MIN_UTTER_DURATION = 60;  	 // min utter length — must be > BRAIN_SENSORY_UPDATE_PERIOD (50) to guarantee at least one scan catches each utterance window.
const MAX_UTTER_DURATION = 130;    // max utter length (if > than MIN_UTTER_PERIOD you risk ceaseless uttering)

//--------------------------------------------
// perceiving (moved from Brain.js)
//--------------------------------------------
const BRAIN_SENSORY_UPDATE_PERIOD           = 50;  // how often each swimbot scans for mates/food; directly couples to MIN_UTTER_DURATION
const BRAIN_MAX_PERCEIVED_NEARBY_SWIMBOTS   = 20;  // caps how many candidates are evaluated per scan; affects mate selection quality



// UTTERANCE MATING RANGE vs. FOOD DETECTION RADIUS (Darwin's Chorus feature — Canton Becker)
// -------------------------------------------------------------------
// Each swimbot has an effective "broadcast range" for its utterances, derived
// from its utterance duty cycle (utterDuration / utterPeriod). Think of each
// utterance as a beam of light: an infrequent utterer emits a bright, far-reaching
// beacon; a frequent utterer emits many dim, short-range pulses.
//
// This creates a genuine evolutionary trade-off between two viable mating strategies:
//   BUSY utterer (high duty cycle):  short range, but heard constantly nearby.
//                                    Thrives in dense population areas.
//   QUIET utterer (low duty cycle):  long range, reaches distant mates.
//                                    Thrives when population is sparse or spread out.
//
// The 4:1 ratio (150 to 600) mirrors the 4:1 ratio of the utterPeriod gene range
// (MIN_UTTER_PERIOD=160 to MAX_UTTER_PERIOD=640), giving a clean symmetry.
// At the midpoint duty cycle, a swimbot gets ~375 range — close to the old
// fixed SWIMBOT_VIEW_RADIUS of 300, so average behavior at generation 0 is similar.
//
// See: Embryology.js for how utterRange is computed at birth from genes 112-113.
//      GenePool.js giveSwimbotNearbyUtteringStimuli() for how it gates the mate scan.
const MIN_UTTER_RANGE           = 150.0;  // mating range for the busiest utterer (duty cycle ~0.94)
const MAX_UTTER_RANGE           = 500.0;  // mating range for the quietest utterer (duty cycle ~0.09)
const SWIMBOT_VIEW_RADIUS	    = 300.0; // how far can a swimbot see FOOD? Range for finding swimbots to mate with depends on the UTTERER'S calculated range.


// ------------------------------------------------------------------------------------
// NORENDER_UTTER_STIMULI_SCAN_INTERVAL — throttle the O(n²) mate-detection scan
//                                        in no-render mode only
// ------------------------------------------------------------------------------------
// Every tick, each alive swimbot scans every other swimbot to build its list of nearby
// potential mates (giveSwimbotNearbyUtteringStimuli in GenePool.js). At 300 swimbots
// this is 90,000 distance checks per tick — the most expensive operation in the sim.
//
// This constant ONLY applies when rendering is OFF (the "no render" button).
// In normal rendering mode and in fast-but-rendering-on mode, the scan always runs
// every tick at full fidelity. The throttle is purely a no-render speed optimization.
//
// The mate-search window counter (BRAIN_LOOKING_FOR_MATE_DURATION = 160 ticks) always
// decrements every tick regardless of this setting, so mate commitment timing is never
// affected. The only difference is that each swimbot evaluates potential mates fewer
// times per window (160/N times instead of 160 times).
//
// SETTING = 1:
//   Scans every tick even in no-render mode. Exactly identical behavior to having
//   rendering on. Use this if you suspect the throttle is skewing your results.
//
// SETTING = 2:
//   Significant 20% faster simulation in no-render. Scans every 2 ticks in no-render mode.
//   Each swimbot evaluates mates ~80 times per 160-tick window. Negligible effect
//   on evolutionary outcomes. Good default for long evolution runs.
//
// SETTING = 3–4:
//   Diminishing returns, still only about 20% faster. Each swimbot evaluates mates 40–53 times per window.
//   Still robust mate selection.
//   (the remaining bottleneck is setTimeout's ~4ms minimum floor, not the scan).
//   Recommended for fast evolutionary surveys.
//
// SETTING = 5+:
//   Diminishing returns (setTimeout floor dominates). Mate selection quality begins
//   to degrade. Safe up to interval=20 (MIN_UTTER_DURATION is 40 ticks so brief
//   utterances won't be missed), but not recommended for serious experiments.
//
// The scan is staggered across swimbots (swimbot s scans when
//   s % INTERVAL === clock % INTERVAL), spreading CPU load evenly across ticks
//   rather than bursting all 300 scans on the same tick every N ticks.
// ------------------------------------------------------------------------------------
const NORENDER_UTTER_STIMULI_SCAN_INTERVAL = 2;


/*** DEBUGGING STUFF ***/

const DEBUGGING_NOISY_CONSOLE_MODE  = false; // show lots more messages

const USE_CIRCULAR_VIEW				= true;
const GARDEN_OF_EDEN_RADIUS 		= DEFAULT_GARDEN_OF_EDEN_RADIUS;
const DEFAULT_CHILD_ENERGY_RATIO	= ONE_HALF;
const MIN_CHILD_ENERGY_RATIO        = ZERO;
const MAX_CHILD_ENERGY_RATIO        = ONE;
const MIN_SWIMBOT_HUNGER_THRESHOLD  = ZERO;

// DEFUNCT MULTIPLE FOOD BIT STUFF
const MAX_FOODBITS_PER_TYPE  						= 500;
const DEFAULT_NUM_FOOD_TYPES 						= 1;
// FOOD_TYPE_OFFSET is the proportion of energy a swimbot gets from food if 
// it is not its preferred food source. So if swimbots usually get 50 energy points, 
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





