/* MovieBox plugin for BlooBZ (movies and series). Logic ported from the CloudStream "MovieBox" provider by phisher98 (GPL-3.0).
   Needs the BlooBZ app's native networking (it signs every request with custom headers). */
/*CRY-START*//*CRY-END*/
BZ.register({
  id: 'moviebox',
  name: 'MovieBox',
  version: 5,
  base: 'https://api3.aoneroom.com',
  test: 'avatar',
  HOSTS: ['https://api3.aoneroom.com', 'https://apig.inmoviebox.com', 'https://apii.inmoviebox.com', 'https://api7.aoneroom.com', 'https://api6.aoneroom.com', 'https://api5.aoneroom.com', 'https://api4.aoneroom.com', 'https://api4sg.aoneroom.com'],
  SECRET: 'NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==',
  BUILDS: ['1790144723381916466.632cf3fe507b339bc757f117f85b4c4a', '1793366173719104383.d7a1fb415ac995ca890664b0f01e4099-1793366048368718383.dbf44f9f0efa9b445e4f194092a71f01'],
  UA: 'com.community.oneroom/50020132 (Linux; U; Android 14; en_IN; Pixel 8; Build/UD1A.230803.041; Cronet/145.0.7582.0)',
  ROWS: [
    ['Trending Movies', 0, '9167640870324258216'], ['In Cinema', 0, '5692654647815587592'], ['Hollywood', 0, '8019599703232971616'],
    ['New Release', 0, '1488104699998914056'], ['Bollywood', 0, '414907768299210008'], ['South Indian', 0, '3859721901924910512'],
    ['Top Series', 5, '719331337777440448'], ['Asian Drama', 5, '1976033493293449744'], ['Western TV', 5, '3910636007619709856'],
    ['Turkish Drama', 5, '5177200225164885656'], ['Indian Drama', 5, '4903182713986896328'], ['Reality TV', 5, '1255898847918934600']
  ],
  hostIdx: 0, build: 0, token: '',
  /* shown in Settings > Repositories > MovieBox > Settings (same idea as the CloudStream plugin's settings) */
  get settings() {
    return [
      { key: 'host', title: 'API host', type: 'choice', options: [{ v: '', label: 'Auto (try every host)' }].concat(this.HOSTS.map(h => ({ v: h, label: h.replace('https://', '') }))) },
      { key: 'sections', title: 'Home sections (show, hide, reorder)', type: 'sections', items: this.ROWS.map(r => r[0]) }
    ];
  },
  fixedHost() { try { const h = BZ.pref('moviebox', 'host', ''); return this.HOSTS.indexOf(h) >= 0 ? h : ''; } catch (e) { return ''; } },
  curHost() { return this.fixedHost() || this.HOSTS[this.hostIdx]; },

  deviceId() { let d = ''; try { d = localStorage.getItem('mb_dev') || ''; } catch (e) {} if (!d) { for (let i = 0; i < 32; i++) { d += Math.floor(Math.random() * 16).toString(16); } try { localStorage.setItem('mb_dev', d); } catch (e) {} } return d; },
  info() { return '{"package_name":"com.community.oneroom","version_name":"4.0.03.0930.03","version_code":50020132,"os":"android","os_version":"14","device_id":"' + this.deviceId() + '","install_store":"official","gaid":"1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d","brand":"Google","model":"Pixel 8","system_language":"en","net":"NETWORK_WIFI","region":"IN","timezone":"Asia/Calcutta","sp_code":""}'; },

  /* "METHOD\naccept\ncontent-type\nbody length\ntime\nbody md5\npath?sorted query" */
  canonical(method, accept, ctype, url, body, ts) {
    const u = new URL(url); let path = u.pathname, q = '';
    try { path = decodeURIComponent(path); } catch (e) {}
    let rawq = u.search.replace(/^\?/, ''); try { rawq = decodeURIComponent(rawq); } catch (e) {}
    if (rawq) {
      q = rawq.split('&').map(p => { const a = p.split('='); return [a[0], a[1] || '']; }).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map(p => p[0] + '=' + p[1]).join('&');
    }
    const bytes = body == null ? null : CRY.utf8(body);
    const md5 = bytes ? CRY.hex(CRY.md5(bytes.length > 102400 ? bytes.slice(0, 102400) : bytes)) : '';
    return [method.toUpperCase(), accept || '', ctype || '', bytes ? String(bytes.length) : '', String(ts), md5, q ? path + '?' + q : path].join('\n');
  },
  /* the app base64-decodes this constant twice: the first result is text that is itself base64 */
  key() { return this._k || (this._k = CRY.b64d(CRY.fromUtf8(CRY.b64d(this.SECRET)))); },
  sign(method, accept, ctype, url, body, ts) {
    const mac = CRY.hmacMd5(this.key(), CRY.utf8(this.canonical(method, accept, ctype, url, body, ts)));
    return ts + '|2|' + CRY.b64e(mac);
  },
  headers(method, url, ctype, body, withToken) {
    const ts = Date.now(), accept = 'application/json';
    ctype = ctype || 'application/json';
    const h = {
      'user-agent': this.UA, accept, 'content-type': ctype, connection: 'keep-alive',
      'x-client-token': ts + ',' + CRY.hex(CRY.md5(CRY.utf8(String(ts).split('').reverse().join('')))),
      'x-tr-signature': this.sign(method, accept, ctype, url, body, ts),
      'x-client-info': this.info(), 'x-client-status': '0', 'x-client-build': this.BUILDS[this.build] || this.BUILDS[0]
    };
    if (withToken && this.token) { h.Authorization = 'Bearer ' + this.token; }
    return h;
  },
  async raw(method, path, body, ctype, withToken) {
    const host = this.curHost(), url = host + path, t0 = Date.now();
    const o = { method, body: body == null ? '' : body, headers: this.headers(method, url, ctype, body, withToken), ua: this.UA };
    const to = new Promise(res => setTimeout(() => res({ status: 0, body: '', headers: {}, timeout: 1 }), 12000));
    let r;
    try { r = await Promise.race([BZ.nat(url, o), to]); } catch (e) { r = { status: 0, body: String(e && e.message || e), headers: {} }; }
    if (!r.status && /HTTP_PROXY_AUTH|\(407\)/.test(String(r.body || ''))) { r.status = 407; }
    BZ.log(method + ' ' + host.replace('https://', '') + '/' + path.split('?')[0].split('/').slice(-2).join('/') + ' -> ' + r.status + (r.timeout ? ' (no answer in 12s)' : '') + ' ' + String(r.body || '').slice(0, 160).replace(/\s+/g, ' ') + (r.status && r.status !== 200 && r.headers ? ' H:' + JSON.stringify(r.headers).slice(0, 220) : '') + ' [' + (Date.now() - t0) + 'ms]');
    return r;
  },
  login() { return this._lp || (this._lp = this.loginRun().finally(() => { this._lp = null; })); },
  async loginRun() {
    try { const t = JSON.parse(localStorage.getItem('mb_tok') || 'null'); if (t && t.v && Date.now() - t.t < 4 * 3600000) { this.token = t.v; return; } } catch (e) {}
    try { const b = Number(localStorage.getItem('mb_build')); if (b >= 0 && b < this.BUILDS.length) { this.build = b; } } catch (e) {}
    let last = 0;
    for (let k = 0, n = this.fixedHost() ? 1 : this.HOSTS.length; k < n && !this.token; k++) {
      for (let b = 0; b < this.BUILDS.length && !this.token; b++) {
        const r = await this.raw('POST', '/wefeed-mobile-bff/user-api/visitor-login', '{}', 'application/json; charset=utf-8', false);
        let tok = '';
        try { tok = JSON.parse(r.body).data.token || ''; } catch (e) {}
        if (!tok && r.headers && r.headers['x-user']) { try { tok = JSON.parse(r.headers['x-user']).token || ''; } catch (e) {} }
        if (!tok) {
          const g = await this.raw('GET', '/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1', null, 'application/json', false);
          if (g.headers && g.headers['x-user']) { try { tok = JSON.parse(g.headers['x-user']).token || ''; } catch (e) {} }
          last = r.status || g.status;
        }
        if (tok) { this.token = tok; try { localStorage.setItem('mb_tok', JSON.stringify({ v: tok, t: Date.now() })); localStorage.setItem('mb_build', String(this.build)); } catch (e) {} break; }
        BZ.log('MovieBox login failed on ' + this.curHost() + ' (' + last + ') with client build ' + (this.build + 1) + '/' + this.BUILDS.length);
        // the server answers 407/403/400/401 when it does not like the client build: try the next one
        if ([407, 403, 400, 401].indexOf(last) >= 0) { this.build = (this.build + 1) % this.BUILDS.length; } else { break; }
      }
      if (!this.token) { this.hostIdx = (this.hostIdx + 1) % this.HOSTS.length; }
    }
    if (!this.token) { throw new Error('MovieBox login was refused (last answer ' + last + '). Try another API host in this plugin\'s Settings.'); }
  },
  /* signed call with login, host and build fallback; returns the "data" part */
  async call(method, path, body, ctype) {
    if (!window.BZNet) { throw new Error('MovieBox needs the BlooBZ native extension'); }
    await this.login();
    let last = '';
    for (let i = 0; i < 3; i++) {
      const r = await this.raw(method, path, body, ctype, true);
      let j = null; try { j = JSON.parse(r.body); } catch (e) {}
      if (r.status === 200 && j && (j.code === 0 || j.data)) { return j.data || {}; }
      last = r.status + ' ' + String(r.body || '').slice(0, 120);
      if (r.status === 401 || (j && /token|login|auth/i.test(String(j.message || j.msg || '')))) { this.token = ''; try { localStorage.removeItem('mb_tok'); } catch (e) {} await this.login(); }
      else if (r.status === 0 || r.status >= 500) { this.hostIdx = (this.hostIdx + 1) % this.HOSTS.length; }
      else if (r.status === 403 || r.status === 400 || r.status === 407) { this.build = (this.build + 1) % this.BUILDS.length; }
    }
    throw new Error('MovieBox request failed: ' + last);
  },

  pic(s) { const c = (s && (s.cover || s.stills || s.image)) || {}; return (typeof c === 'string' ? c : c.url) || ''; },
  card(s) { return { id: String(s.subjectId), title: s.title || '', poster: this.pic(s), badge: s.subjectType === 2 ? 'Series' : (s.imdbRatingValue ? '★ ' + s.imdbRatingValue : '') }; },
  subjects(d) {
    const out = [];
    const take = e => { if (!e) { return; } if (Array.isArray(e)) { e.forEach(take); return; } if (e.subjectId) { out.push(e); } else { take(e.subjects); take(e.subject); take(e.items); } };
    take(d.subjects); take(d.items); take(d.results); take(d.list);
    return out;
  },

  async home() {
    const rows = [];
    await this.login().catch(e => { throw e; });
    const st = BZ.pref('moviebox', 'sections', null) || {}, hidden = st.hidden || [], order = st.order || [];
    const list = this.ROWS.filter(r => hidden.indexOf(r[0]) < 0).sort((a, b) => { const x = order.indexOf(a[0]), y = order.indexOf(b[0]); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    if (!list.length) { throw new Error('All MovieBox home sections are hidden (Settings > MovieBox > Settings)'); }
    await Promise.all(list.map(async ([title, tab, cat], i) => {
      try {
        const d = await this.call('GET', '/wefeed-mobile-bff/tab/ranking-list?tabId=' + tab + '&categoryType=' + cat + '&page=1&perPage=18&restrictKid=false');
        const items = this.subjects(d).map(s => this.card(s)).filter(x => x.id && x.title);
        if (items.length) { rows[i] = { title, items }; }
      } catch (e) { BZ.log('MovieBox row ' + title + ': ' + e.message); }
    }));
    const r = rows.filter(Boolean);
    if (!r.length) { throw new Error('MovieBox home is empty (see the plugin log)'); }
    return { rows: r };
  },

  async search(q, page) {
    const body = JSON.stringify({ page: page || 1, perPage: 20, keyword: q });
    const d = await this.call('POST', '/wefeed-mobile-bff/subject-api/search/v2', body, 'application/json; charset=utf-8');
    return this.subjects(d).map(s => this.card(s)).filter(x => x.id && x.title);
  },

  async details(id) {
    const d = await this.call('GET', '/wefeed-mobile-bff/subject-api/get?subjectId=' + encodeURIComponent(id));
    const dubs = (d.dubs || []).filter(x => x && x.subjectId && x.subjectId !== id).map(x => x.subjectId + ':' + (x.lanName || 'Dub').replace(/[|:,]/g, ' ')).join(',');
    const eps = [];
    if (d.subjectType === 2) {
      let seasons = []; try { seasons = (await this.call('GET', '/wefeed-mobile-bff/subject-api/season-info?subjectId=' + encodeURIComponent(id))).seasons || []; } catch (e) { BZ.log('MovieBox seasons: ' + e.message); }
      if (!seasons.length) { seasons = [{ se: 1, maxEp: 1 }]; }
      seasons.forEach(s => { for (let e = 1; e <= (s.maxEp || 1); e++) { eps.push({ id: id + '|' + s.se + '|' + e + '|' + dubs, number: seasons.length > 1 ? s.se + 'x' + e : String(e), title: seasons.length > 1 ? 'Season ' + s.se + ' · Episode ' + e : 'Episode ' + e }); } });
    } else { eps.push({ id: id + '|0|0|' + dubs, number: '1', title: d.title || 'Movie' }); }
    return {
      title: d.title || '', poster: this.pic(d), description: String(d.description || '').trim(),
      genres: [].concat(String(d.genre || '').split(',').map(x => x.trim()).filter(Boolean), [d.countryName, d.releaseDate ? String(d.releaseDate).slice(0, 4) : ''].filter(Boolean)),
      episodes: eps
    };
  },

  async captions(sid, streamId) {
    const out = [];
    try {
      const d = await this.call('GET', '/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=' + encodeURIComponent(sid) + '&streamId=' + encodeURIComponent(streamId));
      (d.extCaptions || d.captions || []).forEach(c => { const u = c.url || c.captionUrl || ''; if (u) { out.push({ lang: c.lanName || c.language || c.lan || 'Subtitle', url: u }); } });
    } catch (e) {}
    return out;
  },

  async streams(key) {
    const [id, se, ep, dubs] = String(key).split('|');
    const targets = [{ sid: id, lang: 'Original' }].concat(String(dubs || '').split(',').filter(Boolean).map(x => { const i = x.indexOf(':'); return { sid: x.slice(0, i), lang: x.slice(i + 1) }; }));
    const out = [];
    await Promise.all(targets.map(async t => {
      try {
        const d = await this.call('GET', '/wefeed-mobile-bff/subject-api/play-info?subjectId=' + encodeURIComponent(t.sid) + '&se=' + (se || 0) + '&ep=' + (ep || 0));
        const list = d.streams || [];
        await Promise.all(list.map(async s => {
          if (!s.url || !/^https?:/i.test(s.url) || /\.mpd(\?|$)/i.test(s.url) || /^dash$/i.test(s.format || '')) { return; }
          const hls = /^hls$/i.test(s.format || '') || /\.m3u8/i.test(s.url);
          const q = String(s.resolutions || '').split(/[,\s]+/).map(x => parseInt(x, 10)).filter(Boolean).sort((a, b) => b - a)[0] || 0;
          const subs = s.id ? await this.captions(t.sid, s.id) : [];
          out.push({ name: t.lang + (q ? ' ' + q + 'p' : ''), url: s.url, type: hls ? 'hls' : 'mp4', quality: q ? q + 'p' : '', h: q, cookie: s.signCookie || '', headers: { ua: this.UA }, subs });
        }));
      } catch (e) { BZ.log('MovieBox streams (' + t.lang + '): ' + e.message); }
    }));
    out.sort((a, b) => (b.h || 0) - (a.h || 0));
    if (!out.length) { throw new Error('MovieBox has no playable stream for this title'); }
    return out;
  }
});
