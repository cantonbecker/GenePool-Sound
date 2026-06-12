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


//--------------------------
const DEFAULT_BASIC_PANEL_COLOR         = "#caccc2";
const DEFAULT_BASIC_BUTTON_COLOR        = "#dadad0";   
const DEFAULT_BASIC_BUTTON_BORDER_COLOR = "#7f7f77";   
const ACTIVE_BORDER_COLOR               = '#ffffff';   

var DEVELOPER_MODE = true; // reflects how we launch into developer mode with the panel showing
var _kioskStatsOn  = false; // third UI mode: kiosk + curved Tick/LOD/Budget readout overlay
var DEMO_MODE = false; // used for unattended testing
let _lastPresetRequestTS = 0;

let _graph                      = new Graph();
let _tweakGenesCategory         = 0;
let _runningFast                = false;
let _rate_lastStep = 0;
let _rate_lastTSms = 0;
let _stepsPerSecond = 0;


// ---- D-key tap vs. hold state ---------------------------------------------
// Tap = cycle kiosk modes (doToggleDeveloperMode); hold 1500ms = act like X (doToggleFullscreen).
let _dKeyHoldTimer = null;
let _dKeyLongFired = false;

// 🤖 Tracks currently-held keys so we can detect chord presses (e.g. Q+T).
const _keysDown = new Set();
// Drop stale keys if the window loses focus mid-press (prevents phantom chords).
window.addEventListener('blur', () => _keysDown.clear());

// ---- Pointer Lock state/helpers -------------------------------------------
let _pointerLocked = false;
let _virtualX = 0, _virtualY = 0; // virtual cursor for infinite motion
let _draggingWithLock = false;
const LOCK_GAIN = 1.0;            // sensitivity; raise/lower to taste

function enterPointerLock() {
    const canvas = document.getElementById('Canvas');
    if (!canvas || !canvas.requestPointerLock) return;

    // Lock first (while we still have the key/click user gesture)
    try {
        canvas.focus();
        canvas.requestPointerLock();
    } catch (_) {}

    // Then fullscreen the whole document
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
}

function exitPointerLock() {
    try {
        if (document.pointerLockElement) document.exitPointerLock();
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    } catch (_) {}
}

// If fullscreen succeeded but lock was dropped, try to (re)acquire it.
document.addEventListener('fullscreenchange', () => {
    const canvas = document.getElementById('Canvas');
    if (document.fullscreenElement && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch (_) {}
    }
});

// Keep state in sync with browser
document.addEventListener('pointerlockchange', () => {
    const canvas = document.getElementById('Canvas');
    _pointerLocked = (document.pointerLockElement === canvas);

    if (_pointerLocked) {
        _virtualX = canvas.width * 0.5;
        _virtualY = canvas.height * 0.5;
        _draggingWithLock = true;
        if (typeof genePool !== "undefined") {
            genePool.touchDown(_virtualX, _virtualY);
        }
    } else {
        if (_draggingWithLock && typeof genePool !== "undefined") {
            genePool.touchUp(_virtualX, _virtualY);
        }
        _draggingWithLock = false;
    }
});



//-------------------------
//  *** INITIALIZE UI ***
//-------------------------
function initializeUI()
{
    initializeEcosystemUI();    
    
    _graph.initialize();

  // *** AUTO GENERATE SWIMBOT PRESET BUTTONS IN UI ****
  const presetSwimbotButtons = document.getElementById('presetSwimbotButtons');
  if (!presetSwimbotButtons) return;

  if (typeof PRESET_LIST === 'undefined' || !Array.isArray(PRESET_LIST)) {
    presetSwimbotButtons.textContent = '(no presets found)';
    return;
  }
  
  const frag = document.createDocumentFragment();

  PRESET_LIST.forEach((NAME, i) => {
    const btn = document.createElement('button');
    btn.id = `presetSwimbot${i + 1}Button`;
    btn.className = 'autoPresetButton';
    btn.textContent = NAME;
    btn.addEventListener('click', () => loadSwimbotFromPreset(i));
    frag.appendChild(btn);
  });

  presetSwimbotButtons.appendChild(frag);

  // *** AUTO GENERATE POOL PRESET BUTTONS IN UI ****
  const container = document.getElementById('poolPresets');
  if (container && typeof SimulationStartMode === 'object') {
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
  
    Object.entries(SimulationStartMode).forEach(([name, value]) => {
      const btn = document.createElement('button');
      btn.className = 'autoPresetButton';
      btn.textContent = name; // use the enum key as the label
      btn.addEventListener('click', () => {
        choosePoolToLoad(value);
        requestToLoadPoolFromPreset();
      });
      frag.appendChild(btn);
    });
  
    container.appendChild(frag);
  }

    //--------------------------------------------------
    // This starts an update loop that is called 
    // periodically to adjust UI states and stuff. 
    //--------------------------------------------------
    //console.log( "setTimeout" );
        
    setTimeout( "updateUI()", 1 );
 }



//----------------------------
function chooseAttraction()
{
    //console.log( "chooseAttraction" );

    let radioButtons = document.getElementsByName( 'attractionRadioButton' );

    /*
    console.log( "radioButtons.length = " + radioButtons.length );

    for (let i = 0; i < radioButtons.length; i++) 
    {
        console.log( radioButtons[i].value );
    }
    */
    
    for (let i = 0; i < radioButtons.length; i++) 
    {
        if ( radioButtons[i].type === 'radio' ) 
        {
            //console.log( "if ( radioButtons[i].type === 'radio' ) " );

            if ( radioButtons[i].checked )
            {
                let value = radioButtons[i].value;  
                let attraction = ATTRACTION_SIMILAR_COLOR;

                     if ( value === "colorful"          ) { attraction = ATTRACTION_COLORFUL;           }
                else if ( value === "big"               ) { attraction = ATTRACTION_BIG;                }
                else if ( value === "hyper"             ) { attraction = ATTRACTION_HYPER;              }
                else if ( value === "long"              ) { attraction = ATTRACTION_LONG;               }
                else if ( value === "straight"          ) { attraction = ATTRACTION_STRAIGHT;           }
                
                else if ( value === "noColor"           ) { attraction = ATTRACTION_NO_COLOR;           }
                else if ( value === "small"             ) { attraction = ATTRACTION_SMALL;              }
                else if ( value === "still"             ) { attraction = ATTRACTION_STILL;              }
                else if ( value === "short"             ) { attraction = ATTRACTION_SHORT;              }
                else if ( value === "crooked"           ) { attraction = ATTRACTION_CROOKED;            }
                
                else if ( value === "similarColor"      ) { attraction = ATTRACTION_SIMILAR_COLOR;      }
                else if ( value === "similarSize"       ) { attraction = ATTRACTION_SIMILAR_SIZE;       }
                else if ( value === "similatHyper"      ) { attraction = ATTRACTION_SIMILAR_HYPER;      }
                else if ( value === "similatLength"     ) { attraction = ATTRACTION_SIMILAR_LENGTH;     }
                else if ( value === "similarStraight"   ) { attraction = ATTRACTION_SIMILAR_STRAIGHT;   }
                
                else if ( value === "random"            ) { attraction = ATTRACTION_RANDOM;             }
                else if ( value === "closest"           ) { attraction = ATTRACTION_CLOSEST;            }
            
                //console.log ( "Attraction set to " + attraction );
                genePool.setAttraction( attraction );
            }
        }
    }
}


//-------------------------
function openTweakPanel()
{
    document.getElementById('tweakPanel' ).style.visibility = 'visible';		        

    document.getElementById( 'tweakDefaultButton' ).style.visibility = 'visible';
    updateEcosystemUI();
}    



//--------------------------------
function setEcosystemValue( id )
{
    let input = document.getElementById( id );
    
         if ( id === "foodGrowthDelaySlider"    ) { genePool.setFoodGrowthDelay     ( input.value ); }
    else if ( id === "foodSpreadSlider"         ) { genePool.setFoodSpread          ( input.value ); }
    else if ( id === "foodBitEnergySlider"      ) { genePool.setFoodBitEnergy       ( input.value ); }
    else if ( id === "hungerThresholdSlider"    ) { genePool.setHungerThreshold     ( input.value ); }
    else if ( id === "energyToOffspringSlider"  ) { genePool.setOffspringEnergyRatio( input.value ); }
    else if ( id === "maxAgeSlider"             ) { genePool.setMaximumSwimbotAge   ( input.value ); }
        
    updateEcosystemUI(); 
}

//------------------------------------
function setEcosystemToDefaults()
{   
    genePool.setFoodGrowthDelay     ( DEFAULT_FOOD_REGENERATION_PERIOD  );
    genePool.setFoodSpread          ( DEFAULT_FOOD_BIT_MAX_SPAWN_RADIUS );
    genePool.setFoodBitEnergy       ( DEFAULT_FOOD_BIT_ENERGY           );
    genePool.setHungerThreshold     ( DEFAULT_SWIMBOT_HUNGER_THRESHOLD  );
    genePool.setOffspringEnergyRatio( DEFAULT_CHILD_ENERGY_RATIO        );
    genePool.setMaximumSwimbotAge   ( DEFAULT_MAXIMUM_LIFESPAN          );
    
    updateEcosystemUI(); 
}



