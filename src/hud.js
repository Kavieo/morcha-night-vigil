/* MORCHA :: HUD, INSTRUCTOR PANEL, AFTER-ACTION REVIEW */

const HUD = (function () {

  let api, $ = id => document.getElementById(id);
  let instrOpen = false, logN = 0;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---------- bearing tape ------------------------------------------------ */
  function drawTape(bearing, fov, marks) {
    const c = $('tape'), g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0,0,w,h);
    const span = 190, px = w / span;                    // -95..+95 degrees
    const toX = b => (b + span/2) * px;
    // everything outside the post's assigned arc belongs to the flanking morchas
    const lim = DOCTRINE.world.arcLimit;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, toX(-lim), h); g.fillRect(toX(lim), 0, w - toX(lim), h);
    g.strokeStyle = '#4a3a18'; g.lineWidth = 1.5;
    for (const sx of [-lim, lim]) { g.beginPath(); g.moveTo(toX(sx),0); g.lineTo(toX(sx),h); g.stroke(); }
    g.strokeStyle = '#2a3a30'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, h-1); g.lineTo(w, h-1); g.stroke();
    g.font = '10px ui-monospace,monospace'; g.textAlign = 'center';
    for (let b = -90; b <= 90; b += 10) {
      const x = toX(b), maj = b % 30 === 0;
      g.strokeStyle = maj ? '#5d7a68' : '#2e4438';
      g.beginPath(); g.moveTo(x, h - (maj?12:6)); g.lineTo(x, h); g.stroke();
      if (maj) { g.fillStyle = '#6f8f7c'; g.fillText((b>0?'+':'')+b, x, h-16); }
    }
    // the slice you can actually see right now
    const a = toX(bearing - fov/2), bx = toX(bearing + fov/2);
    g.fillStyle = 'rgba(120,200,150,0.16)';
    g.fillRect(a, 0, Math.max(bx-a, 2), h);
    g.strokeStyle = '#8ef0b4'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(toX(bearing), 0); g.lineTo(toX(bearing), h); g.stroke();
    for (const m of marks) {
      g.fillStyle = m.c; g.beginPath();
      g.arc(toX(m.b), 8, 4, 0, 7); g.fill();
      g.fillStyle = m.c; g.font='9px ui-monospace,monospace';
      g.fillText(m.l, toX(m.b), 22);
    }
  }

  /* ---------- ladder checklist -------------------------------------------- */
  function ladderHTML(c) {
    if (!c) return '<div class="dim">No contact designated.<br><span class="k">LEFT-CLICK</span> a suspicious return to designate it.<br><span class="k">TAB</span> cycles designated contacts.</div>';
    const rows = [
      ['DESIGNATED', c.designated],
      ['REPORTED to Coy HQ', c.reported],
      ['CHALLENGED', c.challenged],
      ['ILLUMINATED', c.illuminated],
      ['QRT DISPATCHED', c.qrtSent],
      ['WEAPON POSITIVELY ID’d', c.armedIdentified]
    ];
    let h = '<div class="cid">CONTACT ' + c.id + '</div>';
    h += '<div class="grid">' + (c.reportedGrid || '—') + '</div>';
    h += '<div class="cls">' +
         (c.armedIdentified ? '<b class="red">ARMED</b>' :
          '<span class="dim">classification UNCONFIRMED</span>') + '</div>';
    h += '<div class="state">' + (c.state || '') + (c.verdict ? ' · ' + c.verdict : '') + '</div>';
    for (const [k, v] of rows)
      h += '<div class="lad ' + (v?'on':'') + '"><span>' + (v?'▣':'▢') + '</span>' + k + '</div>';
    return h;
  }

  /* ---------- after action review ------------------------------------------ */
  function showAAR(a) {
    const o = $('aar');
    let h = '<h1 class="' + (a.verdict.startsWith('PASS')?'pass':'fail') + '">' + a.verdict + '</h1>';
    h += '<div class="sub">' + a.reason + ' · SCORE <b>' + a.score + '</b> / pass mark ' + a.passMark + '</div>';

    h += '<div class="cards">';
    h += card('BREACHES', a.breaches, a.breaches ? 'fail' : 'pass');
    h += card('APPREHENDED', a.apprehended, a.apprehended ? 'pass' : '');
    h += card('STILL LOOSE', a.loose, a.loose ? 'fail' : 'pass');
    h += card('FIRE DISCIPLINE', a.coi ? 'BREACHED' : 'HELD', a.coi ? 'fail' : 'pass');
    h += '</div>';

    if (a.missedCues.length) {
      h += '<h2>WHERE YOU WERE LOOKING WHEN IT MATTERED</h2>';
      h += '<table><tr><th>Contact</th><th>Readable from</th><th>Its bearing</th>' +
           '<th>Your arc</th><th>Your optic</th><th>Through at</th></tr>';
      for (const m of a.missedCues)
        h += '<tr class="bad"><td>#' + m.id + ' ' + m.type + '</td><td>' + Sim.clk(m.readableAt||0) +
             '</td><td>' + m.contactBearing + '°</td><td>' +
             (m.yourBearing==null?'—':m.yourBearing + '°') + '</td><td>' + m.yourOptic +
             '</td><td>' + Sim.clk(m.throughAt) + '</td></tr>';
      h += '</table>';
      h += '<p class="teach">Every row above was visible to you. The grass over that bearing was moving ' +
           'across the wind while your arc was elsewhere. Scan the dark floodlight gaps and the nallah ' +
           'on a fixed cycle — do not follow noise.</p>';
    }

    h += '<h2>CONTACT LEDGER</h2><table><tr><th>#</th><th>Class</th><th>Route</th>' +
         '<th>Seen</th><th>Reported</th><th>Challenged</th><th>Outcome</th></tr>';
    for (const c of a.contacts)
      h += '<tr class="' + (c.verdict.indexOf('BREACH')>=0 || c.verdict==='NEVER SEEN' ? 'bad' : '') + '">' +
           '<td>' + c.id + '</td><td>' + c.type + (c.decoy?' <i>(decoy)</i>':'') + '</td><td>' + c.route +
           '</td><td>' + (c.designated ? Sim.clk(c.designatedT) : '—') + '</td><td>' + (c.reported?'✓':'—') +
           '</td><td>' + (c.challenged?'✓':'—') + '</td><td>' + c.verdict + '</td></tr>';
    h += '</table>';

    h += '<h2>SHIFT LOG</h2><div class="loglist">';
    for (const e of a.events)
      h += '<div><span class="t">' + Sim.clk(e.t) + '</span><span class="kind">' + e.kind + '</span>' +
           e.text + (e.pts ? '<b class="' + (e.pts>0?'pos':'neg') + '">' +
           (e.pts>0?'+':'') + e.pts + '</b>' : '') + '</div>';
    h += '</div>';

    if (a.notes) h += '<h2>INSTRUCTOR REMARKS</h2><div class="notes">' + a.notes + '</div>';
    h += '<div class="btns"><button onclick="HUD.exportAAR()">EXPORT AAR (.txt)</button>' +
         '<button onclick="Sim.restart()">RUN AGAIN</button></div>';
    o.innerHTML = h; o.style.display = 'block';
    HUD._aar = a;
    document.exitPointerLock && document.exitPointerLock();
  }
  function card(l, v, c) { return '<div class="card ' + c + '"><b>' + v + '</b><span>' + l + '</span></div>'; }

  /* ---------- instructor panel --------------------------------------------- */
  function buildInstructor() {
    const p = $('instr');
    p.innerHTML = `
      <h3>INSTRUCTOR CONTROL <span class="dim">— press I to hide</span></h3>
      <div class="row"><label>Inject contact</label>
        <select id="i_type">
          <option>INFILTRATOR</option><option>SMUGGLER</option><option>CATTLE</option><option>OWN_TROOPS</option>
        </select>
        <input id="i_brg" type="range" min="-85" max="85" value="0">
        <span id="i_brgv">0°</span>
        <button id="i_go">INJECT</button>
      </div>
      <div class="row"><label>Visibility</label>
        <input id="i_fog" type="range" min="8" max="90" value="16">
        <span id="i_fogv">clear</span>
      </div>
      <div class="row"><label>Slew arc to</label>
        <input id="i_slew" type="range" min="-58" max="58" value="0">
        <span id="i_slewv">0°</span>
        <button id="i_slewgo">POINT HIM THERE</button>
      </div>
      <div class="row"><label>Time x</label>
        <input id="i_ts" type="range" min="1" max="12" value="1">
        <span id="i_tsv">x1</span>
        <span class="dim" style="font-size:9px">compress the quiet stretches</span>
      </div>
      <div class="row">
        <button id="i_rev">REVEAL ALL CONTACTS</button>
        <button id="i_flare">FORCE ILLUM</button>
        <button id="i_pause">PAUSE</button>
        <button id="i_end" class="danger">END SHIFT &amp; SCORE</button>
      </div>
      <div class="row"><label>Remarks</label>
        <textarea id="i_notes" placeholder="Observations on the trainee — carried into the AAR."></textarea>
      </div>
      <div class="row" id="i_live"></div>`;
    $('i_brg').oninput = e => $('i_brgv').textContent = e.target.value + '°';
    $('i_go').onclick   = () => api.inject($('i_type').value, +$('i_brg').value);
    $('i_slew').oninput = e => $('i_slewv').textContent = e.target.value + '°';
    $('i_slewgo').onclick = () => Optics.setAim(+$('i_slew').value, 0);
    $('i_ts').oninput   = e => { $('i_tsv').textContent = 'x' + e.target.value;
                                 api.setTimeScale(+e.target.value); };
    $('i_fog').oninput  = e => { const v = +e.target.value/10000; api.setFog(v);
      $('i_fogv').textContent = v < 0.002 ? 'clear' : v < 0.004 ? 'haze' : v < 0.006 ? 'fog' : 'thick fog'; };
    $('i_rev').onclick  = () => { const on = api.toggleReveal(); $('i_rev').classList.toggle('active', on); };
    $('i_flare').onclick= () => api.forceFlare();
    $('i_pause').onclick= () => { const s = api.state(); api.setPaused(!s.paused);
      $('i_pause').textContent = s.paused ? 'PAUSE' : 'RESUME'; };
    $('i_end').onclick  = () => api.forceEnd();
    $('i_notes').oninput= e => api.setNotes(e.target.value);
  }

  /* The trainee's screen carries almost nothing: a clock, what sight he is
     being shown, and the state of his own claim. No crosshair to aim, no key
     legend he cannot use, no score to play to. */
  function applyTraineeChrome() {
    if (!Sim.isTrainee || !Sim.isTrainee()) return;
    for (const id of ['keys','contact','stores','ret','log'])
      { const e = $(id); if (e) e.style.display = 'none'; }
    const opt = $('optics'); if (opt) opt.classList.add('lean');
    document.body.classList.add('trainee');
    const cue = el('div', '', '<b>SPACE</b> \u2014 CONTACT');
    cue.id = 'cue'; document.body.appendChild(cue);
  }

  return {
    showClaim(cl) {
      let b = $('claimbox');
      if (!b) { b = el('div'); b.id = 'claimbox'; document.body.appendChild(b); }
      if (!cl) { b.className = ''; return; }
      b.innerHTML = '<h3>CONTACT REPORTED</h3>' +
        '<p>Indicate it on the screen and give the bearing.</p>' +
        '<div class="wait">awaiting instructor\u2019s verification\u2026</div>';
      b.className = 'show';
    },
    init(a) {
      api = a;
      buildInstructor();
      applyTraineeChrome();
      $('brief_go').onclick = () => { $('brief').style.display = 'none'; api.start(); };
    },
    toggleInstructor() { instrOpen = !instrOpen; $('instr').style.display = instrOpen ? 'block' : 'none'; },
    setPaused(p) { $('paused').style.display = p ? 'flex' : 'none'; },
    select(c) { $('ladder').innerHTML = ladderHTML(c); },
    pushLog(time, kind, text, pts) {
      const l = $('log');
      const d = el('div', 'e' + (pts<0?' neg':pts>0?' pos':''),
        '<span class="t">' + time + '</span><span class="kind">' + kind + '</span>' + text +
        (pts ? '<b>' + (pts>0?'+':'') + pts + '</b>' : ''));
      l.appendChild(d); l.scrollTop = l.scrollHeight;
      if (++logN > 90) l.removeChild(l.firstChild);
      const f = $('flash'); f.textContent = kind + ' · ' + text.replace(/<[^>]+>/g,'');
      f.className = 'show' + (pts<0?' neg':'');
      clearTimeout(HUD._ft); HUD._ft = setTimeout(()=>f.className='', 3600);
    },
    update(s) {
      $('clock').textContent  = Sim.clk(s.remaining);
      if (!(Sim.isTrainee && Sim.isTrainee())) $('score').textContent = Math.round(s.score);
      $('loose').textContent  = s.loose;
      $('breach').textContent = s.breaches;
      $('met').textContent    = s.met;
      $('opticname').textContent = s.optic.name;
      $('opticnote').textContent = s.optic.note;
      $('brg').textContent = (s.bearing>0?'+':'') + s.bearing.toFixed(0) + '°';
      $('fat').style.width = (s.fatigue*100).toFixed(0) + '%';
      $('bat').style.width = (s.light.battery / DOCTRINE.timing.searchlightBattery*100).toFixed(0) + '%';
      $('s_flare').textContent = s.stores.flares;
      $('s_qrt').textContent   = s.stores.qrtDispatches;
      $('s_warn').textContent  = s.stores.warningShots;
      $('qrtstat').textContent = s.qrt.out ? 'QRT INBOUND — ' + Math.ceil(s.qrt.eta) + 's'
                               : s.qrt.cool > 0 ? 'QRT re-forming ' + Math.ceil(s.qrt.cool) + 's'
                               : 'QRT ready';
      $('qrtstat').className = s.qrt.out ? 'warn' : '';
      document.body.classList.toggle('blind', !!s.blinded);
      for (let i=0;i<4;i++) $('opt'+i).classList.toggle('on', Optics.modeIdx()===i);
      $('ladder').innerHTML = ladderHTML(s.selected);

      const marks = [];
      if (s.selected) marks.push({ b: THREE.MathUtils.radToDeg(Math.atan2(s.selected.x, -s.selected.z)),
                                   l:'C'+s.selected.id, c:'#ffd479' });
      if (s.qrt.out)  marks.push({ b: THREE.MathUtils.radToDeg(Math.atan2(s.qrt.x, 150)), l:'QRT', c:'#7fd4ff' });
      for (const f of World.floodlights) if (f.dead)
        marks.push({ b: THREE.MathUtils.radToDeg(Math.atan2(f.x, 150)), l:'U/S', c:'#ff6b6b' });
      for (const r of World.rangers)
        marks.push({ b: THREE.MathUtils.radToDeg(Math.atan2(r.x, -r.z)), l:'PAK', c:'#9a8cff' });
      marks.push({ b: THREE.MathUtils.radToDeg(Math.atan2(DOCTRINE.world.culvertX, 150)),
                   l:'NALLAH', c:'#ffa04d' });
      drawTape(s.bearing, s.optic.fov / Optics.zoom(), marks);
    },
    showAAR,
    exportAAR() {
      const a = HUD._aar; if (!a) return;
      let x = 'MORCHA :: NIGHT VIGIL — AFTER ACTION REVIEW\n';
      x += '='.repeat(64) + '\nVERDICT: ' + a.verdict + '   SCORE: ' + a.score +
           ' (pass ' + a.passMark + ')\n' + a.reason + '\n\n';
      x += 'Breaches: '+a.breaches+'   Apprehended: '+a.apprehended+
           '   Still loose: '+a.loose+'   CoI: '+(a.coi?'YES':'NO')+'\n\n';
      x += 'MISSED CUES\n' + '-'.repeat(64) + '\n';
      for (const m of a.missedCues)
        x += '#'+m.id+' '+m.type+'  readable '+Sim.clk(m.readableAt||0)+
             '  its brg '+m.contactBearing+'  your arc '+(m.yourBearing??'-')+
             ' ('+m.yourOptic+')  through '+Sim.clk(m.throughAt)+'\n';
      x += '\nCONTACT LEDGER\n' + '-'.repeat(64) + '\n';
      for (const c of a.contacts)
        x += '#'+c.id+' '+c.type+(c.decoy?' (decoy)':'')+' via '+c.route+
             '  seen:'+(c.designated?Sim.clk(c.designatedT):'NO')+
             '  rep:'+(c.reported?'Y':'N')+'  chal:'+(c.challenged?'Y':'N')+
             '  => '+c.verdict+'\n';
      x += '\nSHIFT LOG\n' + '-'.repeat(64) + '\n';
      for (const e of a.events)
        x += Sim.clk(e.t)+'  ['+e.kind+'] '+e.text.replace(/<[^>]+>/g,'')+
             (e.pts?('  ('+(e.pts>0?'+':'')+e.pts+')'):'')+'\n';
      if (a.notes) x += '\nINSTRUCTOR REMARKS\n'+'-'.repeat(64)+'\n'+a.notes+'\n';
      const b = new Blob([x], { type:'text/plain' });
      const u = URL.createObjectURL(b), l = document.createElement('a');
      l.href = u; l.download = 'morcha_aar.txt'; l.click(); URL.revokeObjectURL(u);
    }
  };
})();
