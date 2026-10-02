/* MORCHA :: LINK — the bus between the trainee screen and the instructor console.

   Two browser windows on ONE machine: the instructor's laptop screen carries the
   console, the HDMI/projector output carries the trainee's screen. That is the
   ordinary classroom setup and it needs no network, no server and no second
   computer — BroadcastChannel talks between windows of the same origin, offline.

   The trainee's window is deliberately DEAF to everything except one key. Every
   other control lives on the console, because in this exercise the trainee does
   not drive the machine: he watches, he calls, he points. */

const Link = (function () {

  const NAME = 'morcha-link';
  let ch = null, role = null;
  const handlers = {};

  function open(asRole) {
    role = asRole;
    try {
      ch = new BroadcastChannel(NAME);
      ch.onmessage = e => {
        const m = e.data;
        if (!m || m.to !== role) return;         // ignore our own echoes
        const h = handlers[m.kind];
        if (h) h(m.data);
      };
    } catch (err) {
      console.warn('[link] BroadcastChannel unavailable:', err && err.message);
    }
    return !!ch;
  }

  function send(to, kind, data) {
    if (!ch) return;
    try { ch.postMessage({ to, kind, data }); } catch (e) { /* payload too large */ }
  }

  return {
    open,
    on(kind, fn) { handlers[kind] = fn; },
    /* sim -> console */
    state(d)  { send('console', 'state', d); },
    claim(d)  { send('console', 'claim', d); },
    mirror(d) { send('console', 'mirror', d); },
    event(d)  { send('console', 'event', d); },
    ended(d)  { send('console', 'ended', d); },
    /* console -> sim */
    cmd(name, args) { send('sim', 'cmd', { name, args }); },
    hello()   { send(role === 'console' ? 'sim' : 'console', 'hello', { role }); },
    isOpen()  { return !!ch; }
  };
})();