//----------------------------
function initializeEcosystemUI()
{
    document.getElementById( 'foodGrowthDelaySlider'    ).min = MIN_FOOD_REGENERATION_PERIOD;
    document.getElementById( 'foodGrowthDelaySlider'    ).max = MAX_FOOD_REGENERATION_PERIOD;

    document.getElementById( 'foodSpreadSlider'         ).min = MIN_FOOD_BIT_MAX_SPAWN_RADIUS;
    document.getElementById( 'foodSpreadSlider'         ).max = MAX_FOOD_BIT_MAX_SPAWN_RADIUS;

    document.getElementById( 'foodBitEnergySlider'      ).min = MIN_FOOD_BIT_ENERGY;
    document.getElementById( 'foodBitEnergySlider'      ).max = MAX_FOOD_BIT_ENERGY;
    
    document.getElementById( 'hungerThresholdSlider'    ).min = MIN_SWIMBOT_HUNGER_THRESHOLD;
    document.getElementById( 'hungerThresholdSlider'    ).max = MAX_SWIMBOT_HUNGER_THRESHOLD;
        
    document.getElementById( 'energyToOffspringSlider'  ).min = MIN_CHILD_ENERGY_RATIO;
    document.getElementById( 'energyToOffspringSlider'  ).max = MAX_CHILD_ENERGY_RATIO;
    
    document.getElementById( 'maxAgeSlider'             ).min = MIN_MAXIMUM_AGE;
    document.getElementById( 'maxAgeSlider'             ).max = MAX_MAXIMUM_AGE;
    
    updateEcosystemUI();
}
    


//----------------------------
function updateEcosystemUI()
{
    if ( typeof genePool != "undefined" ) 
    {    
        document.getElementById( "foodGrowthDelaySlider"    ).value     = genePool.getFoodGrowthDelay();
        document.getElementById( "foodGrowthDelayValue"     ).innerHTML = genePool.getFoodGrowthDelay();        
    
        document.getElementById( "foodSpreadSlider"         ).value     = genePool.getFoodSpread();
        document.getElementById( "foodSpreadValue"          ).innerHTML = genePool.getFoodSpread();

        document.getElementById( "foodBitEnergySlider"      ).value     = genePool.getFoodBitEnergy();
        document.getElementById( "foodBitEnergyValue"       ).innerHTML = genePool.getFoodBitEnergy();
    
        document.getElementById( "hungerThresholdSlider"    ).value     = genePool.getHungerThreshold();
        document.getElementById( "hungerThresholdValue"     ).innerHTML = genePool.getHungerThreshold();

        document.getElementById( "energyToOffspringSlider"  ).value     = genePool.getEnergyToOffspring();
        document.getElementById( "energyToOffspringValue"   ).innerHTML = genePool.getEnergyToOffspring();   

        document.getElementById( "maxAgeSlider"             ).value     = genePool.getMaximumSwimbotAge();
        document.getElementById( "maxAgeValue"              ).innerHTML = genePool.getMaximumSwimbotAge();   
        
    
        //--------------------------------------------------------------------------    
        // the radio buttons need to be reset to reflect any changes in attraction    
        //--------------------------------------------------------------------------    
        let radioButtons = document.getElementsByName( 'attractionRadioButton' );
        //console.log ( "updateEcosystemUI: genePool.getAttraction() = " + genePool.getAttraction() );
    
        for (let i = 0; i < radioButtons.length; i++) 
        {
            assert( i < NUM_ATTRACTIONS, "ui.js: updateEcosystemUI: i < NUM_ATTRACTIONS" );
        
            if ( radioButtons[i].type === 'radio' ) 
            {
                if ( genePool.getAttraction() === i )
                {
                    radioButtons[i].checked = true;
                }
                else
                {
                    radioButtons[i].checked = false;
                }
            }
        }
    } 
}




//----------------------------
function closeAllPanels()
{
    document.getElementById('poolPanel'    ).style.visibility = 'hidden';
    document.getElementById('swimbotPanel' ).style.visibility = 'hidden';
    document.getElementById('graphPanel'   ).style.visibility = 'hidden';
    document.getElementById('tweakPanel'   ).style.visibility = 'hidden';
    document.getElementById('infoPanel'    ).style.visibility = 'hidden';
    document.getElementById('audioMixer'   ).style.visibility = 'hidden';
    clearInterval(_audioStatusTimer);
    _stopStatusTimerIfUnused();
    
    document.getElementById('noSelectedSwimbotPanel' ).style.visibility = 'hidden';	
    document.getElementById('selectedSwimbotPanel'   ).style.visibility = 'hidden';	

    document.getElementById('menuPoolButton'    ).style.top = 0;		        
    document.getElementById('menuSwimbotButton' ).style.top = 0;			        
    document.getElementById('menuTweakButton'   ).style.top = 0;			        
    document.getElementById('menuInfoButton'    ).style.top = 0;			        
    document.getElementById('menuGraphButton'   ).style.top = 0;	
    
    document.getElementById( 'menuPoolButton'    ).style = "border-bottom-width: 3; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;"
    document.getElementById( 'menuSwimbotButton' ).style = "border-bottom-width: 3; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;"
    document.getElementById( 'menuTweakButton'   ).style = "border-bottom-width: 3; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;"
    document.getElementById( 'menuInfoButton'    ).style = "border-bottom-width: 3; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;"
    document.getElementById( 'menuGraphButton'   ).style = "border-bottom-width: 3; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;"

    closePopupPanel();		        
                    
    _graph.clear();        	        
}


//----------------------------
function openPanel( buttonID )
{
    closeAllPanels(); 
    
    //console.log( "openPanel" );    
    //document.getElementById( buttonID ).style.visibility = 'hidden';
    
    let panelID = 'poolPanel';
            
    if ( buttonID === 'menuPoolButton'      ) { panelID = 'poolPanel';      openPoolPanel();    }
    if ( buttonID === 'menuSwimbotButton'   ) { panelID = 'swimbotPanel';   openSwimbotPanel(); }
    if ( buttonID === 'menuTweakButton'     ) { panelID = 'tweakPanel';     openTweakPanel();   }
    if ( buttonID === 'menuInfoButton'      ) { panelID = 'infoPanel';      openInfoPanel();    }
    if ( buttonID === 'menuGraphButton'     ) { panelID = 'graphPanel';     openGraphPanel()    }

    document.getElementById( buttonID ).style = "border-bottom-width: 0; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px;"
    
    
    document.getElementById( buttonID ).style.backgroundColor = DEFAULT_BASIC_PANEL_COLOR;
    
    
    document.getElementById( buttonID ).style.top = 3;
}


var _poolStatusTimer = null;

// Start the 250ms readout timer if not already running. Used by the dev pool panel
// AND the kiosk-stats overlay — whichever is shown first.
function _ensureStatusTimer() {
    if (_poolStatusTimer) return;
    _poolStatusTimer = setInterval(updatePoolStatus, 250);
}
// Stop the timer only when neither consumer needs it.
function _stopStatusTimerIfUnused() {
    const poolPanelOpen = document.getElementById('poolPanel').style.visibility === 'visible';
    if (poolPanelOpen || _kioskStatsOn) return;
    if (_poolStatusTimer) { clearInterval(_poolStatusTimer); _poolStatusTimer = null; }
}

//--------------------------
function openPoolPanel()
{
    document.getElementById( 'poolPanel' ).style.visibility = 'visible';
    updatePoolStatus();
    _ensureStatusTimer();
}

