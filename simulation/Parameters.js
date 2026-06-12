const SWIMBOT_VERSION			= '2026-06-12.1';


/*************************/
/*** CONSOLE CONTROLS  ***/
/*************************/
const ZOOM_CONTROL_SPEED_ADJUSTMENT = 0.80;	// adjust the zoom joystick speed here, e.g. 0.5 = half as fast as default, 1.5 = 1.5x as fast as default
const PRESET_COOLDOWN_MS = 600; 	// prevent visitors from mashing on preset loading buttons too fast
const DEBUGGING_NOISY_CONSOLE_MODE  = false; // show lots more messages


/****************************/
/*** AUDIO CONFIGURATION  ***/
/****************************/

// The Audio tab sliders will initialize from these values.
var WEB_AUDIO_VOLUME     = 0.90; // master volume 0–1 (scaled ×0.75 by slider, so 0.50 → 37.5% of max)
var WEB_VOLUME_UTTERANCE = 1.00; // category mix: swimbot vocal utterxqances
var WEB_VOLUME_BIRTH     = 0.45; // category mix: birth samples
var WEB_VOLUME_SPAWN     = 0.30; // category mix: spawn (q*bert) samples
var WEB_VOLUME_DEATH     = 0.45; // category mix: death samples
var WEB_VOLUME_EAT       = 0.30; // category mix: eating samples
var WEB_VOLUME_LOOP      = 0.60; // category mix: background loop
var WEB_VOLUME_UI        = 0.80; // category mix: UI sounds (preset launch)

const ZOOM_UTTER_ATTENUATION = 30; // when zooming out, we can quiet our swimbots by this much (velocity reduction 0-127)
const LOUD_PRESET_ATTENUATION = 10; // a couple of our presets can get really loud so, set *additionally* reduce them by this much (0-127)


/****************************/
/*** PERFORMANCE TWEAKERS ***/
/****************************/

// don't allow user or any simulation to grow pool beyond this many living swimbots
const MAX_SWIMBOTS = 300;	// 300 is a good number for our Mac Mini Intel live kiosk, big bang will create 85% this many to start with

// limit simultaneous AUDIBLE utterances
var WEB_MAXIMUM_VOICES   = 25; // max simultaneous utterance voices (1–64) IMPACTS PERFORMANCE!

// limit simultaneous VISIBLE utterances
const MAX_UTTERANCES_TO_RENDER = 50; // too many animations? try reducing this
const MAX_PARTICLES = 300; // global max ripples shared by ALL concurrent utterances

//------------------------------------------------------------------------------
// 🤖 ADAPTIVE LEVEL OF DETAIL (LOD) — coarse vs. smooth swimbot bodies.
//
// The renderer draws each swimbot at HIGH (smooth bezier bodies) or LOW (coarse).
// The choice is automatic, made every tick in GenePool.update() from two DIFFERENT
// measurements — and it matters which is which:
//
//   CPU   (_emaTickMs)  — smoothed time of the SYNCHRONOUS tick body (sim + render).
//                         This is the work LOD actually controls: dropping to LOW
//                         cuts render compute, which lowers CPU. It is the clean
//                         measure of headroom and the predictor of "can we afford
//                         HIGH?".  → drives the continuous DROP and RAISE budget.
//
//   Frame (_emaFrameMs) — real wall-clock gap between consecutive tick starts.
//                         Because the loop schedules the next tick AFTER the work,
//                         Frame ≈ CPU + the ~20ms fixed timestep + any BETWEEN-tick
//                         stall (the utterance setTimeout storm, GC, canvas paint).
//                         Those stalls are INVISIBLE to CPU. Their cost arrives as
//                         rare spikes that an EMA would smooth away, so Frame is used
//                         as a RAW single-frame spike trigger, never as a budget.
//
// Division of labor: CPU = continuous budget (the headroom signal coupled to LOD's
// lever). Frame = emergency spike-drop + a post-spike promotion lockout for the
// class of stalls CPU can't see (the RADIAL preset was the motivating case: it
// juddered ~250ms every few seconds while CPU still read a healthy ~11ms).
//
// Asymmetric hysteresis: DROP is instant (one tick over budget), RAISE is slow
// (must prove sustained headroom). Fast-drop / slow-raise is what prevents the
// detail level from chattering at the budget boundary.
//------------------------------------------------------------------------------

