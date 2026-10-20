/* MORCHA :: SIMULATION CORE */

const Sim = (function () {

  const T = DOCTRINE.timing, S = DOCTRINE.scoring, ST = DOCTRINE.stores, W = DOCTRINE.world;

  let renderer, scene, cam, clock;
  let t = 0, running = false, paused = false, ended = false;
  let waveIdx = 0, degIdx = -1;
  let score = 0, fatigue = 0, coi = false, breaches = 0, apprehended = 0, terminal = null;
  let selected = null;
  let events = [], arcTrace = [], missedCues = [];
  let stores = {}, notes = '';

  let timeScale = 1;
  /* TRAINEE MODE: he cannot aim, designate or act. His whole input is one
     button — "I have something". He then points at the screen with his hand or
     a laser and says where; the instructor verifies it on the console. Machine
     control belongs to the console. */
  let traineeMode = true;
  let claims = [], claimSeq = 1, pendingClaim = null, lastPush = 0;
  let flare = { active:false, tLeft:0 },
      light = { on:false, battery:T.searchlightBattery, cool:0, x:0 },
      qrt   = { out:false, eta:0, x:0, cool:0, left:0 },
      nvgBlind = 0, flash = 0;

  let flareLight, slSpot, slCone, qrtGroup, revealGroup, reveal = false, lights, slPool;
let dragging = false, panKey = 0, lockRefused = false;
/* Pointer lock is refused by kiosk browsers and embedded panes. Fail over to
   drag-look silently rather than spraying the console. */
function tryLock(el) {
  try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => { lockRefused = true; }); }
  catch (e) { lockRefused = true; }
}
  let env = { illuminated:false, searchlightOn:false, searchlightX:0, blinded:false };

  /* ================= audio (procedural, no assets) ===================== */
  const Audio = (function () {
    let ctx, wind;
    function C(){ if(!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); return ctx; }
    function noiseBuf(sec){
      const c=C(), b=c.createBuffer(1, c.sampleRate*sec, c.sampleRate), d=b.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b;
    }
    function burst(dur, freq, q, gain, type){
      const c=C(), s=c.createBufferSource(); s.buffer=noiseBuf(dur);
      const f=c.createBiquadFilter(); f.type=type||'bandpass'; f.frequency.value=freq; f.Q.value=q;
      const g=c.createGain(); g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime+dur);
      s.connect(f); f.connect(g); g.connect(c.destination); s.start();
    }
    function tone(f0,f1,dur,gain,type){
      const c=C(), o=c.createOscillator(), g=c.createGain();
      o.type=type||'sine'; o.frequency.setValueAtTime(f0,c.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1,1), c.currentTime+dur);
      g.gain.setValueAtTime(gain,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+dur);
    }
    return {
      start(){ const c=C(); if(wind) return;
        const s=c.createBufferSource(); s.buffer=noiseBuf(4); s.loop=true;
        const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=240;
        const g=c.createGain(); g.gain.value=0.035;
        s.connect(f); f.connect(g); g.connect(c.destination); s.start(); wind=s; },
      radio(){ burst(0.10, 1800, 6, 0.25); setTimeout(()=>tone(900,700,0.08,0.10,'square'),90); },
      challenge(){ burst(0.55, 700, 2.2, 0.20); },
      shot(){ burst(0.30, 900, 0.7, 0.55,'lowpass'); tone(160,40,0.35,0.35,'sawtooth'); },
      flare(){ tone(500,90,0.5,0.25,'triangle'); burst(0.7, 400, 1.0, 0.16); },
      deny(){ tone(220,180,0.16,0.18,'square'); },
      ok(){ tone(760,1100,0.12,0.14,'sine'); },
      alarm(){ tone(300,300,0.5,0.3,'square'); setTimeout(()=>tone(240,240,0.7,0.3,'square'),520); }
    };
  })();

  /* ================= logging ============================================ */
  function clk(x){ const m=Math.floor(x/60), s=Math.floor(x%60);
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
  function log(kind, text, pts) {
    events.push({ t, kind, text, pts: pts||0 });
    if (pts) score += pts;
    HUD.pushLog(clk(t), kind, text, pts||0);
  }

  /* ================= actions ============================================ */
  function designate() {
    const c = Contacts.designate(Optics.camera(), Optics.mode(), t);
    if (!c) { Audio.deny(); log('MARK','Designated empty ground — nothing at that bearing.', -3); return; }
    selected = c;
    if (c.designatedT === t) {
      let pts, how;
      if (c.z < W.zeroLineZ)            { pts = S.detectionExcellent; how='beyond the zero line'; }
      else if (c.z < W.fenceZ - 45)     { pts = S.detectionGood;      how='in no-man\'s land'; }
      else                              { pts = S.detectionLate;      how='already at the fence'; }
      Audio.ok();
      log('CONTACT', 'Contact ' + c.id + ' designated ' + how + ' — ' + c.reportedGrid, pts);
    }
    HUD.select(selected);
  }

  /* What could a trained eye honestly have picked up at this instant? The
     console shows the instructor exactly this list, so his verification is
     against the ground truth and not his memory. */
  function detectableNow() {
    return Contacts.active().filter(c => {
      const d = Math.hypot(c.x, c.z);
      const brg = THREE.MathUtils.radToDeg(Math.atan2(c.x, -c.z));
      return d < 620 && Math.abs(brg) <= DOCTRINE.world.arcLimit + 2 && c.z < W.fenceZ + 20;
    }).map(c => ({
      id: c.id, type: c.cls.label, hostile: !!c.cls.hostile, own: !!c.cls.own,
      bearing: +THREE.MathUtils.radToDeg(Math.atan2(c.x, -c.z)).toFixed(1),
      range: Math.round(Math.hypot(c.x, c.z)),
      grid: World.gridRef(c.x, c.z),
      state: c.state, moving: c.state !== 'FREEZE' && c.state !== 'HALTED',
      designated: c.designated
    }));
  }

  /* The trainee's one action. */
  function raiseClaim() {
    if (!running || ended || pendingClaim) return;
    const cl = { id: claimSeq++, t, verified: false,
                 options: detectableNow(), result: null, contactId: null };
    claims.push(cl); pendingClaim = cl;
    Audio.ok();
    log('CLAIM', 'Trainee reports a contact. Awaiting his indication and the ' +
        'instructor\'s verification.', 0);
    Link.claim(cl);
    HUD.showClaim(cl);
  }

  /* The instructor's verdict on where the trainee pointed. */
  function resolveClaim(claimId, contactId) {
    const cl = claims.find(c => c.id === claimId) || pendingClaim;
    if (!cl || cl.verified) return;
    cl.verified = true; pendingClaim = null;

    if (contactId === null || contactId === 'FALSE') {
      cl.result = 'FALSE ALARM';
      log('VERIFY', 'Instructor: nothing on that bearing. False alarm.', -8);
      HUD.showClaim(null); return;
    }
    const c = Contacts.all().find(x => x.id === contactId);
    if (!c) { cl.result = 'FALSE ALARM'; HUD.showClaim(null); return; }

    cl.result = 'CORRECT'; cl.contactId = c.id;
    selected = c;
    if (!c.designated) {
      c.designated = true; c.designatedT = cl.t; c.designatedZ = c.z;
      c.reportedGrid = World.gridRef(c.x, c.z);
      let pts, how;
      if (c.designatedZ < W.zeroLineZ)        { pts = S.detectionExcellent; how = 'beyond the zero line'; }
      else if (c.designatedZ < W.fenceZ - 45) { pts = S.detectionGood;      how = "in no-man's land"; }
      else                                    { pts = S.detectionLate;      how = 'already at the fence'; }
      log('VERIFY', 'Instructor confirms: ' + c.cls.label + ' ' + how + ' — ' +
          c.reportedGrid + '. Picked up at ' + clk(cl.t) + '.', pts);
    } else {
      log('VERIFY', 'Instructor confirms — already held as Contact ' + c.id + '.', 0);
    }
    HUD.select(selected); HUD.showClaim(null);
  }

  function need(cond, msg) { if (!cond) { Audio.deny(); log('DENIED', msg, 0); } return cond; }

  function actReport() {
    if (!need(selected, 'REPORT refused — no contact designated.')) return;
    if (selected.reported) return;
    selected.reported = true;
    selected.reportedGrid = World.gridRef(selected.x, selected.z);
    Audio.radio();
    log('RADIO', 'To Coy HQ: "Contact, ' + selected.reportedGrid + ', ' +
        (Optics.mode().id) + ', moving." — acknowledged.', 10);
  }

  function actChallenge() {
    if (!need(selected, 'CHALLENGE refused — no contact designated.')) return;
    if (!selected.reported) log('PROCEDURE', 'Challenged before reporting to Coy HQ.',
        -DOCTRINE.ladder[2].skipPenalty);
    selected.challenged = true;
    Audio.challenge();
    log('CHALLENGE', '"HALT! KAUN HAI? Aage mat badho!" — loudhailer, ' + selected.reportedGrid, 0);

    const c = selected;
    setTimeout(() => {
      if (c.resolvedAt) return;
      if (c.cls.own) {
        c.state = Contacts.STATE.HALTED;
        c.verdict = 'OWN TROOPS — password given';
        log('RESOLVED', 'Contact ' + c.id + ' answered with the password: A Coy patrol, ' +
            'own side of the wire. Correctly identified and held.', S.ownTroopsCorrect);
      } else if (c.type === 'CIVILIAN') {
        c.state = Contacts.STATE.HALTED; c.resolvedAt = t;
        c.verdict = 'IDENTIFIED — local cultivator, papers given';
        log('RESOLVED', 'Contact ' + c.id + ' answered the challenge: local farmer, ID given. Correctly held fire.', 25);
      } else if (c.type === 'SMUGGLER') {
        c.cls.speed = 2.4; c.freezeT = 0;
        log('REACTION', 'Contact ' + c.id + ' broke and ran on the challenge — consistent with smuggling.', 0);
      } else if (c.cls.hostile) {
        c.freezeT = 5;
        log('REACTION', 'Contact ' + c.id + ' went to ground on the challenge. No reply.', 0);
      } else {
        log('REACTION', 'No reply — animal signature.', 0);
      }
      HUD.select(c);
    }, 1500);
  }

  function actFlare() {
    if (!need(stores.flares > 0, 'No para-illum remaining.')) return;
    stores.flares--;
    flare.active = true; flare.tLeft = T.flareBurnTime;
    flash = 1.0;
    if (Optics.mode().id === 'NVG') { nvgBlind = T.nvgBloomRecovery;
      log('OPTICS', 'NVG blanked out by your own flare — you are blind for ' + T.nvgBloomRecovery + 's.', -5); }
    if (selected) selected.illuminated = true;
    Audio.flare();
    log('ILLUM', 'Para-illum fired. ' + stores.flares + ' remaining.', 0);
  }

  function actLight() {
    if (light.on) { light.on = false; light.cool = T.searchlightCooldown; log('ILLUM','Searchlight off.',0); return; }
    if (!need(light.cool <= 0, 'Searchlight cooling — ' + Math.ceil(light.cool) + 's.')) return;
    if (!need(light.battery > 1, 'Searchlight battery dead for the shift.')) return;
    light.on = true;
    if (selected) selected.illuminated = true;
    log('ILLUM', 'Searchlight on — ' + Math.ceil(light.battery) + 's battery left. They can see the beam too.', 0);
  }

  function actQRT() {
    if (!need(selected, 'QRT refused — no contact designated.')) return;
    if (!need(selected.reported, 'QRT refused — grid has not been passed to Coy HQ.')) return;
    if (!need(!qrt.out, 'QRT already deployed — 1 party forward at a time.')) return;
    if (!need(qrt.cool <= 0, 'QRT re-forming — ' + Math.ceil(qrt.cool) + 's.')) return;
    if (!need(stores.qrtDispatches > 0, 'No QRT dispatches left this shift.')) return;
    stores.qrtDispatches--;
    qrt.out = true; qrt.eta = T.qrtTransitTime; qrt.x = selected.x; qrt.left = 0;
    selected.qrtSent = true;
    Audio.radio();
    log('QRT', 'QRT dispatched to ' + selected.reportedGrid + '. ETA ' + T.qrtTransitTime +
        's. They will arrive where you SAID, not where he IS.', 0);
  }

  function actWarning() {
    if (!need(selected, 'No contact designated.')) return;
    if (!need(stores.warningShots > 0, 'No warning rounds allocated.')) return;
    stores.warningShots--;
    flash = 0.8; Audio.shot();
    if (!selected.challenged)
      log('PROCEDURE', 'Warning shot WITHOUT a prior challenge — out of sequence.',
          -DOCTRINE.roe.unchallengedWarningPenalty);
    else log('FIRE', 'Warning shot fired high over ' + selected.reportedGrid + '.', 0);

    const c = selected;
    if (c.cls.own) {
      log('FRATRICIDE RISK', 'Warning shot fired over our OWN patrol. ' +
          'They have gone to ground and are calling it in.', -120);
      return;
    }
    if (DOCTRINE.roe.noFireBeyondZeroLine && c.z < W.zeroLineZ) {
      log('FIRE DISCIPLINE', 'Warning shot toward a contact beyond the zero line. ' +
          'Rounds must not cross the IB — ' + nearestRangers(c.x) + ' is on that bearing.', -90);
    }
    if (c.cls.hostile) {
      c.freezeT = 7;
      if (Math.random() < 0.35 && c.z < W.fenceZ - 60) {
        c.state = Contacts.STATE.WITHDRAWN; c.resolvedAt = t;
        c.verdict = 'WITHDREW after warning shot';
        log('RESOLVED','Contact '+c.id+' withdrew across the line after the warning shot.', 30);
      }
    } else {
      log('CAUTION','Warning shot near a non-hostile contact — incident is reportable.', -20);
    }
  }

  function actEngage() {
    if (!need(selected, 'No contact designated.')) return;
    const c = selected, R = DOCTRINE.roe.engageRequires;
    flash = 1.0; Audio.shot();

    /* --- own troops ------------------------------------------------------ */
    if (c.cls.own) {
      coi = true; terminal = 'FAIL — FRATRICIDE'; c.resolvedAt = t; c.verdict = 'FIRED ON OWN TROOPS';
      Audio.alarm();
      log('FRATRICIDE', 'Aimed fire on the A Coy patrol at ' + c.reportedGrid +
          '. Our own men, on our own side of the wire. Shift terminated.', S.fratricide);
      endShift('FRATRICIDE'); return;
    }

    /* --- rounds across the International Boundary ------------------------- */
    if (DOCTRINE.roe.noFireBeyondZeroLine && c.z < W.zeroLineZ) {
      coi = true; terminal = 'FAIL — CROSS-BORDER FIRING'; c.resolvedAt = t; c.verdict = 'ROUNDS ACROSS THE IB';
      Audio.alarm();
      const near = nearestRangers(c.x);
      log('CROSS-BORDER FIRING',
          'Aimed fire at a contact STILL BEYOND THE ZERO LINE — ' + c.reportedGrid +
          '. That is Pakistani soil, and ' + near + ' is behind it. ' +
          'Rounds across the IB. Shift terminated.', S.crossBorderFire);
      endShift('CROSS-BORDER FIRING INCIDENT'); return;
    }

    const fail = [];
    if (R.reported        && !c.reported)        fail.push('grid never passed to Coy HQ');
    if (R.challenged      && !c.challenged)      fail.push('no challenge given');
    if (R.identifiedArmed && !c.armedIdentified) fail.push('weapon never positively identified');

    if (!c.cls.hostile || !c.cls.armed) {
      coi = true; terminal = 'FAIL — COURT OF INQUIRY'; c.resolvedAt = t; c.verdict = 'FIRED ON A NON-COMBATANT';
      Audio.alarm();
      log('COURT OF INQUIRY',
        'Aimed fire on ' + c.cls.label + ' at ' + c.reportedGrid +
        '. Unarmed. This is a Court of Inquiry. Shift terminated.', S.civilianHarm);
      endShift('COURT OF INQUIRY');
      return;
    }
    if (fail.length) {
      c.resolvedAt = t; c.verdict = 'NEUTRALISED — outside ROE';
      log('ROE BREACH', 'Target neutralised but engagement was unlawful: ' + fail.join('; ') + '.',
          -DOCTRINE.ladder[6].skipPenalty);
    } else {
      c.resolvedAt = t; c.verdict = 'NEUTRALISED — lawful engagement';
      log('ENGAGED', 'Armed infiltrator neutralised at ' + c.reportedGrid +
          ' after full escalation. Lawful.', S.correctApprehension);
    }
    HUD.select(c);
  }

  /* ================= QRT resolution ===================================== */
  function qrtArrive() {
    qrt.out = false; qrt.cool = T.qrtCooldown; qrt.left = 12;
    qrtGroup.position.set(qrt.x, 0, W.fenceZ + 6); qrtGroup.visible = true;
    let got = null;
    for (const c of Contacts.active())
      if (c.cls.hostile && Math.abs(c.x - qrt.x) < 60 && c.z > W.zeroLineZ - 30) { got = c; break; }
    if (got) {
      got.resolvedAt = t; got.verdict = 'APPREHENDED by QRT'; apprehended++;
      Audio.ok();
      log('QRT', 'QRT closed on the grid and apprehended Contact ' + got.id + ' — ' +
          got.cls.label + '. Clean.', S.correctApprehension);
    } else {
      log('QRT', 'QRT reached the reported grid. Nothing there. Your reserve is now out of position.',
          S.falseQrtPenalty);
    }
  }

  /* ================= breach ============================================= */
  function onBreach(c) {
    breaches++;
    Audio.alarm();
    const trace = nearestArc(c.detectableT != null ? c.detectableT : c.spawnT);
    missedCues.push({
      id: c.id, type: c.cls.label,
      readableAt: c.detectableT, throughAt: t,
      contactBearing: Math.round(THREE.MathUtils.radToDeg(Math.atan2(c.x, -c.z))),
      yourBearing: trace ? Math.round(trace.b) : null,
      yourOptic: trace ? trace.o : '—',
      designated: c.designated
    });
    log('*** BREACH ***', 'Contact ' + c.id + ' (' + c.cls.label + ') is THROUGH the fence at ' +
        World.gridRef(c.x, c.z) + '. Inside Indian territory.', S.breachPenalty);
  }

  /* which Rangers post sits behind a given bearing — used in the fire-discipline
     warnings, because that is literally what is downrange                      */
  function nearestRangers(x) {
    let best = null, bd = 1e9;
    for (const r of World.rangers) { const d = Math.abs(r.x - x); if (d < bd) { bd = d; best = r; } }
    if (!best) return 'a Pakistan Rangers post';
    return 'the Rangers BOP at ' + (best.x < 0 ? Math.abs(Math.round(best.x)) + 'm left'
                                                : Math.round(best.x) + 'm right');
  }

  function nearestArc(tt) {
    if (tt == null) return null;
    let best = null, bd = 1e9;
    for (const a of arcTrace) { const d = Math.abs(a.t - tt); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  /* ================= shift control ====================================== */
  function endShift(reason) {
    if (ended) return;
    ended = true; running = false;
    for (const c of Contacts.active())
      if (c.cls.hostile) {
        /* A hostile still on the far side of the zero line at the buzzer never
           entered Indian territory. Holding him out there all night IS the job,
           so it is not a failure — only one left loose INSIDE no-man's land is
           something the sentry left hanging. */
        c.verdict = c.verdict || (c.z < W.zeroLineZ
          ? 'HELD OFF — never crossed the zero line'
          : "UNRESOLVED — loose in no-man's land at end of shift");
      }
    const aar = buildAAR(reason);
    Link.ended(aar);
    HUD.showAAR(aar);
  }

  function buildAAR(reason) {
    const heldOff = Contacts.all().filter(c => c.cls.hostile && !c.resolvedAt &&
                                               c.z < W.zeroLineZ);
    const loose   = Contacts.all().filter(c => c.cls.hostile && !c.resolvedAt &&
                                               c.z >= W.zeroLineZ);
    score += loose.length * -30;
    score += heldOff.length * 20;      // kept out is a result, and it is scored
    if (heldOff.length)
      log('SHIFT', heldOff.length + ' hostile' + (heldOff.length>1?'s':'') +
          ' held beyond the zero line for the whole shift — none entered.',
          heldOff.length * 20);
    const verdict = terminal ? terminal
                  : breaches > 0 ? 'FAIL — BORDER BREACHED'
                  : score >= S.passMark ? 'PASS' : 'FAIL — BELOW STANDARD';
    return {
      reason, verdict, score: Math.round(score), passMark: S.passMark,
      breaches, apprehended, coi, loose: loose.length, heldOff: heldOff.length, terminal,
      events, missedCues, notes,
      contacts: Contacts.all().map(c => ({
        id:c.id, type:c.cls.label, decoy:c.decoy, route:c.route,
        designated:c.designated, designatedT:c.designatedT,
        reported:c.reported, challenged:c.challenged,
        armedIdentified:c.armedIdentified, qrtSent:c.qrtSent,
        verdict: c.verdict || (c.designated ? 'observed, not resolved' : 'NEVER SEEN'),
        detectableT: c.detectableT
      }))
    };
  }

  /* ================= frame ============================================== */
  function frame() {
    requestAnimationFrame(frame);
    step(Math.min(clock.getDelta(), 0.05) * timeScale, true);
  }

  /* One tick of the exercise, decoupled from requestAnimationFrame.
     The render loop calls this with real elapsed time; a test harness can call
     it with a fixed dt and run a whole shift deterministically, without needing
     the window to be visible — a browser throttles a hidden tab to about 0.1
     fps, which otherwise makes an end-to-end run impossible to verify. */
  function step(dt, doRender) {
    if (!running || paused) { if (doRender) Optics.render(renderer, scene); return; }
    t += dt;

    /* --- scenario --- */
    while (waveIdx < DOCTRINE.waves.length && DOCTRINE.waves[waveIdx].t <= t) {
      const c = Contacts.spawn(DOCTRINE.waves[waveIdx], t); waveIdx++;
      if (c.decoy) log('SOUND', 'Movement and voices heard to the right flank.', 0);
    }
    /* --- degradation --- */
    for (let i = DOCTRINE.degradation.length - 1; i >= 0; i--) {
      const d = DOCTRINE.degradation[i];
      if (t >= d.t && degIdx < i) { degIdx = i;
        scene.fog.density = d.fog;
        log('MET', d.note, 0);
      }
    }
    const deg = DOCTRINE.degradation[Math.max(degIdx,0)];

    if (panKey) Optics.look(panKey * 900 * dt, 0);

    /* --- consumables / systems --- */
    if (flare.active) { flare.tLeft -= dt; if (flare.tLeft <= 0) flare.active = false; }
    /* A para-illum swings under its parachute and burns unevenly — the light
       breathes, and shadows swing with it. Trainees read movement wrong under it. */
    const flick = 0.82 + 0.18*Math.sin(t*11.0) + 0.06*Math.sin(t*23.0);
    const fi = flare.active ? Math.min(1, flare.tLeft/2.5) * flick : 0;
    flareLight.intensity = fi * 1.05 * World.GAIN;
    flareLight.visible = flare.active;
    flareLight.castShadow = flare.active;          // only pay for it while it burns
    if (flare.active) {
      /* A para-illum hangs under a parachute: it sinks and drifts downwind, so
         every shadow on the ground swings slowly. That movement is the most
         alive thing in the scene and it is free. */
      const burnt = 1 - flare.tLeft / T.flareBurnTime;
      const dx = Math.cos(W.windDir) * burnt * 55;
      const dz = Math.sin(W.windDir) * burnt * 55;
      flareLight.position.set(dx, 132 - burnt * 58, -270 + dz);
      flareLight.target.position.set(dx * 1.6, 0, -270 + dz * 1.6);
      flareLight.target.updateMatrixWorld();
    }
    World.setFlare(fi, flareLight.position);
    lights.amb.intensity  = (0.16 + fi*0.20) * World.GAIN;
    lights.hemi.intensity = (0.13 + fi*0.15) * World.GAIN;
    lights.moon.intensity = (0.30 + fi*0.12) * World.GAIN;

    if (light.on) {
      light.battery -= dt;
      if (light.battery <= 0) { light.on = false; log('ILLUM','Searchlight battery exhausted.',0); }
    } else if (light.cool > 0) light.cool -= dt;

    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(Optics.camera().quaternion);
    const hitT = (W.fenceZ - 1.6) / (fwd.z || -0.001);
    light.x = fwd.x * hitT;
    const th = World.isThermal();
    slSpot.visible = light.on;
    slCone.visible = light.on && !th;          // glare is visible light only
    if (light.on) {
      slSpot.target.position.set(light.x, 0, W.fenceZ);
      slSpot.target.updateMatrixWorld();
      slCone.position.set(light.x * 0.02, 9.0, -2.8);   // glare sits at the lamp
    }
    World.setSearchlight(light.on, slSpot.position,
      new THREE.Vector3(light.x, -2.2, W.fenceZ).sub(slSpot.position).normalize());

    if (qrt.out) { qrt.eta -= dt; if (qrt.eta <= 0) qrtArrive(); }
    else if (qrt.cool > 0) qrt.cool -= dt;
    if (qrt.left > 0) { qrt.left -= dt; if (qrt.left <= 0) qrtGroup.visible = false; }

    if (nvgBlind > 0) nvgBlind -= dt;
    flash = Math.max(0, flash - dt * 3.2);
    fatigue = Math.min(1, t / T.shiftDuration * 0.8 + (light.on ? 0.0001 : 0));

    env.illuminated    = flare.active || light.on;
    env.searchlightOn  = light.on;
    env.searchlightX   = light.x;
    env.blinded        = nvgBlind > 0 && Optics.mode().id === 'NVG';

    /* --- world + contacts --- */
    World.retargetLights(Optics.bearing());
    World.update(t, scene.fog.density, deg.moon * (flare.active ? 2.2 : 1));
    Contacts.update(dt, t, Optics.camera(), Optics.mode(), env);

    /* first moment each contact was physically readable — used in the AAR */
    for (const c of Contacts.all()) {
      if (c.detectableT == null && !c.resolvedAt) {
        const d = Math.hypot(c.x, c.z);
        if (d < 620 && c.z < W.fenceZ) c.detectableT = t;
      }
    }

    /* --- arc trace for the after-action replay --- */
    if (!arcTrace.length || t - arcTrace[arcTrace.length-1].t > 0.4)
      arcTrace.push({ t, b: Optics.bearing(), o: Optics.mode().id });

    /* --- reveal markers (instructor) --- */
    revealGroup.visible = reveal;
    if (reveal) {
      while (revealGroup.children.length < Contacts.all().length) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 4),
          new THREE.MeshBasicMaterial({ color: World.hdr(1,0.13,0.13), depthTest:false, transparent:true, opacity:0.9 }));
        m.rotation.x = Math.PI; revealGroup.add(m);
      }
      Contacts.all().forEach((c, i) => {
        const m = revealGroup.children[i];
        m.visible = !c.resolvedAt;
        m.position.set(c.x, 6 + Math.sin(t*3+i)*0.5, c.z);
        m.material.color.setHex(c.cls.colour);
      });
    }

    /* A flare does not raise the exposure of the whole picture — it ADDS light to
       what it shines on. Lifting uGain lifted the sky too, which clipped the
       frame to white. Let flareLight and the shader terms do the work; leave the
       gain a token amount for the eye's own adaptation lagging behind. */
    const gain = 1 + (flare.active ? 0.10 : 0) + (light.on ? 0.05 : 0);
    const bloom = (Optics.mode().id === 'NVG')
      ? Math.max(nvgBlind / T.nvgBloomRecovery, flare.active ? 0.45 : 0) : 0;
    Optics.update(dt, t, fatigue, gain, bloom, flash);
    Optics.camera().position.set(0, World.OP_EYE, 0);

    HUD.update({
      t, remaining: Math.max(0, T.shiftDuration - t), score, fatigue,
      optic: Optics.mode(), bearing: Optics.bearing(),
      stores, light, qrt, selected, flare,
      loose: Contacts.hostilesLoose(), breaches, apprehended,
      met: deg.note, blinded: env.blinded
    });

    /* Keep the console live. 6 Hz is plenty for a human reading a map and is
       cheap enough not to touch the frame rate. */
    if (t - lastPush > 0.16) {
      lastPush = t;
      Link.state(snapshot());
    }

    if (doRender) Optics.render(renderer, scene);
    if (t >= T.shiftDuration) endShift('SHIFT COMPLETE');
  }

  /* One description of the exercise, sent both from the frame loop and from the
     heartbeat below. */
  /* A small JPEG of exactly what the trainee is looking at, plus where each
     contact sits ON that picture. The instructor gets his screen with the
     answers drawn over it: what each shape actually is, and whether it is
     moving. He is checking the man's eyes, so he has to see the same frame. */
  let mirrorCv = null, mirrorCtx = null, lastMirror = 0;
  function grabMirror() {
    const src = renderer.domElement;
    if (!mirrorCv) {
      mirrorCv = document.createElement('canvas');
      mirrorCv.width = 512; mirrorCv.height = 288;
      mirrorCtx = mirrorCv.getContext('2d');
    }
    const a = src.width / src.height;
    mirrorCv.height = Math.round(512 / a);
    try {
      mirrorCtx.drawImage(src, 0, 0, mirrorCv.width, mirrorCv.height);
      return mirrorCv.toDataURL('image/jpeg', 0.45);
    } catch (e) { return null; }
  }

  /* Where a contact lands on that picture, in 0..1 of the frame. */
  function onScreenAt(c) {
    const cam = Optics.camera();
    const h = c.cls.stance === 'PRONE' ? 0.35 : c.cls.stance === 'QUAD' ? 0.9 : 1.1;
    const v = new THREE.Vector3(c.x, World.heightAt(c.x, c.z) + h, c.z).project(cam);
    if (v.z > 1) return null;                       // behind the camera
    const sx = (v.x * 0.5 + 0.5), sy = (1 - (v.y * 0.5 + 0.5));
    if (sx < -0.1 || sx > 1.1 || sy < -0.1 || sy > 1.1) return null;
    const dist = Math.hypot(c.x, c.z);
    return { sx: +sx.toFixed(4), sy: +sy.toFixed(4),
             px: +(Math.max(0.012, 2.2 / Math.max(dist, 1))).toFixed(4) };
  }

  function snapshot() {
    const deg = DOCTRINE.degradation[Math.max(degIdx,0)];
    return ({
        t, remaining: Math.max(0, T.shiftDuration - t), score: Math.round(score),
        breaches, apprehended, loose: Contacts.hostilesLoose(),
        optic: Optics.mode().id, opticName: Optics.mode().name,
        bearing: +Optics.bearing().toFixed(1), fatigue: +fatigue.toFixed(2),
        stores, met: deg.note, paused, timeScale, reveal, ended,
        light: { on: light.on, battery: Math.round(light.battery), cool: Math.ceil(light.cool) },
        qrt: { out: qrt.out, eta: Math.ceil(qrt.eta), cool: Math.ceil(qrt.cool) },
        flare: { active: flare.active, left: Math.ceil(flare.tLeft) },
        pendingClaim: pendingClaim ? { id: pendingClaim.id, t: pendingClaim.t,
                                       options: pendingClaim.options } : null,
        selected: selected ? {
          id: selected.id, type: selected.cls.label, grid: selected.reportedGrid,
          reported: selected.reported, challenged: selected.challenged,
          illuminated: selected.illuminated, qrtSent: selected.qrtSent,
          armedIdentified: selected.armedIdentified, state: selected.state,
          verdict: selected.verdict, beyondZeroLine: selected.z < W.zeroLineZ,
          own: !!selected.cls.own
        } : null,
        truth: Contacts.all().map(c => ({
          id: c.id, type: c.cls.label, hostile: !!c.cls.hostile, own: !!c.cls.own,
          decoy: !!c.decoy, route: c.route,
          bearing: +THREE.MathUtils.radToDeg(Math.atan2(c.x, -c.z)).toFixed(1),
          range: Math.round(Math.hypot(c.x, c.z)),
          state: c.state, resolved: !!c.resolvedAt, verdict: c.verdict,
          designated: c.designated, reported: c.reported,
          screen: onScreenAt(c)
        })),
      hidden: document.hidden
    });
  }

  /* A heartbeat on a TIMER, not on the render loop. A hidden tab freezes
     requestAnimationFrame but still runs setInterval (throttled to about 1 Hz),
     so the console keeps a live link and can say the trainee screen has gone
     behind something — instead of simply reading NOT CONNECTED and leaving the
     instructor to guess whether the exercise died. */
  function startHeartbeat() {
    setInterval(() => { if (scene && Optics.camera()) Link.state(snapshot()); }, 500);
    /* The picture itself goes separately and slower — it is much heavier than
       the numbers, and the instructor is watching a man, not a video. */
    setInterval(() => {
      if (!scene || document.hidden) return;
      const img = grabMirror();
      if (img) Link.mirror({ img, t });
    }, 220);
  }

  /* ================= boot =============================================== */
  function init() {
    /* Load the real geometry before building anything — the world places
       instanced props, so it needs the meshes in hand. */
    const btn = document.getElementById('brief_go');
    let done = 0, total = 8;
    Assets.load(() => {
      done++;
      if (btn) btn.textContent = 'LOADING… ' + Math.round(done/total*100) + '%';
    }).then(() => {
      if (btn) { btn.textContent = 'START — TAKE OVER THE POST'; btn.disabled = false; }
      boot();
    });
  }

  function boot() {
    const cv = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas: cv,
      /* the scene never touches the canvas directly — it goes through Optics'
         own multisampled target — so canvas MSAA only costs fill */
      antialias: false,
      powerPreference: 'high-performance',
      /* The console mirrors this canvas, which means reading pixels back out of
         it after the frame is composited. Without this the buffer is already
         cleared and the mirror comes back black. */
      preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(innerWidth, innerHeight);
    renderer.setClearColor(0x04060a, 1);
    /* Shadows. The fence throwing long bars across the sodium-lit strip is a
       large part of what floodlit border ground actually looks like, and its
       absence was the biggest remaining gap. Soft PCF — a 1000 W lamp head is
       an area source, so hard-edged shadows would read as wrong as none. */
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;

    renderer.toneMapping = THREE.NoToneMapping;     // done manually in the optics pass
    renderer.outputEncoding = THREE.LinearEncoding;

    scene = new THREE.Scene();
    lights = World.build(scene);
    cam = Optics.build(renderer, innerWidth, innerHeight);
    if (Optics.msaa && Optics.msaa()) World.enableCoverage();
    Contacts.init(scene);

    /* ===================================================================
       THE PARA-ILLUM IS THE ONLY LIGHT WHOSE SHADOWS YOU CAN SEE.
       Work it through from the post's point of view:
         · The fence floodlights stand at fenceZ+5.5, on OUR side of the wire,
           so everything past the fence throws its shadow AWAY from the post
           onto ground the fence itself occludes.
         · The searchlight sits at the sentry's own eye. A light co-located
           with the observer hides every shadow behind the thing casting it —
           the opposition effect. You cannot see your own torch's shadows.
         · The flare burns at 120 m altitude and 270 m downrange. Its shadows
           fall back TOWARD the post, across open no-man's land, in full view.
       So the entire shadow budget goes here: one map, only while a flare is
       burning — 10 seconds, three times a shift. A spot rather than a point
       light because a point needs a six-face cube map for the same result. */
    flareLight = new THREE.SpotLight(0xfff1cc, 0, 1100, 0.78, 0.6, 1.3);
    flareLight.position.set(0, 120, -270);
    flareLight.target.position.set(0, 0, -270);
    flareLight.castShadow = true;
    flareLight.shadow.mapSize.set(2048, 2048);
    flareLight.shadow.camera.near = 25;
    flareLight.shadow.camera.far  = 320;
    flareLight.shadow.bias = -0.0012;
    flareLight.shadow.normalBias = 0.06;
    scene.add(flareLight); scene.add(flareLight.target);

    slSpot = new THREE.SpotLight(0xfff4dc, 3.4 * World.GAIN, 620, 0.095, 0.45, 1.1);
    /* The searchlight is where shadows actually earn their keep: the trainee
       sweeps it across near ground he is looking straight down at, so the beam
       rakes the folds and throws real shadows off bunds, scrub and bodies.
       One map, and only rendered while the beam is on. */
    slSpot.castShadow = true;
    slSpot.shadow.mapSize.set(2048, 2048);
    slSpot.shadow.camera.near = 3;
    slSpot.shadow.camera.far  = 420;
    slSpot.shadow.bias = -0.0012;
    slSpot.shadow.normalBias = 0.05;
    slSpot.position.set(0, 8.9, -2.6); scene.add(slSpot); scene.add(slSpot.target);
    /* No fake beam mesh and no fake ground pool.

       Both were legacy stand-ins from when the searchlight had no real light
       behind it, and both fight the world now that it has one: the cone is a
       150 m solid the camera keeps ending up inside, and the pool was a FLAT
       90x90 plane at y=0.08 which the undulating terrain now cuts straight
       through. Between them they produced a hard-edged wedge across the lower
       frame that read as a giant shadow and was neither.

       The SpotLight above does the job properly — real falloff over real
       terrain, and a real shadow. All that is still wanted is a little glare
       at the source, which is a sprite. */
    /* Nothing to draw. The sentry's own searchlight is mounted outside the
       embrasure and pointed away from him; he sees what it LIGHTS, not the
       lamp. A glare sprite here sat 2.8 m from the eye and washed the frame.
       An empty placeholder keeps the call sites below unchanged. */
    slCone = new THREE.Object3D(); slCone.visible = false; scene.add(slCone);
    slPool = slCone;                     // one object now; keeps the call sites honest

    qrtGroup = new THREE.Group(); qrtGroup.visible = false;
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5,1.7,0.35),
        new THREE.MeshBasicMaterial({ color:World.hdr(0.18,0.42,0.24) }));
      m.position.set((i-1.5)*1.6, 0.85, 0); qrtGroup.add(m);
    }
    scene.add(qrtGroup);

    revealGroup = new THREE.Group(); revealGroup.visible = false; scene.add(revealGroup);

    stores = Object.assign({}, ST);
    Link.open('sim');
    Link.on('cmd', m => handleCmd(m.name, m.args));
    Link.on('hello', () => Link.event({ kind: 'HELLO', text: 'Trainee screen connected.' }));
    clock = new THREE.Clock();
    /* A browser FREEZES a hidden tab: requestAnimationFrame drops to near zero
       and the shift clock stops with it. Measured in Chrome: 0.1 fps hidden,
       against 2.2 ms a frame (about 450 fps) when visible. So if the trainee
       screen is put behind another window, or the two screens are opened as two
       TABS of one window instead of two windows, the exercise silently stops.
       Catch it, say so on both screens, and hold the clock rather than let it
       drift. */
    document.addEventListener('visibilitychange', () => {
      const hidden = document.hidden;
      if (hidden && running && !paused) {
        paused = true; HUD.setPaused(true);
        log('HELD', 'Trainee screen was hidden — shift held. Bring it back to the ' +
            'front. Use two WINDOWS, not two tabs of one window.', 0);
        Link.event({ kind: 'HIDDEN',
          text: 'TRAINEE SCREEN HIDDEN — shift held. It must be a separate window, on screen.' });
      } else if (!hidden && paused && running) {
        paused = false; HUD.setPaused(false);
        log('RESUMED', 'Trainee screen visible again. Shift resumed.', 0);
        Link.event({ kind: 'VISIBLE', text: 'Trainee screen visible. Resumed.' });
      }
    });

    bindInput();
    startHeartbeat();
    HUD.init(api);
    frame();
  }

  function bindInput() {
    const cv = document.getElementById('gl');
    cv.addEventListener('click', () => {
      if (traineeMode) return;            // no aiming, no designating by hand
      if (!running) return;
      if (document.pointerLockElement !== cv && !lockRefused) { tryLock(cv); return; }
      designate();
    });
    /* Pointer lock is the primary control. Some training laptops / kiosk browsers
       refuse it, so dragging and the arrow keys do the same job. */
    cv.addEventListener('mousedown', () => { if (!document.pointerLockElement) dragging = true; });
    document.addEventListener('pointerlockerror', () => { lockRefused = true; });
    addEventListener('mouseup',   () => dragging = false);
    document.addEventListener('mousemove', e => {
      if (traineeMode) return;
      if (document.pointerLockElement === cv) Optics.look(e.movementX, e.movementY);
      else if (dragging) Optics.look(e.movementX || 0, e.movementY || 0);
    });
    addEventListener('wheel', e => {
      if (traineeMode || !running) return;
      Optics.setZoom(Optics.zoom() * (e.deltaY < 0 ? 1.12 : 0.89));
    }, { passive:true });
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (traineeMode) {
        /* One button. Space, Enter, or any USB buzzer that reports as a key.
           Everything else is ignored so a trainee cannot touch the exercise. */
        if (e.code === 'Space' || k === 'enter') { e.preventDefault(); raiseClaim(); }
        if (k === 'i') HUD.toggleInstructor();     // fallback if run on one screen
        return;
      }
      if (k === 'i') { HUD.toggleInstructor(); return; }
      if (k === 'p') { paused = !paused; HUD.setPaused(paused); return; }
      if (!running || paused) return;
      if (k === '1') Optics.setMode(0);
      if (k === '2') Optics.setMode(1);
      if (k === '3') Optics.setMode(2);
      if (k === '4') Optics.setMode(3);
      if (k === 'r') actReport();
      if (k === 'c') actChallenge();
      if (k === 'f') actFlare();
      if (k === 'l') actLight();
      if (k === 'q') actQRT();
      if (k === 'v') actEngage();
      if (e.code === 'Space') { e.preventDefault(); actWarning(); }
      if (k === 'tab') { e.preventDefault(); cycleSelect(); }
      if (k === 'arrowleft'  || k === 'a') panKey = -1;
      if (k === 'arrowright' || k === 'd') panKey =  1;
      if (k === 'arrowup')   Optics.look(0, -14);
      if (k === 'arrowdown') Optics.look(0,  14);
    });
    addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      if (k==='arrowleft'||k==='a'||k==='arrowright'||k==='d') panKey = 0;
    });
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      Optics.resize(innerWidth, innerHeight);
    });
  }

  function cycleSelect() {
    const d = Contacts.active().filter(c => c.designated);
    if (!d.length) return;
    const i = d.indexOf(selected);
    selected = d[(i + 1) % d.length];
    HUD.select(selected);
  }

  /* Everything the console can do. The trainee window obeys; it never asks. */
  function handleCmd(name, a) {
    a = a || {};
    switch (name) {
      case 'optic':      Optics.setMode(a.i); break;
      case 'aim':        Optics.setAim(a.bearing, a.pitch); break;
      case 'nudge':      Optics.setAim(Optics.bearing() + a.d, Optics.pitchDeg()); break;
      case 'zoom':       Optics.setZoom(a.z); break;
      case 'verify':     resolveClaim(a.claimId, a.contactId); break;
      case 'select':     { const c = Contacts.all().find(x => x.id === a.id);
                           if (c) { selected = c; HUD.select(c); } break; }
      case 'report':     actReport(); break;
      case 'challenge':  actChallenge(); break;
      case 'flare':      actFlare(); break;
      case 'light':      actLight(); break;
      case 'qrt':        actQRT(); break;
      case 'warning':    actWarning(); break;
      case 'engage':     actEngage(); break;
      case 'inject':     api.inject(a.type, a.bearing); break;
      case 'fog':        api.setFog(a.v); break;
      case 'reveal':     api.toggleReveal(); break;
      case 'pause':      api.setPaused(!!a.v); HUD.setPaused(!!a.v); break;
      case 'timescale':  api.setTimeScale(a.v); break;
      case 'notes':      api.setNotes(a.v); break;
      case 'end':        api.forceEnd(); break;
      case 'start':      if (!running) api.start(); break;
      case 'restart':    location.reload(); break;
      case 'trainee':    traineeMode = !!a.v; break;
      case 'picture':    Optics.setPicture(a); break;
    }
  }

  const api = {
    start() { running = true; ended = false; t = 0; Audio.start(); Optics.setMode(0);
              tryLock(document.getElementById('gl')); },
    onBreach, endShift, clk, raiseClaim, resolveClaim, step,
    /* The same entry point the console drives over the link. Exposed so the
       exercise can be run programmatically end to end — in trainee mode the
       keyboard is deliberately dead, so this is the ONLY way to work the
       ladder without a second window. */
    cmd: handleCmd,
    claims: () => claims,
    isTrainee: () => traineeMode,
    /* instructor controls */
    inject(type, bearingDeg) {
      const x = Math.tan(THREE.MathUtils.degToRad(bearingDeg)) * 420;
      const route = type === 'OWN_TROOPS' ? 'PATROL'
                  : (type === 'INFILTRATOR' || type === 'SMUGGLER')
                    ? (Math.random() < 0.5 ? 'CULVERT' : 'FENCE_GAP')
                    : 'OPEN';
      // own troops walk the home-side track; they are never injected across the line
      const spec = { type, route,
                     x: route === 'PATROL' ? (bearingDeg < 0 ? -430 : 430)
                                           : THREE.MathUtils.clamp(x, -430, 430) };
      Contacts.spawn(spec, t);
      log('INSTRUCTOR', 'Injected ' + type + ' at bearing ' + Math.round(bearingDeg) + '°.', 0);
    },
    setFog(v){ scene.fog.density = v; log('INSTRUCTOR','Visibility set by instructor.',0); },
    forceFlare(){ actFlare(); },
    toggleReveal(){ reveal = !reveal; return reveal; },
    setPaused(v){ paused = v; },
    /* Time compression. An instructor running a demonstration or skipping to the
       diversion should not have to sit out the quiet stretches in real time.  */
    setTimeScale(v){ timeScale = THREE.MathUtils.clamp(v, 1, 20);
      log('INSTRUCTOR', 'Time compression set to x' + timeScale + '.', 0); },
    timeScale(){ return timeScale; },
    setNotes(v){ notes = v; },
    scene(){ return scene; },
    renderer(){ return renderer; },
    state(){ return { t, score, breaches, apprehended, running, paused, reveal,
                      contacts: Contacts.all() }; },
    forceEnd(){ endShift('TERMINATED BY INSTRUCTOR'); },
    restart(){ location.reload(); }
  };

  return Object.assign(api, { init });
})();
