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

  function bodyFor(cls) {
    const mat = new THREE.MeshPhongMaterial({
      color: 0x0d0f0d, specular: 0x050505, shininess: 3 });
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
    c.mesh = bodyFor(cls);
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
        // bursts: move, then go still — the real rhythm of a night crawl
        c.moveT -= dt;
        const burstOn = c.moveT > 0;
        if (c.moveT < -(1.2 + Math.random()*2.5)) c.moveT = 2 + Math.random()*4;

        if (burstOn) {
          let sp = c.cls.speed;
          if (c.state === STATE.CROSS && c.cls.hostile) sp *= 2.3;    // final dash at the wire
          if (c.type === 'NILGAI' && Math.random() < dt*0.4) sp *= 2.2; // bolts
          const goalX = c.targetX !== null ? c.targetX : c.x + Math.sin(tNow*0.2 + c.id)*30;
          const goalZ = c.route === 'PATROL' ? W.patrolZ
                      /* PAST the breach line, not up to it. This was fenceZ+12
                         while a breach is declared at fenceZ+14, so a crawler
                         walked to his goal and stopped two metres short of the
                         wire, forever. Every breach in the exercise was
                         unreachable and a sentry who did nothing at all still
                         scored no breaches. */
                      : c.targetX !== null   ? W.fenceZ + 34
                      :                        c.z + 6;
          const dxg = goalX - c.x, dzg = goalZ - c.z;
          const L = Math.hypot(dxg, dzg) || 1;
          c.x += (dxg/L) * sp * dt;
          c.z += (dzg/L) * sp * dt;
        }
      }

      /* Follow the ground. A man who drops into a fold or the nallah is in
         genuine dead ground — which is exactly the lane a trainee must learn
         to watch, and it now happens for real rather than by assertion. */
      c.mesh.position.set(c.x, World.heightAt(c.x, c.z), c.z);
      c.mesh.rotation.y = Math.atan2(c.targetX !== null ? (c.targetX - c.x) : 0, 8);

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