const LOD_FRAME_BUDGET_DROP_MS    = 14;	// CPU EMA over this → drop HIGH→LOW immediately. A COMPUTE budget (~70% of the 20ms timestep), NOT a frame-rate.
const LOD_FRAME_BUDGET_RAISE_MS   = 11;	// CPU EMA under this → start counting toward HIGH. The DROP−RAISE gap is the dead zone that stops oscillation.
const LOD_EMA_ALPHA               = 0.1;	// smoothing for BOTH EMAs (CPU and Frame). smaller = steadier/slower to react, bigger = twitchier/thrashier.
const LOD_RAISE_CONFIRM_FRAMES    = 30;	// consecutive sub-budget ticks required to promote LOW→HIGH (~0.6s). Higher = stickier HIGH, less hunting.

// 🤖 Frame-spike guard — catches BETWEEN-tick stalls that CPU cannot see (their cost
// lands outside the synchronous tick body). A RAW single-frame test, not an EMA,
// because a 250ms crest every few seconds barely moves an average. Frame's resting
// value is ~20ms (timestep) + CPU, so this threshold sits well clear of that floor.
const LOD_FRAME_SPIKE_DROP_MS       = 100;	// one real inter-tick gap over this → drop HIGH→LOW now
const LOD_FRAME_SPIKE_IGNORE_MS     = 1000;	// gaps over this = tab backgrounded / throttled → ignore (not a CPU signal; dropping LOD wouldn't help)
const LOD_FRAME_SPIKE_COOLDOWN_FRAMES = 300;	// after a spike, block LOW→HIGH promotion this many ticks (~6s). Re-testing HIGH risks re-freezing, so re-test rarely; if HIGH still spikes we just drop and stay LOW.

// 🤖 Startup grace window. Every preset launch resets _clock to 0 and is followed by
// ~1s of churn (allocation, voice setup, the auto-zoom transient). We keep MEASURING
// during the window but act on NEITHER drop nor raise, so launch churn can't strand a
// light preset at LOW or bounce a heavy one to HIGH mid-explosion. Counted in ticks
// (≈20ms each), it self-extends through churn: when launch hitches slow the ticks, the
// window naturally covers more wall-clock time.
const LOD_STARTUP_GRACE_FRAMES    = 60;	// ~1.2s at the 20ms tick rate

// 🤖 Initial-LOD prior. Before any frame is measured we must pick a starting detail
// level. A preset launching with a large population (e.g. BIG_BANG: ~85% of
// MAX_SWIMBOTS spawned at once, zoomed out so all are on-screen) is monstrous for its
// first seconds, and the grace window would otherwise hold it at HIGH through exactly
// that churn. So a launch pop ≥ this starts at LOW; lighter presets start at HIGH.
// Only the pre-measurement guess — once grace ends the measured system takes over
// (climbs to HIGH if headroom appears, stays LOW if it never does).
const LOD_STARTUP_LOW_POP_THRESHOLD = 200;	// launch pop ≥ this → start at LOW (≈⅔ of MAX_SWIMBOTS)

// 🤖 TUNING — if you hit performance trouble, first press K to open the kiosk readout
// and watch CPU vs Frame: that tells you WHICH problem you have. Then adjust roughly
// in this order:
//   1. Raw load too high everywhere (CPU pinned high): the biggest levers are NOT here.
//      Lower MAX_SWIMBOTS / WEB_MAXIMUM_VOICES / MAX_UTTERANCES_TO_RENDER / MAX_PARTICLES
//      (above). LOD only trades body detail; it can't fix genuine overload.
//   2. Too detailed / drops too late on a slow machine: lower LOD_FRAME_BUDGET_DROP_MS
//      (drop sooner) and/or LOD_FRAME_BUDGET_RAISE_MS (re-promote more reluctantly).
//   3. Periodic freezes while CPU looks fine (between-tick stalls, e.g. RADIAL): lower
//      LOD_FRAME_SPIKE_DROP_MS to catch milder hitches; raise LOD_FRAME_SPIKE_COOLDOWN_FRAMES
//      to stay LOW longer between crests.
//   4. Detail level hunts/flickers in steady state: lower LOD_EMA_ALPHA (more smoothing)
//      and/or raise LOD_RAISE_CONFIRM_FRAMES, and/or widen the DROP−RAISE gap.
//   5. A heavy preset starts too detailed: lower LOD_STARTUP_LOW_POP_THRESHOLD. LOD
//      flickers right after a launch: raise LOD_STARTUP_GRACE_FRAMES.

const UI_UPDATE_PERIOD = 2000; // decrease when using graphs to debug


/*******************************/
/*** AUTOPILOT CONFIGURATION ***/
/*******************************/

var AUTOPILOT_MODE = false; 					// Init until we're inactive
const USER_INACTION_TIME_OUT	= 5*60; 		// switch to AUTOPILOT preset when user hasn't touched interface in this many seconds. Set to 0 to disable.
const AUTOPILOT_VOLUME_REDUCTION = .35; 	// percentage decrease in volume when we enter autopilot
const AUTOPILOT_MIN_POPULATION   = 5;		// if we're in AUTOPILOT and our population is ≤ this, start a brand new autopilot from a random snapshot