//--------------------------
function updatePoolStatus() {
    // genePool may not be initialized yet (this can be called at startup
    // before the simulation has started and the camera exists)
    if (typeof genePool === 'undefined' || !genePool.getRendering()) return;

    const scale     = Math.round(genePool.getCameraScale());
    const lod       = genePool.getLevelOfDetail();
    const emaMs     = genePool.getEmaTickMs();
    const frameMs   = genePool.getEmaFrameMs(); // real inter-tick gap
    const pop       = genePool.getNumSwimbots();
    const food      = genePool.getNumFoodBits();
    const steps     = genePool.getTimeStep();

    const lodNames  = ['dot', 'low', 'high'];
    const lodName   = lodNames[lod] || '?';
    const overBudget = emaMs > LOD_FRAME_BUDGET_DROP_MS;
    // Frame goes amber when the SMOOTHED inter-tick gap is high — i.e. sustained
    // between-tick stalls, not just one spike. CPU can read fine while this is bad
    // (the RADIAL case). The actual spike-drop trips on a raw single frame, not this EMA.
    const frameOver  = frameMs > LOD_FRAME_SPIKE_DROP_MS;

    // Live countdown to autopilot. Resets when the user touches the UI.
    // Once tripped, AUTOPILOT_MODE stays on until the next interaction.
    const autopilotLabel = !USER_INACTION_TIME_OUT
        ? 'off'
        : (AUTOPILOT_MODE ? 'auto' : Math.ceil(genePool.getSecondsUntilAutopilot()) + 's');

    const el = document.getElementById('poolStatusPanel');
    if (el) {
        el.innerHTML =
            `<b>Steps:</b>&nbsp;${steps} ` +
            `<b>Pop:</b>&nbsp;${pop} ` +
            `<b>Food:</b>&nbsp;${food} ` +
            `<b>Auto:</b>&nbsp;${autopilotLabel}<br />` +
            `<b>Zoom:</b>&nbsp;${scale} ` +
            `<b>LOD:</b>&nbsp;${lodName} ` +
            `<b>Targets:</b>&nbsp;${LOD_FRAME_BUDGET_RAISE_MS}/${LOD_FRAME_BUDGET_DROP_MS}ms ` +
            `<b>CPU:</b>&nbsp;<span style="color:${overBudget ? '#c80' : 'inherit'};">${emaMs.toFixed(1)}ms</span> ` +
            `<b>Frame:</b>&nbsp;<span style="color:${frameOver ? '#c80' : 'inherit'};">${frameMs.toFixed(1)}ms</span>`; // real inter-tick gap
    }

    if (_kioskStatsOn) {
        const tp = document.querySelector('#kioskStatsText textPath');
        const t  = document.getElementById('kioskStatsText');
        if (tp) {
            // Built as separate nodes (not one string) so the LOD segment can be
            // tinted red on its own when we've dropped to LOW detail.
            const pre  = `Steps ${steps} · Pop ${pop} · Food ${food} · Auto ${autopilotLabel} · Zoom ${scale} · `;
            const post = ` · Targets ${LOD_FRAME_BUDGET_RAISE_MS}/${LOD_FRAME_BUDGET_DROP_MS}ms · CPU ${emaMs.toFixed(1)}ms · Frame ${frameMs.toFixed(1)}ms`;
            const lodSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            lodSpan.textContent = `LOD ${lodName}`;
            if (lodName === 'low') lodSpan.setAttribute('fill', '#e55'); // only this span goes red at LOW detail
            tp.replaceChildren(document.createTextNode(pre), lodSpan, document.createTextNode(post));
        }
        if (t)  t.setAttribute('fill', overBudget ? 'rgba(255,180,0,0.75)' : 'rgba(255,255,255,0.55)');
    }
}

//--------------------------
function openGraphPanel()
{
    document.getElementById( 'graphPanel' ).style.visibility = 'visible'; 
}

//--------------------------
function openSwimbotPanel()
{
    //console.log( "openSwimbotPanel" );    

    document.getElementById('swimbotPanel' ).style.visibility = 'visible';		        
  
    if ( genePool.getASwimbotIsSelected() )
    {
        //console.log( "openSwimbotPanel ----SELECTED!" );
        document.getElementById( 'selectedSwimbotPanel'   ).style.visibility = 'visible';		        	        
        document.getElementById( 'noSelectedSwimbotPanel' ).style.visibility = 'hidden';
    }		    
    else
    {
        //console.log( "openSwimbotPanel ----NOT SELECTED!" );
        document.getElementById( 'selectedSwimbotPanel'   ).style.visibility = 'hidden';		        	        
        document.getElementById( 'noSelectedSwimbotPanel' ).style.visibility = 'visible';
    }		    
}    




//------------------------------------------------
function openTweakGenesPanel( selectedSwimbotID )
{
    if ( selectedSwimbotID != NULL_INDEX )
    {
        document.getElementById( 'tweakGenesPanel'      ).style.visibility = 'visible';		        	        
        document.getElementById( 'closeTweakGenesPanel' ).style.visibility = "visible"; 

        document.getElementById( 'tweakGenesPanel' ).innerHTML = "<div id = 'tweakGenesTitle' >Tweak the genes of swimbot " + selectedSwimbotID + "</div>"; 

        const _NUM_UTTER = (UTTERANCE_GENES_SLICE_END - UTTERANCE_GENES_SLICE_START);
        document.getElementById('tweakGenesPanel').innerHTML 
            += "<div id='tweakGenesCategoryNote' style='margin-top:" + (_NUM_UTTER * 20) + "px'>(choose which limb type to tweak)</div>";

        let numCategories = genePool.getNumGeneCategories();        
        for (let c=0; c<numCategories; c++)
        {
            document.getElementById( 'tweakGenesPanel' ).innerHTML            
            += "<div id = 'category" + (c+1) + "' >" + (c+1)
            +  "<input "
            +  "type         = 'radio' " 
            +  "id           = 'geneTweakerCategory" + c + "'"
            +  "name         = 'geneTweakerCategory'" 
            +  "oninput      = 'setGeneTweakCategory( " + selectedSwimbotID + ", " + c + ")' "
            +  "onchange     = 'setGeneTweakCategory( " + selectedSwimbotID + ", " + c + ")' "
            +  "></div>";
        }
        
        // number of category genes + the two global genes + the utterance genes
        const perCat = genePool.getNumGenesPerCategory();
        const NUM_GLOBAL = 2; // genes 0,1
        const NUM_UTTER = (UTTERANCE_GENES_SLICE_END - UTTERANCE_GENES_SLICE_START);
        const totalRows = NUM_GLOBAL + NUM_UTTER + perCat;
        
        let width = 150;
        
        // Build sliders for: [0,1] (global), [112..119] (utterance), then category genes for category 0 by default
        for (let g = 0; g < totalRows; g++) {
            // Map slider index -> real gene index (for initial render we use category 0)
            let geneIndex;
            if (g < NUM_GLOBAL) {
                geneIndex = g; // 0 or 1
            } else if (g < NUM_GLOBAL + NUM_UTTER) {
                geneIndex = UTTERANCE_GENES_SLICE_START + (g - NUM_GLOBAL); // 112..119
            } else {
                const withinCat = g - (NUM_GLOBAL + NUM_UTTER);
                geneIndex = 2 + withinCat; // category 0 starts at 2
            }
        
            let geneTweakerName  = genePool.getGeneName(geneIndex);
            let geneTweakerValue = genePool.getGeneValue(selectedSwimbotID, geneIndex);
        
            // Lay out rows; anything after the utterance block is pushed down to clear the radio row
            let top = 60 + g * 20;
            if (g >= NUM_GLOBAL + NUM_UTTER) {
                top += 80.0; // same extra space you were using before for the radio controls
            }
        
            // value display
            document.getElementById('tweakGenesPanel').innerHTML
                += "<div class='geneTweakerValue' id='gene" + g + "Value' style='top:" + top + "px;'>" + geneTweakerValue + "</div>";
        
            // slider
            document.getElementById('tweakGenesPanel').innerHTML
                += "<input "
                +  "style='top:" + (top - 3) + "px; width:" + width + "px;' "
                +  "type='range' class='geneTweakerSlider' min='0' max='255' step='1' autocomplete='off' "
                +  "value='" + geneTweakerValue + "' "
                +  "id='geneTweaker" + g + "' name='geneTweaker' "
                +  "onchange='tweakGene(" + selectedSwimbotID + ", " + g + ")'>";
        
            // name label
            document.getElementById('tweakGenesPanel').innerHTML
                += "<div class='geneTweakerName' style='top:" + top + "px;'>" + geneTweakerName + "</div>";
        }


        //----------------------------------------------------
        // initialize tweak category
        //----------------------------------------------------
        _tweakGenesCategory = 0;

        //----------------------------------------------------
        // set radio button check status
        //----------------------------------------------------
        let radioButtons = document.getElementsByName( 'geneTweakerCategory' );

        for (let i = 0; i < radioButtons.length; i++) 
        {
            if ( i === _tweakGenesCategory ) 
            {
                radioButtons[i].checked = true;
            }
            else
            {
                radioButtons[i].checked = false;
            }
        }    
    }
    else
    {
        document.getElementById( 'tweakGenesPanel'      ).style.visibility = 'hidden';		        	        
        document.getElementById( 'closeTweakGenesPanel' ).style.visibility = "hidden"; 
    }    
}


//----------------------------
function closeTweakGenesPanel()
{
    document.getElementById( 'tweakGenesPanel'      ).style.visibility = "hidden"; 
    document.getElementById( 'closeTweakGenesPanel' ).style.visibility = "hidden"; 
}


//---------------------------------------------
function updateGeneSliders(selectedSwimbotID) {
    const perCat = genePool.getNumGenesPerCategory();
    const NUM_GLOBAL = 2;
    const NUM_UTTER = (UTTERANCE_GENES_SLICE_END - UTTERANCE_GENES_SLICE_START);
    const totalRows = NUM_GLOBAL + NUM_UTTER + perCat;

    for (let g = 0; g < totalRows; g++) {
        let geneIndex;
        if (g < NUM_GLOBAL) {
            geneIndex = g;
        } else if (g < NUM_GLOBAL + NUM_UTTER) {
            geneIndex = UTTERANCE_GENES_SLICE_START + (g - NUM_GLOBAL);
        } else {
            const withinCat = g - (NUM_GLOBAL + NUM_UTTER);
            geneIndex = 2 + withinCat + genePool.getNumGenesPerCategory() * _tweakGenesCategory;
        }

        const geneTweakerValue = genePool.getGeneValue(selectedSwimbotID, geneIndex);

        let id = "geneTweaker" + g;
        let slider = document.getElementById(id);
        slider.value = geneTweakerValue;

        id = "gene" + g + "Value";
        document.getElementById(id).innerHTML = geneTweakerValue;
    }
}


