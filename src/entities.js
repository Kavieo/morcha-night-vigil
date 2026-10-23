/* MORCHA :: CONTACTS — detection is hard because they watch you back. */

const Contacts = (function () {

  const W = DOCTRINE.world;
  let scene, list = [], nextId = 1;

  const STATE = { APPROACH:'APPROACH', FREEZE:'FREEZE', CROSS:'CROSSING', THROUGH:'THROUGH',
                  HALTED:'HALTED', APPREHENDED:'APPREHENDED', NEUTRALISED:'NEUTRALISED',
                  WITHDRAWN:'WITHDRAWN', IDLE:'IDLE' };

  /* ========================================================================
     CONTACT BODIES
     ------------------------------------------------------------------------
     These were three boxes. At 250 m a contact is a silhouette a few pixels
     across and the OUTLINE is the entire detection cue — a box tells the
     trainee nothing and, worse, teaches him the wrong shape. Built here from
     tapered capsules with real proportions (1.72 m standing), posed per
     stance: head, neck, torso, upper/lower arms, thighs, shins.
     ======================================================================== */

  function limb(rTop, rBot, len, mat) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 6, 1);
    g.translate(0, -len/2, 0);                 // pivot at the top joint
    return new THREE.Mesh(g, mat);
  }

  function humanoid(cls, mat) {
    const g = new THREE.Group();
    const parts = [];
    const add = (m, x, y, z, rx, rz) => {
      m.castShadow = true;
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (rz) m.rotation.z = rz;
      g.add(m); parts.push(m); return m;
    };

    if (cls.stance === 'PRONE') {
      /* Flat, low, legs splayed, head and shoulders slightly raised — the
         shape a man makes crawling, which is nothing like a box. */
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.20, 0.62, 7), mat);
      torso.rotation.x = Math.PI/2; add(torso, 0, 0.17, -0.02);
      const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.26, 7), mat);
      hips.rotation.x = Math.PI/2; add(hips, 0, 0.16, 0.40);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 7), mat);
      add(head, 0, 0.26, -0.44);
      const neck = limb(0.06, 0.07, 0.12, mat);
      neck.rotation.x = -1.25; add(neck, 0, 0.24, -0.34);
      for (const sx of [-1, 1]) {                       // arms forward, elbows out
        const ua = limb(0.055, 0.048, 0.30, mat);
        ua.rotation.set(-1.45, 0, sx*0.55); add(ua, sx*0.17, 0.16, -0.20);
        const la = limb(0.045, 0.038, 0.28, mat);
        la.rotation.set(-1.75, 0, sx*0.22); add(la, sx*0.31, 0.13, -0.46);
        const th = limb(0.075, 0.062, 0.40, mat);       // thighs splayed
        th.rotation.set(1.52, 0, sx*0.40); add(th, sx*0.11, 0.14, 0.50);
        const sh = limb(0.058, 0.045, 0.40, mat);
        sh.rotation.set(1.40, 0, sx*0.62); add(sh, sx*0.27, 0.12, 0.88);
      }
    } else if (cls.stance === 'QUAD') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.10, 8), mat);
      body.rotation.x = Math.PI/2; add(body, 0, 0.82, 0);
      const neck = limb(0.11, 0.09, 0.42, mat);
      neck.rotation.x = -0.75; add(neck, 0, 0.98, -0.52);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), mat), 0, 1.10, -0.82);
      for (const sx of [-1, 1]) for (const sz of [-0.42, 0.42]) {
        const leg = limb(0.055, 0.042, 0.80, mat);
        add(leg, sx*0.20, 0.80, sz);
      }
      const tail = limb(0.035, 0.015, 0.36, mat);
      tail.rotation.x = 0.5; add(tail, 0, 0.92, 0.56);
    } else {
      const crouch = cls.stance === 'CROUCH';
      const hipY   = crouch ? 0.62 : 0.92;
      const torsoH = crouch ? 0.52 : 0.60;
      const lean   = crouch ? 0.45 : 0.10;
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.185, torsoH, 7), mat);
      add(torso, 0, hipY + torsoH/2 * Math.cos(lean), -torsoH/2*Math.sin(lean), lean);
      const shY = hipY + torsoH * Math.cos(lean);
      const neck = limb(0.055, 0.065, 0.10, mat);
      neck.rotation.x = Math.PI; add(neck, 0, shY + 0.02, -torsoH*Math.sin(lean));
      add(new THREE.Mesh(new THREE.SphereGeometry(0.098, 8, 7), mat),
          0, shY + 0.17, -torsoH*Math.sin(lean) - 0.02);
      for (const sx of [-1, 1]) {
        const ua = limb(0.052, 0.045, 0.29, mat);
        ua.rotation.set(crouch ? -0.55 : 0.12, 0, sx*0.10);
        add(ua, sx*0.175, shY - 0.03, -torsoH*Math.sin(lean));
        const la = limb(0.043, 0.036, 0.27, mat);
        la.rotation.set(crouch ? -1.15 : -0.35, 0, sx*0.06);
        add(la, sx*0.195, shY - 0.31, -torsoH*Math.sin(lean) + (crouch ? 0.14 : 0.03));
        const th = limb(0.078, 0.062, crouch ? 0.34 : 0.46, mat);
        th.rotation.set(crouch ? -0.85 : -0.06, 0, sx*0.05);
        add(th, sx*0.095, hipY, 0);
        const sh = limb(0.058, 0.046, crouch ? 0.32 : 0.44, mat);
        sh.rotation.set(crouch ? 0.80 : 0.05, 0, 0);
        add(sh, sx*0.10, hipY - (crouch ? 0.28 : 0.45), crouch ? -0.24 : 0.02);
        const ft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.22), mat);
        add(ft, sx*0.10, 0.03, -0.04);
      }
    }
    return { group: g, parts };
  }

  /* Clothing per class, and how much sky-fill keeps him a shape rather than
     a hole (the moon is ahead of the post, so every front is in shadow). */
  const DRESS = {
    INFILTRATOR: { tint: [0.82, 0.86, 0.96], fill: 2.4 },    // moon-white: readable at 2 m on a 55-inch screen
    SMUGGLER:    { tint: [0.52, 0.43, 0.31], fill: 0.85 },   // brown shawl
    CIVILIAN:    { tint: [0.62, 0.60, 0.55], fill: 0.12 },   // pale kurta
    OWN_TROOPS:  { tint: [0.34, 0.37, 0.27], fill: 0.60 }    // olive
  };

  function heatSwap(root, v) {
    root.traverse(m => {
      if (!m.isMesh) return;
      World.heatables.push(m);
      m.userData.matNormal = m.material;
      m.userData.matThermal = new THREE.MeshBasicMaterial({
        color: new THREE.Color(v, v, v*0.96), fog: true, skinning: !!m.isSkinnedMesh });
    });
  }

  function slungRifle(h) {
    /* The weapon, slung across the back: it is the bump on a crawling man's
       silhouette that binoculars can resolve. */
    const g = Assets.group('g_insas'); const sp = h.bones.Spine2;
    if (!g || !sp) return;
    h.model.updateMatrixWorld(true);
    const mInv = new THREE.Matrix4().copy(h.model.matrixWorld).invert();
    const boneRel = new THREE.Matrix4().multiplyMatrices(mInv, sp.matrixWorld);
    // in the model frame (metres, facing -Z): across the back, muzzle up-left
    const want = new THREE.Matrix4().compose(
      new THREE.Vector3(0.0, 1.30, 0.17),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI/2, 0.85)),
      new THREE.Vector3(0.95, 0.95, 0.95));
    const local = new THREE.Matrix4().copy(boneRel).invert().multiply(want);
    local.decompose(g.position, g.quaternion, g.scale);
    g.traverse(m => { if (m.isMesh) { m.castShadow = true;
      m.material = m.material.clone(); m.material.color.multiplyScalar(0.35); } });
    sp.add(g);
  }

  function bodyFor(cls, type) {
    /* Rigged, animated people and dog (see rigs.js). */
    if (cls.stance !== 'QUAD' && Assets.rig('r_soldier')) {
      const d = DRESS[type] || DRESS.CIVILIAN;
      const h = Rigs.human({ tint: new THREE.Color(d.tint[0], d.tint[1], d.tint[2]), fill: d.fill });
      if (h) {
        if (cls.armed) slungRifle(h);
        heatSwap(h.root, cls.heat);
        h.root.userData.rig = h;
        return h.root;
      }
    }
    if (cls.label === 'STRAY DOG' && Assets.rig('r_fox')) {
      const dg = Rigs.dog();
      if (dg) { heatSwap(dg.root, cls.heat); dg.root.userData.dog = dg; return dg.root; }
    }
    /* Gemini 4 Argon animals: a real zebu cow, nilgai and stray dog. */
    const GM = { 'CATTLE': 'g_cow', 'NILGAI': 'g_nilgai', 'STRAY DOG': 'g_dog' }[cls.label];
    if (GM && Assets.has(GM)) {
      const g = Assets.group(GM);
      const v = cls.heat;
      g.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = true;
        World.heatables.push(m);
        m.userData.matNormal = m.material;
        m.userData.matThermal = new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v*0.96), fog: true });
      });
      return g;
    }
    /* Dark drab cloth, not black: under a half moon a man is a grey-brown
       shape a shade off his ground — findable by a sentry who is looking. */
    const mat = new THREE.MeshPhongMaterial({
      color: 0x5e5c4a, specular: 0x0c0c0a, shininess: 4,
      /* the moon is ahead of the post, so his front is in shadow; a little
         sky-fill keeps him a shape instead of a hole */
      emissive: new THREE.Color(0.45, 0.45, 0.40) });
    const { group, parts } = humanoid(cls, mat);

    for (const m of parts) {
      World.heatables.push(m);
      m.userData.matNormal = mat;
      const v = cls.heat;
      m.userData.matThermal = new THREE.MeshBasicMaterial({
        color: new THREE.Color(v, v, v*0.96), fog: true });
    }

    /* Slung weapon — only resolvable in binos/NVG at close range. That is the
       point, so its silhouette must actually read as a weapon. */
    if (cls.armed) {
      const wm = new THREE.MeshPhongMaterial({ color: 0x141614, specular: 0x000000, shininess: 0 });
      const w = new THREE.Group();
      const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.56, 5), wm);
      brl.rotation.z = Math.PI/2; brl.position.x = -0.20; w.add(brl);
      const rec = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.075, 0.05), wm);
      rec.position.x = 0.16; w.add(rec);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.19, 0.04), wm);
      mag.position.set(0.10, -0.12, 0); mag.rotation.z = 0.2; w.add(mag);
      const stk = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.085, 0.045), wm);
      stk.position.x = 0.44; w.add(stk);
      if (cls.stance === 'PRONE') { w.position.set(0.26, 0.15, -0.30); w.rotation.y = 0.22; }
      else if (cls.stance === 'CROUCH') { w.position.set(0.24, 0.72, -0.10); w.rotation.set(0, 0.3, -0.5); }
      else { w.position.set(0.26, 0.95, -0.06); w.rotation.set(0, 0.25, -1.05); }
      w.traverse(m => {
        if (!m.isMesh) return;
        m.castShadow = true;
        World.heatables.push(m);
        m.userData.matNormal = wm;
        m.userData.matThermal = new THREE.MeshBasicMaterial({
          color: new THREE.Color(0.22, 0.22, 0.22), fog: true });
      });
      group.add(w); group.userData.weapon = w;
    }
    return group;
  }

  function crossingPoint(route, spec) {
    if (route === 'PATROL') return spec.x > 0 ? -460 : 460;     // walks the frontage
    if (route === 'CULVERT') return W.culvertX;
    if (route === 'FENCE_GAP') {
      const dead = World.floodlights.filter(f => f.dead);
      return dead.length ? dead[(Math.random()*dead.length)|0].x : 0;
    }
    return null;                         // OPEN — never crosses
  }

  function spawn(spec, tNow) {
    const cls = DOCTRINE.classes[spec.type];
    const c = {
      id: nextId++, type: spec.type, cls, decoy: !!spec.decoy, route: spec.route,
      x: spec.x,
      z: spec.route === 'PATROL' ? W.patrolZ : (-360 + Math.random()*42),
      targetX: crossingPoint(spec.route, spec),
      state: STATE.APPROACH, stateT: 0,
      moveT: 1 + Math.random()*2, freezeT: 0, frozenFor: 0,
      spawnT: tNow,
      /* --- trainee's record against this contact --- */
      designated:false, designatedT:null, designatedZ:null,
      reported:false, reportedGrid:null, challenged:false, illuminated:false,
      qrtSent:false, warned:false, armedIdentified:false, idProgress:0,
      eyesOn:0, everSeen:false, resolvedAt:null, verdict:null,
      cueMissedLog: []
    };
    c.mesh = bodyFor(cls, spec.type);
    c.heading = 0; c.tac = null; c.wp = null; c.lastX = c.x; c.lastZ = c.z;
    c.mesh.position.set(c.x, World.heightAt(c.x, c.z), c.z);
    scene.add(c.mesh);
    list.push(c);
    return c;
  }

  /* --- is the trainee actually looking at this contact right now? --------- */
  function observation(c, cam, optic) {
    const dx = c.x - cam.position.x, dz = c.z - cam.position.z;
    const dist = Math.hypot(dx, dz);
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
    const to  = new THREE.Vector3(dx, 0, dz).normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(fwd.clone().setY(0).normalize().dot(to), -1, 1));
    const halfFov = THREE.MathUtils.degToRad(optic.fov) / 2;
    return {
      dist, ang,
      inView:  ang < halfFov * 0.92 && dist < optic.range,
      onCross: ang < THREE.MathUtils.degToRad(Math.min(3.2, optic.fov * 0.18)) && dist < optic.range
    };
  }

  /* ========================================================================
     HOW THEY MOVE
     A real crossing is not a man walking at the wire. Far out he moves
     crouched and stops to look. Once inside crawling range he goes to the
     ground and works from one stand of grass to the next: crawl, freeze, a
     short crouched dash across an open patch when he thinks nobody is looking,
     sometimes rising to a knee for a few seconds to check his line — the
     moment a sentry can catch him. Every man rolls his own rhythm.
     ======================================================================== */
  const rr = (a, b) => a + Math.random() * (b - a);

  function pickTactic(c, watched) {
    const far  = c.z < W.zeroLineZ - 20;
    const strip = c.z > W.fenceZ - 26;
    const k = Math.random();
    let mode, t, sp;
    if (c.type === 'SMUGGLER') {
      if (strip)            { mode = 'RUN';    t = rr(3, 6);   sp = 4.0; }
      else if (k < 0.55)    { mode = 'CROUCH'; t = rr(4, 9);   sp = 1.9; }
      else if (k < 0.75)    { mode = 'KNEEL';  t = rr(1.5, 4); sp = 0; }
      else                  { mode = 'FLAT';   t = rr(3, 8);   sp = 0; }
    } else if (strip)       { mode = Math.random() < 0.8 ? 'RUN' : 'CRAWL'; t = rr(3, 7); sp = mode === 'RUN' ? 4.3 : 0.9; }
    else if (far) {
      if (k < 0.72)         { mode = 'CROUCH'; t = rr(5, 12);  sp = 2.0; }
      else if (k < 0.88)    { mode = 'KNEEL';  t = rr(1.5, 4); sp = 0; }
      else                  { mode = 'FLAT';   t = rr(2, 5);   sp = 0; }
    } else {
      /* (crawl and dash rates are compressed for a five-minute shift) */
      if (k < 0.46)         { mode = 'CRAWL';  t = rr(4, 10);  sp = rr(1.15, 1.55); }
      else if (k < 0.66)    { mode = 'FLAT';   t = rr(2, 8);   sp = 0; }
      else if (k < 0.89 && !watched) { mode = 'CROUCH'; t = rr(3, 6); sp = 2.6; }      // a dash between stands
      else                  { mode = 'KNEEL';  t = rr(1.5, 3.0); sp = 0; }             // a look over the grass
    }
    c.tac = { mode, t, sp: sp * (c.cls.speed / 2.95) };
  }

  function nextWaypoint(c) {
    /* Work toward the crossing point, choosing each bound for cover: try a
       few spots ahead and take the one in the thickest grass, with some luck. */
    const gx = c.targetX !== null ? c.targetX : c.x;
    let best = null, bs = -1e9;
    for (let i = 0; i < 6; i++) {
      const fwd = rr(9, 26);
      const toward = THREE.MathUtils.clamp((gx - c.x) * 0.35, -14, 14);
      const x = c.x + toward + rr(-14, 14);
      const z = Math.min(c.z + fwd, W.fenceZ + 34);
      const cover = World.__gPatch ? World.__gPatch(x, z) : 0.5;
      const score = cover * 2.0 - Math.abs(gx - x) * 0.012 + Math.random() * 0.5;
      if (score > bs) { bs = score; best = { x, z }; }
    }
    if (c.z > W.fenceZ - 30) best = { x: gx + rr(-2, 2), z: W.fenceZ + 34 };   // last strip: straight at the gap
    c.wp = best;
  }

  function moveContact(c, dt, tNow, obs, env) {
    const hostile = c.cls.hostile && c.route !== 'PATROL';
    if (hostile) {
      const watched = obs.inView && obs.dist < 420 && !env.blinded;
      if (!c.tac || (c.tac.t -= dt) <= 0) pickTactic(c, watched);
      if (!c.wp || Math.hypot(c.wp.x - c.x, c.wp.z - c.z) < 2.5) nextWaypoint(c);
      const sp = c.tac.sp * (c.state === STATE.CROSS && c.tac.mode === 'RUN' ? 1.0 : 1.0);
      if (sp > 0) {
        const dx = c.wp.x - c.x, dz = c.wp.z - c.z, L = Math.hypot(dx, dz) || 1;
        c.x += dx / L * sp * dt; c.z += dz / L * sp * dt;
      }
      return;
    }
    // everyone else: the old steady rhythm, with a wander
    c.moveT -= dt;
    const burstOn = c.moveT > 0;
    if (c.moveT < -(1.2 + Math.random()*2.5)) c.moveT = 2 + Math.random()*4;
    if (!burstOn) return;
    let sp = c.cls.speed;
    if (c.type === 'NILGAI' && Math.random() < dt*0.4) sp *= 2.2;
    const goalX = c.targetX !== null ? c.targetX : c.x + Math.sin(tNow*0.2 + c.id)*30;
    const goalZ = c.route === 'PATROL' ? W.patrolZ
                : c.targetX !== null   ? W.fenceZ + 34
                :                        c.z + 6 + Math.sin(tNow*0.13 + c.id*3.1)*10;
    const dxg = goalX - c.x, dzg = goalZ - c.z;
    const L = Math.hypot(dxg, dzg) || 1;
    c.x += (dxg/L) * sp * dt;
    c.z += (dzg/L) * sp * dt;
  }

  function animateContact(c, dt) {
    const vx = (c.x - c.lastX) / Math.max(dt, 1e-3), vz = (c.z - c.lastZ) / Math.max(dt, 1e-3);
    c.lastX = c.x; c.lastZ = c.z;
    const speed = Math.hypot(vx, vz);
    if (speed > 0.05) {
      const want = Math.atan2(vx, vz);
      let d = want - c.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      c.heading += d * Math.min(1, dt * 3.0);
    }
    c.mesh.rotation.y = c.heading;
    const rig = c.mesh.userData.rig, dog = c.mesh.userData.dog;
    if (rig) {
      let mode;
      if (c.cls.hostile && c.route !== 'PATROL') {
        mode = c.tac ? c.tac.mode : 'CROUCH';
        if (c.state === STATE.FREEZE) mode = (mode === 'KNEEL' || mode === 'CROUCH') ? 'KNEEL' : 'FLAT';
        if (c.state === STATE.HALTED) mode = 'KNEEL';
        if ((mode === 'CRAWL' || mode === 'CROUCH' || mode === 'RUN') && speed < 0.05) mode = mode === 'CRAWL' ? 'FLAT' : 'KNEEL';
      } else {
        mode = c.state === STATE.HALTED ? 'STAND' : speed > 0.05 ? 'WALK' : 'STAND';
      }
      Rigs.pose(rig, mode, dt, speed);
    } else if (dog) {
      Rigs.poseDog(dog, dt, speed);
    } else if (c.cls.stance === 'QUAD') {
      // the Gemini cattle and nilgai: a plodding head-and-body bob, and
      // the head goes down to graze when they stop
      c.gait = (c.gait || Math.random() * 6) + dt * (0.8 + speed * 2.2);
      c.mesh.position.y += speed > 0.05 ? Math.abs(Math.sin(c.gait * 2.0)) * 0.04 : 0;
      c.mesh.rotation.z = speed > 0.05 ? Math.sin(c.gait * 2.0) * 0.025 : 0;
      c.mesh.rotation.x = speed > 0.05 ? 0 : 0.05 + Math.sin(c.gait * 0.3) * 0.03;
    }
  }

  function update(dt, tNow, cam, optic, env) {
    const disturbers = [];

    for (const c of list) {
      if (c.state === STATE.THROUGH || c.state === STATE.APPREHENDED ||
          c.state === STATE.NEUTRALISED || c.state === STATE.WITHDRAWN) continue;

      const obs = observation(c, cam, optic);
      c.lastObs = obs;

      /* ---- the trainee has eyes on: accumulate, and let them ID the weapon */
      if (obs.onCross && !env.blinded) {
        c.eyesOn += dt; c.everSeen = true;
        const canID = (optic.id === 'BINO' || optic.id === 'NVG') &&
                      obs.dist < 260 && (env.illuminated || optic.id === 'NVG');
        if (canID) { c.idProgress += dt; if (c.idProgress > 2.0) c.armedIdentified = c.cls.armed || c.armedIdentified; }
      }

      /* ---- the contact reacts to being watched ---------------------------
         Hostiles are disciplined: they move only while your arc is elsewhere. */
      const watched = obs.inView && obs.dist < 420 && !env.blinded;
      const lit     = env.searchlightOn && Math.abs(c.x - env.searchlightX) < 45 && c.z > W.treelineZ + 40;
      const flared  = env.illuminated;

      if (c.cls.hostile) {
        if ((watched && obs.onCross) || lit || (flared && watched)) {
          c.freezeT = Math.max(c.freezeT, lit ? 6 : 3.5);
        }
        // light pressure can turn an approach back before the zero line
        if (lit && c.z < W.zeroLineZ && Math.random() < dt * 0.05) {
          c.state = STATE.WITHDRAWN; c.verdict = 'WITHDREW under illumination'; c.resolvedAt = tNow;
        }
      }

      c.stateT += dt;

      if (c.state === STATE.HALTED) { /* challenged and complying */ }
      else if (c.freezeT > 0) {
        c.freezeT -= dt; c.state = STATE.FREEZE; c.frozenFor += dt;
        /* A man cannot lie in the open indefinitely. Held down for this long he
           either chances it or backs off — without this, a trainee who simply
           stares at one bearing pins a contact there for the whole shift and
           nothing is ever resolved. */
        if (c.frozenFor > 26) {
          c.frozenFor = 0; c.freezeT = 0;
          if (c.cls.hostile && c.z < W.zeroLineZ && Math.random() < 0.45) {
            c.state = STATE.WITHDRAWN; c.resolvedAt = tNow;
            c.verdict = 'WITHDREW — could not move under observation';
          } else {
            c.moveT = 3 + Math.random()*3;          // chances it
          }
        }
      }
      else {
        c.frozenFor = 0;
        c.state = (c.z > W.fenceZ - 25) ? STATE.CROSS : STATE.APPROACH;
        moveContact(c, dt, tNow, obs, env);
      }

      /* Follow the ground. A man who drops into a fold or the nallah is in
         genuine dead ground — which is exactly the lane a trainee must learn
         to watch, and it now happens for real rather than by assertion. */
      c.mesh.position.set(c.x, World.heightAt(c.x, c.z), c.z);
      animateContact(c, dt);

      /* ---- grass betrays anything in it ----------------------------------
         Moving: wide radius, violent sway across the wind — obvious if you are
         looking at that bearing. Frozen: no sway at all, but his body is still
         lying in crushed grass. That flattened patch is the only thing that
         gives a frozen man away, and it is very easy to scan straight past.  */
      if (c.z < W.fenceZ && !c.resolvedAt && c.route !== 'PATROL') {
        const moving = c.state !== STATE.FREEZE && c.state !== STATE.HALTED;
        const big = c.cls.stance === 'QUAD';
        disturbers.push({
          x: c.x, z: c.z,
          motion: moving ? 1.0 : 0.0,
          r: moving ? (big ? 7.5 : 5.5) : (big ? 3.4 : 2.6)
        });
      }

      if (c.route === 'PATROL' && Math.abs(c.x) > 450) {
        c.state = STATE.WITHDRAWN; c.resolvedAt = tNow;
        c.verdict = c.verdict || 'patrol completed its beat';
      }

      /* ---- BREACH ---------------------------------------------------------*/
      if (c.cls.hostile && c.z > W.fenceZ + 14) {
        c.state = STATE.THROUGH; c.resolvedAt = tNow;
        c.verdict = 'BREACH — crossed undetected';
        Sim.onBreach(c);
      }
      if (!c.cls.hostile && c.z > W.fenceZ - 30 && c.targetX === null) c.z -= 12 * dt; // livestock drift back
    }

    disturbers.sort((a,b) => a.z - b.z);
    World.setDisturbers(disturbers.slice(0, 8));
  }

  /* ---- trainee designates whatever is under the crosshair ---------------- */
  function designate(cam, optic, tNow) {
    let best = null, bestAng = 1e9;
    for (const c of list) {
      if (c.resolvedAt) continue;
      const o = observation(c, cam, optic);
      const tol = THREE.MathUtils.degToRad(Math.min(4.0, optic.fov * 0.22));
      if (o.ang < tol && o.dist < optic.range && o.ang < bestAng) { bestAng = o.ang; best = c; }
    }
    if (best && !best.designated) {
      best.designated = true; best.designatedT = tNow; best.designatedZ = best.z;
      best.reportedGrid = World.gridRef(best.x, best.z);
    }
    return best;
  }

  return {
    STATE,
    init(sc) { scene = sc; list = []; nextId = 1; },
    spawn, update, designate,
    all: () => list,
    active: () => list.filter(c => !c.resolvedAt),
    hostilesLoose: () => list.filter(c => c.cls.hostile && !c.resolvedAt).length,
    remove(c) { scene.remove(c.mesh); }
  };
})();
