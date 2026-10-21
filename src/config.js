/* ===========================================================================
   MORCHA :: NIGHT VIGIL  —  DOCTRINE & SCENARIO CONFIGURATION
   ---------------------------------------------------------------------------
   THIS FILE IS FOR INSTRUCTORS. Everything below is doctrine, not code.
   The simulation mechanics are built to obey whatever you put here.

   >> The escalation ladder, ROE thresholds and timings below are a REASONABLE
   >> PLACEHOLDER built for the training mechanic. They are NOT certified SOP.
   >> Your unit's training officer must review and correct these values against
   >> the current BSF SOP / Rules of Engagement before this is used to assess
   >> any trainee. Change the numbers here — nothing else needs touching.
   =========================================================================== */

const DOCTRINE = {

  /* --- The escalation ladder -------------------------------------------
     Each rung must be completed before the rungs below it are permitted.
     'skipPenalty' is applied if a trainee jumps to this rung early.        */
  ladder: [
    { id:'OBSERVE',   key:'—',     label:'Observe & maintain contact',      skipPenalty:0   },
    { id:'REPORT',    key:'R',     label:'Report grid to Coy HQ',           skipPenalty:15  },
    { id:'CHALLENGE', key:'C',     label:'Challenge — "Halt! Kaun hai?"',   skipPenalty:20  },
    { id:'ILLUM',     key:'F / L', label:'Illuminate (searchlight / flare)',skipPenalty:5   },
    { id:'QRT',       key:'Q',     label:'Dispatch QRT to reported grid',   skipPenalty:10  },
    { id:'WARNING',   key:'SPACE', label:'Warning shot — fired high',       skipPenalty:40  },
    { id:'ENGAGE',    key:'V',     label:'Aimed fire — engage',             skipPenalty:100 }
  ],

  /* --- Rules of engagement gates ---------------------------------------- */
  roe: {
    // Aimed fire is only lawful if ALL of these are true for the contact:
    engageRequires: {
      reported:        true,   // grid passed to Coy HQ
      challenged:      true,   // loudhailer challenge given
      identifiedArmed: true,   // weapon actually observed on the contact
      insideFence:     false   // false = may engage in no-man's land too
    },
    // Rounds must not cross the International Boundary. Anything still BEYOND
    // the zero line is on Pakistani soil, whatever it is doing. Firing there is
    // a cross-border incident, not an engagement — and the Rangers BOPs that
    // are plainly visible across the line are precisely what is behind it.
    noFireBeyondZeroLine: true,
    crossBorderFireResult: 'CROSS-BORDER FIRING INCIDENT',
    // Firing on an unarmed / civilian contact:
    civilianFireResult: 'COURT_OF_INQUIRY',   // hard fail, outranks a breach
    // Firing on our own patrol on the home side of the wire:
    fratricideResult: 'FRATRICIDE',
    // Warning shot without a prior challenge:
    unchallengedWarningPenalty: 40
  },

  /* --- Timings (seconds) ------------------------------------------------- */
  timing: {
    shiftDuration:      300,   // 5 minutes — one compressed vigil
    qrtTransitTime:      42,   // QRT transit — still longer than a crossing takes
    qrtCooldown:         22,
    challengeWindow:      8,
    searchlightBattery:  42,   // total seconds of searchlight for the shift
    searchlightCooldown: 10,
    flareBurnTime:       10,
    nvgBloomRecovery:     4    // seconds blind after a flare hits NVG
  },

  /* --- Finite stores ------------------------------------------------------ */
  stores: { flares: 3, qrtDispatches: 3, warningShots: 6 },

  /* --- Scoring ------------------------------------------------------------ */
  scoring: {
    detectionExcellent:  40,   // detected while still beyond the zero line
    detectionGood:       25,   // detected in no-man's land
    detectionLate:        8,   // detected at the fence
    breachPenalty:     -120,   // one infiltrator through = shift is a failure
    falseQrtPenalty:    -25,
    correctApprehension: 60,
    civilianHarm:      -500,   // Court of Inquiry
    crossBorderFire:   -450,   // rounds across the IB
    fratricide:        -800,   // own troops
    ownTroopsCorrect:   20,    // correctly identified the patrol and held
    passMark:           200
  },

  /* --- Environment ---------------------------------------------------------
     Punjab / Jammu International Border — Anti-Infiltration Obstacle System   */
  world: {
    fenceZ:        -150,   // AIOS fence line, metres from the morcha
    zeroLineZ:     -300,   // international boundary
    treelineZ:     -620,   // scrub / village edge across the line
    fenceWidth:     900,   // visible frontage
    floodlightGap:   55,   // metres between fence floodlights
    deadFloodlights:[4,5,9],// which floodlights are u/s — the DARK GAPS (all inside the arc)
    culvertX:       -95,   // nallah / culvert crossing point (a known weak point)
    arcLimit:        58,   // the post's ASSIGNED arc, degrees either side of centre.
                           // The embrasure jambs enforce it. Flanking morchas hold the rest.
    patrolZ:       -133,   // the home-side patrol track
    grassTufts:    52000,  // sampled by bearing/range, see world.js buildGrass()
    windDir:        0.75,  // radians — trainees must read sway AGAINST this
    windStrength:   0.55
  },

  /* --- TIME IS COMPRESSED -------------------------------------------------
     A real night crawl is ~0.3 m/s over hours. The shift here is 12 minutes,
     so approach speeds below are scaled so that an UNDETECTED infiltrator
     reaches the wire in roughly 3 minutes. Detection windows, not speeds,
     are the thing being trained. Scale all six together if you re-time it.  */

  /* --- Contact classes -----------------------------------------------------
     heat  = thermal signature      armed = weapon observable in binos/NVG     */
  classes: {
    INFILTRATOR: { label:'INFILTRATOR', heat:0.92, armed:true,  speed:2.95, stance:'PRONE',
                   hostile:true,  colour:0xff4444, desc:'Armed. Prone crawl. Freezes when observed.' },
    SMUGGLER:    { label:'SMUGGLER',    heat:0.88, armed:false, speed:3.20, stance:'CROUCH',
                   hostile:true,  colour:0xffaa33, desc:'Unarmed, carrying a bundle. Runs if challenged.' },
    CIVILIAN:    { label:'CIVILIAN',    heat:0.90, armed:false, speed:1.10, stance:'STAND',
                   hostile:false, colour:0x44ff88, desc:'Farmer near the zero line. Answers a challenge.' },
    CATTLE:      { label:'CATTLE',      heat:0.74, armed:false, speed:0.90, stance:'QUAD',
                   hostile:false, colour:0x66aaff, desc:'Stray cattle. Heavy thermal return — classic false alarm.' },
    NILGAI:      { label:'NILGAI',      heat:0.70, armed:false, speed:2.20, stance:'QUAD',
                   hostile:false, colour:0x66aaff, desc:'Bolts unpredictably. Disturbs grass exactly like a crawler.' },
    DOG:         { label:'STRAY DOG',   heat:0.62, armed:false, speed:1.80, stance:'QUAD',
                   hostile:false, colour:0x8888ff, desc:'Small signature. Wastes your flares.' },
    // Our own men, on our own side of the wire, walking the patrol track.
    // Armed, upright, moving with purpose — and a trainee who has been staring
    // into the far scrub for ten minutes will absolutely designate them.
    OWN_TROOPS:  { label:'OWN TROOPS',  heat:0.91, armed:true,  speed:1.35, stance:'STAND',
                   hostile:false, own:true, colour:0x44ddff,
                   desc:'BSF patrol on the home side of the wire. Answers with the password.' }
  },

  /* --- Scenario ------------------------------------------------------------
     t = seconds into the shift.  x = metres left(-)/right(+) of the morcha.
     'route' : FENCE_GAP | CULVERT | OPEN
     'decoy' : true  => this contact exists to pull the trainee off-axis        */
  waves: [
    /* Timed against a ~142 s approach (see entities.js spawn band) so that every
       hostile that is NOT dealt with reaches the wire INSIDE the 5 minute shift.
       A crossing that lands after the buzzer teaches the trainee nothing.      */
    { t:8,   type:'CATTLE',      x:  120, route:'OPEN'      },   // wire ~02:30
    { t:18,  type:'NILGAI',      x: -240, route:'OPEN'      },
    { t:26,  type:'INFILTRATOR', x:  -60, route:'FENCE_GAP' },   // wire ~02:48

    { t:48,  type:'OWN_TROOPS',  x: -430, route:'PATROL'    },
    { t:62,  type:'CIVILIAN',    x:  235, route:'OPEN'      },
    { t:72,  type:'SMUGGLER',    x: -300, route:'CULVERT'   },   // wire ~03:34

    { t:90,  type:'DOG',         x:   40, route:'OPEN'      },
    { t:96,  type:'INFILTRATOR', x:  195, route:'FENCE_GAP' },   // wire ~03:58
    { t:104, type:'INFILTRATOR', x:  215, route:'FENCE_GAP' },   // wire ~04:06

    // --- THE DIVERSION. Noise and movement right, real crossing left. ---
    { t:124, type:'SMUGGLER',    x:  300, route:'OPEN',     decoy:true },
    { t:129, type:'SMUGGLER',    x:  325, route:'OPEN',     decoy:true },
    { t:132, type:'INFILTRATOR', x: -180, route:'CULVERT'   },   // wire ~04:34
    { t:138, type:'INFILTRATOR', x: -200, route:'CULVERT'   },   // wire ~04:40

    { t:196, type:'OWN_TROOPS',  x:  430, route:'PATROL'    },
    { t:206, type:'CIVILIAN',    x: -320, route:'OPEN'      }
  ],

  /* --- Degradation schedule: the night works against you ------------------ */
  degradation: [
    { t:0,   fog:0.0016, moon:0.55, note:'Clear. Moon up.' },
    { t:80,  fog:0.0024, moon:0.40, note:'Ground haze forming over the nallah.' },
    { t:155, fog:0.0042, moon:0.22, note:'Fog bank rolling in — thermal contrast dropping.' },
    { t:225, fog:0.0055, moon:0.08, note:'Moon set. Fog thick. NVG gain failing.' }
  ]
};