//-------------------------
function closePopupPanel()
{
    document.getElementById( 'popUpPanel'               ).style.visibility = 'hidden';
    document.getElementById( 'cancelPopUpPanelButton'   ).style.visibility = 'hidden';
    //document.getElementById( 'PopUpPanelError'          ).style.visibility = 'hidden';
    //document.getElementById( 'cancelErrorButton'        ).style.visibility = 'hidden';  
    //document.getElementById( 'popUpPanelInput'          ).style.visibility = 'hidden';
    //document.getElementById( 'savePopUpPanelButton'     ).style.visibility = 'hidden';
    //document.getElementById( 'noSavePopUpPanelButton'   ).style.visibility = 'hidden';
    document.getElementById( 'tweakDefaultButton'       ).style.visibility = 'hidden';
    //document.getElementById( 'submitFilenameButton'     ).style.visibility = 'hidden';
    document.getElementById( 'dataDisplayButton'        ).style.visibility = "hidden";
    
// I don't know why these are popping an error that they don't exist.... ??     
//document.getElementById( "PopupText"                ).style.visibility = "hidden";   
//document.getElementById( "loadedList"               ).style.visibility = "hidden";   
    
    //---------------------------------------------------------------------   
    // move focus to the canvas in case it had been on the popup input  
    //---------------------------------------------------------------------   
    document.getElementById( "Canvas" ).focus();     
}


//-------------------------
function closeAccountPanel()
{
    document.getElementById( 'cancelAccountPanelButton' ).style.visibility = "hidden";    
    document.getElementById( 'accountPanel'             ).style.visibility = "hidden";  
    document.getElementById( 'accountEmailInput'        ).style.visibility = "hidden";
    document.getElementById( 'accountPasswordInput'     ).style.visibility = "hidden";
    document.getElementById( 'submitAccountButton'      ).style.visibility = 'hidden';
    
    document.getElementById( 'accountButton'    ).style.visibility = "visible";      
    document.getElementById( 'loginButton'      ).style.visibility = "visible";      
}



//-------------------------
function closeErrorPanel()
{
    document.getElementById( 'PopUpPanelError'      ).style.visibility = "hidden";    
    document.getElementById( 'cancelErrorButton'    ).style.visibility = "hidden";    
}





//----------------------------------
function toggleSimulationRunning()
{
    if ( genePool.getSimulationRunning() )
    {
        genePool.setSimulationRunning( false ); 
        document.getElementById( "freezeButton" ).style.borderColor = ACTIVE_BORDER_COLOR;             
        document.getElementById( "freezeButton" ).style.borderWidth = "3px";   
    }
    else
    {
        genePool.setSimulationRunning( true ); 
        document.getElementById( "freezeButton" ).style = "border-color: " + DEFAULT_BASIC_BUTTON_BORDER_COLOR;          
    }
}

//----------------------------------
function toggleFastRendering()
{
    if ( _runningFast )
    {
        _runningFast = false;
        genePool.setMillisecondsPerUpdateToDefault();
        document.getElementById( "fastButton" ).style = "border-color: " + DEFAULT_BASIC_BUTTON_BORDER_COLOR;
    }
    else
    {
        _runningFast = true;
        genePool.setMillisecondsPerUpdate(0);
        document.getElementById( "fastButton" ).style.borderColor = ACTIVE_BORDER_COLOR;
        document.getElementById( "fastButton" ).style.borderWidth =  "3px";
    }
    updateAudioDisabledState();
}


//-------------------------
function toggleRendering()
{
    if ( genePool.getRendering() )
    {
        setRendering( false );
    }
    else
    {
        setRendering( true ); 
    }
}

//-------------------------
function setRendering(r)
{
    if ( r )
    {
        genePool.setRendering( true ); 
        //document.getElementById( "noRenderButton" ).style = "border-color: " + DEFAULT_BASIC_BUTTON_BORDER_COLOR      
        //document.getElementById( "noRenderButton" ).style.zIndex = '4';                     
        //document.getElementById( "noRenderButton" ).style.zIndex = '1';     
        
        
                        
        canvasID.style.visibility = 'visible';
        document.getElementById( "noRenderPanel" ).style.visibility = 'hidden';

        /*
        _runningFast = false;
        genePool.setMillisecondsPerUpdate( 20 );
        document.getElementById( "fastButton" ).style = "border-color: #666659;"                
        */
    }
    else
    {
        genePool.setRendering( false ); 
        //document.getElementById( "noRenderButton" ).style = "border-color: " + ACTIVE_BORDER_COLOR + ";"                     
        //document.getElementById( "noRenderButton" ).style.borderWidth =  "3px";   

        //document.getElementById( "noRenderButton" ).style.content = 'fdf';       
                

        //document.getElementById( "noRenderButton" ).style.zIndex = '4';                     
        canvasID.style.visibility = 'hidden';
        document.getElementById( "noRenderPanel" ).style.visibility = 'visible';
        
        /*
        _runningFast = true;
        genePool.setMillisecondsPerUpdate(0);
        document.getElementById( "fastButton" ).style = "border-color: " + ACTIVE_BORDER_COLOR + ";"
        */
    }
    updateAudioDisabledState();
}


//---------------------------
function toggleGoalOverlay()
{
    genePool.toggleGoalOverlay();
    
    if ( genePool.getRenderingGoals() )
    {
        document.getElementById( "viewGoalButton" ).style = "border-color: " + ACTIVE_BORDER_COLOR    
        document.getElementById( "viewGoalButton" ).style.borderWidth = "3px";   
    }
    else
    {
        document.getElementById( "viewGoalButton" ).style = "border-color: " + DEFAULT_BASIC_BUTTON_BORDER_COLOR;  
        //document.getElementById( "viewGoalButton" ).style.borderWidth = "1px";   
        //document.getElementById( "viewGoalButton" ).style.borderBottomWidth = "4px";   
    }
}




//-------------------------------
function clearViewMode()
{
    //console.log( "ui.js: clearViewMode");

    genePool.clearViewMode();
    clearViewModeButtons();
}


