/* MORCHA :: WORLD — Punjab/Jammu IB. Night-lit AIOS fence, nallah, elephant grass.
   Textures in /tex are Poly Haven CC0. Everything else is generated at runtime,
   so the whole folder runs offline from a USB stick.                            */

const World = (function () {

  const W = DOCTRINE.world;
  /* Scene gain: everything is authored in near-physical units and brought back
     down by the exposure in the optics pass. Keeps the dark end off the floor. */
  const GAIN = 8;
  const hdr = (r,g,b) => new THREE.Color(r*GAIN, g*GAIN, b*GAIN);
  let scene, grassMat, skyMat, stars, village, mist = [];
  const heatables = [], bpMarkers = [], floodlights = [];
  let poolLights = [], visLights = [];
  let motes = null, interiorLights = null;
  const rangers = [];   // visible-light glow, invisible to a thermal imager                       // 6 roving real lights, see retargetLights()
  const TL = new THREE.TextureLoader();

  function tex(f, rep, srgb) {
    const t = TL.load('tex/' + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ---------- terrain height ----------------------------------------------
     The ground was a single flat quad, which is most of why this read as a
     model rather than a place. Punjab border country is flat FARMLAND, not a
     billiard table: metre-scale folds, field bunds, and the nallah cut.
     Everything that sits on the ground samples this one function, so the
     folds are real dead ground a crawler can and will use.                  */
  function heightAt(x, z) {
    let h = Math.sin(x*0.0125 + 1.3) * Math.cos(z*0.0102 - 0.7) * 0.62
          + Math.sin(x*0.0271 - 2.1) * Math.cos(z*0.0233 + 1.9) * 0.27
          + Math.sin(x*0.0604 + 0.4) * Math.cos(z*0.0561 - 2.6) * 0.105;
    // the fence and the patrol track run on graded ground
    const g = Math.min(Math.abs(z - W.fenceZ) / 48, 1);
    h *= 0.12 + 0.88 * g;
    // the nallah: genuine dead ground, the whole way in
    const nd = Math.abs(x - W.culvertX);
    if (nd < 27 && z < W.fenceZ + 38) {
      const across = 1 - nd/27;
      const along  = Math.min(1, (W.fenceZ + 38 - z) / 55);
      h -= across * across * along * 2.7;
    }
    return h;
  }

  /* ---------- generated textures ----------------------------------------- */
  function radialTex(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128,128,0,128,128,128);
    gr.addColorStop(0,    inner); gr.addColorStop(0.45,'rgba(255,225,170,0.38)');
    gr.addColorStop(0.78,'rgba(255,215,150,0.10)'); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0,0,256,256);
    return new THREE.CanvasTexture(c);
  }
  function bladeTex() {
    const c = document.createElement('canvas'); c.width = 96; c.height = 192;
    const g = c.getContext('2d'); g.clearRect(0,0,96,192);
    for (let i = 0; i < 26; i++) {
      const x0 = 48 + (Math.random()-0.5)*40, lean = (Math.random()-0.5)*44;
      const h  = 80 + Math.random()*108, w = 0.9 + Math.random()*2.1;
      const a  = 0.35 + Math.random()*0.65;
      const gd = g.createLinearGradient(0,192-h,0,192);
      gd.addColorStop(0,'rgba(255,255,255,'+(a*0.55)+')');
      gd.addColorStop(1,'rgba(255,255,255,'+a+')');
      g.strokeStyle = gd; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0,192);
      g.quadraticCurveTo(x0+lean*0.35, 192-h*0.6, x0+lean, 192-h); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; return t;
  }
  function mistTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i=0;i<120;i++){
      const x=Math.random()*256,y=Math.random()*256,r=25+Math.random()*70;
      const gr=g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,'rgba(190,205,215,0.055)'); gr.addColorStop(1,'rgba(190,205,215,0)');
      g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
    }
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
  }
  function labelTex(txt) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#b8b3a2'; g.fillRect(0,0,128,64);
    g.fillStyle = '#15150f'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
    g.fillText(txt, 64, 42);
    return new THREE.CanvasTexture(c);
  }

  /* ---------- thermal ----------------------------------------------------- */
  function registerHeat(mesh, heat) {
    mesh.userData.heat = heat; mesh.userData.matNormal = mesh.material;
    const v = Math.pow(heat, 1.5);   // widen the spread between a body and the ground
    mesh.userData.matThermal = new THREE.MeshBasicMaterial({
      color: hdr(v,v,v), transparent: mesh.material.transparent,
      alphaTest: mesh.material.alphaTest || 0, side: mesh.material.side, fog: true });
    heatables.push(mesh); return mesh;
  }
  let thermalOn = false;
  function setThermal(on) {
    thermalOn = on;
    for (const m of heatables) m.material = on ? m.userData.matThermal : m.userData.matNormal;
    grassMat.uniforms.uThermal.value = on ? 1 : 0;
    skyMat.uniforms.uThermal.value   = on ? 1 : 0;
    stars.visible = village.visible = !on;
    for (const m of mist) m.visible = !on;
    /* A thermal imager sees emitted heat, not lamplight. The floodlight pools,
       halos and beam shafts are visible-light phenomena and must disappear —
       which is exactly why a trainee on thermal loses his sense of where the
       lit ground is, and why he has to cross-check on another sight.        */
    for (const m of visLights) m.visible = !on;
    if (motes) motes.visible = !on;
  }

  /* ---------- sky: horizon reference, stars, moon -------------------------- */
  function buildSky() {
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uMoonDir:{value:new THREE.Vector3(-0.55,0.42,0.72).normalize()},
                  uMoon:{value:0.55}, uThermal:{value:0}, uFlare:{value:0}, uGain:{value:GAIN},
                  uSky:{value:null}, uHasSky:{value:0}, uSkyGain:{value:1.0} },
      vertexShader:`varying vec3 vD; void main(){ vD=normalize(position);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader:`
        uniform vec3 uMoonDir; uniform float uMoon,uThermal,uFlare,uGain,uHasSky,uSkyGain; varying vec3 vD;
        uniform sampler2D uSky;
        void main(){
          float h = clamp(vD.y, -0.1, 1.0);
          vec3 c;
          if (uHasSky > 0.5) {
            /* Gemini 4 Argon equirectangular night (Bortle 3-4, Milky Way, half
               moon). Decoded sRGB -> linear; it already holds its own moon. */
            vec3 d = normalize(vD);
            float u = atan(d.x, -d.z) / 6.2831853 + 0.5;
            float v = asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5;
            vec3 t = texture2D(uSky, vec2(u, v)).rgb;
            c = pow(t, vec3(2.2)) * uSkyGain;
          } else {
            vec3 zen = vec3(0.0016,0.0026,0.0062);
            vec3 hor = vec3(0.0085,0.0120,0.0210) * (0.5 + uMoon);
            c = mix(hor, zen, pow(clamp(h,0.0,1.0), 0.42));
          }
          // sodium glow from the fence floodlights and the villages, low on the horizon
          /* 2000 km of 1000 W sodium throws a hard orange band along the whole
             horizon over the fence. It is the loudest thing in the sky here. */
          float glow  = exp(-pow(max(h,0.0)*11.0, 1.5));
          float toFence = smoothstep(-0.15, 0.75, -normalize(vD).z);
          c += vec3(0.055,0.024,0.005) * glow * (0.40 + toFence*0.95);
          // the moon and its halo
          float md = max(dot(normalize(vD), uMoonDir), 0.0);
          if (uHasSky < 0.5) {
            c += vec3(0.85,0.88,1.0) * pow(md, 2200.0) * 2.2 * uMoon;
            c += vec3(0.055,0.065,0.095) * pow(md, 14.0) * uMoon;
          }
          c += vec3(0.9,0.85,0.7) * uFlare * 0.035 * glow;
          c = mix(c, vec3(0.004), uThermal);
          gl_FragColor = vec4(c*uGain,1.0);
        }`
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(2400, 64, 32), skyMat));
    TL.load('models/gemini/night_sky_360_equirectangular_8192x4096.jpg', t => {
      t.encoding = THREE.LinearEncoding;          // decoded by hand in the shader
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
      skyMat.uniforms.uSky.value = t; skyMat.uniforms.uHasSky.value = 1;
      if (stars) stars.visible = false;           // the panorama has real stars
    });

    // stars — thin them out toward the horizon where the haze eats them
    const N = 1400, pos = new Float32Array(N*3), sz = new Float32Array(N);
    for (let i=0;i<N;i++){
      const th = Math.random()*Math.PI*2, ph = Math.acos(Math.random()*0.97);
      const y = Math.cos(ph);
      pos[i*3]=Math.sin(ph)*Math.cos(th)*2200; pos[i*3+1]=y*2200; pos[i*3+2]=Math.sin(ph)*Math.sin(th)*2200;
      sz[i] = (Math.random()<0.08?4.5:1.8) * (0.3+y);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(sz,1));
    stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
      uniforms:{ uT:{value:0} },
      vertexShader:`attribute float aSize; varying float vA; uniform float uT;
        void main(){ vA = 0.55+0.45*sin(uT*1.7 + position.x*0.01);
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=aSize; gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`varying float vA; void main(){
        float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
        gl_FragColor=vec4(vec3(0.85,0.90,1.0)*6.0, (1.0-d*2.0)*vA*0.85); }`
    }));
    scene.add(stars);

    // village / town lights across the border — depth cue and atmosphere
    const M = 220, vp = new Float32Array(M*3);
    for (let i=0;i<M;i++){
      vp[i*3]=(Math.random()-0.5)*3000; vp[i*3+1]=1.2+Math.random()*4;
      vp[i*3+2]=W.treelineZ - 60 - Math.random()*900;
    }
    const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.BufferAttribute(vp,3));
    village = new THREE.Points(vg, new THREE.PointsMaterial({
      color:hdr(1.0,0.66,0.32), size:2.6, sizeAttenuation:false,
      transparent:true, opacity:0.75, blending:THREE.AdditiveBlending, depthWrite:false, fog:true }));
    scene.add(village);
  }

  /* ---------- ground ------------------------------------------------------- */
  function buildGround() {
    const soil = new THREE.MeshPhongMaterial({
      map: tex('soil_diff.jpg', 300, true),
      normalMap: tex('soil_nor_gl.jpg', 300),
      color: 0x1c1915, specular: 0x050505, shininess: 2
    });
    soil.normalScale.set(1.25, 1.25);
    // 240x240 quads out to 2.4 km: enough to carry the folds without a mesh cost
    const g = new THREE.PlaneGeometry(4800, 4800, 240, 240);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i);          // plane is still XY here
      pa.setZ(i, heightAt(x, -y));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, soil);
    m.rotation.x = -Math.PI/2; m.receiveShadow = true;
    scene.add(m); registerHeat(m, 0.16);

    // cultivated field band beyond the zero line
    const fg = new THREE.PlaneGeometry(2600, 520, 130, 26);
    const fa = fg.attributes.position;
    for (let i = 0; i < fa.count; i++)
      fa.setZ(i, heightAt(fa.getX(i), -fa.getY(i) + (W.zeroLineZ - 200)) + 0.03);
    fg.computeVertexNormals();
    const f = new THREE.Mesh(fg, new THREE.MeshPhongMaterial({
      map: tex('field_diff.jpg', 110, true), normalMap: tex('field_nor.jpg', 110),
      color: 0x21231a, specular: 0x000000, shininess: 0 }));
    f.rotation.x = -Math.PI/2; f.position.set(0, 0, W.zeroLineZ - 200); f.receiveShadow = true;
    scene.add(f); registerHeat(f, 0.13);

    // graded patrol track on our side
    const tg = new THREE.PlaneGeometry(W.fenceWidth*1.6, 9, 160, 2);
    const ta = tg.attributes.position;
    for (let i = 0; i < ta.count; i++)
      ta.setZ(i, heightAt(ta.getX(i), -ta.getY(i) + (W.fenceZ + 17)) + 0.05);
    tg.computeVertexNormals();
    const t = new THREE.Mesh(tg, new THREE.MeshPhongMaterial({
      map: tex('soil_diff.jpg', 80, true), color: 0x2e2a23, specular: 0x000000, shininess: 0 }));
    t.rotation.x = -Math.PI/2; t.position.set(0, 0, W.fenceZ + 17); t.receiveShadow = true;
    scene.add(t); registerHeat(t, 0.20);

    // field bunds — the low earth ridges that divide Punjab fields. Free realism,
    // and they break up the ground plane exactly the way the real thing does.
    const bundM = new THREE.MeshPhongMaterial({
      map: tex('soil_diff.jpg', 40, true), color: 0x1f1c17, specular: 0x000000, shininess: 0 });
    for (let k = 0; k < 14; k++) {
      const bz = W.zeroLineZ - 60 - k*38 - Math.random()*20;
      if (bz < W.treelineZ + 40) continue;
      const bg = new THREE.PlaneGeometry(1400, 1.7, 90, 1);
      const ba = bg.attributes.position;
      for (let i = 0; i < ba.count; i++)
        ba.setZ(i, heightAt(ba.getX(i), bz) + (Math.abs(ba.getY(i)) < 0.5 ? 0.42 : 0.06));
      bg.computeVertexNormals();
      const b = new THREE.Mesh(bg, bundM);
      b.rotation.x = -Math.PI/2; b.position.set((Math.random()-0.5)*300, 0, bz);
      b.receiveShadow = true; scene.add(b); registerHeat(b, 0.17);
    }
  }

  /* ---------- elephant grass: the detection cue lives here ------------------ */
  function buildGrass() {
    const n = W.grassTufts;
    const pos=new Float32Array(n*4*3), uv=new Float32Array(n*4*2),
          base=new Float32Array(n*4*3), sc=new Float32Array(n*4*2),
          rnd=new Float32Array(n*4), idx=new Uint32Array(n*6);

    let i = 0, guard = 0;
    while (i < n && guard++ < n*4) {
      /* Sample by BEARING and RANGE, not by a rectangle: the sentry is fixed, so
         angular density is what he actually sees. Density falls off with range
         exactly as apparent size does, which keeps the field looking even.      */
      const brg = (Math.random()-0.5)*Math.PI*1.08;
      /* Our own side of the wire is kept cleared — a sentry does not let scrub
         grow across his own arc. Everything beyond the fence is scrub and
         elephant grass, plus a thin fringe right at the parapet for framing. */
      const near = Math.random() < 0.012;
      const rng  = near ? (11 + Math.random()*9)
                        : (162 + Math.pow(Math.random(), 0.62) * 520);
      let x = Math.sin(brg)*rng, z = -Math.cos(brg)*rng;
      let tall = false;
      if (!near && Math.random()<0.18) { x = W.culvertX + (Math.random()-0.5)*90;  // elephant grass on the nallah
                                         z = W.zeroLineZ + Math.random()*190; tall = true; }
      if (!near && Math.random()<0.09) tall = true;      // scattered standing patches
      // cleared strip on the far side of the wire — he loses his cover for the last 25 m
      if (!near && z > W.fenceZ - 26) continue;

      /* Open ground is grazed and cut short — from an elevated OP a prone man
         is only partly hidden by it. The TALL patches (the nallah, and a few
         standing stands of elephant grass) are the ones that swallow him, and
         those are precisely the lanes a trainee must learn to watch.        */
      const h  = near ? (0.16+Math.random()*0.22)
               : tall ? (1.65+Math.random()*1.25)
               :        (0.58+Math.random()*0.52);
      const wd = near ? (0.18+Math.random()*0.2)
               : tall ? (0.55+Math.random()*0.55)
               :        (0.38+Math.random()*0.40);
      const rot= Math.random()*Math.PI;
      const cr=Math.cos(rot), sr=Math.sin(rot);
      const corner=[[-0.5,0],[0.5,0],[0.5,1],[-0.5,1]], uvs=[[0,0],[1,0],[1,1],[0,1]];
      for(let v=0;v<4;v++){
        const o=i*4+v;
        pos[o*3]=corner[v][0]*wd*cr; pos[o*3+1]=corner[v][1]*h; pos[o*3+2]=corner[v][0]*wd*sr;
        uv[o*2]=uvs[v][0]; uv[o*2+1]=uvs[v][1];
        base[o*3]=x; base[o*3+1]=heightAt(x,z); base[o*3+2]=z;
        sc[o*2]=h; sc[o*2+1]=corner[v][1];
        rnd[o]=Math.random();
      }
      const b=i*4;
      idx[i*6]=b; idx[i*6+1]=b+1; idx[i*6+2]=b+2; idx[i*6+3]=b; idx[i*6+4]=b+2; idx[i*6+5]=b+3;
      i++;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    geo.setAttribute('aBase',new THREE.BufferAttribute(base,3));
    geo.setAttribute('aScale',new THREE.BufferAttribute(sc,2));
    geo.setAttribute('aRand',new THREE.BufferAttribute(rnd,1));
    geo.setIndex(new THREE.BufferAttribute(idx,1));
    geo.computeBoundingSphere();

    grassMat = new THREE.ShaderMaterial({
      transparent:true, alphaTest:0.34, side:THREE.DoubleSide,
      uniforms:{
        uTime:{value:0}, uMap:{value:bladeTex()},
        uWind:{value:new THREE.Vector2(Math.cos(W.windDir), Math.sin(W.windDir))},
        uWindStr:{value:W.windStrength},
        uDisturb:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,0,0))},
        uFlood:{value:Array.from({length:16},()=>new THREE.Vector4(0,0,0,0))},
        uSLo:{value:new THREE.Vector3()}, uSLd:{value:new THREE.Vector3(0,0,-1)},
        uSLon:{value:0}, uFlarePos:{value:new THREE.Vector3(0,140,-280)}, uFlare:{value:0},
        uMoon:{value:0.55}, uThermal:{value:0}, uGain:{value:GAIN}, uA2C:{value:0},
        uFog:{value:0.0016}, uFogColor:{value:new THREE.Color(0x02030a)}
      },
      vertexShader:`
        attribute vec3 aBase; attribute vec2 aScale; attribute float aRand;
        uniform float uTime,uWindStr; uniform vec2 uWind; uniform vec4 uDisturb[8];
        uniform vec4 uFlood[16]; uniform vec3 uSLo,uSLd,uFlarePos;
        uniform float uSLon,uFlare,uMoon,uGain;
        varying vec2 vUv; varying float vTip,vRand,vFogD; varying vec3 vLight;
        void main(){
          vUv=uv; vTip=aScale.y; vRand=aRand;
          float ph = aBase.x*0.09 + aBase.z*0.07 + aRand*3.0;
          float sway = sin(uTime*1.15+ph)*0.6 + sin(uTime*2.31+ph*1.9)*0.22;
          vec2 off = uWind * sway * uWindStr * vTip;
          /* uDisturb = (x, motion, z, radius). motion drives the chaotic sway
             ACROSS the wind — the cue. The radius also FLATTENS the grass: a
             body crawling through leaves a crushed path, and that path is what
             a thermal imager finally gets a look at him through.            */
          float crush = 0.0;
          for(int i=0;i<8;i++){
            float R=uDisturb[i].w; if(R<=0.0) continue;
            vec2 d=aBase.xz-uDisturb[i].xz; float dist=length(d); if(dist>R) continue;
            float infl=pow(1.0-dist/R,1.6);
            crush = max(crush, infl);
            off += normalize(d+vec2(0.0001)) * sin(uTime*5.5-dist*2.4+aRand*6.0)
                   * infl * 0.9 * vTip * uDisturb[i].y;
          }
          vec3 lp = position; lp.y *= mix(1.0, 0.22, crush);
          vec3 wp = aBase + lp;
          wp.xz += off;
          /* --- light the blade here, once per vertex --- */
          vec3 L = vec3(0.072,0.092,0.160) * (0.30 + uMoon*1.55);
          for(int i=0;i<16;i++){
            float I = uFlood[i].w; if(I<=0.0) continue;
            float d = distance(wp, uFlood[i].xyz);
            L += vec3(1.0,0.52,0.14) * I * 10.5 / (1.0 + d*d*0.055);
          }
          if(uSLon > 0.5){
            vec3 sd = wp - uSLo; float dd = length(sd); sd /= dd;
            float cone = smoothstep(0.986, 0.9978, dot(sd, normalize(uSLd)));
            L += vec3(1.0,0.96,0.85) * cone * 30.0 / (1.0 + dd*dd*0.0035);
          }
          if(uFlare > 0.0){
            float d = distance(wp, uFlarePos);
            L += vec3(1.0,0.90,0.68) * uFlare * 2000.0 / (d*d + 3400.0);
          }
          vLight = L * uGain;
          vec4 mv = modelViewMatrix*vec4(wp,1.0);
          vFogD = -mv.z;
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader:`
        uniform sampler2D uMap; uniform float uThermal,uFog,uGain,uA2C;
        uniform vec3 uFogColor;
        varying vec2 vUv; varying float vTip,vRand,vFogD; varying vec3 vLight;
        void main(){
          vec4 t = texture2D(uMap,vUv);
          /* With multisampling on, alpha drives COVERAGE: a blade edge covers
             part of a pixel instead of all-or-nothing, so the field stops
             crawling. Without it, fall back to the hard cut. */
          float cov = 1.0;
          if (uA2C > 0.5) { if (t.a < 0.06) discard; cov = smoothstep(0.18, 0.50, t.a); }
          else if (t.a < 0.34) discard;
          float ao = 0.26 + vTip*0.74;                      // dark at the root
          vec3 albedo = mix(vec3(0.32,0.27,0.145), vec3(0.54,0.45,0.235), vRand);
          vec3 col = albedo * vLight * ao;
          col = mix(col, vec3(0.090*ao*uGain), uThermal);           // vegetation is cold
          float f = 1.0 - exp(-uFog*uFog*vFogD*vFogD);
          gl_FragColor = vec4(mix(col, uFogColor*uGain, clamp(f,0.0,1.0)), cov);
        }`
    });
    const m = new THREE.Mesh(geo, grassMat); m.frustumCulled = false; scene.add(m);
  }

  /* ========================================================================
     AIOS — ANTI-INFILTRATION OBSTACLE SYSTEM
     ------------------------------------------------------------------------
     Built to the real thing rather than to a row of cylinders:

       · Twin fence rows 3.2 m apart, posts on 3 m centres.
       · Posts are L-SECTION ANGLE IRON, 2.7 m, extruded from a real profile,
         each crowned with a Y-fork outrigger canted outward both ways.
       · 18 barbed strands per bay, hanging in a shallow CATENARY. Straight
         lines are the single clearest tell that a fence is computer-drawn.
       · A true HELICAL concertina coil crowning each row, plus the three-coil
         pyramid stacked in the trough between the rows.
       · A concrete footing collar at every post.

     Only |x| < 300 m is ever inside the post's arc, so the full detail is
     built there and the flanks fall back to the cheap version.
     ======================================================================== */

  function anglePostGeo(height) {
    // 75 x 75 x 6 mm angle iron
    const t = 0.006, w = 0.075;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(w, 0); sh.lineTo(w, t);
    sh.lineTo(t, t); sh.lineTo(t, w); sh.lineTo(0, w);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: height, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI/2);                 // extrude up
    g.translate(-w/2, 0, w/2);
    return g;
  }

  /* THREE.Curve is an ES class in r128, so this must be a real subclass —
     Curve.call(this) throws "cannot be invoked without 'new'". */
  class HelixCurve extends THREE.Curve {
    constructor(length, radius, turns) {
      super(); this.len = length; this.rad = radius; this.turns = turns;
    }
    getPoint(t, target) {
      const v = target || new THREE.Vector3();
      const a = t * this.turns * Math.PI * 2;
      return v.set(t * this.len, Math.cos(a) * this.rad, Math.sin(a) * this.rad);
    }
  }
  function helixGeo(length, radius, turns, tube) {
    return new THREE.TubeGeometry(new HelixCurve(length, radius, turns),
                                  Math.round(turns * 4), tube, 3, false);
  }

  function buildFence() {
    const half = W.fenceWidth / 2;
    const DETAIL = 300;                     // metres either side that get full detail
    const SPAN = 3.0;                       // post spacing
    const PH = 2.70;                        // post height
    const rows = [W.fenceZ, W.fenceZ + 3.2];

    const steel = new THREE.MeshPhongMaterial({
      map: tex('metal_diff.jpg', 1.4, true), color: 0x4a453c,
      specular: 0x22201c, shininess: 26 });
    const galv = new THREE.MeshPhongMaterial({
      color: 0x5a5f63, specular: 0x3a4046, shininess: 42 });
    const conc = new THREE.MeshPhongMaterial({
      map: tex('conc_diff.jpg', 0.9, true), color: 0x2b2924, specular: 0x000000, shininess: 0 });

    /* ---- posts, forks and footings, instanced ---------------------------- */
    const xs = [];
    for (let x = -half; x <= half; x += SPAN) xs.push(x);
    const detailXs = xs.filter(x => Math.abs(x) <= DETAIL);
    const gemFence = Assets.has('g_fence');
    const nPost = (gemFence ? xs.filter(x => Math.abs(x) > DETAIL).length : xs.length) * rows.length;
    const nFork = gemFence ? 1 : detailXs.length * rows.length * 2;

    const postGeo = anglePostGeo(PH);
    const posts = new THREE.InstancedMesh(postGeo, steel, nPost);
    const forkGeo = anglePostGeo(0.55);
    const forks = new THREE.InstancedMesh(forkGeo, steel, nFork);
    const footGeo = new THREE.CylinderGeometry(0.17, 0.21, 0.30, 7);
    const foots = new THREE.InstancedMesh(footGeo, conc, nPost);

    /* Gemini 4 Argon fence bay inside the arc: galvanised L-posts with Y
       outriggers, footings and the razor coils. Its barbed strands are left
       out on purpose — thin wire as geometry crawls and flickers at 150 m; the
       mip-mapped wire panel below does that job without glitching. */
    const GEM = Assets.has('g_fence');
    if (GEM) {
      const bays = detailXs.filter(x => x + SPAN <= half + 0.01);
      const ims = Assets.instancedParts('g_fence', bays.length, (i, dd) => {
        const cx = bays[i] + SPAN / 2;
        dd.position.set(cx, heightAt(cx, W.fenceZ), W.fenceZ);
      }, { skip: ['Barbed'] });
      for (const m of ims) { m.castShadow = true; scene.add(m); registerHeat(m, 0.06); }
    }

    const d = new THREE.Object3D();
    let pi = 0, fi = 0;
    for (const rz of rows) {
      for (const x of xs) {
        if (GEM && Math.abs(x) <= DETAIL) continue;     // Gemini bay stands here
        const y = heightAt(x, rz);
        d.position.set(x, y, rz); d.rotation.set(0, 0, 0); d.scale.set(1,1,1);
        d.updateMatrix(); posts.setMatrixAt(pi, d.matrix);
        d.position.set(x, y + 0.12, rz);
        d.updateMatrix(); foots.setMatrixAt(pi, d.matrix);
        pi++;
        if (Math.abs(x) <= DETAIL) {
          // Y-fork: two short angles canted 40 deg out either side of the crown
          for (const sgn of [-1, 1]) {
            d.position.set(x, y + PH - 0.03, rz);
            d.rotation.set(0, 0, sgn * 0.70);
            d.updateMatrix(); forks.setMatrixAt(fi++, d.matrix);
          }
        }
      }
    }
    posts.count = pi; forks.count = fi;   // Gemini bays replace the inner posts
    posts.instanceMatrix.needsUpdate = true;
    forks.instanceMatrix.needsUpdate = true;
    foots.instanceMatrix.needsUpdate = true;
    for (const m of [posts, forks, foots]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
    registerHeat(posts, 0.06); registerHeat(forks, 0.06); registerHeat(foots, 0.11);

    /* ---- barbed strands ---------------------------------------------------
       These were LineSegments: 18 real strands per bay, hanging in a catenary.
       Geometrically honest and visually unusable — at 150 m a strand is far
       under one pixel wide, so it aliases and crawls as the arc moves. Lines
       also cannot be mip-mapped, so there is no fix from that direction.

       Standard solution for fences and grates: put the wires in an ALPHA
       TEXTURE on a single panel and let mip-mapping do the work. Up close you
       see individual strands with their barbs; at range they resolve to a
       stable grey haze, which is exactly what real wire does to the eye and
       never shimmers. The sag is baked into the texture. Sodium falloff rides
       on vertex colours so the panel still goes dark in the U/S gaps.        */
    const lampXs = [];
    for (let k = 0, lx = -half + 30; lx <= half; lx += W.floodlightGap, k++)
      if (W.deadFloodlights.indexOf(k) < 0) lampXs.push(lx - 1.8);

    const litAt = (x, y) => {
      let lit = 0;
      for (const lx of lampXs) {
        const d2 = (x-lx)*(x-lx) + (y-9.4)*(y-9.4) + 30.25;
        lit += 620 / (1 + d2 * 0.42);
      }
      return Math.min(lit, 3.2);
    };

    function wireTex() {
      const w = 256, h = 256, c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.lineCap = 'butt';
      const N = 18, sag = 7;
      for (let n = 0; n < N; n++) {
        const y0 = 14 + n * ((h - 26) / (N - 1));
        g.strokeStyle = 'rgba(255,255,255,0.92)';
        g.lineWidth = 1.7;
        g.beginPath(); g.moveTo(0, y0);
        g.quadraticCurveTo(w/2, y0 + sag*2, w, y0);     // the catenary, baked in
        g.stroke();
        // barbs: a short cross every so often along the strand
        g.lineWidth = 1.3;
        for (let bx = 10; bx < w; bx += 34) {
          const t = bx / w, yy = y0 + sag*2*2*t*(1-t);
          g.beginPath();
          g.moveTo(bx - 3.2, yy - 3.2); g.lineTo(bx + 3.2, yy + 3.2);
          g.moveTo(bx - 3.2, yy + 3.2); g.lineTo(bx + 3.2, yy - 3.2);
          g.stroke();
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 16;
      t.generateMipmaps = true;
      return t;
    }

    const wTex = wireTex();
    for (const rz of rows) {
      const SEG = Math.round(W.fenceWidth / SPAN);
      const pg = new THREE.PlaneGeometry(W.fenceWidth, PH - 0.22, SEG, 1);
      const pa = pg.attributes.position;
      const col = new Float32Array(pa.count * 3);
      for (let k = 0; k < pa.count; k++) {
        const wx = pa.getX(k);
        const wy = pa.getY(k) + (PH - 0.22)/2 + 0.20;      // sit the panel on the ground
        pa.setY(k, wy + heightAt(wx, rz));
        const lit = litAt(wx, wy);
        col[k*3]   = 0.014 + lit * 0.190;
        col[k*3+1] = 0.016 + lit * 0.094;
        col[k*3+2] = 0.021 + lit * 0.025;
      }
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      pg.computeVertexNormals();
      const panel = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({
        map: wTex, vertexColors: true, alphaTest: 0.28,
        side: THREE.DoubleSide, fog: true }));
      panel.material.map = wTex.clone();
      panel.material.map.wrapS = THREE.RepeatWrapping;
      panel.material.map.repeat.set(SEG, 1);
      panel.material.map.needsUpdate = true;
      panel.position.set(0, 0, rz);
      panel.frustumCulled = false;
      scene.add(panel); registerHeat(panel, 0.06);
    }

    buildFloodlights(half);
    buildPillars();
  }

  /* ========================================================================
     FLOODLIGHT MAST — tapered pole on a bolted base flange, bracket arm, and
     THREE 1000 W high-pressure-sodium housings canted 30 degrees down. One
     glowing ball was the laziest thing in the scene and it was also the
     brightest, which is the worst combination.
     ======================================================================== */
  function buildFloodlights(half) {
    const steel = new THREE.MeshPhongMaterial({
      map: tex('metal_diff.jpg', 1.2, true), color: 0x4e4941, specular: 0x262420, shininess: 30 });
    const housing = new THREE.MeshPhongMaterial({ color: 0x53565a, specular: 0x33383c, shininess: 48 });
    const poolTex = radialTex('rgba(255,236,196,0.92)', 'rgba(255,205,140,0)');

    const MH = 11.0;                                   // mast height
    const poleG = new THREE.CylinderGeometry(0.085, 0.175, MH, 10);
    const flangeG = new THREE.CylinderGeometry(0.30, 0.30, 0.06, 10);
    const armG = new THREE.BoxGeometry(2.6, 0.10, 0.10);
    const riserG = new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8);
    const bodyG = new THREE.BoxGeometry(0.62, 0.40, 0.22);
    const glassG = new THREE.BoxGeometry(0.56, 0.34, 0.04);
    const hoodG = new THREE.BoxGeometry(0.66, 0.06, 0.30);
    const condG = new THREE.CylinderGeometry(0.028, 0.028, MH*0.92, 6);

    let i = 0;
    for (let x = -half + 30; x <= half; x += W.floodlightGap, i++) {
      const dead = W.deadFloodlights.indexOf(i) >= 0;
      const z = W.fenceZ + 5.5, gy = heightAt(x, z);
      const g = new THREE.Group();
      const reg = (m, h) => { m.castShadow = true; g.add(m); registerHeat(m, h); return m; };

      const GEMM = Assets.has('g_mast');
      if (GEMM) {
        /* Gemini mast: lamps face +Z in the file; mirrored in Z so they face
           downrange (-Z) and the bracket stays on -X, where every light,
           wire-glow and grass term in this file already expects the heads. */
        const mast = Assets.group('g_mast', { mat: pp => {
          if (pp.name.indexOf('glass') >= 0)
            return new THREE.MeshBasicMaterial({ color: dead ? hdr(0.04,0.038,0.03) : hdr(2.10,1.12,0.30) });
          const m = pp.mat.clone(); m.side = THREE.DoubleSide; return m; } });
        mast.scale.set(1, 1, -1);
        mast.traverse(m => { if (m.isMesh) { m.castShadow = true; registerHeat(m, m.name.indexOf('glass') >= 0 ? (dead ? 0.08 : 0.95) : 0.06); } });
        g.add(mast);
      }
      if (!GEMM) {
      reg(new THREE.Mesh(flangeG, steel), 0.09).position.set(0, 0.03, 0);
      reg(new THREE.Mesh(poleG, steel), 0.06).position.set(0, MH/2, 0);
      const cond = reg(new THREE.Mesh(condG, steel), 0.07);
      cond.position.set(0.14, MH*0.46, 0.02);
      reg(new THREE.Mesh(riserG, steel), 0.06).position.set(0, MH + 0.22, 0);
      const arm = reg(new THREE.Mesh(armG, steel), 0.06);
      arm.position.set(-1.25, MH + 0.42, 0); arm.rotation.z = 0.06;

      }   // end procedural mast
      // three housings along the bracket, canted down and slightly splayed
      for (let k = 0; k < 3; k++) {
        const hx = GEMM ? (-0.62 - k * 0.82) : (-0.35 - k * 0.82);
        if (GEMM) {
          if (!dead) {
            const halo = new THREE.Sprite(new THREE.SpriteMaterial({
              map: poolTex, color: hdr(0.72, 0.33, 0.075), transparent: true, opacity: 0.52,
              blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
            halo.scale.set(2.6, 2.6, 1);
            halo.position.set(hx, 10.55, -0.16); g.add(halo); visLights.push(halo);
          }
          continue;
        }
        const h = new THREE.Group();
        h.add(new THREE.Mesh(bodyG, housing));
        const hood = new THREE.Mesh(hoodG, housing); hood.position.set(0, 0.21, 0.06); h.add(hood);
        const glass = new THREE.Mesh(glassG, new THREE.MeshBasicMaterial({
          color: dead ? hdr(0.04,0.038,0.03) : hdr(2.10,1.12,0.30) }));
        glass.position.set(0, -0.02, 0.12); h.add(glass);
        h.position.set(hx, MH + 0.30, 0.10);
        h.rotation.set(0.52, (k - 1) * 0.22, 0);       // 30 deg down, splayed
        h.traverse(m => { if (m.isMesh) registerHeat(m, dead ? 0.08 : 0.95); });
        g.add(h);

        if (!dead) {
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: poolTex, color: hdr(0.72, 0.33, 0.075), transparent: true, opacity: 0.52,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
          halo.scale.set(2.6, 2.6, 1);
          halo.position.set(hx, MH + 0.26, 0.22); g.add(halo); visLights.push(halo);
        }
      }

      if (!dead) {
        /* The pool must HUG the ground. It was a flat 82 m sheet at a fixed
           height, laid over terrain that now undulates by a metre or more: it
           poked through wherever the ground dipped and sank wherever it rose,
           which read as pale scraps scattered across the field. Drape it. */
        const pg = new THREE.PlaneGeometry(82, 82, 28, 28);
        const pa = pg.attributes.position;
        for (let v = 0; v < pa.count; v++) {
          const wx = x - 2.0 + pa.getX(v), wz = z - 8.5 - pa.getY(v);
          pa.setZ(v, heightAt(wx, wz) - gy - 0.07 + 0.06);   // 6 cm proud of the soil
        }
        const pool = new THREE.Mesh(pg,
          new THREE.MeshBasicMaterial({ map: poolTex, color: hdr(0.50, 0.22, 0.042),
            transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending,
            depthWrite: false, fog: true,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        pool.rotation.x = -Math.PI/2; pool.position.set(-2.0, 0.07, -8.5);
        g.add(pool); visLights.push(pool);
      }

      g.position.set(x, gy, z);
      scene.add(g);
      floodlights.push({ x, dead, lamp: g });
    }

    /* Three roving SPOTLIGHTS that follow the arc, standing in for whichever
       masts you are actually looking at. Spot rather than point because a
       floodlight IS directional — real falloff across the ground instead of a
       flat decal.

       They deliberately do NOT cast shadows. The masts stand at fenceZ+5.5,
       i.e. on OUR side of the wire, so everything beyond the fence throws its
       shadow AWAY from the post, onto ground the fence itself occludes. From
       an elevated OP 150 m back those shadows are structurally invisible, and
       three 2048 shadow maps a frame would buy nothing. The shadow budget goes
       to the searchlight instead, where the beam rakes near ground the sentry
       is looking straight down at. */
    for (let k = 0; k < 3; k++) {
      const L = new THREE.SpotLight(0xff8c22, 0, 240, 1.18, 0.55, 1.4);
      L.castShadow = false;
      scene.add(L); scene.add(L.target);
      poolLights.push(L);
    }
  }

  function buildPillars() {
    let bp = 118;
    for (let x = -440; x <= 440; x += 110, bp++) {
      const y = heightAt(x, W.zeroLineZ);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 0.45),
        new THREE.MeshPhongMaterial({ map: labelTex(String(bp)), color: 0x6a6659,
          specular: 0x000000, shininess: 0 }));
      m.position.set(x, y + 0.8, W.zeroLineZ); scene.add(m); registerHeat(m, 0.10);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 4),
        new THREE.MeshPhongMaterial({ color: 0x6a6659, specular: 0x000000, shininess: 0 }));
      cap.position.set(x, y + 1.70, W.zeroLineZ); cap.rotation.y = Math.PI/4;
      scene.add(cap); registerHeat(cap, 0.10);
      bpMarkers.push({ x, num: bp });
    }
  }

  function buildNallah() {
    const cx=W.culvertX;
    const conc=new THREE.MeshPhongMaterial({
      map:tex('conc_diff.jpg',6,true), color:0x3a3831, specular:0x050505, shininess:4 });
    const sh=new THREE.Shape();
    sh.moveTo(-17,0); sh.lineTo(17,0); sh.lineTo(11,-3.4); sh.lineTo(-11,-3.4);
    const bed=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:560,bevelEnabled:false}),
      new THREE.MeshPhongMaterial({ map:tex('soil_diff.jpg',120,true), color:0x2b2a25,
        specular:0x000000, shininess:0 }));
    bed.position.set(cx,0.02,W.fenceZ+40); bed.rotation.y=Math.PI;
    scene.add(bed); registerHeat(bed,0.14);
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(10,3.6,9), conc);
    mouth.position.set(cx,1.3,W.fenceZ+1.6); scene.add(mouth); registerHeat(mouth,0.12);
    const lip=new THREE.Mesh(new THREE.BoxGeometry(13,0.6,1.2), conc);
    lip.position.set(cx,3.3,W.fenceZ-3); scene.add(lip); registerHeat(lip,0.12);
  }

  /* ---------- tree silhouettes ---------------------------------------------
     A squashed sphere is not a tree and never reads as one. At 600 m at night a
     tree is PURE SILHOUETTE, so what matters is the outline — trunk, branch
     structure, ragged canopy edge. Draw that properly into an alpha texture and
     it beats any mesh, at a fraction of the cost. Four Punjab-border species
     shapes: kikar (acacia, umbrella), eucalyptus (tall, narrow), dense
     broadleaf (shisham), and a bare/dead one.                                */
  function treeTex(kind, seed) {
    let sd = seed * 9301 + 49297;
    const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    const S = 256, c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';

    const blob = (x, y, r, squash) => {
      g.beginPath();
      for (let a = 0; a < Math.PI*2; a += 0.28) {
        const rr = r * (0.76 + rnd()*0.48);
        const px = x + Math.cos(a)*rr, py = y + Math.sin(a)*rr*(squash||1);
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    };

    function branch(x, y, ang, len, w, depth) {
      if (depth <= 0 || len < 5) return;
      const x2 = x + Math.cos(ang)*len, y2 = y + Math.sin(ang)*len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      const n = depth > 3 ? 2 : (rnd() < 0.72 ? 2 : 3);
      for (let i = 0; i < n; i++) {
        const spread = kind === 'euc' ? 0.30 : kind === 'kikar' ? 0.72 : 0.55;
        branch(x2, y2, ang + (rnd()-0.5)*2*spread, len*(0.62+rnd()*0.20),
               Math.max(w*0.66, 0.7), depth-1);
      }
      if (depth <= 2 && kind !== 'dead') {
        const fr = kind === 'euc' ? 11 : kind === 'kikar' ? 16 : 20;
        blob(x2, y2, fr*(0.6+rnd()*0.7), kind === 'kikar' ? 0.62 : 0.92);
      }
    }

    const baseY = S - 4;
    const trunkLen = kind === 'euc' ? S*0.46 : kind === 'kikar' ? S*0.30 : S*0.34;
    g.lineWidth = kind === 'euc' ? 7 : 10;
    branch(S/2, baseY, -Math.PI/2 + (rnd()-0.5)*0.12, trunkLen,
           kind === 'euc' ? 7 : 10, kind === 'dead' ? 5 : 5);

    if (kind === 'kikar') {                    // acacia's flat umbrella crown
      for (let i = 0; i < 9; i++)
        blob(S/2 + (rnd()-0.5)*S*0.74, baseY - trunkLen - 18 + (rnd()-0.5)*26,
             20 + rnd()*22, 0.46);
    } else if (kind === 'broad') {
      for (let i = 0; i < 11; i++)
        blob(S/2 + (rnd()-0.5)*S*0.58, baseY - trunkLen - 34 + (rnd()-0.5)*54,
             22 + rnd()*20, 0.94);
    } else if (kind === 'euc') {
      for (let i = 0; i < 8; i++)
        blob(S/2 + (rnd()-0.5)*S*0.26, baseY - trunkLen - 30 + (rnd()-0.5)*72,
             13 + rnd()*13, 1.25);
    }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  function buildTreeline() {
    const KINDS = ['kikar', 'broad', 'euc', 'kikar', 'broad', 'dead'];
    /* The camera never translates — it only rotates about the morcha — so a
       quad turned to face the origin is always correctly oriented. No billboard
       shader needed, and it stays one draw call per species. */
    /* Gemini 4 Argon trees: kikar, eucalyptus, shisham as real 3D models. */
    const GT = [['g_kikar', 110], ['g_euc', 80], ['g_shisham', 100]].filter(t => Assets.has(t[0]));
    for (const [name, n] of GT) {
      const ims = Assets.instancedParts(name, n, (i, dd) => {
        const x = (Math.random()-0.5)*2700;
        const z = W.treelineZ - Math.random()*190;
        const k = 0.75 + Math.random()*0.55;
        dd.position.set(x, heightAt(x, z) - 0.1, z);
        dd.scale.set(k, k * (0.9 + Math.random()*0.25), k);
        dd.rotation.y = Math.random() * Math.PI * 2;
      });
      for (const m of ims) { scene.add(m); registerHeat(m, 0.07); }
    }
    for (let k = 0; k < (GT.length ? 0 : KINDS.length); k++) {
      const kind = KINDS[k];
      const mat = new THREE.MeshBasicMaterial({
        map: treeTex(kind, k*37+11), transparent: true, alphaTest: 0.42,
        color: hdr(0.030, 0.034, 0.028), fog: true, side: THREE.DoubleSide });
      const n = kind === 'dead' ? 26 : 96;
      const geo = new THREE.PlaneGeometry(1, 1);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const x = (Math.random()-0.5)*2700;
        const z = W.treelineZ - Math.random()*190;
        const h = kind === 'euc' ? (11 + Math.random()*7)
                : kind === 'kikar' ? (6 + Math.random()*4)
                : (7 + Math.random()*5);
        d.position.set(x, heightAt(x, z) + h/2, z);
        d.scale.set(h * (kind === 'euc' ? 0.52 : 0.92), h, 1);
        d.rotation.set(0, Math.atan2(-x, -z), 0);      // face the morcha
        d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      scene.add(inst);
      registerHeat(inst, 0.07);
    }

    /* Scrub forward of the treeline -----------------------------------------
       These were the scanned CC0 bushes, instanced 260 times across the whole
       field. They are photogrammetry: ONE shrub is 27,000 triangles. At 400 m
       it covers a few pixels. That single decision put 8.9 MILLION triangles in
       the scene and dropped the frame rate to about 2 fps, which in turn made
       the shift clock crawl (the loop advances by at most 0.05 s a frame).

       So: real scanned geometry ONLY within ~70 m, where a sentry can actually
       resolve a plant. Everything beyond is a billboard imposter on 2 triangles
       — which is all a bush at 400 m has ever been worth. */
    function bushTex(seed) {
      let sd = seed * 7919 + 13;
      const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
      const S = 128, c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      g.clearRect(0, 0, S, S); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
      // a low ragged mound, then twigs breaking its outline
      for (let i = 0; i < 16; i++) {
        const bx = S/2 + (rnd()-0.5)*S*0.66, by = S - 6 - rnd()*S*0.34;
        const r = 9 + rnd()*15;
        g.beginPath();
        for (let a = 0; a < Math.PI*2; a += 0.5)
          g.lineTo(bx + Math.cos(a)*r*(0.7+rnd()*0.6), by + Math.sin(a)*r*0.62);
        g.closePath(); g.fill();
      }
      g.lineWidth = 1.2;
      for (let i = 0; i < 22; i++) {
        const bx = S/2 + (rnd()-0.5)*S*0.7;
        g.beginPath(); g.moveTo(bx, S - 4);
        g.lineTo(bx + (rnd()-0.5)*26, S - 20 - rnd()*34); g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }

    /* Scrub cards. Two things were wrong with these and both read as "fake":
       · They were UNLIT — one constant colour — and that colour was brighter
         than the unlit ground around them. At night a bush is a darker mass,
         not a pale sticker. Each one now carries its OWN light: near-black by
         default, sodium-orange only if it actually stands inside a lamp's pool,
         and darker at the root than the crown, as real foliage reads.
       · About a third sat on OUR side of the wire. The home side of an AIOS is
         a cleared strip — that is the whole point of it — so scrub now grows
         only beyond the fence's own cleared margin, and thickest along the
         nallah, which is where real cover grows and where a crawler comes. */
    const half = W.fenceWidth / 2;
    const lampsX = [];
    for (let k = 0, lx = -half + 30; lx <= half; lx += W.floodlightGap, k++)
      if (W.deadFloodlights.indexOf(k) < 0) lampsX.push(lx - 1.2);
    const sodiumAt = (x, z) => {
      let lit = 0;
      for (const lx of lampsX) {
        const d2 = (x-lx)*(x-lx) + (z-(W.fenceZ-8.5))*(z-(W.fenceZ-8.5));
        lit += 1 / (1 + d2 * 0.0016);
      }
      return Math.min(lit, 1.4);
    };
    const tmpC = new THREE.Color();

    for (let k = 0; k < 3; k++) {
      const geo = new THREE.PlaneGeometry(1, 1);
      // root-to-crown gradient: the base sits in its own shadow
      const vc = new Float32Array(geo.attributes.position.count * 3);
      for (let v = 0; v < geo.attributes.position.count; v++) {
        const top = geo.attributes.position.getY(v) > 0 ? 1 : 0;
        const g = top ? 1.0 : 0.32;
        vc[v*3] = g; vc[v*3+1] = g; vc[v*3+2] = g;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
      const mat = new THREE.MeshBasicMaterial({
        map: bushTex(k*31+5), transparent: true, alphaTest: 0.40, vertexColors: true,
        color: 0xffffff, fog: true, side: THREE.DoubleSide });
      const n = 90;
      const inst = new THREE.InstancedMesh(geo, mat, n);
      const d = new THREE.Object3D();
      let placed = 0, guard = 0;
      while (placed < n && guard++ < n * 20) {
        let x, z;
        if (Math.random() < 0.28) {                       // the nallah's own cover
          x = W.culvertX + (Math.random()-0.5) * 70;
          z = W.fenceZ - 30 - Math.random() * 220;
        } else {
          const brg = (Math.random()-0.5)*Math.PI*1.05;
          const rng = 180 + Math.pow(Math.random(), 0.7)*440;
          x = Math.sin(brg)*rng; z = -Math.cos(brg)*rng;
        }
        if (z > W.fenceZ - 28) continue;                 // keep the cleared strip clear
        const h = 0.8 + Math.random()*1.9;
        d.position.set(x, heightAt(x, z) + h/2, z);
        d.scale.set(h*(1.1+Math.random()*0.6), h, 1);
        d.rotation.set(0, Math.atan2(-x, -z), 0);      // face the post
        d.updateMatrix(); inst.setMatrixAt(placed, d.matrix);

        const sod = sodiumAt(x, z);
        /* Through the ACES curve at the scene's exposure, unlit ground shows
           at ~18/255; the old cards came out at ~28 — paler than the soil, the
           exact reverse of night. These land the crown at ~14 and the root at
           ~9: just darker than the ground, as real scrub sits. */
        const base = 0.008 + Math.random()*0.004;
        tmpC.setRGB(base*0.85 + sod*0.100, base*1.00 + sod*0.048, base*0.70 + sod*0.012)
            .multiplyScalar(GAIN);
        inst.setColorAt(placed, tmpC);
        placed++;
      }
      inst.count = placed;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.frustumCulled = false;
      scene.add(inst); registerHeat(inst, 0.09);
    }

    /* Real scanned scrub, near field only, where the detail is visible. */
    const nearPlace = (lo, hi) => (i, d, size) => {
      const brg = (Math.random()-0.5)*Math.PI*1.05;
      const rng = 16 + Math.pow(Math.random(), 0.7)*54;
      const x = Math.sin(brg)*rng, z = -Math.cos(brg)*rng;
      const k = (lo + Math.random()*(hi-lo)) / Math.max(size.y, 0.01);
      d.position.set(x, heightAt(x, z) - 0.04, z);
      d.scale.set(k*(0.8+Math.random()*0.5), k, k*(0.8+Math.random()*0.5));
      d.rotation.y = Math.random()*Math.PI*2;
    };
    const bushOpt = { color: 0x1d2417, roughness: 1.0 };
    const b1 = Assets.instanced('bush',  14, nearPlace(0.9, 2.0), bushOpt);
    const b2 = Assets.instanced('shrub', 16, nearPlace(0.5, 1.2), bushOpt);
    for (const b of [b1, b2]) if (b) { b.frustumCulled = false; b.castShadow = true;
      scene.add(b); registerHeat(b, 0.09); }

    /* Grass clumps: real geometry, but only right over the parapet. */
    const gplace = (i, d, size) => {
      const brg = (Math.random()-0.5)*Math.PI*1.1;
      const rng = 9 + Math.pow(Math.random(), 0.8)*26;
      const x = Math.sin(brg)*rng, z = -Math.cos(brg)*rng;
      const k = (0.5 + Math.random()*0.9) / Math.max(size.y, 0.01);
      d.position.set(x, heightAt(x, z) - 0.03, z);
      d.scale.set(k, k, k);
      d.rotation.y = Math.random()*Math.PI*2;
    };
    const gOpt = { color: 0x2a2c1c, roughness: 1.0 };
    const g1 = Assets.instanced('grassA', 26, gplace, gOpt);
    const g2 = Assets.instanced('grassB', 30, gplace, gOpt);
    for (const gg of [g1, g2]) if (gg) { gg.frustumCulled = false; scene.add(gg); registerHeat(gg, 0.10); }
  }

  /* ---------- fog banks ----------------------------------------------------
     These were horizontal additive sheets. Seen from an elevated OP at a
     grazing angle the path length through them is enormous, so they blanketed
     the whole lower frame in a pale wash — measured at +8,10,18 over ground
     that should read 3,5,8. A fog bank is something you look AT, sitting over
     the low ground, not a sheet laid over your own feet. Vertical planes in
     the far field, facing the post.                                         */
  function buildMist() {
    const t = mistTex();
    const bands = [-215, -320, -430, -560];
    for (let i = 0; i < bands.length; i++) {
      const z = bands[i];
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2800, 11),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.05,
          depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      p.position.set(0, 2.6 + i*0.5, z);      // hugs the ground, thickens with range
      scene.add(p); mist.push(p);
    }
    // one low sheet in the nallah itself — mist genuinely does sit in the cut,
    // and it is the lane the trainee most needs to doubt
    const n = new THREE.Mesh(new THREE.PlaneGeometry(150, 6),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.06,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    n.position.set(W.culvertX, 1.1, W.zeroLineZ + 60);
    scene.add(n); mist.push(n);
  }

  /* ---------- the morcha: you are INSIDE the room ---------------------------
     Floor 7.80, eye 9.35 (1.55 m standing height), front wall 0.80 m ahead.
     The embrasure jambs are the physical limit of the arc — which is correct:
     a morcha holds an ASSIGNED arc and the flanking posts cover the rest.    */
  const FLOOR  = 7.80;
  const OP_EYE = 9.35;
  const ARC    = 70;                 // degrees either side of the post's centre line

  function buildMorcha() {
    const g = new THREE.Group();
    const concrete = new THREE.MeshPhongMaterial({
      map: tex('conc_diff.jpg', 2.2, true), normalMap: tex('conc_nor.jpg', 2.2),
      color: 0x17160f, specular: 0x030303, shininess: 1 });
    concrete.normalScale.set(1.6, 1.6);
    const bagM = new THREE.MeshPhongMaterial({
      map: tex('soil_diff.jpg', 1, true), color: 0x211e17, specular: 0x000000, shininess: 0 });
    const steel = new THREE.MeshPhongMaterial({ color: 0x1b1c19, specular: 0x131313, shininess: 22 });
    const dark  = new THREE.MeshPhongMaterial({ color: 0x0d0e0c, specular: 0x060606, shininess: 6 });

    const FW = -1.35;                 // inner face of the front wall
    const HW =  2.55;                 // half width of the room
    const RR =  2.10;                 // rear wall
    const SILL = FLOOR + 1.00;        // 8.80 — comfortably below the eye
    const LINT = FLOOR + 2.15;        // 9.95 — lintel

    const add = (m, heat) => { g.add(m); World.__reg(m, heat); return m; };

    if (Assets.has('g_morcha')) {
      /* Gemini 4 Argon bunker: concrete room, hessian sandbags on the slit,
         field telephone, logbook, binoculars, ammo crate. Its slit faces +Z in
         the file; turned PI it faces downrange and its inner face lands
         exactly on FW. Plus the INSAS on the sill. */
      const room = Assets.group('g_morcha');
      room.rotation.y = Math.PI;
      room.position.set(0, FLOOR, 0);
      /* At night the inside of a morcha is near-black: nothing lights it but a
         red panel lamp and floodlight spill through the slit. Gemini's atlas is
         day-bright, so darken it, and smooth the low-poly bags' facets. */
      room.traverse(m => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.color.multiplyScalar(0.32);
        if (m.material.roughness !== undefined) m.material.roughness = 1.0;
        m.geometry = m.geometry.clone(); m.geometry.computeVertexNormals();
        m.castShadow = true; m.receiveShadow = true; World.__reg(m, 0.30);
      });
      g.add(room);
      const rifle = Assets.group('g_insas');
      if (rifle) {
        rifle.rotation.y = Math.PI / 2 - 0.18;    // muzzle out over the parapet
        rifle.position.set(-1.15, FLOOR + 1.02, FW - 0.18);
        rifle.traverse(m => { if (m.isMesh) World.__reg(m, 0.20); });
        g.add(rifle);
      }
      scene.add(g);
      const red = new THREE.PointLight(0xff2a12, 0.12*GAIN, 4.6, 2);
      red.position.set(0.58, SILL+0.30, FW-0.05); scene.add(red);
      const spill = new THREE.PointLight(0xff9a4a, 0.26*GAIN, 11.0, 2);
      spill.position.set(0.6, SILL+0.55, FW-3.0); scene.add(spill);
      const back = new THREE.PointLight(0x8899bb, 0.030*GAIN, 5.0, 2);
      back.position.set(0, FLOOR+2.2, 1.0); scene.add(back);
      return { red, spill, back };
    }

    // floor and ceiling
    add(new THREE.Mesh(new THREE.BoxGeometry(HW*2, 0.22, RR-FW+0.9), concrete), 0.30)
      .position.set(0, FLOOR-0.11, (RR+FW)/2);
    add(new THREE.Mesh(new THREE.BoxGeometry(HW*2+0.7, 0.26, RR-FW+1.3), concrete), 0.26)
      .position.set(0, FLOOR+2.62, (RR+FW)/2);

    // front wall: a pier under the embrasure, a lintel over it, jambs either side
    add(new THREE.Mesh(new THREE.BoxGeometry(HW*2, 1.05, 0.50), concrete), 0.31)
      .position.set(0, FLOOR+0.52, FW-0.25);
    add(new THREE.Mesh(new THREE.BoxGeometry(HW*2, 0.75, 0.50), concrete), 0.28)
      .position.set(0, LINT+0.37, FW-0.25);

    // side walls and rear wall with a doorway
    for (const sx of [-1, 1])
      add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.60, RR-FW), concrete), 0.30)
        .position.set(sx*(HW+0.17), FLOOR+1.30, (RR+FW)/2);
    for (const sx of [-1, 1])
      add(new THREE.Mesh(new THREE.BoxGeometry(HW-0.35, 2.60, 0.34), concrete), 0.29)
        .position.set(sx*(HW/2+0.18), FLOOR+1.30, RR+0.17);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.70, 0.34), concrete), 0.29)
      .position.set(0, FLOOR+2.25, RR+0.17);

    // the sill: concrete ledge, sandbags along it, elbow-polished in the middle
    add(new THREE.Mesh(new THREE.BoxGeometry(HW*2, 0.12, 0.62), concrete), 0.33)
      .position.set(0, SILL+0.06, FW-0.16);
    /* Real scanned sandbags. A bag slumps, bulges and sits at its own angle —
       that irregular top line is most of what says 'sandbag' at a glance, and a
       row of identical boxes says 'programmer art' instead.                  */
    const bagRow = [];
    for (let i = -6; i <= 6; i++) {
      if (Math.abs(i) < 2) continue;                       // kept clear where he leans
      bagRow.push(i);
    }
    /* The scanned bag is a CEMENT bag and the word is printed across it —
       plainly readable on a full-size screen. Strip the colour map; the normal
       and roughness maps carry all the slump and weave that matter. */
    const bagsOnSill = Assets.instanced('sandbag', bagRow.length, (i, d, size) => {
      const k = 0.46 / Math.max(size.z, 0.01);             // bags laid across the sill
      d.position.set(bagRow[i]*0.44, SILL + 0.10, FW - 0.20 + (Math.random()-0.5)*0.04);
      d.scale.set(k*(0.92+Math.random()*0.16), k*(0.9+Math.random()*0.2), k);
      d.rotation.set((Math.random()-0.5)*0.10, Math.PI/2 + (Math.random()-0.5)*0.16,
                     (Math.random()-0.5)*0.09);
    }, { color: 0x4a4436, noMap: true });
    if (bagsOnSill) { g.add(bagsOnSill); World.__reg(bagsOnSill, 0.30); }

    /* A second, lower course along the front of the sill, and bags stacked up
       both jambs. Concrete boxes read as boxes; sandbags break every hard edge
       and are what a morcha is actually revetted with. */
    const front = Assets.instanced('sandbag', 13, (i, d, size) => {
      const k = 0.50 / Math.max(size.z, 0.01);
      d.position.set((i-6)*0.42, SILL - 0.10, FW - 0.34 + (Math.random()-0.5)*0.05);
      d.scale.set(k*(0.9+Math.random()*0.2), k*0.95, k);
      d.rotation.set((Math.random()-0.5)*0.08, Math.PI/2 + (Math.random()-0.5)*0.2,
                     (Math.random()-0.5)*0.08);
    }, { color: 0x413c2f, noMap: true });
    if (front) { g.add(front); World.__reg(front, 0.30); }

    const jambs = Assets.instanced('sandbag', 8, (i, d, size) => {
      const side = i < 4 ? -1 : 1, row = i % 4;
      const k = 0.52 / Math.max(size.z, 0.01);
      d.position.set(side*(HW - 0.20) + (row%2)*side*0.10,
                     SILL - 0.05 + row*0.17, FW - 0.14 + (Math.random()-0.5)*0.06);
      d.scale.set(k*(0.9+Math.random()*0.18), k*0.9, k);
      d.rotation.set((Math.random()-0.5)*0.12, (Math.random()-0.5)*0.35,
                     (Math.random()-0.5)*0.14);
    }, { color: 0x443f31, noMap: true });
    if (jambs) { g.add(jambs); World.__reg(jambs, 0.30); }

    /* --- the weapon on the sill: the single strongest POV anchor there is ---
       Set down muzzle-out over the parapet, butt toward the sentry, the way it
       actually sits when he has picked up the binoculars instead.
       NOTE: this is a scanned 7.62 bolt-action — the closest CC0 rifle there
       is. It is NOT the INSAS/AK a BSF sentry actually carries. Swap the model
       in models/ when a correct one is available; nothing else changes.     */
    const wpn = Assets.single('rifle', { color: 0x2a2a26 });
    if (wpn) {
      const rs = Assets.size('rifle');
      const k = 1.05 / Math.max(rs.x, 0.01);               // ~1.05 m over the parapet
      wpn.scale.setScalar(k);
      wpn.position.set(0.52, SILL + 0.15, FW - 0.20);
      wpn.rotation.set(0.04, -0.28, 0.03);
      wpn.traverse(m => { if (m.isMesh) World.__reg(m, 0.20); });
      g.add(wpn);
    }

    /* --- binoculars, set down where he can reach them ---------------------- */
    const bino = new THREE.Group();
    for (const bx of [-0.035, 0.035]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.16, 10), dark);
      tube.rotation.x = Math.PI/2; tube.position.set(bx, 0, 0); bino.add(tube);
      const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 10),
        new THREE.MeshPhongMaterial({ color: 0x0a1418, specular: 0x334455, shininess: 70 }));
      obj.rotation.x = Math.PI/2; obj.position.set(bx, 0, -0.082); bino.add(obj);
    }
    bino.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.030, 0.09), dark));
    bino.traverse(m => { if (m.isMesh) World.__reg(m, 0.26); });
    bino.position.set(0.10, SILL+0.14, FW-0.02); bino.rotation.y = 0.5; g.add(bino);

    /* --- field telephone, log register, ammunition box, water bottle ------- */
    const tel = new THREE.Group();
    tel.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.20), dark));
    const hs = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.24), dark);
    hs.position.set(0, 0.10, 0.01); tel.add(hs);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5),
      new THREE.MeshBasicMaterial({ color: hdr(0.9, 0.05, 0.03) }));
    led.position.set(0.09, 0.055, -0.10); tel.add(led);
    tel.traverse(m => { if (m.isMesh) World.__reg(m, 0.34); });
    tel.position.set(-0.78, SILL+0.14, FW-0.14); tel.rotation.y = 0.34; g.add(tel);

    const reg = add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.035, 0.22),
      new THREE.MeshPhongMaterial({ color: 0x15130e, specular: 0x000000, shininess: 0 })), 0.30);
    reg.position.set(-0.36, SILL+0.14, FW-0.07); reg.rotation.y = -0.26;
    const pen = add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 5), dark), 0.29);
    pen.position.set(-0.26, SILL+0.16, FW-0.04); pen.rotation.set(Math.PI/2, 0, 0.5);

    const crate = Assets.single('crate', { color: 0x3a3c2e });
    if (crate) {
      const cs = Assets.size('crate'), ck = 0.62 / Math.max(cs.x, 0.01);
      crate.scale.setScalar(ck);
      crate.position.set(-1.88, FLOOR + 0.02, FW + 0.62); crate.rotation.y = 0.26;
      crate.traverse(m => { if (m.isMesh) World.__reg(m, 0.27); });
      g.add(crate);
    }
    const abox = Assets.single('ammobox', { color: 0x3d4033 });
    if (abox) {
      const as = Assets.size('ammobox'), ak = 0.30 / Math.max(as.z, 0.01);
      abox.scale.setScalar(ak);
      abox.position.set(-1.35, FLOOR + 0.02, FW + 0.50); abox.rotation.y = -0.4;
      abox.traverse(m => { if (m.isMesh) World.__reg(m, 0.27); });
      g.add(abox);
    }
    const bot = add(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.20, 10), dark), 0.31);
    bot.position.set(1.02, SILL+0.16, FW-0.04);

    // a loose stack of bags in the corner, thrown down rather than laid
    const stack = Assets.instanced('sandbag', 7, (i, d, size) => {
      const k = 0.50 / Math.max(size.z, 0.01);
      d.position.set(-1.95 + (i%2)*0.26, FLOOR + 0.07 + Math.floor(i/2)*0.16,
                     RR - 0.60 - (i%2)*0.12);
      d.scale.set(k, k*0.92, k);
      d.rotation.set((Math.random()-0.5)*0.2, Math.random()*Math.PI, (Math.random()-0.5)*0.22);
    }, { color: 0x45402f, noMap: true });
    if (stack) { g.add(stack); World.__reg(stack, 0.29); }

    scene.add(g);

    /* Night discipline means no white light in an OP. What there IS: a faint
       red glow off the telephone panel, and floodlight spill through the slit. */
    const red = new THREE.PointLight(0xff2a12, 0.12*GAIN, 4.6, 2);
    red.position.set(-0.76, SILL+0.24, FW-0.02); scene.add(red);
    const spill = new THREE.PointLight(0xff9a4a, 0.26*GAIN, 11.0, 2);
    spill.position.set(0.6, SILL+0.55, FW-3.0); scene.add(spill);
    const back = new THREE.PointLight(0x8899bb, 0.030*GAIN, 5.0, 2);
    back.position.set(0, FLOOR+2.2, RR-0.4); scene.add(back);

    return { red, spill, back };
  }

  /* ---------- Pakistan Rangers posts across the line ------------------------
     On the Punjab IB the Rangers BOPs are plainly visible from our side, lit,
     with their own towers and mast. They are a constant in a sentry's night:
     a fixed reference, a distraction, and the reason aimed fire beyond the
     zero line is a cross-border incident rather than an engagement.          */
  function buildRangersPosts() {
    const conc = new THREE.MeshPhongMaterial({
      map: tex('conc_diff.jpg', 3, true), color: 0x33312b, specular: 0x060606, shininess: 4 });
    const bag  = new THREE.MeshPhongMaterial({
      map: tex('soil_diff.jpg', 1, true), color: 0x2a2822, specular: 0x000000, shininess: 0 });
    const steel= new THREE.MeshPhongMaterial({ color: 0x232420, specular: 0x101010, shininess: 14 });

    const posts = [
      { x: -335, z: -540, tower: 9.5, name: 'RANGERS BOP' },
      { x:  165, z: -585, tower: 7.5, name: 'RANGERS BOP' },
      { x:  505, z: -505, tower: 8.5, name: 'RANGERS BOP' }
    ];

    for (const p of posts) {
      const g = new THREE.Group();
      const reg = (m, h) => { g.add(m); World.__reg(m, h); return m; };
      const GEMR = Assets.has('g_rangers');
      if (GEMR) {
        // Gemini model faces +Z (toward us); this group is turned PI for the lamps
        const bop = Assets.group('g_rangers');
        bop.rotation.y = Math.PI;
        bop.traverse(m => { if (m.isMesh) { m.castShadow = true; World.__reg(m, 0.14); } });
        g.add(bop);
      }
      if (!GEMR) {
      // plinth and single-storey block
      reg(new THREE.Mesh(new THREE.BoxGeometry(17, 1.1, 11), conc), 0.13).position.set(0, 0.55, 0);
      reg(new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 7), conc), 0.15).position.set(-1.5, 2.7, 1.0);
      reg(new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.35, 7.8), conc), 0.14).position.set(-1.5, 4.45, 1.0);

      // the watchtower — four legs, a cab, overhead cover
      const T = p.tower;
      for (const sx of [-1.7, 1.7]) for (const sz of [-1.7, 1.7])
        reg(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, T, 6), steel), 0.12)
          .position.set(6.2+sx, T/2, -2.4+sz);
      reg(new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.3, 5.0), conc), 0.17).position.set(6.2, T+1.15, -2.4);
      reg(new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.3, 6.0), conc), 0.15).position.set(6.2, T+2.45, -2.4);
      // sandbagged parapet round the cab
      const cabBags = Assets.instanced('sandbag', 7, (i, d, size) => {
        const k = 0.72 / Math.max(size.z, 0.01);
        d.position.set(6.2 + (i-3)*0.70, T + 0.58, -4.85);
        d.scale.set(k, k, k);
        d.rotation.set(0, Math.PI/2 + (Math.random()-0.5)*0.25, (Math.random()-0.5)*0.1);
      }, { color: 0x2f2b21, noMap: true });
      if (cabBags) { g.add(cabBags); World.__reg(cabBags, 0.19); }

      // perimeter sangar — real bags, so the parapet line is irregular
      const sang = Assets.instanced('sandbag', 26, (i, d, size) => {
        const row = i < 13 ? 0 : 1, col = (i % 13) - 6;
        const k = 0.95 / Math.max(size.z, 0.01);
        d.position.set(col*0.92 + row*0.42, 1.28 + row*0.34, -5.4);
        d.scale.set(k, k, k);
        d.rotation.set(0, Math.PI/2 + (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.12);
      }, { color: 0x2f2b21, noMap: true });
      if (sang) { g.add(sang); World.__reg(sang, 0.16); }

      // flag mast
      reg(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 12, 6), steel), 0.11)
        .position.set(-8.5, 6.0, -3.0);
      const flag = reg(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7),
        new THREE.MeshPhongMaterial({ color: 0x0d3321, side: THREE.DoubleSide,
          specular: 0x000000, shininess: 0 })), 0.12);
      flag.position.set(-7.2, 11.0, -3.0);
      g.userData.flag = flag;
      }   // end procedural BOP

      // their lighting: a couple of lamps plus the sodium wash over the post
      const poolTex = radialTex('rgba(255,236,196,0.92)','rgba(255,205,140,0)');
      for (const lx of [-9, 9]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.30, 8, 6),
          new THREE.MeshBasicMaterial({ color: hdr(0.62, 0.52, 0.34) }));
        lamp.position.set(lx, 7.4, -1.0); g.add(lamp); World.__reg(lamp, 0.85);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: poolTex, color: hdr(0.58, 0.26, 0.06), transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
        halo.scale.set(9, 9, 1); halo.position.copy(lamp.position); g.add(halo); visLights.push(halo);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(52, 52),
          new THREE.MeshBasicMaterial({ map: poolTex, color: hdr(0.32, 0.14, 0.032),
            transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
            depthWrite: false, fog: true }));
        pool.rotation.x = -Math.PI/2; pool.position.set(lx, 1.2, -4); g.add(pool); visLights.push(pool);
      }
      // the tower cab's own light, small and high — a fixed point on the horizon
      const cab = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5),
        new THREE.MeshBasicMaterial({ color: hdr(0.5, 0.18, 0.10) }));
      cab.position.set(GEMR ? -7.1 : 6.2, GEMR ? 9.6 : T+1.6, GEMR ? -3.9 : -4.9);
      g.add(cab); World.__reg(cab, 0.8);

      g.position.set(p.x, heightAt(p.x, p.z), p.z);
      g.rotation.y = Math.PI + (Math.random()-0.5)*0.25;     // they face us
      scene.add(g);
      rangers.push({ x: p.x, z: p.z, name: p.name, group: g });
    }

    // a track running along their side, and their own villages behind
    const tr = new THREE.Mesh(new THREE.PlaneGeometry(2600, 7),
      new THREE.MeshPhongMaterial({ map: tex('soil_diff.jpg', 300, true), color: 0x38342c,
        specular: 0x000000, shininess: 0 }));
    tr.rotation.x = -Math.PI/2; tr.position.set(0, 0.05, -560);
    scene.add(tr); registerHeat(tr, 0.15);
  }

  /* ---------- dust and insects in the near field ---------------------------
     A few motes drifting a metre from the eye do more for the feeling of being
     in a real volume of air than any amount of geometry further out.         */
  function buildMotes() {
    const N = 220, pos = new Float32Array(N*3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random()-0.5)*5.0;
      pos[i*3+1] = FLOOR + 0.6 + Math.random()*2.0;
      pos[i*3+2] = -1.5 + Math.random()*3.2;
      ph[i] = Math.random()*6.283;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    motes = new THREE.Points(gg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uT: { value: 0 }, uG: { value: GAIN } },
      vertexShader: `attribute float aPh; uniform float uT; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uT*0.35 + aPh)*0.30;
          p.y += sin(uT*0.22 + aPh*1.7)*0.16;
          p.z += cos(uT*0.28 + aPh*0.9)*0.22;
          vA = 0.35 + 0.65*abs(sin(uT*0.7 + aPh*2.3));
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_PointSize = 2.4;
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `varying float vA; uniform float uG;
        void main(){
          float d = length(gl_PointCoord-0.5); if(d>0.5) discard;
          gl_FragColor = vec4(vec3(0.85,0.78,0.62)*uG*0.06, (1.0-d*2.0)*vA*0.55);
        }`
    }));
    motes.frustumCulled = false;
    scene.add(motes);
  }

  /* ---------- public ------------------------------------------------------- */
  return {
    glowTex: () => radialTex('rgba(255,248,225,0.95)','rgba(255,225,160,0)'),
    heatables, bpMarkers, floodlights, mist, visLights, rangers, GAIN, hdr, OP_EYE, ARC,
    heightAt,
    __reg: registerHeat,
    isThermal: () => thermalOn,
    build(sc) {
      scene = sc;
      scene.fog = new THREE.FogExp2(0x02030a, 0.0016);
      const amb  = new THREE.AmbientLight(0x1b2738, 0.105*GAIN); scene.add(amb);
      const hemi = new THREE.HemisphereLight(0x22304a, 0x0d0a05, 0.085*GAIN); scene.add(hemi);
      const moon = new THREE.DirectionalLight(0xaec4e8, 0.085*GAIN);
      // the panorama's moon sits at bearing +35 deg, 35 deg up: light from there
      moon.position.set(Math.sin(0.61)*Math.cos(0.61)*400, Math.sin(0.61)*400,
                        -Math.cos(0.61)*Math.cos(0.61)*400);
      scene.add(moon);
      buildSky(); buildGround(); buildGrass(); buildFence();
      buildNallah(); buildTreeline(); buildRangersPosts();
      buildMist(); interiorLights = buildMorcha(); buildMotes();
      World.retargetLights(0);
      // hand the floodlight positions to the grass shader
      const u = grassMat.uniforms.uFlood.value; let k=0;
      for (const f of floodlights) if (!f.dead && k<16) u[k++].set(f.x-1.8, 8.8, W.fenceZ+5.5, 1.0);
      return { amb, hemi, moon };
    },
    setThermal,
    /* Called once the renderer has confirmed real multisampling. Every cut-out
       material (grass, trees, bush cards, the wire panel, scanned plants) goes
       to alpha-to-coverage: its edges become partial coverage and stop crawling.
       The cut-off drops right down, because far-away mip levels of thin things
       like wire carry faint alpha — under a hard 0.28 cut the fence would VANISH
       at range instead of settling into haze, which is what real wire does. */
    enableCoverage() {
      const flip = m => {
        if (!m || !(m.alphaTest > 0)) return;
        m.alphaToCoverage = true; m.transparent = false;
        m.alphaTest = Math.min(m.alphaTest, 0.06); m.needsUpdate = true;
      };
      scene.traverse(o => { if (o.material) [].concat(o.material).forEach(flip); });
      for (const h of heatables) { flip(h.userData.matNormal); flip(h.userData.matThermal); }
      grassMat.alphaToCoverage = true; grassMat.transparent = false;
      grassMat.uniforms.uA2C.value = 1; grassMat.needsUpdate = true;
    },
    setDisturbers(list) {
      const u=grassMat.uniforms.uDisturb.value;
      for(let i=0;i<8;i++){
        if(i<list.length) u[i].set(list[i].x, list[i].motion, list[i].z, list[i].r);
        else u[i].set(0,0,0,0);
      }
    },
    /* roving real lights keep the normal-mapped ground alive wherever you look */
    retargetLights(bearingDeg) {
      const aim = Math.tan(THREE.MathUtils.degToRad(bearingDeg)) * Math.abs(W.fenceZ);
      const live = floodlights.filter(f=>!f.dead)
        .sort((a,b)=>Math.abs(a.x-aim)-Math.abs(b.x-aim));
      poolLights.forEach((L,i)=>{
        const f = live[i];
        if (!f) { L.intensity = 0; return; }
        const lx = f.x - 1.8, lz = W.fenceZ + 5.5;
        L.position.set(lx, heightAt(f.x, lz) + 11.3, lz);      // the lamp head
        L.target.position.set(lx - 3.0, heightAt(f.x, W.fenceZ - 16), W.fenceZ - 16);
        L.target.updateMatrixWorld();
        L.intensity = 4.2 * GAIN;
      });
    },
    setSearchlight(on, origin, dir) {
      grassMat.uniforms.uSLon.value = on?1:0;
      if(on){ grassMat.uniforms.uSLo.value.copy(origin); grassMat.uniforms.uSLd.value.copy(dir); }
    },
    setFlare(intensity, pos) {
      grassMat.uniforms.uFlare.value = intensity;
      skyMat.uniforms.uFlare.value = intensity;
      if(pos) grassMat.uniforms.uFlarePos.value.copy(pos);
    },
    update(t, fog, moonI) {
      grassMat.uniforms.uTime.value = t;
      grassMat.uniforms.uFog.value  = fog;
      grassMat.uniforms.uMoon.value = moonI;
      skyMat.uniforms.uMoon.value   = moonI;
      stars.material.uniforms.uT.value = t;
      if (motes) motes.material.uniforms.uT.value = t;
      const dense = THREE.MathUtils.clamp((fog-0.0016)/0.004, 0, 1);
      mist.forEach((m,i)=>{ m.material.opacity = 0.012 + dense*0.115;
        m.position.x = Math.sin(t*0.035 + i)*70; });
    },
    gridRef(x,z) {
      let best=bpMarkers[0], bd=1e9;
      for(const b of bpMarkers){ const d=Math.abs(b.x-x); if(d<bd){bd=d;best=b;} }
      const range=Math.round(Math.hypot(x,z)/25)*25;
      return 'BP '+best.num+'/'+((x-best.x)>=0?'R':'L')+Math.round(bd)+' — '+range+'m';
    }
  };
})();
