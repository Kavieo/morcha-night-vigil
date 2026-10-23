/* MORCHA :: RIGS — real skinned people and animals, posed by hand.

   The contact bodies used to be capsules; prone, a man read as a flat line.
   Now: a rigged human (Mixamo skeleton, from the three.js examples) and a
   rigged fox standing in for the stray dog / jackal (glTF sample model — model
   CC0 PixelMannen, rig and animation CC-BY 4.0 @tomkranis).

   The soldier ships with Idle / Walk / Run. Everything a man actually does
   crossing a border at night — the leopard crawl, the crouched walk, going
   flat, rising to a knee to look — is built here by driving the bones, so
   each man moves on his own random rhythm instead of looping one clip. */

const Rigs = (function () {

  const qa = new THREE.Quaternion(), ea = new THREE.Euler();

  /* One posed human. mode: 'WALK' | 'CROUCH' | 'RUN' | 'CRAWL' | 'FLAT' | 'KNEEL' | 'STAND' */
  function human(opts) {
    const src = Assets.rig('r_soldier');
    if (!src) return null;
    const model = THREE.SkeletonUtils.clone(src.scene);
    const root = new THREE.Group();          // on the ground, yawed to the heading
    const body = new THREE.Group();          // pitched over for the prone modes
    root.add(body); body.add(model);
    model.rotation.y = Math.PI;              // the file faces -Z; our heading is +Z

    const tint = opts.tint || new THREE.Color(0.30, 0.29, 0.25);
    const mats = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const m = o.material.clone();
      m.color = tint.clone();
      if (m.metalness !== undefined) { m.metalness = 0; m.roughness = 1; }
      m.emissive = new THREE.Color(opts.fill || 0.0, opts.fill || 0.0, (opts.fill || 0.0) * 0.9);
      o.material = m; mats.push(o);
    });

    const bones = {};
    model.traverse(o => { if (o.isBone) bones[o.name.replace('mixamorig', '')] = o; });
    const bind = {};
    for (const k in bones) bind[k] = bones[k].quaternion.clone();
    /* For posing about the BODY's axes (sideways, front-back, along the spine)
       instead of each bone's own local axes: each bone's parent orientation
       relative to the model, in the bind pose. */
    model.updateMatrixWorld(true);
    const mq = new THREE.Quaternion(); model.getWorldQuaternion(mq); mq.invert();
    const prel = {};
    for (const k in bones) {
      const pq = new THREE.Quaternion(); bones[k].parent.getWorldQuaternion(pq);
      prel[k] = mq.clone().multiply(pq);
    }
    // which side is the character's left, in the model frame
    const lp = new THREE.Vector3(), rp = new THREE.Vector3();
    if (bones.LeftArm) bones.LeftArm.getWorldPosition(lp);
    if (bones.RightArm) bones.RightArm.getWorldPosition(rp);
    model.worldToLocal(lp); model.worldToLocal(rp);
    const side = Math.sign(lp.x - rp.x) || -1;

    const mixer = new THREE.AnimationMixer(model);
    const clip = n => src.animations.find(a => a.name === n);
    const act = {};
    for (const n of ['Idle', 'Walk', 'Run']) {
      const c = clip(n); if (!c) continue;
      act[n] = mixer.clipAction(c); act[n].play(); act[n].setEffectiveWeight(0);
    }

    const h = { root, body, model, bones, bind, prel, side, mixer, act, mode: 'STAND', phase: Math.random() * 10,
                fill: opts.fill || 0,
                glow: (opts.tint || new THREE.Color(1, 1, 1)).clone().lerp(new THREE.Color(0.86, 0.91, 1.0), 0.5),
                speed: 1, meshes: mats, hipsY: bones.Hips ? bones.Hips.position.y : 100 };
    return h;
  }

  function rot(b, x, y, z) {               // additive local rotation, radians
    if (!b) return;
    ea.set(x, y, z, 'XYZ'); qa.setFromEuler(ea); b.quaternion.multiply(qa);
  }

  /* Rotate a bone about a MODEL-frame axis: X = across the body, Y = along the
     spine (up), Z = front-back. */
  const AX = { X: new THREE.Vector3(1,0,0), Y: new THREE.Vector3(0,1,0), Z: new THREE.Vector3(0,0,1) };
  const qd = new THREE.Quaternion(), qi = new THREE.Quaternion();
  function rotM(h, name, axis, ang) {
    const b = h.bones[name]; if (!b || !ang) return;
    const pr = h.prel[name];
    qa.setFromAxisAngle(AX[axis], ang);
    qi.copy(pr).invert();
    qd.copy(qi).multiply(qa).multiply(pr);
    b.quaternion.premultiply(qd);
  }

  function weights(h, w) {
    for (const k in h.act) h.act[k].setEffectiveWeight(w[k] || 0);
  }

  /* Advance and pose. speed = ground speed in m/s (drives the gait rate). */
  /* How much he shows. Up on a knee, crouch-dashing or running, the moon
     catches his shoulders and he is a man-shape over the grass. Flat or
     crawling he is part of the ground. Eased, so he never pops. */
  const SHOW = { KNEEL: 1.0, CROUCH: 0.9, RUN: 1.0, WALK: 1.0, STAND: 1.0, CRAWL: 0.55, FLAT: 0.32 };
  function exposure(h, mode, dt) {
    const want = SHOW[mode] !== undefined ? SHOW[mode] : 1;
    h.show = h.show === undefined ? want : h.show + (want - h.show) * Math.min(1, dt * 2.5);
    const f = h.fill * h.show;
    for (const m of h.meshes) {
      const mt = m.userData.matNormal || m.material;
      if (mt.emissive) mt.emissive.copy(h.glow).multiplyScalar(f);
    }
  }

  function pose(h, mode, dt, speed) {
    const B = h.bones;
    h.mode = mode;
    if (h.fill) exposure(h, mode, dt);
    const s = Math.max(0, speed || 0);
    const moving = s > 0.05;
    h.phase += dt * (moving ? (0.9 + s * 1.1) : 0.6);
    const p = h.phase;

    // clip-driven modes
    if (mode === 'WALK' || mode === 'CROUCH' || mode === 'RUN' || mode === 'STAND' || mode === 'KNEEL') {
      if (mode === 'RUN')       { weights(h, { Run: 1 }); h.act.Run.timeScale = 0.75 + s * 0.08; }
      else if (moving)          { weights(h, { Walk: 1 }); h.act.Walk.timeScale = mode === 'CROUCH' ? 0.55 + s * 0.35 : 0.6 + s * 0.3; }
      else                      { weights(h, { Idle: 1 }); h.act.Idle.timeScale = 0.8; }
      h.mixer.update(dt);
      h.body.rotation.set(0, 0, 0); h.body.position.set(0, 0, 0);

      if (mode === 'CROUCH') {
        // low, bent at the hips and knees, head up, weapon held in
        h.body.position.y = -0.36;
        rot(B.Spine, 0.32, 0, 0); rot(B.Spine1, 0.18, 0, 0); rot(B.Neck, -0.30, 0, 0);
        rot(B.LeftUpLeg, -0.75, 0, 0.04); rot(B.RightUpLeg, -0.75, 0, -0.04);
        rot(B.LeftLeg, 1.05, 0, 0); rot(B.RightLeg, 1.05, 0, 0);
        rot(B.LeftFoot, -0.30, 0, 0); rot(B.RightFoot, -0.30, 0, 0);
        rot(B.LeftArm, 0.0, 0, 0.35); rot(B.RightArm, 0.0, 0, -0.35);
      } else if (mode === 'RUN') {
        rot(B.Spine, 0.22, 0, 0); rot(B.Neck, -0.18, 0, 0);
        h.body.position.y = -0.08;
      } else if (mode === 'KNEEL') {
        // down on the right knee, upright from the waist, scanning
        h.body.position.y = -0.48;
        rot(B.LeftUpLeg, -1.45, 0, 0.10); rot(B.LeftLeg, 1.50, 0, 0);
        rot(B.RightUpLeg, 0.05, 0, -0.06); rot(B.RightLeg, 1.70, 0, 0); rot(B.RightFoot, 0.6, 0, 0);
        rot(B.Spine, 0.10, Math.sin(p * 0.5) * 0.25, 0);
        rot(B.Neck, -0.10, Math.sin(p * 0.37 + 1.0) * 0.45, 0);
        rot(B.LeftArm, 0, 0, 0.30); rot(B.RightArm, 0, 0, -0.30);
      }
      return;
    }

    // hand-posed prone modes: bones from the bind (T) pose
    weights(h, {});
    for (const k in h.bind) B[k] && B[k].quaternion.copy(h.bind[k]);
    // face down, head toward the heading
    h.body.rotation.set(Math.PI / 2, 0, 0);
    h.body.position.set(0, 0.17, -0.95);

    const S = h.side;              // +1 if the character's left is +X in the model frame
    if (mode === 'CRAWL') {
      /* Leopard crawl, in the body's own frame (prone, the coronal plane IS
         the ground): one arm reaches up past the head while the opposite knee
         swings up beside the hip, then they swap; the spine snakes into it. */
      const c = Math.sin(p * 2.0);
      const L = 0.5 + 0.5 * c, R = 0.5 - 0.5 * c;
      const kl = Math.pow(Math.max(0, -c), 0.8), kr = Math.pow(Math.max(0, c), 0.8);   // one knee at a time
      rotM(h, 'Spine',  'Z', c * 0.10 * S);  rotM(h, 'Spine1', 'Z', c * 0.08 * S);
      rotM(h, 'Neck', 'X', -0.55);  rotM(h, 'Head', 'X', -0.30);
      // arms: from the T, raised in the ground plane toward the head ...
      rotM(h, 'LeftArm',  'Z',  S * (0.75 + L * 0.55));
      rotM(h, 'RightArm', 'Z', -S * (0.75 + R * 0.55));
      // ... forearms folded in toward the head line, elbows on the ground
      rotM(h, 'LeftForeArm',  'Z',  S * (1.35 - L * 0.95));
      rotM(h, 'RightForeArm', 'Z', -S * (1.35 - R * 0.95));
      // legs: the pushing knee swings out and up beside the hip, shin folding back
      rotM(h, 'LeftUpLeg',  'Z',  S * (0.12 + kl * 1.10));
      rotM(h, 'RightUpLeg', 'Z', -S * (0.12 + kr * 1.10));
      rotM(h, 'LeftLeg',  'Z', -S * (0.04 + kl * 1.50));
      rotM(h, 'RightLeg', 'Z',  S * (0.04 + kr * 1.50));
      rotM(h, 'LeftFoot', 'X', 0.6); rotM(h, 'RightFoot', 'X', 0.6);
      h.body.position.y = 0.16;
    } else {
      /* FLAT: gone to ground — cheek in the dirt, forearms tucked under the
         head, legs straight and a little apart. Not a muscle moving. */
      rotM(h, 'Neck', 'Y', 0.9 * S); rotM(h, 'Head', 'Y', 0.4 * S);
      rotM(h, 'LeftArm',  'Z',  S * 0.95);  rotM(h, 'RightArm', 'Z', -S * 0.95);
      rotM(h, 'LeftForeArm',  'Z',  S * 1.9); rotM(h, 'RightForeArm', 'Z', -S * 1.9);
      rotM(h, 'LeftUpLeg',  'Z', S * 0.14); rotM(h, 'RightUpLeg', 'Z', -S * 0.14);
      rotM(h, 'LeftFoot', 'X', 0.9); rotM(h, 'RightFoot', 'X', 0.9);
      h.body.position.y = 0.13 + Math.sin(p * 1.4) * 0.005;
    }
  }

  /* The fox, as a stray dog or jackal: trots, runs, stops to look about. */
  function dog() {
    const src = Assets.rig('r_fox');
    if (!src) return null;
    const model = THREE.SkeletonUtils.clone(src.scene);
    const root = new THREE.Group();
    model.scale.setScalar(0.0068);
    root.add(model);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const m = o.material.clone();
      m.color = new THREE.Color(0.55, 0.47, 0.38);    // dusty tan, not fox-orange
      if (m.metalness !== undefined) { m.metalness = 0; m.roughness = 1; }
      o.material = m;
    });
    const mixer = new THREE.AnimationMixer(model);
    const act = {};
    for (const a of src.animations) { act[a.name] = mixer.clipAction(a); act[a.name].play(); act[a.name].setEffectiveWeight(0); }
    return { root, model, mixer, act, phase: Math.random() * 10 };
  }

  function poseDog(d, dt, speed) {
    const w = speed > 2.2 ? { Run: 1 } : speed > 0.1 ? { Walk: 1 } : { Survey: 1 };
    for (const k in d.act) d.act[k].setEffectiveWeight(w[k] || 0);
    if (d.act.Walk) d.act.Walk.timeScale = 0.6 + speed * 0.45;
    if (d.act.Run) d.act.Run.timeScale = 0.7 + speed * 0.1;
    d.mixer.update(dt);
  }

  return { human, pose, dog, poseDog };
})();
