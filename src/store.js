/* MORCHA :: STORE — one login for every screen, and the shared, encrypted
   training database.

   - The roster ships ENCRYPTED (data/roster.enc.json). The key is derived from
     the username and password (PBKDF2-SHA256, 600k rounds) in the browser.
   - Signing in once on the main page carries over to the trainee screen, the
     instructor console and the records page opened from it (sessionStorage —
     it ends when the window is closed).
   - The database (scores, people added by hand, simulator sessions) lives in
     the repo's "records" branch as one AES-GCM encrypted file, written through
     the GitHub API with a repo-scoped token that is itself stored encrypted.
     Every key is merged separately, so two computers saving at once do not
     overwrite each other.                                                   */

const Store = (function () {
  const REPO = 'Kavieo/morcha-night-vigil', BR = 'records';
  const MF = 'data/marks.enc.json', TF = 'data/token.enc.json';
  const CRED = 'morcha.cred', LOCAL = 'morcha.marks.v1';
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const tob64 = u => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };

  let key = null, user = null, token = null, roster = [], data = {}, sha = null;
  const dirty = new Set();
  let syncing = false, saveT = null, pullT = null, status = { text: '', cls: '' };
  const subs = [];
  const emit = () => subs.forEach(f => { try { f(); } catch (e) {} });
  const setStatus = (text, cls) => { status = { text, cls: cls || '' }; emit(); };

  async function deriveKey(u, p, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(u.toLowerCase() + ':' + p), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function enc(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
    return { iv: tob64(iv), ct: tob64(ct) };
  }
  async function dec(o) {
    return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(o.iv) }, key, b64(o.ct))));
  }

  /* ---- GitHub ---- */
  const gh = (path, opt) => fetch('https://api.github.com/repos/' + REPO + '/' + path, Object.assign({ cache: 'no-store' }, opt || {}, {
    headers: Object.assign({ 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token }, (opt && opt.headers) || {}) }));
  const ub64 = str => btoa(unescape(encodeURIComponent(str)));
  const db64 = str => decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));

  async function loadToken() {
    try {
      const r = await fetch('https://raw.githubusercontent.com/' + REPO + '/' + BR + '/' + TF + '?t=' + Date.now(), { cache: 'no-store' });
      return r.ok ? (await dec(await r.json())).t : null;
    } catch (e) { return null; }
  }
  async function fetchRemote() {
    const r = await gh('contents/' + MF + '?ref=' + BR);
    if (r.status === 404) { sha = null; return {}; }
    if (!r.ok) throw new Error('read ' + r.status);
    const j = await r.json(); sha = j.sha;
    return await dec(JSON.parse(db64(j.content)));
  }
  async function push() {
    if (!token || syncing || !dirty.size) return;
    syncing = true; setStatus('Saving online…');
    /* Take this batch of edits out of the queue. Anything typed while it is
       being sent goes into a fresh queue and is sent next — it used to be
       wiped when this save finished, which is why some marks did not stick. */
    const batch = [...dirty]; dirty.clear();
    let saved = false;
    try {
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        const remote = await fetchRemote();
        const merged = Object.assign({}, remote);
        for (const k of batch) { if (data[k] === undefined) delete merged[k]; else merged[k] = data[k]; }
        const body = { message: 'Training records update', branch: BR, content: ub64(JSON.stringify(await enc(merged))) };
        if (sha) body.sha = sha;
        const r = await gh('contents/' + MF, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
        if (r.ok) {
          sha = (await r.json()).content.sha;
          for (const k of dirty) { if (data[k] === undefined) delete merged[k]; else merged[k] = data[k]; }   // newer, unsent edits win
          data = merged; saved = true; await saveLocal();
          setStatus('Saved online · all computers · ' + new Date().toLocaleTimeString(), 'ok'); emit();
        } else if (r.status !== 409 && r.status !== 422) throw new Error('write ' + r.status);
      }
      if (!saved) throw new Error('conflict');
    } catch (e) {
      for (const k of batch) dirty.add(k);
      setStatus('Online save failed — kept on this computer, retrying…', 'warn');
    }
    finally { syncing = false; if (dirty.size) setTimeout(push, saved ? 300 : 4000); }
  }
  async function pull() {
    if (!token || syncing || dirty.size) return false;
    try { const prev = sha, m = await fetchRemote();
          if (sha !== prev) { data = m; await saveLocal(); emit(); return true; } } catch (e) {}
    return false;
  }

  /* ---- this computer's copy (encrypted) ---- */
  async function saveLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(await enc(data))); } catch (e) {} }
  async function loadLocal() {
    try { const s = JSON.parse(localStorage.getItem(LOCAL) || 'null'); return s ? await dec(s) : {}; } catch (e) { return {}; }
  }

  /* ---- session ---- */
  async function open(u, p) {
    const encR = await (await fetch('data/roster.enc.json?v=' + Date.now(), { cache: 'no-store' })).json();
    const k = await deriveKey(u, p, b64(encR.salt), encR.iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(encR.iv) }, k, b64(encR.ct));  // throws if wrong
    key = k; user = u; roster = JSON.parse(td.decode(pt));
    data = await loadLocal();
    token = await loadToken();
    if (token) {
      try {
        const local = data, rm = await fetchRemote();
        data = Object.assign({}, rm);
        /* Anything that only ever reached THIS computer (a save that never got
           online) is recovered and sent now — nothing typed is lost. Where both
           have it, the newer one wins. */
        for (const k in local) {
          const L = local[k], R = rm[k];
          const newer = R === undefined || (L && typeof L === 'object' && (L.u || 0) > ((R && R.u) || 0));
          if (newer && JSON.stringify(L) !== JSON.stringify(R)) { data[k] = L; dirty.add(k); }
        }
        await saveLocal();
        if (dirty.size) push();
        setStatus('Online · same records on every computer', 'ok');
      }
      catch (e) { setStatus("Can't reach online records — showing this computer's copy", 'warn'); }
    } else setStatus('Online saving not connected — records stay on this computer', 'warn');
    clearInterval(pullT); pullT = setInterval(pull, 20000);
    emit();
  }

  return {
    /* Sign in. Throws on a wrong username or password. */
    async login(u, p, remember) {
      await open(u.trim(), p);
      const c = JSON.stringify({ u: u.trim(), p });
      try { sessionStorage.setItem(CRED, c); if (remember) localStorage.setItem(CRED, c); else localStorage.removeItem(CRED); } catch (e) {}
      return true;
    },
    /* Pick up the sign-in from the main page (same window or one it opened). */
    async resume() {
      if (key) return true;
      let c = null; try { c = JSON.parse(sessionStorage.getItem(CRED) || localStorage.getItem(CRED) || 'null');
                          if (c) sessionStorage.setItem(CRED, JSON.stringify(c)); } catch (e) {}
      if (!c) return false;
      try { await open(c.u, c.p); return true; } catch (e) { sessionStorage.removeItem(CRED); localStorage.removeItem(CRED); return false; }
    },
    hasSession() { try { return !!(sessionStorage.getItem(CRED) || localStorage.getItem(CRED)); } catch (e) { return false; } },
    logout() {
      try { sessionStorage.removeItem(CRED); localStorage.removeItem(CRED); } catch (e) {}
      key = null; user = null; token = null; roster = []; data = {}; sha = null; dirty.clear();
      clearInterval(pullT); emit();
    },
    ready: () => !!key,
    user: () => user,
    online: () => !!token,
    status: () => status,
    roster: () => roster,
    get: k => data[k],
    all: () => data,
    set(k, v) {
      if (v && typeof v === 'object') v.u = Date.now();   // when it was last changed
      if (v === undefined) delete data[k]; else data[k] = v;
      dirty.add(k);
      clearTimeout(saveT);
      saveT = setTimeout(async () => { await saveLocal();
        if (token) push(); else setStatus('Saved on this computer only · ' + new Date().toLocaleTimeString(), 'warn'); emit(); }, 700);
    },
    flush() { clearTimeout(saveT); return saveLocal().then(() => token ? push() : null); },
    /* Save now and wait until it is really online (or report why not). */
    async saveNow() {
      clearTimeout(saveT); await saveLocal();
      if (!token) { setStatus('Saved on this computer (online saving not connected)', 'warn'); return false; }
      for (let i = 0; i < 40 && (syncing || dirty.size); i++) {
        if (!syncing && dirty.size) push();
        await new Promise(r => setTimeout(r, 250));
      }
      if (dirty.size) { setStatus('Could not save online — check the internet and press Save again', 'warn'); return false; }
      setStatus('All saved online · ' + new Date().toLocaleTimeString(), 'ok'); return true;
    },
    pending: () => dirty.size,
    pull,
    on(fn) { subs.push(fn); },
    /* one-time: store a repo token, encrypted with this login */
    async connect(t) {
      token = t;
      const chk = await gh('contents/README.md?ref=' + BR);
      if (!chk.ok) { token = null; throw new Error('Token cannot read the repository (' + chk.status + ')'); }
      let s2 = null; const ex = await gh('contents/' + TF + '?ref=' + BR); if (ex.ok) s2 = (await ex.json()).sha;
      const body = { message: 'Connect training records', branch: BR, content: ub64(JSON.stringify(await enc({ t }))) };
      if (s2) body.sha = s2;
      const w = await gh('contents/' + TF, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      if (!w.ok) { token = null; throw new Error('Token cannot write (' + w.status + ') — give it Contents: Read and write'); }
      for (const k in data) dirty.add(k);
      push();
    },
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  };
})();
