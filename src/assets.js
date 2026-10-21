/* MORCHA :: ASSETS — real CC0 geometry, instanced.
   Models are Poly Haven CC0 glTF (1k PBR). Everything here is local: the folder
   still runs offline from a USB stick.

   Primitives were the reason the scene read as blocky. A sandbag is not a box
   and a bush is not a squashed sphere — the silhouette is what the eye reads,
   especially at night when that is ALL it has. */

const Assets = (function () {

  /* Gemini 4 Argon models (models/gemini/). Multi-part: every part is kept. */
  const GEMINI = {
    g_morcha:  'models/gemini/bsf_border_bunker_morcha.glb',
    g_fence:   'models/gemini/india_pakistan_border_fence_3m.glb',
    g_mast:    'models/gemini/indian_border_floodlight_mast.glb',
    g_insas:   'models/gemini/insas_556_assault_rifle.glb',
    g_rangers: 'models/gemini/pakistan_rangers_border_outpost.glb',
    g_cow:     'models/gemini/cow.glb',
    g_nilgai:  'models/gemini/nilgai.glb',
    g_dog:     'models/gemini/stray_dog.glb',
    g_kikar:   'models/gemini/tree_kikar.glb',
    g_euc:     'models/gemini/tree_eucalyptus.glb',
    g_shisham: 'models/gemini/tree_shisham.glb'
  };

  const MODELS = {
    grassA:   'models/grass_medium_01/grass_medium_01_1k.gltf',
    grassB:   'models/grass_medium_02/grass_medium_02_1k.gltf',
    shrub:    'models/shrub_04/shrub_04_1k.gltf',
    bush:     'models/wild_rooibos_bush/wild_rooibos_bush_1k.gltf'
  };

  /* Rigged, animated characters — kept whole (skeleton + clips), cloned per use. */
  const RIGS = {
    r_soldier: 'models/rig/Soldier.glb',
    r_fox:     'models/rig/Fox.glb'
  };

  const store = {};          // name -> { geo, mat, size }
  let onProgress = null;

  /* Flatten a loaded glTF into ONE geometry + material so it can be instanced.
     These assets are single-object scans, so this is lossless in practice. */
  function flatten(gltf) {
    const metas = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      metas.push({ g, m: o.material });
    });
    if (!metas.length) return null;
    // keep the highest-vertex mesh; the rest of these assets are single-part
    metas.sort((a, b) => b.g.attributes.position.count - a.g.attributes.position.count);
    const geo = metas[0].g, mat = metas[0].m;

    // re-origin to the base centre so instances sit ON the ground, not through it
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const size = new THREE.Vector3();
    geo.boundingBox.getSize(size);
    return { geo, mat, size };
  }

  /* Keep EVERY mesh of a model, transforms baked, re-origined as a whole to the
     centre of its base. part.name is the glTF node/mesh name ("glass", ...). */
  function allParts(gltf) {
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      parts.push({ geo: g, mat: o.material,
                   name: (o.name || '') + ' ' + ((o.parent && o.parent.name) || '') });
    });
    if (!parts.length) return null;
    const bb = new THREE.Box3();
    for (const p of parts) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
    const dx = -(bb.min.x + bb.max.x) / 2, dy = -bb.min.y, dz = -(bb.min.z + bb.max.z) / 2;
    for (const p of parts) { p.geo.translate(dx, dy, dz); p.geo.computeBoundingSphere(); }
    const size = new THREE.Vector3(); bb.getSize(size);
    parts.sort((a, b) => b.geo.attributes.position.count - a.geo.attributes.position.count);
    return { parts, size, geo: parts[0].geo, mat: parts[0].mat };
  }

  function loadOne(loader, name, url, multi) {
    return new Promise(resolve => {
      loader.load(url, gltf => {
        const f = multi ? allParts(gltf) : flatten(gltf);
        if (f) store[name] = f;
        if (onProgress) onProgress(name);
        resolve();
      }, undefined, err => {
        console.warn('[assets] failed:', name, url, err && err.message);
        if (onProgress) onProgress(name);
        resolve();                       // a missing prop must not stop the shift
      });
    });
  }

  return {
    load(progressCb) {
      onProgress = progressCb;
      const loader = new THREE.GLTFLoader();
      return Promise.all([
        ...Object.keys(MODELS).map(k => loadOne(loader, k, MODELS[k], false)),
        ...Object.keys(GEMINI).map(k => loadOne(loader, k, GEMINI[k], true)),
        ...Object.keys(RIGS).map(k => new Promise(resolve => loader.load(RIGS[k], g => {
          store[k] = { scene: g.scene, animations: g.animations };
          if (onProgress) onProgress(k); resolve();
        }, undefined, () => { if (onProgress) onProgress(k); resolve(); })))
      ]);
    },
    count: () => Object.keys(MODELS).length + Object.keys(GEMINI).length + Object.keys(RIGS).length,
    rig: name => store[name] && store[name].animations ? store[name] : null,

    /* Every part of a multi-part model as one Group. opts.skip: part names to
       leave out; opts.mat(part) may return a replacement material. */
    group(name, opts) {
      const s = store[name]; if (!s) return null;
      const o = opts || {};
      const g = new THREE.Group();
      for (const p of (s.parts || [{ geo: s.geo, mat: s.mat, name: '' }])) {
        if (o.skip && o.skip.some(k => p.name.indexOf(k) >= 0)) continue;
        const m = new THREE.Mesh(p.geo, (o.mat && o.mat(p)) || p.mat);
        m.name = p.name.trim();
        g.add(m);
      }
      return g;
    },

    /* One InstancedMesh per part, all sharing the same placements. */
    instancedParts(name, count, place, opts) {
      const s = store[name]; if (!s || count <= 0) return [];
      const o = opts || {};
      const d = new THREE.Object3D(), mats = [];
      for (let i = 0; i < count; i++) {
        d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
        place(i, d, s.size); d.updateMatrix(); mats.push(d.matrix.clone());
      }
      const out = [];
      for (const p of (s.parts || [{ geo: s.geo, mat: s.mat, name: '' }])) {
        if (o.skip && o.skip.some(k => p.name.indexOf(k) >= 0)) continue;
        const im = new THREE.InstancedMesh(p.geo, (o.mat && o.mat(p)) || p.mat, count);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        im.name = p.name.trim();
        out.push(im);
      }
      return out;
    },
    has: n => !!store[n],
    size: n => store[n] ? store[n].size.clone() : new THREE.Vector3(1, 1, 1),

    /* A single copy — for the rifle, the telephone, one-off props. */
    single(name, opts) {
      const s = store[name]; if (!s) return null;
      const o = opts || {};
      const mat = s.mat.clone();
      if (o.color) mat.color = new THREE.Color(o.color);
      if (o.roughness !== undefined) mat.roughness = o.roughness;
      if (o.noMap) mat.map = null;          // scanned props carry printed branding
      const m = new THREE.Mesh(s.geo, mat);
      if (o.height) { const k = o.height / s.size.y; m.scale.setScalar(k); }
      return m;
    },

    /* Many copies in ONE draw call. Placement callback gets (i, dummy) and sets
       the dummy's transform; we bake the matrix. */
    instanced(name, count, place, opts) {
      const s = store[name]; if (!s || count <= 0) return null;
      const o = opts || {};
      const mat = s.mat.clone();
      if (o.color) mat.color = new THREE.Color(o.color);
      if (o.roughness !== undefined) mat.roughness = o.roughness;
      if (o.noMap) mat.map = null;          // scanned props carry printed branding
      const mesh = new THREE.InstancedMesh(s.geo, mat, count);
      const d = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
        place(i, d, s.size);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = false;
      return mesh;
    },

    names: () => Object.keys(store)
  };
})();
