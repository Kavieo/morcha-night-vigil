/* MORCHA :: OPTICS — every sight is a trade. None of them show you everything. */

const Optics = (function () {

  const MODES = [
    { id:'EYE',     name:'WIDE WATCH (naked eye)', fov:44, range:230, key:'1',
      note:'The whole watch. He scans this with his own eyes — no man past 150 m.' },
    { id:'BINO',    name:'BINOCULAR 7x50',   fov: 7, range:700, key:'2',
      note:'Detail and weapon ID — but you are blind outside 7 degrees.' },
    { id:'THERMAL', name:'THERMAL IMAGER',   fov:10, range:900, key:'3',
      note:'Sees heat through grass. Cannot tell a farmer from an infiltrator.' },
    { id:'NVG',     name:'IMAGE INTENSIFIER',fov:26, range:430, key:'4',
      note:'Detail at night — blooms out completely if a flare catches it.' }
  ];

  let cam, rt, quad, quadScene, quadCam, uni, R = null;
  let brightMat, blurMat, downMat, blurQuad, blurScene;
  let mips = [], temps = [];
  const MIPS = 4;            // glow levels: tight core -> wide soft halo
  let MSAA = false, PR = 1;
  let SS = 1.45;              // supersample factor — fallback path only
  let yaw = 0, pitch = 0, zoom = 1, modeIdx = 0;
  let sway = 0;

  function build(renderer, w, h) {
    cam = new THREE.PerspectiveCamera(MODES[0].fov, w/h, 0.15, 2600);
    cam.position.set(0, 9.35, 0);

    R = renderer;
    PR = renderer.getPixelRatio();

    /* HDR target. The scene is lit in near-physical units: moonlit ground sits
       around 0.01 and a floodlight is 100x that. An 8-bit buffer quantises the
       dark end into flat grey bands, which is exactly where the man is hiding. */
    const gl2 = renderer.capabilities.isWebGL2;
    const hdr = gl2 || !!renderer.extensions.get('OES_texture_half_float');

    /* ANTI-ALIASING.
       Before: a plain render target at 1.45x the WINDOW size. On a retina screen
       the canvas is already 1.6x, so that was rendering BELOW native and every
       post, wire and branch edge crawled.
       Now: real 4x multisampling at native drawing-buffer size, which is both
       sharper and cheaper than supersampling (it shades each pixel once). It
       also enables alpha-to-coverage, which is the only thing that smooths the
       cut-out edges of grass, trees and wire. Needs WebGL2 + float colour
       buffers; anything older falls back to the supersampled path. */
    MSAA = gl2 && !!THREE.WebGLMultisampleRenderTarget &&
           !!renderer.extensions.get('EXT_color_buffer_float');
    SS = MSAA ? 1.0 : 1.45;
    const sceneOpt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType };
    const W0 = Math.round(w*PR*SS), H0 = Math.round(h*PR*SS);
    if (MSAA) { rt = new THREE.WebGLMultisampleRenderTarget(W0, H0, sceneOpt); rt.samples = 4; }
    else        rt = new THREE.WebGLRenderTarget(W0, H0, sceneOpt);

    /* GLOW. Real glare round a 1000 W lamp at night is not one blur: there is a
       bright tight core and a wide soft halo that fades over a large part of the
       frame. One small blur reads as a hard dot. So: a chain of MIPS levels, each
       half the size of the last and blurred, summed — the small ones are the halo. */
    const rtOpt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                    format: THREE.RGBAFormat,
                    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType };
    mips = []; temps = [];
    for (let k = 0; k < MIPS; k++) {
      const bw = Math.max(2, Math.round(w*PR / Math.pow(2, k+1)));
      const bh = Math.max(2, Math.round(h*PR / Math.pow(2, k+1)));
      mips.push(new THREE.WebGLRenderTarget(bw, bh, rtOpt));
      temps.push(new THREE.WebGLRenderTarget(bw, bh, rtOpt));
    }

    const VQ = 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}';
    /* Bright pass. Output stays in SCENE units: the composite applies exposure
       once. It used to apply it here AND there, which scaled the glow by
       exposure squared — about 0.3% of what was intended. */
    brightMat = new THREE.ShaderMaterial({
      uniforms: { uTex:{value:rt.texture}, uExposure:{value:0.18}, uCut:{value:0.55} },
      depthTest:false, depthWrite:false, vertexShader: VQ,
      fragmentShader:`uniform sampler2D uTex; uniform float uExposure,uCut; varying vec2 vUv;
        void main(){ vec3 h = texture2D(uTex,vUv).rgb;
          float l = dot(h, vec3(0.2126,0.7152,0.0722)) * uExposure;
          gl_FragColor = vec4(h * smoothstep(uCut, uCut*3.0, l), 1.0); }` });

    downMat = new THREE.ShaderMaterial({
      uniforms: { uTex:{value:null}, uTexel:{value:new THREE.Vector2()} },
      depthTest:false, depthWrite:false, vertexShader: VQ,
      fragmentShader:`uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec2 o = uTexel;
          vec3 c = texture2D(uTex,vUv+vec2(-o.x,-o.y)).rgb + texture2D(uTex,vUv+vec2(o.x,-o.y)).rgb
                 + texture2D(uTex,vUv+vec2(-o.x, o.y)).rgb + texture2D(uTex,vUv+vec2(o.x, o.y)).rgb;
          gl_FragColor = vec4(c*0.25, 1.0); }` });

    blurMat = new THREE.ShaderMaterial({
      uniforms: { uTex:{value:null}, uDir:{value:new THREE.Vector2(1,0)},
                  uTexel:{value:new THREE.Vector2()} },
      depthTest:false, depthWrite:false, vertexShader: VQ,
      fragmentShader:`uniform sampler2D uTex; uniform vec2 uDir,uTexel; varying vec2 vUv;
        void main(){
          vec2 o = uDir * uTexel;
          vec3 c = texture2D(uTex,vUv).rgb * 0.227;
          c += (texture2D(uTex,vUv+o*1.385).rgb + texture2D(uTex,vUv-o*1.385).rgb) * 0.316;
          c += (texture2D(uTex,vUv+o*3.231).rgb + texture2D(uTex,vUv-o*3.231).rgb) * 0.070;
          gl_FragColor = vec4(c,1.0); }` });

    uni = {
      uTex:{value:rt.texture}, uTime:{value:0}, uMode:{value:0},
      uBloom:{value:0}, uGain:{value:1}, uAspect:{value:w/h},
      uFlash:{value:0}, uFatigue:{value:0}, uExposure:{value:0.18},
      uB0:{value:mips[0].texture}, uB1:{value:mips[1].texture},
      uB2:{value:mips[2].texture}, uB3:{value:mips[3].texture},
      uBloomW:{value:new THREE.Vector4(0.50, 0.62, 0.78, 0.95)},
      uBloomAmt:{value:0.30}, uSS:{value:SS},
      uTexel:{value:new THREE.Vector2(1/W0, 1/H0)}
    };

    quadScene = new THREE.Scene();
    quadCam   = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
      uniforms: uni, depthTest:false, depthWrite:false,
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);} `,
      fragmentShader:`
        uniform sampler2D uTex, uB0, uB1, uB2, uB3;
        uniform vec4 uBloomW;
        uniform float uTime,uMode,uBloom,uGain,uAspect,uFlash,uFatigue,uExposure,uBloomAmt,uSS;
        uniform vec2 uTexel;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        /* ACES filmic approximation — keeps floodlights from clipping to flat white
           while still lifting the deep shadow where the crawler actually is. */
        vec3 aces(vec3 x){
          const float a=2.51,b=0.03,c2=2.43,d=0.59,e=0.14;
          return clamp((x*(a*x+b))/(x*(c2*x+d)+e), 0.0, 1.0);
        }

        void main(){
          vec2 uv = vUv;
          /* Rotated-grid 4-tap resolve of the supersampled buffer. Cheap, and
             it removes the crawling on the wire and the concertina. */
          vec3 c;
          if (uSS > 1.01) {              // supersampled fallback: filter it down
            vec2 o = uTexel * 0.34;
            c = ( texture2D(uTex, uv + vec2( o.x,  o.y)).rgb
                + texture2D(uTex, uv + vec2(-o.x,  o.y)).rgb
                + texture2D(uTex, uv + vec2( o.x, -o.y)).rgb
                + texture2D(uTex, uv + vec2(-o.x, -o.y)).rgb ) * 0.25;
          } else {
            c = texture2D(uTex, uv).rgb;  // MSAA already resolved it
          }
          /* glare: tight core + progressively wider halo */
          vec3 bl = texture2D(uB0,uv).rgb*uBloomW.x + texture2D(uB1,uv).rgb*uBloomW.y
                  + texture2D(uB2,uv).rgb*uBloomW.z + texture2D(uB3,uv).rgb*uBloomW.w;
          c += bl * uBloomAmt;
          c = aces(c * uExposure * uGain);
          c = pow(c, vec3(1.0/2.2));                 // linear -> display
          vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
          float r = length(p);
          float g = hash(uv*vec2(1920.0,1080.0) + uTime*60.0);

          if(uMode < 0.5){
            /* ---- NAKED EYE ------------------------------------------------
               The eye is NOT uniformly scotopic at night. Rods carry the dark
               scrub — no colour, and a blue shift, because rod sensitivity
               peaks around 500 nm (Purkinje). But a 1000 W sodium floodlight
               at 150 m is well over the cone threshold, so the lit band is
               PHOTOPIC and you see it as the orange it really is.
               Desaturating everything uniformly is the day-for-night look and
               it is wrong. Split it by luminance instead.                   */
            float l = dot(c, vec3(0.28,0.60,0.12));
            float photopic = smoothstep(0.055, 0.30, l);
            vec3  rods = vec3(l*0.58, l*0.78, l*1.32);
            c = mix(rods, c, photopic);
            c += (g-0.5)*0.030;                       // retinal noise in the dark
            c *= 1.0 - smoothstep(0.36,0.80,r)*0.62;

          } else if(uMode < 1.5){
            /* ---- BINOCULAR: twin-circle field, hard black outside ----------
               50 mm objectives gather far more light than the naked pupil, so
               the cone threshold is crossed over much more of the field and
               colour survives further into the shadow.                      */
            float d1 = length(p - vec2(-0.15,0.0));
            float d2 = length(p - vec2( 0.15,0.0));
            float fieldR = 0.40;
            float m = 1.0 - smoothstep(fieldR-0.012, fieldR, min(d1,d2));
            float lb = dot(c, vec3(0.28,0.60,0.12));
            float ph = smoothstep(0.022, 0.16, lb);
            c = mix(vec3(lb*0.62, lb*0.80, lb*1.24), c, ph);
            c += (g-0.5)*0.022;
            c *= 1.0 - smoothstep(0.10,fieldR,min(d1,d2))*0.35;   // edge falloff
            c *= m;

          } else if(uMode < 2.5){
            /* ---- THERMAL: white-hot. A cooled imager has a hard response
                   curve, not a gamma lift — terrain stays near black and a body
                   at 30 C saturates. That contrast IS the instrument.        */
            float l = dot(c, vec3(0.32,0.52,0.16));
            l = clamp((l - 0.100) / 0.620, 0.0, 1.0);
            l += (g-0.5)*0.040;                                   // sensor noise
            l *= 0.94 + 0.06*sin(uv.y*900.0);                     // scanlines
            c = vec3(l);
            float d = length(p);
            float m = 1.0 - smoothstep(0.455,0.465,d);
            c *= m;

          } else {
            /* ---- NVG: green gain, heavy grain, and it BLOOMS ------------- */
            float l = dot(c, vec3(0.30,0.59,0.11));
            l = pow(clamp(l*2.1,0.0,1.0), 0.80) * uGain;
            l += (g-0.5)*0.10;
            c = vec3(l*0.18, l*1.0, l*0.32);
            float d = length(p);
            c *= 1.0 - smoothstep(0.24,0.455,d)*0.55;
            c *= 1.0 - smoothstep(0.450,0.462,d);
            c += vec3(0.02,0.16,0.05) * uBloom;                   // halation
            c = mix(c, vec3(0.55,1.0,0.6), clamp(uBloom*0.95,0.0,0.95));
          }

          /* muzzle flash / flare ignition punch */
          c += vec3(1.0,0.92,0.75) * uFlash;
          /* fatigue: the picture starts to swim and dim */
          c *= 1.0 - uFatigue*0.22;
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
    quadScene.add(quad);
    return cam;
  }

  function mode() { return MODES[modeIdx]; }

  function setMode(i) {
    if (i === modeIdx) return;
    modeIdx = i;
    World.setThermal(MODES[i].id === 'THERMAL');
    zoom = 1;
    apply();
  }

  function apply() {
    cam.fov = MODES[modeIdx].fov / zoom;
    cam.updateProjectionMatrix();
    uni.uMode.value = modeIdx;
  }

  function look(dx, dy) {
    const s = 0.0030 * (cam.fov / 30);       // fine optics pan slowly. This hurts.
    yaw   -= dx * s;
    pitch -= dy * s;
    const lim = THREE.MathUtils.degToRad(DOCTRINE.world.arcLimit);
    yaw   = THREE.MathUtils.clamp(yaw, -lim, lim);   // the post's assigned arc
    pitch = THREE.MathUtils.clamp(pitch, -0.42, 0.16);
  }

  function bearing() {                        // 0 = dead ahead, +right, in degrees
    return -THREE.MathUtils.radToDeg(yaw);
  }

  return {
    MODES,
    build, setMode, mode, look, apply, bearing,
    setExposure(v){ uni.uExposure.value = v; },
    exposure(){ return uni.uExposure.value; },
    modeIdx: () => modeIdx,
    setZoom(z) { zoom = THREE.MathUtils.clamp(z, 1, 3.2); apply(); },
    /* Slew the arc directly. Used by the instructor to put a trainee's eyes on
       something during a debrief, and by the harness for repeatable checks. */
    setAim(bearingDeg, pitchDeg) {
      const lim = THREE.MathUtils.degToRad(DOCTRINE.world.arcLimit);
      yaw = THREE.MathUtils.clamp(-THREE.MathUtils.degToRad(bearingDeg), -lim, lim);
      if (pitchDeg !== undefined)
        pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg), -0.42, 0.16);
    },
    pitchDeg() { return THREE.MathUtils.radToDeg(pitch); },
    /* Picture settings. A projector in a bright classroom needs a different
       exposure from a laptop in a dark room, so these are live, not baked. */
    setPicture(o) {
      if (o.exposure !== undefined) { uni.uExposure.value = o.exposure;
                                      brightMat.uniforms.uExposure.value = o.exposure; }
      if (o.bloom !== undefined)    uni.uBloomAmt.value = o.bloom;
      if (o.cut   !== undefined)    brightMat.uniforms.uCut.value = o.cut;
    },
    picture() { return { exposure: uni.uExposure.value, bloom: uni.uBloomAmt.value,
                         cut: brightMat.uniforms.uCut.value }; },
    zoom: () => zoom,
    update(dt, t, fatigue, gain, bloom, flash) {
      sway += dt;
      const amp = 0.00055 + fatigue * 0.0032;                    // breathing + fatigue
      const wy = Math.sin(sway*1.1)*amp + Math.sin(sway*2.7)*amp*0.4;
      const wp = Math.cos(sway*0.9)*amp*0.7;
      cam.rotation.set(0,0,0,'YXZ');
      cam.rotation.y = yaw + wy;
      cam.rotation.x = pitch + wp;
      uni.uTime.value = t; uni.uGain.value = gain;
      uni.uBloom.value = bloom; uni.uFlash.value = flash; uni.uFatigue.value = fatigue;
    },
    render(renderer, scene) {
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);

      if (!blurScene) {
        blurScene = new THREE.Scene();
        blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), brightMat);
        blurQuad.frustumCulled = false;
        blurScene.add(blurQuad);
      }
      const pass = (mat, target) => {
        blurQuad.material = mat;
        renderer.setRenderTarget(target); renderer.clear();
        renderer.render(blurScene, quadCam);
      };
      const blur = k => {
        const m = mips[k], tp = temps[k];
        blurMat.uniforms.uTexel.value.set(1/m.width, 1/m.height);
        blurMat.uniforms.uTex.value = m.texture;  blurMat.uniforms.uDir.value.set(1,0); pass(blurMat, tp);
        blurMat.uniforms.uTex.value = tp.texture; blurMat.uniforms.uDir.value.set(0,1); pass(blurMat, m);
      };
      brightMat.uniforms.uTex.value = rt.texture;
      pass(brightMat, mips[0]); blur(0);
      for (let k = 1; k < MIPS; k++) {
        downMat.uniforms.uTex.value = mips[k-1].texture;
        downMat.uniforms.uTexel.value.set(0.5/mips[k-1].width, 0.5/mips[k-1].height);
        pass(downMat, mips[k]); blur(k);
      }

      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    },
    resize(w, h) {
      cam.aspect = w/h; cam.updateProjectionMatrix();
      PR = R ? R.getPixelRatio() : PR;
      const W0 = Math.round(w*PR*SS), H0 = Math.round(h*PR*SS);
      rt.setSize(W0, H0);
      uni.uTexel.value.set(1/W0, 1/H0);
      for (let k = 0; k < MIPS; k++) {
        const bw = Math.max(2, Math.round(w*PR / Math.pow(2, k+1)));
        const bh = Math.max(2, Math.round(h*PR / Math.pow(2, k+1)));
        mips[k].setSize(bw, bh); temps[k].setSize(bw, bh);
      }
      uni.uAspect.value = w/h;
    },
    camera: () => cam,
    msaa: () => MSAA
  };
})();
