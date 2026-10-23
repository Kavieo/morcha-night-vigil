/* MORCHA :: INSTRUCTOR CONSOLE
   Runs in its own window. Sees the ground truth the trainee cannot, verifies
   what he points at, and drives every control. The trainee's window obeys. */

(function () {
  const $ = id => document.getElementById(id);
  let S = null, connected = false, lastSeen = 0, selId = null;
  const ARC = 58, MAXR = 640;

  let joinedAt = Date.now();
  Link.onCode(c => { $('sesscode').textContent = c; joinedAt = Date.now(); });
  Link.open('console');
  function askCode() {
    $('join').classList.add('on'); $('joincode').value = ''; $('joincode').focus();
  }
  $('joinbox').onsubmit = e => {
    e.preventDefault();
    const c = $('joincode').value.trim();
    if (!/^\d{4}$/.test(c)) { $('joincode').focus(); return; }
    $('join').classList.remove('on');
    connected = false; S = null;
    history.replaceState(null, '', 'instructor.html?code=' + c);
    Link.join(c);
  };
  $('sessbox').onclick = askCode;
  if (!Link.code()) askCode();

  /* ---------- incoming ---------------------------------------------------- */
  Link.on('state', d => {
    S = d; connected = true; lastSeen = Date.now();
    paint(); paintClaim(); paintSel();
  });
  Link.on('event', d => logLine('LINK', d.text, 0));

  /* The trainee's own picture, with what each shape actually is drawn on it. */
  let mirrorReady = false;
  Link.on('mirror', d => {
    const img = $('mirror');
    /* Match the box to his real screen shape, so the boxes land on the shapes
       instead of on a stretched copy of them. */
    img.onload = () => { if (img.naturalWidth)
      $('mirrorWrap').style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight; };
    img.src = d.img;
    if (!mirrorReady) { mirrorReady = true; img.style.display = 'block';
                        $('nomirror').style.display = 'none'; }
  });

  function paintOverlay() {
    /* Draw at the screen's real resolution — a fixed 1024px canvas stretched
       over the panel made every label blurry. */
    const c = $('overlay'), g = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W*dpr) || c.height !== Math.round(H*dpr)) {
      c.width = Math.round(W*dpr); c.height = Math.round(H*dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!S || !S.truth) return;
    const now = Date.now();
    for (const t of S.truth) {
      if (!t.screen || t.resolved) continue;
      const x = t.screen.sx * W, y = t.screen.sy * H;
      /* Box it generously — the instructor needs to find it fast, not measure
         it. Size grows as the contact closes so near ones are unmissable. */
      const r = Math.max(14, Math.min(90, t.screen.px * W * 0.5));
      const col = t.own ? '#7fd4ff' : t.hostile ? '#ff5f52' : '#7fe0a4';

      /* A moving contact pulses. Frozen means he has gone to ground because the
         trainee's arc settled on him — which is the moment worth noticing. */
      const moving = t.state !== 'FREEZE' && t.state !== 'HALTED';
      const pulse = moving ? 0.55 + 0.45 * Math.sin(now / 160) : 1;
      g.lineWidth = moving ? 2.4 : 1.4;
      g.globalAlpha = moving ? pulse : 0.75;
      g.strokeStyle = col;
      g.setLineDash(moving ? [] : [4, 4]);
      g.strokeRect(x - r, y - r, r * 2, r * 2);
      g.setLineDash([]);
      g.globalAlpha = 1;

      const label = '#' + t.id + ' ' + t.type + (t.decoy ? ' (DECOY)' : '');
      const sub = Math.round(t.range) + ' m · ' +
                  (t.bearing > 0 ? '+' : '') + t.bearing + '° · ' +
                  (moving ? 'MOVING' : 'FROZEN') +
                  (t.designated ? ' · HELD' : '');
      g.font = 'bold 13px ui-monospace,monospace';
      const w = Math.max(g.measureText(label).width, g.measureText(sub).width) + 12;
      const ly = y - r - 34 < 2 ? y + r + 4 : y - r - 34;
      g.fillStyle = 'rgba(4,8,6,0.82)';
      g.fillRect(x - r, ly, w, 32);
      g.fillStyle = col; g.fillText(label, x - r + 6, ly + 14);
      g.font = '11px ui-monospace,monospace'; g.fillStyle = '#9dbfad';
      g.fillText(sub, x - r + 6, ly + 27);
    }
  }
  setInterval(paintOverlay, 60);          // the pulse needs its own beat

  $('popTrainee').onclick = () => window.open('index.html' + (Link.code() ? '?code=' + Link.code() : ''), 'morchaTrainee',
    'width=1440,height=810,menubar=no,toolbar=no,location=no');
  Link.on('claim', c => {
    logLine('CLAIM', 'Trainee reports a contact at ' + clk(c.t) +
            '. Watch where he points.', 0);
    try { beep(); } catch (e) {}
  });
  Link.on('ended', a => {
    logLine('SHIFT', a.verdict + ' — score ' + a.score + ' / pass ' + a.passMark, 0);
  });
  Link.hello();
  setInterval(() => {
    const live = connected && Date.now() - lastSeen < 3000;
    const hidden = live && S && S.hidden;
    const md = Link.mode();
    /* Say plainly why nothing is showing: almost always a stale code, because
       the trainee screen makes a NEW code every time it is reloaded. */
    if (!mirrorReady) {
      const since = (Date.now() - joinedAt) / 1000;
      $('nomirror').innerHTML = !Link.code()
        ? 'Enter the session code shown on the trainee screen.'
        : since < 8 ? 'Connecting to session <b>' + Link.code() + '</b>…'
        : 'No trainee screen found with code <b>' + Link.code() + '</b>.<br>' +
          '<span style="font-size:12px">The trainee screen makes a new code each time it is reloaded. ' +
          'Check the code on it, then click the code at the top left to change it.</span>';
    }
    $('offline').textContent = !Link.code() ? 'NO SESSION'
      : !live ? (md === 'connecting' ? 'CONNECTING…' : 'NOT CONNECTED')
      : hidden ? 'TRAINEE SCREEN HIDDEN'
      : md === 'network' ? 'LINKED · OTHER COMPUTER' : 'LINKED · THIS COMPUTER';
    $('offline').style.color = !live ? 'var(--red)' : hidden ? 'var(--amber)' : 'var(--grn)';
  }, 500);

  function clk(x){ const m=Math.floor(x/60), s=Math.floor(x%60);
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }

  function beep(){
    const c = new (window.AudioContext||window.webkitAudioContext)();
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.12);
  }

  function logLine(kind, text, pts) {
    const f = $('foot');
    const d = document.createElement('div');
    d.className = 'e' + (pts < 0 ? ' neg' : '');
    d.innerHTML = '<span class="t">' + (S ? clk(S.t) : '00:00') + '</span>' +
                  '<span class="k">' + kind + '</span>' + text;
    f.appendChild(d); f.scrollTop = f.scrollHeight;
    while (f.children.length > 60) f.removeChild(f.firstChild);
  }

  /* ---------- the plan view ------------------------------------------------
     A fan seen from above: the post at the bottom, bearing left to right,
     range outward. The instructor reads it the way he reads ground.        */
  function paint() {
    const c = $('plan'), g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0,0,W,H);
    const ox = W/2, oy = H - 24;
    const toXY = (brg, rng) => {
      const a = brg * Math.PI/180, r = (rng/MAXR) * (H - 60);
      return [ox + Math.sin(a)*r, oy - Math.cos(a)*r];
    };

    // range rings and the key lines
    g.font = '10px ui-monospace,monospace'; g.textAlign = 'center';
    for (const [rng, lbl, col] of [[150,'FENCE 150 m','#6b5a2a'],[300,'ZERO LINE 300 m','#7a3030'],
                                   [450,'450 m','#22332a'],[620,'620 m','#22332a']]) {
      g.strokeStyle = col; g.lineWidth = 1; g.beginPath();
      for (let b = -ARC; b <= ARC; b += 2) {
        const [x,y] = toXY(b, rng); b === -ARC ? g.moveTo(x,y) : g.lineTo(x,y);
      }
      g.stroke();
      const [lx,ly] = toXY(ARC, rng);
      g.fillStyle = col; g.textAlign = 'left'; g.fillText(lbl, lx + 6, ly + 3);
    }
    // arc edges + bearing ticks
    g.strokeStyle = '#2a3a30'; g.textAlign = 'center';
    for (let b = -ARC; b <= ARC; b += 10) {
      const [x1,y1] = toXY(b, 40), [x2,y2] = toXY(b, MAXR);
      g.globalAlpha = b % 30 === 0 ? 0.5 : 0.18;
      g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
      g.globalAlpha = 1;
      if (b % 30 === 0) { g.fillStyle = '#4d6658';
        const [tx,ty] = toXY(b, MAXR); g.fillText((b>0?'+':'')+b, tx, ty - 6); }
    }

    // the slice the trainee is actually looking at
    if (S) {
      const half = ({EYE:27, BINO:3.5, THERMAL:5, NVG:13})[S.optic] || 20;
      g.fillStyle = 'rgba(127,224,164,0.10)';
      g.beginPath(); g.moveTo(ox, oy);
      for (let b = S.bearing - half; b <= S.bearing + half; b += 1) {
        const [x,y] = toXY(b, MAXR); g.lineTo(x,y);
      }
      g.closePath(); g.fill();
      g.strokeStyle = '#8ef0b4'; g.lineWidth = 1.5;
      const [bx,by] = toXY(S.bearing, MAXR);
      g.beginPath(); g.moveTo(ox,oy); g.lineTo(bx,by); g.stroke();
    }

    // the post
    g.fillStyle = '#e8b44c'; g.beginPath(); g.arc(ox, oy, 5, 0, 7); g.fill();
    g.fillStyle = '#6f8f7c'; g.textAlign = 'center'; g.fillText('MORCHA', ox, oy + 16);

    // contacts
    window.__hit = [];
    if (S && S.truth) for (const c2 of S.truth) {
      const [x,y] = toXY(c2.bearing, Math.min(c2.range, MAXR));
      const col = c2.resolved ? '#3d4a42'
                : c2.own ? '#7fd4ff' : c2.hostile ? '#ff5f52' : '#7fe0a4';
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, c2.id === selId ? 8 : 5.5, 0, 7); g.fill();
      if (c2.id === selId) { g.strokeStyle = '#e8b44c'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 12, 0, 7); g.stroke(); }
      g.fillStyle = c2.resolved ? '#3d4a42' : '#cfe9da';
      g.textAlign = 'left';
      g.fillText('#' + c2.id + ' ' + c2.type + (c2.decoy ? ' (decoy)' : ''), x + 11, y - 2);
      g.fillStyle = '#5f7a6a';
      g.fillText(c2.range + ' m · ' + c2.state + (c2.designated ? ' · HELD' : ''), x + 11, y + 9);
      window.__hit.push({ id: c2.id, x: x / W, y: y / H });
    }
  }

  $('plan').addEventListener('click', e => {
    const r = e.target.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    let best = null, bd = 1e9;
    for (const h of (window.__hit || [])) {
      const d = Math.hypot(h.x - fx, h.y - fy);
      if (d < bd) { bd = d; best = h; }
    }
    if (best && bd < 0.05) { selId = best.id; Link.cmd('select', { id: best.id }); paint(); }
  });

  /* ---------- the claim panel --------------------------------------------- */
  function paintClaim() {
    const box = $('claim'), opts = $('opts');
    const pc = S && S.pendingClaim;
    if (!pc) {
      box.className = ''; box.querySelector('h3').textContent = 'Step 1 · Wait for his report';
      opts.innerHTML = ''; return;
    }
    box.className = 'live';
    box.querySelector('h3').textContent = 'He reported at ' + clk(pc.t) + ' — which one is he pointing at?';
    if (!pc.options.length) {
      opts.innerHTML = '<div class="opt"><b>Nothing was out there.</b>' +
        '<button data-verify="FALSE">False alarm</button></div>';
    } else {
      opts.innerHTML = pc.options.map(o =>
        '<div class="opt ' + (o.own ? 'own' : o.hostile ? 'host' : 'civ') + '">' +
          '<div><b>#' + o.id + ' ' + o.type + '</b>' +
          '<div class="meta">' + (o.bearing > 0 ? '+' : '') + o.bearing + '° · ' +
            o.range + ' m · ' + (o.moving ? 'moving' : 'still') +
            (o.designated ? ' · already held' : '') + '</div></div>' +
          '<button data-verify="' + o.id + '">This one</button></div>').join('') +
        '<div class="opt"><b>He pointed at empty ground</b>' +
        '<button data-verify="FALSE">False alarm</button></div>';
    }
  }

  document.addEventListener('click', e => {
    const v = e.target.getAttribute && e.target.getAttribute('data-verify');
    if (v === null || v === undefined) return;
    const pc = S && S.pendingClaim; if (!pc) return;
    Link.cmd('verify', { claimId: pc.id, contactId: v === 'FALSE' ? 'FALSE' : +v });
    if (v !== 'FALSE') selId = +v;
    logLine('VERIFY', v === 'FALSE' ? 'Marked false alarm.' : 'Confirmed contact #' + v + '.',
            v === 'FALSE' ? -1 : 0);
  });

  /* ---------- selected contact + ROE guard --------------------------------- */
  function paintSel() {
    const s = S && S.selected, box = $('sel'), w = $('roewarn');
    if (!s) { box.innerHTML = '<span style="color:var(--dim)">None yet. Confirm a report above.</span>';
              w.style.display = 'none'; return; }
    selId = s.id;
    const rung = (l, on) => '<div class="lad ' + (on ? 'on' : '') + '"><span>' +
      (on ? '▣' : '▢') + ' ' + l + '</span></div>';
    box.innerHTML = '<div id="selhdr">#' + s.id + ' ' + s.type + '</div>' +
      '<div id="selgrid">' + (s.grid || '—') + '</div>' +
      rung('Reported to Coy HQ', s.reported) +
      rung('Challenged', s.challenged) +
      rung('Illuminated', s.illuminated) +
      rung('QRT dispatched', s.qrtSent) +
      rung('Weapon positively ID’d', s.armedIdentified) +
      (s.verdict ? '<div style="color:var(--dim);margin-top:6px">' + s.verdict + '</div>' : '');

    const bad = [];
    if (s.own) bad.push('This is OUR OWN PATROL. Aimed fire ends the shift.');
    if (s.beyondZeroLine) bad.push('Still BEYOND THE ZERO LINE — on Pakistani soil. ' +
      'Aimed fire is a cross-border incident.');
    if (!s.armedIdentified) bad.push('No weapon confirmed. Engagement would be outside ROE.');
    w.innerHTML = bad.join('<br>'); w.style.display = bad.length ? 'block' : 'none';
  }

  /* ---------- controls ------------------------------------------------------ */
  document.querySelectorAll('[data-cmd]').forEach(b =>
    b.onclick = () => { Link.cmd(b.getAttribute('data-cmd')); });
  document.querySelectorAll('[data-optic]').forEach(b =>
    b.onclick = () => Link.cmd('optic', { i: +b.getAttribute('data-optic') }));
  document.querySelectorAll('[data-nudge]').forEach(b =>
    b.onclick = () => Link.cmd('nudge', { d: +b.getAttribute('data-nudge') }));
  $('aimgo').onclick = () => Link.cmd('aim', { bearing: +$('aim').value, pitch: -3 });
  $('expo').oninput  = e => { const v = +e.target.value/1000; $('expov').textContent = v.toFixed(3);
                              Link.cmd('picture', { exposure: v }); };
  $('bloom').oninput = e => { const v = +e.target.value/100; $('bloomv').textContent = v.toFixed(2);
                              Link.cmd('picture', { bloom: v }); };
  $('ibrg').oninput = e => $('ibrgv').textContent = e.target.value + '°';
  $('igo').onclick  = () => { Link.cmd('inject', { type: $('itype').value, bearing: +$('ibrg').value });
                              logLine('INJECT', $('itype').value + ' at ' + $('ibrg').value + '°.', 0); };
  $('fog').oninput  = e => { const v = +e.target.value/10000; Link.cmd('fog', { v });
    $('fogv').textContent = v < 0.002 ? 'clear' : v < 0.004 ? 'haze' : v < 0.006 ? 'fog' : 'thick'; };
  $('ts').oninput   = e => { Link.cmd('timescale', { v: +e.target.value });
                             $('tsv').textContent = '×' + e.target.value; };
  $('reveal').onclick = () => { Link.cmd('reveal'); $('reveal').classList.toggle('on'); };
  $('pause').onclick  = () => { const p = !$('pause').classList.contains('on');
    Link.cmd('pause', { v: p }); $('pause').classList.toggle('on', p);
    $('pause').textContent = p ? 'Resume' : 'Pause'; };
  $('start').onclick  = () => Link.cmd('start');
  $('end').onclick    = () => Link.cmd('end');
  $('notes').oninput  = e => Link.cmd('notes', { v: e.target.value });

  /* ---------- top bar ------------------------------------------------------- */
  setInterval(() => {
    if (!S) return;
    $('clock').textContent  = clk(S.remaining);
    $('score').textContent  = S.score;
    $('loose').textContent  = S.loose;
    $('breach').textContent = S.breaches;
    $('brg').textContent    = (S.bearing > 0 ? '+' : '') + S.bearing + '°';
    $('met').textContent    = S.opticName + ' · ' + S.met +
      ' · flares ' + S.stores.flares + ' · QRT ' + S.stores.qrtDispatches +
      (S.qrt.out ? ' · QRT INBOUND ' + S.qrt.eta + 's' : '');
  }, 200);
})();
