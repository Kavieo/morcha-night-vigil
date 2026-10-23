/* MORCHA :: LINK — the bus between the trainee screen and the instructor console.

   Every trainee screen shows a 4-digit SESSION CODE. The instructor opens the
   console, types that code, and the console joins exactly that session.

   Two ways the code connects, tried in this order:
   1. Same computer (laptop screen + projector): BroadcastChannel between two
      windows. Offline, no server.
   2. Different computer: WebRTC peer-to-peer (PeerJS). The code finds the
      trainee screen over the internet, then the picture and the controls go
      direct between the two machines.

   The trainee's window is deliberately DEAF to everything except one key. Every
   other control lives on the console, because in this exercise the trainee does
   not drive the machine: he watches, he calls, he points. */

const Link = (function () {

  const PREFIX = 'morcha-nv-';
  let role = null, code = null, ch = null, peer = null;
  const conns = new Set();          // sim: every console joined to this session
  let conn = null;                  // console: our line to the trainee screen
  let mode = 'none';                // 'local' | 'network' | 'connecting' | 'none'
  let localHeard = false;
  const handlers = {}, codeFns = [];
  let vstream = null;               // sim: live video of the trainee's picture
  let rtt = null, pingT = null;      // console: measured round trip, ms
  const forceNet = /[?&]net=1\b/.test(location.search);   // test switch: skip same-computer link

  function dispatch(m) {
    if (!m || m.to !== role) return;           // ignore our own echoes
    if (role === 'console' && m.code && m.code !== code) return;
    const h = handlers[m.kind];
    if (h) h(m.data);
  }

  function newCode() { return String(1000 + Math.floor(Math.random() * 9000)); }
  function urlCode() {
    const c = new URLSearchParams(location.search).get('code');
    return c && /^\d{4}$/.test(c) ? c : null;
  }
  function setCode(c) { code = c; codeFns.forEach(f => { try { f(c); } catch (e) {} }); }

  /* ---- 1. same computer ---------------------------------------------------- */
  function openLocal() {
    try {
      if (ch) ch.close();
      ch = new BroadcastChannel('morcha-link-' + code);
      ch.onmessage = e => {
        if (role === 'console' && forceNet) return;
        if (role === 'console' && !localHeard) { localHeard = true; mode = 'local'; dropNetwork(); }
        if (role === 'console' && conn) return;  // network already carrying it
        dispatch(e.data);
      };
    } catch (err) { console.warn('[link] BroadcastChannel unavailable:', err && err.message); }
  }

  /* ---- 2. different computer ----------------------------------------------- */
  function hasPeer() { return typeof window.Peer === 'function'; }

  function hostNetwork() {                       // trainee screen
    if (!hasPeer()) return;
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = new window.Peer(PREFIX + code, { debug: 0 });
    peer.on('connection', c => {
      c.on('open', () => { conns.add(c); callConsole(c); });
      c.on('data', m => {
        if (m && m.kind === 'videoOk') { c.videoOn = true; return; }
        if (m && m.kind === 'ping') { try { c.send({ to: 'console', kind: 'pong', data: m.data, code }); } catch (e) {} return; }
        dispatch(m);
      });
      c.on('close', () => conns.delete(c));
      c.on('error', () => conns.delete(c));
    });
    peer.on('error', err => {
      if (err && err.type === 'unavailable-id') {  // someone else has this code
        setCode(newCode()); openLocal(); hostNetwork();
      }
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  }

  /* The picture goes as real-time VIDEO, not as pictures down the data line:
     a video call is built for low delay, and it leaves the data line free for
     the reports and numbers, which are tiny. */
  function callConsole(c) {
    if (!vstream || !peer || c.videoCall) return;
    try {
      const call = peer.call(c.peer, vstream);
      c.videoCall = call;
      const tune = () => { try {
        const pc = call.peerConnection; if (!pc) return;
        pc.getSenders().forEach(sd => { if (!sd.track || sd.track.kind !== 'video') return;
          const p = sd.getParameters(); p.degradationPreference = 'maintain-framerate';
          if (!p.encodings || !p.encodings.length) p.encodings = [{}];
          p.encodings[0].maxBitrate = 2500000; p.encodings[0].maxFramerate = 30;
          sd.setParameters(p).catch(() => {}); });
      } catch (e) {} };
      setTimeout(tune, 1500); setTimeout(tune, 4000);
    } catch (e) {}
  }

  let retry = null;
  function joinNetwork() {                       // console
    if (!hasPeer() || localHeard || conn) return;
    mode = 'connecting';
    const go = () => {
      if (localHeard || conn) return;
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'binary' });
      c.on('open', () => {
        if (localHeard) { c.close(); return; }
        conn = c; mode = 'network';
        send('sim', 'hello', { role });
        clearInterval(pingT);
        pingT = setInterval(() => { if (conn && conn.open) try { conn.send({ to: 'sim', kind: 'ping', data: performance.now(), code }); } catch (e) {} }, 1000);
      });
      c.on('data', m => {
        if (m && m.kind === 'pong') { const r = performance.now() - m.data; rtt = rtt === null ? r : rtt * 0.7 + r * 0.3; return; }
        dispatch(m);
      });
      c.on('close', () => { if (conn === c) { conn = null; mode = 'connecting'; } });
    };
    if (!peer) {
      peer = new window.Peer({ debug: 0 });
      peer.on('open', go);
      peer.on('error', () => {});
      peer.on('call', call => {
        call.answer();
        call.on('stream', st => {
          try { call.peerConnection.getReceivers().forEach(r => {
            try { r.playoutDelayHint = 0; } catch (e) {}
            try { r.jitterBufferTarget = 0; } catch (e) {} }); } catch (e) {}
          if (handlers.video) handlers.video(st);
          if (conn && conn.open) try { conn.send({ to: 'sim', kind: 'videoOk', code }); } catch (e) {}
        });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    } else if (peer.open) go();
    clearInterval(retry);
    retry = setInterval(() => {
      if (localHeard) { clearInterval(retry); return; }
      if (!conn && peer && peer.open) go();
    }, 4000);
  }
  function dropNetwork() {
    clearInterval(retry);
    try { if (conn) conn.close(); } catch (e) {}
    conn = null;
  }

  function send(to, kind, data) {
    const m = { to, kind, data, code };
    if (ch) { try { ch.postMessage(m); } catch (e) { /* payload too large */ } }
    if (role === 'sim') {
      for (const c of conns) {
        if (!c.open) continue;
        /* A slow line must never back up: drop a picture rather than queue it. */
        const dc = c.dataChannel;
        let mm = m;
        if (kind === 'mirror') {
          if (c.videoOn) mm = { to, kind, code, data: { t: data.t, marks: data.marks } };   // video carries the picture
          else if (dc && dc.bufferedAmount > 120000) continue;
        }
        // never let the small, urgent messages wait behind a queue
        if (kind === 'state' && dc && dc.bufferedAmount > 60000) continue;
        try { c.send(mm); } catch (e) {}
      }
    } else if (conn && conn.open) {
      try { conn.send(m); } catch (e) {}
    }
  }

  /* role 'sim': takes ?code= or makes a new one, and starts hosting.
     role 'console': joins when given a code (now, or later through join()). */
  function open(asRole, c) {
    if (role === asRole && code) return true;
    role = asRole;
    if (role === 'sim') {
      setCode(c || urlCode() || newCode());
      openLocal(); hostNetwork();
    } else {
      const k = c || urlCode();
      if (k) join(k);
    }
    return true;
  }

  function join(c) {
    dropNetwork(); localHeard = false; mode = 'connecting';
    setCode(c);
    openLocal();
    send('sim', 'hello', { role });
    /* Give the same-computer channel a moment; if nobody answers, go network. */
    setTimeout(() => { if (!localHeard) joinNetwork(); }, 1200);
  }

  return {
    open, join,
    code()   { return code; },
    mode()   { return mode; },
    onCode(fn) { codeFns.push(fn); if (code) fn(code); },
    on(kind, fn) { handlers[kind] = fn; },
    /* sim -> console */
    state(d)  { send('console', 'state', d); },
    claim(d)  { send('console', 'claim', d); },
    mirror(d) { send('console', 'mirror', d); },
    event(d)  { send('console', 'event', d); },
    ended(d)  { send('console', 'ended', d); },
    /* console -> sim */
    cmd(name, args) { send('sim', 'cmd', { name, args }); },
    hello()   { if (code) send(role === 'console' ? 'sim' : 'console', 'hello', { role }); },
    isOpen()  { return !!ch || !!conn || conns.size > 0; },
    setVideo(st) { vstream = st; for (const c of conns) callConsole(c); },
    wantsVideo() { return conns.size > 0; },
    latency()    { return rtt === null ? null : Math.round(rtt / 2); },
    debug()   { return { role, code, mode, peer: !!(peer && peer.open), conns: conns.size,
                         conn: !!(conn && conn.open), localHeard }; }
  };
})();