//-------------------------------
function clearViewModeButtons()
{
    //console.log( "clearViewModeButtons");

    document.getElementById( 'viewWholePoolButton'  ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR;  
    document.getElementById( 'viewAutoTrackButton'  ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 
    document.getElementById( 'viewSelectedButton'   ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 
    document.getElementById( 'viewMutualButton'     ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 
    document.getElementById( 'viewProlificButton'   ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 
    document.getElementById( 'viewEfficientButton'  ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 
    document.getElementById( 'viewVirginButton'     ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 
    document.getElementById( 'viewGluttonButton'    ).style.borderColor = DEFAULT_BASIC_BUTTON_BORDER_COLOR; 

    document.getElementById( 'viewWholePoolButton'  ).style.borderWidth = "1px";   
    document.getElementById( 'viewAutoTrackButton'  ).style.borderWidth = "1px";    
    document.getElementById( 'viewSelectedButton'   ).style.borderWidth = "1px";    
    document.getElementById( 'viewMutualButton'     ).style.borderWidth = "1px";    
    document.getElementById( 'viewProlificButton'   ).style.borderWidth = "1px";    
    document.getElementById( 'viewEfficientButton'  ).style.borderWidth = "1px";    
    document.getElementById( 'viewVirginButton'     ).style.borderWidth = "1px";    
    document.getElementById( 'viewGluttonButton'    ).style.borderWidth = "1px"; 

    document.getElementById( 'viewWholePoolButton'  ).style.borderBottomWidth = "4px";   
    document.getElementById( 'viewAutoTrackButton'  ).style.borderBottomWidth = "4px";    
    document.getElementById( 'viewSelectedButton'   ).style.borderBottomWidth = "4px";    
    document.getElementById( 'viewMutualButton'     ).style.borderBottomWidth = "4px";    
    document.getElementById( 'viewProlificButton'   ).style.borderBottomWidth = "4px";    
    document.getElementById( 'viewEfficientButton'  ).style.borderBottomWidth = "4px";    
    document.getElementById( 'viewVirginButton'     ).style.borderBottomWidth = "4px";    
    document.getElementById( 'viewGluttonButton'    ).style.borderBottomWidth = "4px"; 
    
    
}





//---------------------------------------
function setViewMode( buttonID, viewMode )
{
    //---------------------------
    // clear out the buttons...
    //---------------------------
    clearViewModeButtons();

    genePool.setViewMode( viewMode );
        
    closePopupPanel();		        

    if ( buttonID === 'viewSelectedButton' )
    {
        if ( genePool.getSelectedSwimbotID() != -1 )
        {
            document.getElementById( buttonID ).style = "border-color: " + ACTIVE_BORDER_COLOR    
            //document.getElementById( buttonID ).style.borderColor       = ACTIVE_BORDER_COLOR;             
            document.getElementById( buttonID ).style.borderWidth =  "3px";   
        }
    }
    else
    {
        document.getElementById( buttonID ).style = "border-color: " + ACTIVE_BORDER_COLOR    
        //document.getElementById( buttonID ).style.borderColor       = ACTIVE_BORDER_COLOR;             
        document.getElementById( buttonID ).style.borderWidth =  "3px";   
    }

}


//-------------------------------
function choosePoolToLoad( pool )
{
    // If we're transitioning out of an autopilot session, snapshot the current
    // pool to in-memory storage BEFORE _chosenPoolToLoad gets overwritten — so
    // the snapshot's _meta records the autopilot world's preset, not the one
    // the user is switching to. No-op outside an autopilot session.
    if ( typeof genePool !== 'undefined' && genePool.captureAutopilotSnapshot )
    {
        genePool.captureAutopilotSnapshot();
    }

    _chosenPoolToLoad = pool;
}


//------------------------------------
function requestToLoadPoolFromFile()
{
    /*
    if ( _username === "anonymous" )
    {   
        showAccountRequiredPopup( "Cannot load pool" );
    }
    else
    {
        //----------------------------------------
        // get the name of the pool to load...
        //----------------------------------------
        let poolText = "from file";

        //-----------------------------------------------
        // make the appropriate UI elements visible...
        //-----------------------------------------------
        document.getElementById( 'popUpPanel'               ).style.visibility = "visible";   
        document.getElementById( 'cancelPopUpPanelButton'   ).style.visibility = "visible";
        document.getElementById( 'savePopUpPanelButton'     ).style.visibility = "visible";   
        document.getElementById( 'noSavePopUpPanelButton'   ).style.visibility = "visible";   

        //-----------------------------------------------
        // ask the question...
        //-----------------------------------------------
        document.getElementById( 'popUpPanel' ).innerHTML 
        = "<br>" 
        + "Do you want to save the current pool" 
        + "<br>" 
        + "before loading " + poolText + "?";
    }
    */
    
}



//--------------------------------------
function requestToLoadPoolFromPreset()
{
    genePool.notifyUserInteraction();

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - _lastPresetRequestTS < PRESET_COOLDOWN_MS) {
        return false; // blocked by cooldown
    }
    _lastPresetRequestTS = now;

    console.log( "requestToLoadPool " + _chosenPoolToLoad );

    //----------------------------------------
    // get the name of the pool to load...
    //----------------------------------------
    let poolText = "(ERROR)";

         if ( _chosenPoolToLoad === SimulationStartMode.RANDOM       ) { poolText = "'random'";       }
    else if ( _chosenPoolToLoad === SimulationStartMode.NEIGHBORHOOD ) { poolText = "'neighborhood'"; }
    else if ( _chosenPoolToLoad === SimulationStartMode.FROGGIES     ) { poolText = "'froggies'";     }
    else if ( _chosenPoolToLoad === SimulationStartMode.TANGO        ) { poolText = "'tango'";        }
    else if ( _chosenPoolToLoad === SimulationStartMode.RACE         ) { poolText = "'race'";         }
    else if ( _chosenPoolToLoad === SimulationStartMode.BIG_BANG     ) { poolText = "'big bang'";     }
    else if ( _chosenPoolToLoad === SimulationStartMode.BAD_PARENTS  ) { poolText = "'bad parents'";  }
    else if ( _chosenPoolToLoad === SimulationStartMode.EMPTY        ) { poolText = "'empty'";        }

    // Immediately switch (no save prompt)
    switchToChosenPresetPool();
    updateUItitle(); 
    return true;
}




//----------------------------------
function switchToChosenPresetPool()
{
    //console.log( "switchToChosenPresetPool" );

    closePopupPanel();
    genePool.startSimulation( _chosenPoolToLoad ); 
    clearViewMode(); 
    updateEcosystemUI(); 
    _graph.initialize(); 
    setRendering( true );    
}


//--------------------------------
function loadSwimbotFromPreset(p)
{
    let genes = genePool.getPresetGenotype(p);
    genePool.createNewSwimbotWithGenes( genes );
}



//------------------------------------------------------
function setGeneTweakCategory( selectedSwimbotID, c )
{    
    _tweakGenesCategory = c;    
    updateGeneSliders( selectedSwimbotID );//
    //console.log( "_tweakGenesCategory = " + _tweakGenesCategory );
}


//---------------------------------------------
function tweakGene(swimbotIndex, sliderIndex) {
    const perCat = genePool.getNumGenesPerCategory();
    const NUM_GLOBAL = 2;
    const NUM_UTTER = (UTTERANCE_GENES_SLICE_END - UTTERANCE_GENES_SLICE_START);

    let geneIndex;
    if (sliderIndex < NUM_GLOBAL) {
        geneIndex = sliderIndex; // 0,1
    } else if (sliderIndex < NUM_GLOBAL + NUM_UTTER) {
        geneIndex = UTTERANCE_GENES_SLICE_START + (sliderIndex - NUM_GLOBAL); // 112..119
    } else {
        const withinCat = sliderIndex - (NUM_GLOBAL + NUM_UTTER);
        geneIndex = 2 + withinCat + perCat * _tweakGenesCategory; // category-mapped
    }

    // ...rest unchanged...
    const id = "geneTweaker" + sliderIndex;
    const input = document.getElementById(id);
    const geneValue = input.value;

    genePool.tweakGene(swimbotIndex, geneIndex, geneValue);

    const valueId = "gene" + sliderIndex + "Value";
    document.getElementById(valueId).innerHTML = geneValue;
}


//----------------------------
var _audioStatusTimer = null;

function updateAudioDisabledState() {
    const disabled = _runningFast || !genePool.getRendering();
    const notice = document.getElementById('audioDisabledNotice');
    const slider = document.getElementById('mixerMaster');
    if (notice) notice.style.display = disabled ? 'block' : 'none';
    if (slider) slider.disabled = disabled;
}

function openInfoPanel()
{
    document.getElementById( 'infoPanel' ).style.visibility = 'visible';
    document.getElementById( 'audioMixer' ).style.visibility = 'visible';
    updateAudioStatus();
    // Refresh status every 500ms while the audio tab is open
    clearInterval(_audioStatusTimer);
    _audioStatusTimer = setInterval(updateAudioStatus, 500);
}

function updateAudioStatus() {
    const el = document.getElementById('audioStatusPanel');
    if (!el) return;
    if (typeof SwimbotSynth === 'undefined' || !SwimbotSynth.isReady()) {
        el.innerHTML = '<span style="color:#c00;">Audio engine not initialized</span>';
        return;
    }
    const s = SwimbotSynth.getLoadingStatus();
    const irReady = (s.irLoaded === s.irTotal);
    const samplesReady = (s.samplesLoaded === s.samplesTotal);
    const wetPct = Math.round(s.reverbWet * 100);
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const midiToName = function(n) { return noteNames[n % 12] + Math.floor(n / 12 - 1); };
    const shiftedNote = BASE_NOTE + UNIVERSAL_NOTE_SHIFT;
    el.innerHTML =
        `<b>Voices:</b> <span id="audioVoiceCount">${SwimbotSynth.getActiveVoices()} / ${WEB_MAXIMUM_VOICES}</span><br>` +
        `<b>Reverb:</b> ${s.currentIR || 'none'} (wet ${wetPct}%)<br>` +
        `<b>Loop:</b> ${s.currentLoop ? s.currentLoop.replace('loop-','') : 'none'}<br>` +
        `<b>Interval:</b> ${CURRENT_INTERVAL_SET_NAME || 'none'}<br>` +
        `<b>Base Note:</b> ${midiToName(BASE_NOTE)} (MIDI ${BASE_NOTE})` +
        ` &nbsp; <b>Shift:</b> ${UNIVERSAL_NOTE_SHIFT >= 0 ? '+' : ''}${UNIVERSAL_NOTE_SHIFT} → ${midiToName(shiftedNote)}<br>` +
        `<b>IRs:</b> ${irReady ? '<span style="color:#090;">' + s.irTotal + ' loaded</span>' : `<span style="color:#c80;">${s.irLoaded}/${s.irTotal}</span>`}` +
        ` &nbsp; <b>Samples:</b> ${samplesReady ? '<span style="color:#090;">' + s.samplesTotal + ' loaded</span>' : `<span style="color:#c80;">${s.samplesLoaded}/${s.samplesTotal}</span>`}<br>` +
        `<b>Autopilot:</b> ${AUTOPILOT_MODE ? '<span style="color:#c00;">active</span>' : `at ${Math.round(USER_INACTION_TIME_OUT / 60)}m inactivity`} with ${Math.round(AUTOPILOT_VOLUME_REDUCTION * 100)}% vol. decrease`;
}





//-----------------------
function updateUI()
{
    //console.log( "updateUI" );
    
    //-----------------------------------------------------------------------------------
    // check that we have a genePool......
    //-----------------------------------------------------------------------------------
    let genePoolIsDefined = typeof genePool != 'undefined';
    
    if ( genePoolIsDefined )
    {    
        //-----------------------------------------------------------------------------------
        // update the view buttons...
        //-----------------------------------------------------------------------------------
        //console.log( "ui.js: updateUI: genePool.getViewMode() = " + genePool.getViewMode() ); 
    
        if ( genePool.getViewMode() === ViewTrackingMode.NULL )
        {
            clearViewModeButtons();
        }
            
        // compute sim step rate
        const _nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const _curStep = genePool.getTimeStep();
        
        if (_rate_lastTSms) {
          const dtMs = Math.max(1, _nowMs - _rate_lastTSms);
          const dStep = _curStep - _rate_lastStep;
          _stepsPerSecond = (dStep * 1000) / dtMs; // steps / second
        }
        _rate_lastTSms = _nowMs;
        _rate_lastStep = _curStep;


        //-----------------------------------------------------------------------------------
        // update the swimbot panel....
        //-----------------------------------------------------------------------------------
        if ( document.getElementById( 'swimbotPanel' ).style.visibility === 'visible' )
        {
        
//console.log( "OKAY OKAY OKAY OKAY " );        
        
            let selectedSwimbot = genePool.getSelectedSwimbotID();
        
            if ( selectedSwimbot === NULL_INDEX )
            {
                // console.log( "selectedSwimbot = NULL_INDEX" );
                document.getElementById( 'selectedSwimbotPanel'   ).style.visibility = 'hidden';		        	        
                document.getElementById( 'noSelectedSwimbotPanel' ).style.visibility = 'visible';	        	        
            }
            else
            {
                // console.log( "selectedSwimbot = " + selectedSwimbot );
                document.getElementById( 'selectedSwimbotPanel'   ).style.visibility = 'visible';		        	        
                document.getElementById( 'noSelectedSwimbotPanel' ).style.visibility = 'hidden';	
            
                let brainState = genePool.getSwimbotBrainState( selectedSwimbot );
                let mateString = genePool.getSwimbotChosenMate( selectedSwimbot ).toString();
                let nickName = genePool.getSwimbotNickname( selectedSwimbot );
                let goalDescription = "";

                     if ( brainState ===  BRAIN_STATE_RESTING            ) { goalDescription = "resting";                       }
                else if ( brainState ===  BRAIN_STATE_LOOKING_FOR_MATE   ) { goalDescription = "looking for mate";              }
                else if ( brainState ===  BRAIN_STATE_PURSUING_MATE      ) { goalDescription = "pursuing mate " + mateString;   }
                else if ( brainState ===  BRAIN_STATE_LOOKING_FOR_FOOD   ) { goalDescription = "looking for food bit";          }
                else if ( brainState ===  BRAIN_STATE_PURSUING_FOOD      ) { goalDescription = "pursuing food bit";             }
                
                let foodPreferenceText = "green";
                let foodTypeText       = "green";

                if ( genePool.getSwimbotPreferredFoodType ( selectedSwimbot ) === 1 ) { foodPreferenceText = "blue"; }
                if ( genePool.getSwimbotDigestibleFoodType( selectedSwimbot ) === 1 ) { foodTypeText       = "blue"; }
            
                document.getElementById( 'swimbotDataPanel' ).innerHTML
                = "<b>Info about " + nickName + ":</b>"
                + "<br>"
                + "<br>"
                + "ID = " + genePool.getSwimbotIndex( selectedSwimbot ).toString()
                + "<br>"
                + "age = " + genePool.getSwimbotAge( selectedSwimbot ).toString()
                + "<br>"
                + "goal = " + goalDescription
                + "<br>"
                + "is uttering = " + genePool.getSwimbotIsUttering ( selectedSwimbot )
                + "<br>"
                + "utter period = " + genePool.getSwimbotUtterPeriod ( selectedSwimbot )
                + "<br>"
                + "utter duration = " + genePool.getSwimbotUtterDuration ( selectedSwimbot )
                + "<br>"
                + "food type preference = " + foodPreferenceText
                + "<br>"
                + "best-digested food type = " + foodTypeText
                + "<br>"
                + "number of food bits eaten = " + Math.floor( genePool.getSwimbotNumFoodBitsEaten( selectedSwimbot ).toString() )
                + "<br>"
                + "energy = " + Math.floor( genePool.getSwimbotEnergy( selectedSwimbot ).toString() )
                + "<br>"
                + "sexual attraction = " + genePool.getSwimbotAttractionDescription( selectedSwimbot )
                + "<br>"
                + "number of offspring = " + Math.floor( genePool.getSwimbotNumOffspring( selectedSwimbot ).toString() );
            }              
        }


        //-----------------------------------------------------------------------------------
        // always update the graph....
        //-----------------------------------------------------------------------------------
        if ( genePoolIsDefined )
        {    
            _graph.update( genePool.getTimeStep(), genePool.getNumSwimbots(), genePool.getNumFoodBits() );
            SwimbotStats.recordPopulation( genePool.getTimeStep(), genePool.getNumSwimbots(), genePool.getNumFoodBits() );
            // _graph.update( genePool.getTimeStep(), genePool.getNumSwimbots(), genePool.getNumFoodBits() , genePool.getNumFoodBits1() );
        }
    
        //-----------------------------------------------------------------------------------
        // render the graph....
        //-----------------------------------------------------------------------------------
        if ( document.getElementById( 'graphPanel' ).style.visibility === 'visible' )
        {
            document.getElementById( 'graphData' ).innerHTML
            = "<span>time step:</span> " + _curStep
            + " @ " + _stepsPerSecond.toFixed(1) + "/s"
            + "<br>"
            + "<span>swimbots:</span> " + genePool.getNumSwimbots()
            + "<br>"
            + "<span>food bits:</span> " + genePool.getNumFoodBits()
            + "<br><br>"
            + "uttering / uttering in view: " + genePool.getNumUttering() + "/" + genePool.getNumUtteringInView();
            
            _graph.render();
        }
    }
    
    //---------------------------
    // trigger next update...
    //---------------------------
    //this.timer = setTimeout( "updateUI()", 100 );
    setTimeout( "updateUI()", UI_UPDATE_PERIOD );
}	


//----------------------------------------
function notifyGeneTweakPanelMouseDown()
{ 
    let selectedSwimbotID = genePool.getSelectedSwimbotID();
    
    if ( selectedSwimbotID === -1 )
    {
        // console.log( "NULL" );
        closeTweakGenesPanel();
    }
    else
    {
        if ( document.getElementById( 'tweakGenesPanel' ).style.visibility === 'visible' )
        {		        	        
            console.log( selectedSwimbotID );
            openTweakGenesPanel( selectedSwimbotID );
        }
    }
}




// show a brief, fading modal notice (message) for (messageMS) duration -- without blocking interaction
// use offsetVh e.g. 10 or -10 to shift vertical position
let _modalNoticeTimer = null;
function flashNotice(message, messageMS = 1500, offsetVh = 0) {
    const id = 'devpanelNotice';
    let container = document.getElementById(id);

    if (!container) {
        container = document.createElement('div');
        container.id = id;
        Object.assign(container.style, {
            position: 'fixed',
            inset: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '3000',
            background: 'rgba(0,0,0,0.35)',   // dim backdrop
            pointerEvents: 'none',            // don’t block clicks
            opacity: '0',
            transition: 'opacity 400ms ease'
        });

        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.transform = offsetVh ? `translateY(${offsetVh}vh)` : '';
        Object.assign(msg.style, {
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: '22px',
            lineHeight: '1.4',
            color: '#fff',
            background: 'rgba(20,24,28,0.92)',
            padding: '14px 18px',
            borderRadius: '8px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.15)',
            maxWidth: '86vw',
            textAlign: 'center'
        });

        container.appendChild(msg);
        document.body.appendChild(container);
        // force layout so the transition will run
        void container.offsetWidth;
    }

    // show
    container.style.opacity = '1';

    // reset any prior timers
    if (_modalNoticeTimer) clearTimeout(_modalNoticeTimer);

    // hold briefly, then fade and remove
    _modalNoticeTimer = setTimeout(() => {
        container.style.opacity = '0';
        const cleanup = () => {
            container.removeEventListener('transitionend', cleanup);
            if (container.parentNode) container.parentNode.removeChild(container);
        };
        container.addEventListener('transitionend', cleanup);
    }, messageMS); // visible duration (ms)
}




function resize()
{ 
    const HOLE_MARGIN = 20; // total pixels to keep from top+bottom (≈2px each)
    let masterPanel = document.getElementById("masterPanel");
    let masterIsDisplayed = window.getComputedStyle(masterPanel).display;
    // Canvas fills/centers across the full viewport in BOTH modes (dev panel floats on top).
    // Fullscreen sizing + circle crop must stay pixel-identical, so width === innerWidth here too.
    let width  = window.innerWidth;
    let height = window.innerHeight;

    // hide circle mask when master panel is shown; show otherwise
    let viewHole = document.getElementById('viewHole');
    viewHole.style.display = (masterIsDisplayed !== "none") ? "none" : "block";

    // make the hole nearly full height; updates CSS var used by the mask
    let holeDiameter = Math.max(0, height - HOLE_MARGIN);
    document.documentElement.style.setProperty('--mask-diameter', holeDiameter + 'px');

    // Recompute the kiosk-stats arc (curved text just outside the top of the mask).
    // Done here so it tracks viewport changes; updated even when overlay is hidden so
    // that toggling it on shows the right shape immediately.
    const arcPathEl = document.getElementById('kioskArcPath');
    if (arcPathEl) {
        const KIOSK_ARC_RADIUS_OFFSET  = -10;   // px outside the mask (negative = inside)
        const KIOSK_ARC_HALF_ANGLE_DEG = 70;  // arc spans 2x this around 12 o'clock
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;
        const r  = holeDiameter / 2 + KIOSK_ARC_RADIUS_OFFSET;
        // 270° is the top of the circle in SVG coords (y grows downward).
        const a1 = (270 - KIOSK_ARC_HALF_ANGLE_DEG) * Math.PI / 180; // upper-left
        const a2 = (270 + KIOSK_ARC_HALF_ANGLE_DEG) * Math.PI / 180; // upper-right
        const sx = cx + r * Math.cos(a1), sy = cy + r * Math.sin(a1);
        const ex = cx + r * Math.cos(a2), ey = cy + r * Math.sin(a2);
        // sweep-flag 1 = clockwise (increasing angle) → traverses through 12 o'clock,
        // which keeps text reading left-to-right with letters right-side-up.
        arcPathEl.setAttribute('d',
            `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    }

    // canvasID.width  = width;
    canvasID.width  = height; // for Kyoto style projection, always have a square canvas
    canvasID.height = height;

    // center the canvas horizontally
    const left = Math.max(0, Math.floor((width - canvasID.width) / 2));

    // ensure left offset affects offsetLeft math in your mouse handlers
    canvasID.style.position = 'absolute';
    canvasID.style.left     = left + 'px';
    canvasID.style.top      = '0px';

    if (typeof genePool != 'undefined') {    
        genePool.setCanvasDimensions(canvasID.width, canvasID.height);  
    }
}


/********************
/* CANVAS DRAGGING
/* when DEVELOPER_MODE = true, then rely on typical mouse behavior: click to start dragging, then drag, let go to start dragging
/* when DEVELOPER_MODE = false, then we can assume we are in pointerlock mode (see doToggleDeveloperMode) and instead mouse movement
/* always causes camera movement, regardless of mousedown status. in this case, there's no top/bottom/left/right edges of the screen
/* that stop mouse movement. you can infinitely mouse up to keep moving the canvas up.
/* also, when we are in non-developer (pointerlock) mode, we invert movement. mouse up=down, left=right, etc.
// pointerlock example code: https://mdn.github.io/dom-examples/pointer-lock/app.js
/*******************/

//------------------------------------------------------------
const _canvasEl = document.getElementById('Canvas');

// Classic dev-mode drag start OR request pointer lock if in kiosk mode
_canvasEl.onmousedown = function(e) {
    // left button only
    if (e.button !== 0) return;
    e.preventDefault();

    clearViewMode();
    if (typeof genePool === "undefined") return;

    if (DEVELOPER_MODE) {
        // classic click-to-drag
        const x = e.pageX - _canvasEl.offsetLeft;
        const y = e.pageY - _canvasEl.offsetTop;
        genePool.touchDown(x, y);
    } else {
        // *****************************************************************
        // when in full-screen mode, clicking will spawn a random swimbot!
        // (unless we need to re-grab pointer lock)
        // *****************************************************************
        
        if (!_pointerLocked) {
            // use this click to (re)enter pointer lock; don't spawn yet
            enterPointerLock();
            return;
        }
        // make a swimbot (true) means make it, but also trigger a spawn sound
        
        genePool.notifyUserInteraction();
        
        // true,true means yes make a sound, yes murder a living swimbot to make room for a fresh one if necessary
        genePool.makeNewRandomSwimbot(true, true);
    }

    notifyGeneTweakPanelMouseDown();
};

// Continuous move: in dev mode use absolute coords; in kiosk use deltas
document.addEventListener('mousemove', function(e) {
    if (typeof genePool === "undefined") return;

    if (DEVELOPER_MODE) {
        // only move while mouse is down (your engine internally tracks down state)
        const x = e.pageX - _canvasEl.offsetLeft;
        const y = e.pageY - _canvasEl.offsetTop;
        genePool.touchMove(x, y);
    } else if (_pointerLocked && _draggingWithLock) { /*** TRACKBALL MODE! ***/
        // pointer-lock mode: feed the raw relative trackball deltas straight into
        // the velocity-based camera drag (inverted axes). No virtual cursor, no
        // canvas-bounds clamp — so panning is unbounded in every direction at any
        // zoom. (The old clamped-virtual-cursor approach saturated at an edge,
        // which when zoomed in killed panning long before you'd moved far.)
        const dx = -(e.movementX || 0) * LOCK_GAIN;
        const dy = -(e.movementY || 0) * LOCK_GAIN;
        genePool.panByDelta(dx, dy);
    }
});

// Dev-mode drag end; in kiosk mode, ignore (lock session is continuous)
_canvasEl.onmouseup = function(e) {
    if (typeof genePool === "undefined") return;
    if (DEVELOPER_MODE) {
        const x = e.pageX - _canvasEl.offsetLeft;
        const y = e.pageY - _canvasEl.offsetTop;
        genePool.touchUp(x, y);
    }
};

_canvasEl.onmouseout = function(e) {
    if (typeof genePool === "undefined") return;
    if (DEVELOPER_MODE) {
        const x = e.pageX - _canvasEl.offsetLeft;
        const y = e.pageY - _canvasEl.offsetTop;
        genePool.touchOut(x, y);
    }
};

// allow mouse wheel to control scroll while in fullscreen mode
let _wheelZoomTimer = null;
_canvasEl.addEventListener('wheel', function(e) {
    if (typeof genePool === "undefined") return;
    if (DEVELOPER_MODE) return; // only active in fullscreen/pointerlock mode
    e.preventDefault();
    const action = e.deltaY < 0 ? CameraNavigationAction.IN : CameraNavigationAction.OUT;
    genePool.startCameraNavigation(action);
    clearTimeout(_wheelZoomTimer);
    _wheelZoomTimer = setTimeout(() => genePool.stopCameraNavigation(), 150);
}, { passive: false });

/* Set the panel title to include the version number and the current simulation (ID) */
function updateUItitle() {
  document.getElementById("mainTitle").textContent = "Darwin's Chorus v. " + SWIMBOT_VERSION + " (" + _chosenPoolToLoad + ")";
}


//--------------------------------
// key down / button presses
//--------------------------------
document.onkeydown = function(e)
{
    e = e || window.event;
    
    // Ignore all keyboard shortcuts before the initial launch
    if (!window._hasLaunched) return;

    // genePool is assigned in an inline script in index.html; a keypress
    // before that runs would otherwise throw "genePool is not defined".
    if (typeof genePool === "undefined") return;

    _keysDown.add(e.keyCode);

    //-----------------------------
    // keys for camera navigation
    //-----------------------------
    let cameraNavAction = -1;
    
    if ( e.keyCode ===  37 ) // left arrow key
    { 
        cameraNavAction = CameraNavigationAction.LEFT;                 
    } 
    
    if ( e.keyCode ===  39 ) { cameraNavAction = CameraNavigationAction.RIGHT;   } // right arrow key
    if ( e.keyCode ===  38 ) { cameraNavAction = CameraNavigationAction.UP;      } // up arrow key
    if ( e.keyCode ===  40 ) { cameraNavAction = CameraNavigationAction.DOWN;    } // down arrow key
    if ( e.keyCode ===  61 ) { cameraNavAction = CameraNavigationAction.IN;      } // plus key
    if ( e.keyCode === 173 ) { cameraNavAction = CameraNavigationAction.OUT;     } // minus key

    //apparently, Chrome and Safari  use different key codes...
    if ( e.keyCode === 187 ) { cameraNavAction = CameraNavigationAction.IN;      } // plus key
    if ( e.keyCode === 189 ) { cameraNavAction = CameraNavigationAction.OUT;     } // minus key

    if ( e.keyCode === 48 ) { genePool.panCameraToPresetSwimbot(0); } // numbers 0 to 9 pan to swimbots nos. 0-9
    if ( e.keyCode === 49 ) { genePool.panCameraToPresetSwimbot(1); }
    if ( e.keyCode === 50 ) { genePool.panCameraToPresetSwimbot(2); }
    if ( e.keyCode === 51 ) { genePool.panCameraToPresetSwimbot(3); }
    if ( e.keyCode === 52 ) { genePool.panCameraToPresetSwimbot(4); }
    if ( e.keyCode === 53 ) { genePool.panCameraToPresetSwimbot(5); }
    if ( e.keyCode === 54 ) { genePool.panCameraToPresetSwimbot(6); }
    if ( e.keyCode === 55 ) { genePool.panCameraToPresetSwimbot(7); }
    if ( e.keyCode === 56 ) { genePool.panCameraToPresetSwimbot(8); }
    if ( e.keyCode === 57 ) { genePool.panCameraToPresetSwimbot(9); }    
    
    if ( cameraNavAction != -1 )
    {
        if ( ! genePool.getCameraNavigationActive( cameraNavAction ) ) 
        { 
            genePool.startCameraNavigation( cameraNavAction );
            clearViewMode(); 
        }
    }
    
    if ( e.keyCode === 68 ) // D key — tap cycles kiosk modes; hold 1500ms acts like X
    {
        if (!e.repeat) {                       // genuine press, ignore auto-repeat
            _dKeyLongFired = false;
            clearTimeout(_dKeyHoldTimer);
            _dKeyHoldTimer = setTimeout(function() {
                _dKeyLongFired = true;
                doToggleFullscreen();
            }, 1500);
        }
    }

    if ( e.keyCode === 88 ) // X key — toggle fullscreen kiosk <-> dev panel
    {
        doToggleFullscreen();
    }

    if ( e.keyCode === 65 ) // A key — engage autopilot immediately (bypasses USER_INACTION_TIME_OUT)
    {
        genePool.engageAutopilot();
        flashNotice("Autopilot engaged.", 1200);
    }


    if ( e.keyCode === 75 ) // K key — toggle keyboard guide (splash screen)
    {
        e.preventDefault();
        let splash = document.getElementById('splashOverlay');
        if (splash) {
            if (splash.style.display === 'none') {
                splash.style.display = 'flex';
                // Hide launch-related elements when showing guide post-launch
                let btn = document.getElementById('splashLaunchBtn');
                let status = document.getElementById('splashLoadingStatus');
                let mWarn = document.getElementById('mobileWarning');
                let fWarn = document.getElementById('splashFileWarning');
                if (btn) btn.style.display = 'none';
                if (status) status.style.display = 'none';
                if (mWarn) mWarn.style.display = 'none';
                if (fWarn) fWarn.style.display = 'none';
            } else {
                splash.style.display = 'none';
            }
        }
    }
    
    /*
    if ( e.keyCode === 67 ) // C key to clone a swimbot
    { 
        let selectedSwimbot = genePool.getSelectedSwimbotID();
        if ( selectedSwimbot != -1 )
        {
            genePool.cloneSwimbot( selectedSwimbot ); 
        } 
    }
    */
    
    
    //---------------------------
    // LAUNCH SIMULATIONS
    //---------------------------


    // ---- preset loaders ----
    // Q -> EMPTY
    if (e.keyCode === 81) { // Q
        e.preventDefault();
        choosePoolToLoad(SimulationStartMode.EMPTY);
        requestToLoadPoolFromPreset();
        flashNotice("Press 🟢 button to create Swimbots.", 3000, 0);
    }
    // W -> QUARTET
    if (e.keyCode === 87) { // W
        e.preventDefault();
        choosePoolToLoad(SimulationStartMode.QUARTET);
        requestToLoadPoolFromPreset();
        // flashNotice("Invasion!", 2250, -20);
    }
    // E -> FLOCKS
    if (e.keyCode === 69) { // E
        e.preventDefault();
        choosePoolToLoad(SimulationStartMode.FLOCKS);
        requestToLoadPoolFromPreset();
        // flashNotice("Six flocks of Swimbots", 2250, -10);
    }
    // R -> RADIAL
    if (e.keyCode === 82) { // R
      if (e.metaKey || e.ctrlKey) return; // allow Command+R (mac) / Ctrl+R (win/linux) to refresh
      e.preventDefault();
      choosePoolToLoad(SimulationStartMode.RADIAL);
      requestToLoadPoolFromPreset();
      // flashNotice("Radial", 1800, -10);    
    }
    // T -> BIG BANG
    if (e.keyCode === 84) { // T
        e.preventDefault();
        choosePoolToLoad(SimulationStartMode.BIG_BANG);
        requestToLoadPoolFromPreset();
        // flashNotice("Big Bang (" + INITIAL_NUM_SWIMBOTS + " Swimbots)", 3000, -10);
    }

    // 🤖 Chord: R + T held together behaves exactly like pressing A (autopilot).
    // Runs after the q/w/e/r/t launches so engageAutopilot's relaunch wins.
    /*
    if (!e.repeat && _keysDown.has(82) && _keysDown.has(84)) { // 82=R, 84=T
        genePool.engageAutopilot();
        console.log('Chorded keys R+T, engaging autopilothttp://127.0.0.1:8076/');
    }
    */
    
        // Z -> DEMO / TEST MODE
    if (e.keyCode === 90) { // Z toggles DEMO_MODE on and off
      e.preventDefault();
  
      // clear any prior interval (defensive)
      if (document.onkeydown.__demoTimer) {
          clearInterval(document.onkeydown.__demoTimer);
          document.onkeydown.__demoTimer = null;
      }
  
      if (DEMO_MODE) {
          DEMO_MODE = false;
          flashNotice("Demo mode OFF", 1200, 0);
      } else {
          DEMO_MODE = true;
          let demoRotateSeconds = 30;
          let demoRotateMs = demoRotateSeconds * 1000; // ms
  
          // choose from any of our sets
          const ROT = ['EMPTY','QUARTET','FLOCKS','RADIAL','BIG_BANG','AUTOPILOT']
              .map(k => SimulationStartMode[k])
              .filter(v => v !== undefined);
  
          // immediate launch
          (() => {
              flashNotice("Demo mode rotating every "+demoRotateSeconds+" seconds. Press Z to stop.", 5000, 0);
              choosePoolToLoad(ROT[0]);
              requestToLoadPoolFromPreset();
          })();
  
          // repeat every 30s
          document.onkeydown.__demoTimer = setInterval(() => {
              const idx = Math.floor(Math.random() * ROT.length);
              choosePoolToLoad(ROT[idx]);
              requestToLoadPoolFromPreset();
              flashNotice("Demo mode no. " + idx + ". Z to stop.", 2000, 0);

          }, demoRotateMs);
      }
    } // end Z DEMO MODE

                            
    //console.log( "onkeydown " + e.keyCode );
}

//------------------------------
document.onkeyup = function(e)
{
    e = e || window.event;

    // genePool is assigned in an inline script in index.html; a key released
    // before that runs would otherwise throw "genePool is not defined".
    if (typeof genePool === "undefined") return;

    _keysDown.delete(e.keyCode);

    if ( e.keyCode === 68 ) // D key release — short tap cycles kiosk modes (hold already acted like X)
    {
        clearTimeout(_dKeyHoldTimer);
        if (!_dKeyLongFired) doToggleDeveloperMode();
        _dKeyLongFired = false;
    }

    genePool.stopCameraNavigation();
    genePool.stopCameraNavigation();
    genePool.stopCameraNavigation();
    genePool.stopCameraNavigation();
    genePool.stopCameraNavigation();
    genePool.stopCameraNavigation();
};

/* Hide / show developer panel and implement circular mask and engage/disengage pointerlock mode  */
// D key: 3-way cycle through the fullscreen kiosk modes only — never exits to the
// dev panel. KIOSK -> KIOSK+stats -> KIOSK+stats+brainstates -> KIOSK ...
// (Entering from the dev panel lands on plain KIOSK.) Use doToggleFullscreen (X) to
// get back to the dev panel.
function doToggleDeveloperMode (showHint) {
    if (DEVELOPER_MODE)                                   _setUiMode('kiosk', showHint);
    else if (!_kioskStatsOn)                              _setUiMode('kioskStats', false);
    else if (!genePool.getRenderingGoals())               _setUiMode('kioskStatsBrains', false);
    else                                                  _setUiMode('kiosk', false);
    return false;
}

// X key: 2-way toggle between the dev panel and plain fullscreen kiosk mode.
function doToggleFullscreen (showHint) {
    if (DEVELOPER_MODE) _setUiMode('kiosk', showHint);
    else                _setUiMode('dev', false);
    return false;
}

function _setUiMode(mode, showHint) {
    const masterPanel = document.getElementById('masterPanel');
    const overlay     = document.getElementById('kioskStatsOverlay');
    const wasDev      = DEVELOPER_MODE;

    if (mode === 'dev') {
        masterPanel.style.display = 'block';
        DEVELOPER_MODE = true;
        if (overlay) overlay.style.display = 'none';
        _kioskStatsOn = false;
        exitPointerLock();
    } else {
        // 'kiosk', 'kioskStats', 'kioskStatsBrains' — all hide masterPanel and engage pointer lock
        masterPanel.style.display = 'none';
        DEVELOPER_MODE = false;
        if (wasDev) {
            genePool.deselectSwimbot();
            if (showHint) flashNotice("Key 'X' toggles developer panel.", 1400);
            enterPointerLock();
        }
        const wantStats = (mode === 'kioskStats' || mode === 'kioskStatsBrains');
        if (overlay) overlay.style.display = wantStats ? 'block' : 'none';
        _kioskStatsOn = wantStats;
        if (wantStats) {
            _ensureStatusTimer();   // drives the curved readout
            updatePoolStatus();     // paint immediately, don't wait 250ms
        }
    }

    // Brainstates overlay — only on in mode 'kioskStatsBrains'. genePool.toggleGoalOverlay()
    // is a toggle (not a setter), so flip it only if current state doesn't match the target.
    const wantBrains = (mode === 'kioskStatsBrains');
    if (genePool.getRenderingGoals() !== wantBrains) {
        toggleGoalOverlay(); // also updates the dev-panel button styling
    }

    _stopStatusTimerIfUnused();
    resize();
}