// Autopilot camera roaming — picks a new zoom target periodically, choosing
// between two bands: "close" (sit in among the action) and "wide" (pull back
// for an overview). Each band has its own scale range and hold time.
// Hold times are in ticks; ~60 ticks ≈ 1 second of real time.
const AUTOPILOT_WIDE_VIEW_PROBABILITY	= 0.15;		// 0.0 = always close, 1.0 = always wide
const AUTOPILOT_CLOSE_SCALE_MIN			= 400;		// tightest close-up zoom
const AUTOPILOT_CLOSE_SCALE_MAX			= 2500;		// loosest close-up zoom
const AUTOPILOT_CLOSE_HOLD_TICKS			= 700;		// time spent at each close-band pick
const AUTOPILOT_WIDE_SCALE_MIN			= 4000;		// least pulled-back overview
const AUTOPILOT_WIDE_SCALE_MAX			= 7500;		// most pulled-back overview
const AUTOPILOT_WIDE_HOLD_TICKS			= 3000;		// longer so you get a chance to "just observe"


/***************************/
/*** POOL CONFIGURATION ***/
/**************************/

var CIRCULAR_BOUNCE_RADIUS		= 3750; // bounce swimbots this far away from the center (4000=max)
const DEFAULT_GARDEN_OF_EDEN_RADIUS 		= 2000; // normally 1750
const INITIAL_NUM_SWIMBOTS 					= 150;	// default, most simulation presets override this
const MAX_MAXIMUM_AGE       				= 40000;		// 40000
const INITIAL_NUM_FOODBITS   				= 450; 		// 450
const MAX_FOODBITS           				= 500; 		// 500
const DEFAULT_FOOD_REGENERATION_PERIOD  	= 30; 		// 30
const MIN_FOOD_REGENERATION_PERIOD      	= 1; // for UI slider
const MAX_FOOD_REGENERATION_PERIOD      	= 200;


/*******************************/
/*** UTTERANCE CONFIGURATION ***/
/*******************************/

// Utter constants, all in clock time. To think of these in ms, multiply by APPROX_MS_PER_CLOCK (declared in Sound.js)
const MIN_UTTER_PERIOD 	 = 170;    // min time between utterances
const MAX_UTTER_PERIOD 	 = MIN_UTTER_PERIOD * 4;   // max time between utterances
const MIN_UTTER_DURATION = 60;  	 // min utter length — must be > BRAIN_SENSORY_UPDATE_PERIOD (50) to guarantee at least one scan catches each utterance window.
const MAX_UTTER_DURATION = 160;    // max utter length (if > than MIN_UTTER_PERIOD you risk ceaseless uttering)

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
// See: Embryology.js for how utterRange is computed at birth from genes 112-113, especially computing inverseSqrtDuty which we could flatten
//      GenePool.js giveSwimbotNearbyUtteringStimuli() for how it gates the mate scan.

const MIN_UTTER_RANGE           = 250.0;  // mating range for the busiest utterer (penalize busy utterances) // May 27 used to be 150
const MAX_UTTER_RANGE           = 400.0;  // mating range for the quietest utterer (reward infrequent chirpers) // May 27 used to be 500
const SWIMBOT_VIEW_RADIUS	    = 300.0; // how far can a swimbot see FOOD? Range for finding swimbots to mate with depends on the UTTERER'S calculated range.

// perceiving (moved from Brain.js)
const BRAIN_SENSORY_UPDATE_PERIOD           = 50;  // how often each swimbot scans for mates/food; directly couples to MIN_UTTER_DURATION
const BRAIN_MAX_PERCEIVED_NEARBY_SWIMBOTS   = 20;  // caps how many candidates are evaluated per scan; affects mate selection quality



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
const NORENDER_UTTER_STIMULI_SCAN_INTERVAL = 3;



const USE_CIRCULAR_VIEW				= true;
const GARDEN_OF_EDEN_RADIUS 		= DEFAULT_GARDEN_OF_EDEN_RADIUS;
const DEFAULT_CHILD_ENERGY_RATIO	= ONE_HALF;
const MIN_CHILD_ENERGY_RATIO        = ZERO;
const MAX_CHILD_ENERGY_RATIO        = ONE;
const MIN_SWIMBOT_HUNGER_THRESHOLD  = ZERO;

// DEFUNCT MULTIPLE FOOD BIT STUFF
const MAX_FOODBITS_PER_TYPE  						= 500;
const DEFAULT_NUM_FOOD_TYPES 						= 1;
const FOOD_TYPE_OFFSET 								= 0.2;


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





