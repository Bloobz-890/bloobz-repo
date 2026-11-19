/* MovieBox plugin for BlooBZ (movies and series). Logic ported from the CloudStream "MovieBox" provider by phisher98 (GPL-3.0).
   Needs the BlooBZ app's native networking (it signs every request with custom headers). */
/*CRY-START*/
/* BlooBZ shared crypto helpers (small, no dependencies): MD5, HMAC-MD5, AES-128-CBC, UTF-8 and Base64 for byte arrays. */
const CRY = (() => {
  const utf8 = s => { const o = []; s = String(s); for (let i = 0; i < s.length; i++) { let c = s.charCodeAt(i); if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } } if (c < 0x80) { o.push(c); } else if (c < 0x800) { o.push(0xc0 | c >> 6, 0x80 | c & 63); } else if (c < 0x10000) { o.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63); } else { o.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63); } } return o; };
  const fromUtf8 = b => { let s = ''; for (let i = 0; i < b.length;) { const c = b[i++]; if (c < 0x80) { s += String.fromCharCode(c); } else if (c < 0xe0) { s += String.fromCharCode((c & 31) << 6 | b[i++] & 63); } else if (c < 0xf0) { s += String.fromCharCode((c & 15) << 12 | (b[i++] & 63) << 6 | b[i++] & 63); } else { const u = ((c & 7) << 18 | (b[i++] & 63) << 12 | (b[i++] & 63) << 6 | b[i++] & 63) - 0x10000; s += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023)); } } return s; };
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b64e = b => { let s = ''; for (let i = 0; i < b.length; i += 3) { const n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0); s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < b.length ? B64[n >> 6 & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '='); } return s; };
  const b64d = t => { t = String(t).replace(/[^A-Za-z0-9+/\-_]/g, '').replace(/-/g, '+').replace(/_/g, '/'); const o = []; for (let i = 0; i < t.length; i += 4) { const a = B64.indexOf(t[i]), b = B64.indexOf(t[i + 1]), c = i + 2 < t.length ? B64.indexOf(t[i + 2]) : -1, d = i + 3 < t.length ? B64.indexOf(t[i + 3]) : -1; o.push(a << 2 | b >> 4); if (c >= 0) { o.push((b & 15) << 4 | c >> 2); } if (d >= 0) { o.push((c & 3) << 6 | d); } } return o; };
  const hex = b => b.map(x => (x < 16 ? '0' : '') + x.toString(16)).join('');
  /* MD5 */
  const K = [], R = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) { K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0; }
  const md5 = bytes => {
    const m = bytes.slice(), n = m.length; m.push(0x80); while (m.length % 64 !== 56) { m.push(0); }
    const bits = n * 8; for (let i = 0; i < 8; i++) { m.push(i < 4 ? bits >>> (8 * i) & 255 : Math.floor(n / 536870912) >>> (8 * (i - 4)) & 255); }
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < m.length; o += 64) {
      const w = []; for (let i = 0; i < 16; i++) { w[i] = m[o + i * 4] | m[o + i * 4 + 1] << 8 | m[o + i * 4 + 2] << 16 | m[o + i * 4 + 3] << 24; }
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = b & c | ~b & d; g = i; } else if (i < 32) { f = d & b | ~d & c; g = (5 * i + 1) % 16; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = 7 * i % 16; }
        const t = d; d = c; c = b; const x = (a + f + K[i] + w[g]) | 0; b = (b + (x << R[i] | x >>> 32 - R[i])) | 0; a = t;
      }
      a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }
    const out = []; [a0, b0, c0, d0].forEach(v => { for (let i = 0; i < 4; i++) { out.push(v >>> (8 * i) & 255); } }); return out;
  };
  const hmacMd5 = (key, msg) => {
    if (key.length > 64) { key = md5(key); } key = key.concat(new Array(64 - key.length).fill(0));
    return md5(key.map(x => x ^ 0x5c).concat(md5(key.map(x => x ^ 0x36).concat(msg))));
  };
  /* AES-128 */
  const SB = [], IS = []; (() => { let p = 1, q = 1; do { p = p ^ (p << 1 & 255) ^ (p & 128 ? 27 : 0); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 128) { q ^= 9; } const x = q ^ (q << 1 | q >> 7) & 255 ^ (q << 2 | q >> 6) & 255 ^ (q << 3 | q >> 5) & 255 ^ (q << 4 | q >> 4) & 255; SB[p] = (x ^ 99) & 255; IS[(x ^ 99) & 255] = p; } while (p !== 1); SB[0] = 99; IS[99] = 0; })();
  const xt = x => (x << 1 ^ (x & 128 ? 27 : 0)) & 255;
  const mul = (a, b) => { let r = 0; while (b) { if (b & 1) { r ^= a; } a = xt(a); b >>= 1; } return r; };
  const expand = key => { const w = []; for (let i = 0; i < 16; i++) { w[i] = key[i]; } let rc = 1; for (let i = 16; i < 176; i += 4) { let t = w.slice(i - 4, i); if (i % 16 === 0) { t = [SB[t[1]] ^ rc, SB[t[2]], SB[t[3]], SB[t[0]]]; rc = xt(rc); } for (let j = 0; j < 4; j++) { w[i + j] = w[i - 16 + j] ^ t[j]; } } return w; };
  const encBlock = (s, w) => {
    s = s.map((x, i) => x ^ w[i]);
    for (let r = 1; r <= 10; r++) {
      s = s.map(x => SB[x]);
      const t = s.slice(); for (let c = 0; c < 4; c++) { for (let rw = 0; rw < 4; rw++) { s[c * 4 + rw] = t[((c + rw) % 4) * 4 + rw]; } }
      if (r < 10) { for (let c = 0; c < 4; c++) { const a = s.slice(c * 4, c * 4 + 4); s[c * 4] = xt(a[0]) ^ (xt(a[1]) ^ a[1]) ^ a[2] ^ a[3]; s[c * 4 + 1] = a[0] ^ xt(a[1]) ^ (xt(a[2]) ^ a[2]) ^ a[3]; s[c * 4 + 2] = a[0] ^ a[1] ^ xt(a[2]) ^ (xt(a[3]) ^ a[3]); s[c * 4 + 3] = (xt(a[0]) ^ a[0]) ^ a[1] ^ a[2] ^ xt(a[3]); } }
      s = s.map((x, i) => x ^ w[r * 16 + i]);
    }
    return s;
  };
  const decBlock = (s, w) => {
    s = s.map((x, i) => x ^ w[160 + i]);
    for (let r = 9; r >= 0; r--) {
      const t = s.slice(); for (let c = 0; c < 4; c++) { for (let rw = 0; rw < 4; rw++) { s[((c + rw) % 4) * 4 + rw] = t[c * 4 + rw]; } }
      s = s.map(x => IS[x]); s = s.map((x, i) => x ^ w[r * 16 + i]);
      if (r > 0) { for (let c = 0; c < 4; c++) { const a = s.slice(c * 4, c * 4 + 4); s[c * 4] = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9); s[c * 4 + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13); s[c * 4 + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11); s[c * 4 + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14); } }
    }
    return s;
  };
  /* data must already be a multiple of 16 bytes for aesCbcEnc (no padding added) */
  const aesCbcEnc = (data, key, iv) => { const w = expand(key), out = []; let prev = iv; for (let i = 0; i < data.length; i += 16) { prev = encBlock(data.slice(i, i + 16).map((x, j) => x ^ prev[j]), w); out.push(...prev); } return out; };
  const aesCbcDec = (data, key, iv, unpad) => { const w = expand(key), out = []; let prev = iv; for (let i = 0; i < data.length; i += 16) { const c = data.slice(i, i + 16); out.push(...decBlock(c.slice(), w).map((x, j) => x ^ prev[j])); prev = c; } if (unpad) { const n = out[out.length - 1]; if (n < 1 || n > 16) { throw new Error('bad padding'); } out.length -= n; } return out; };
  return { utf8, fromUtf8, b64e, b64d, hex, md5, hmacMd5, aesCbcEnc, aesCbcDec };
})();
/*CRY-END*/
BZ.register({
  id: 'moviebox',
  name: 'MovieBox',
  version: 12,
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
      { key: 'lang', title: 'Preferred language (listed first)', type: 'choice', options: [{ v: '', label: 'Best quality first' }, { v: 'hindi', label: 'Hindi' }, { v: 'english', label: 'English' }, { v: 'original', label: 'Original (native audio)' }] },
      { key: 'sections', title: 'Home sections (show, hide, reorder)', type: 'sections', items: this.ROWS.map(r => r[0]) }
    ];
  },
  /* readable server names: "ptbr dub" -> "Portuguese (BR) dub", the title's own audio -> "Original (native)" */
  lname(l) {
    const M = { ptbr: 'Portuguese (BR)', pt: 'Portuguese', hi: 'Hindi', en: 'English', ta: 'Tamil', te: 'Telugu', ar: 'Arabic', es: 'Spanish', fr: 'French', id: 'Indonesian', ru: 'Russian', tr: 'Turkish', th: 'Thai', vi: 'Vietnamese', bn: 'Bengali', ml: 'Malayalam', kn: 'Kannada', ur: 'Urdu' };
    const k = String(l || '').trim(), m = M[k.toLowerCase()];
    return k === 'Original' ? 'Original (native)' : (m || k) + ' dub';
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
  SECRET_ALT: 'WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==',
  /* the signing recipe is read from a decompiled app, so several close variants are tried at login and the one the server accepts is remembered */
  VARS: (() => { const v = []; [0, 1, 2, 3].forEach(k => ['application/json', '', 'application/json; charset=utf-8'].forEach(ct => v.push({ k, ct }))); return v; })(),
  vi: 0,
  keyOf(k) {
    this._kc = this._kc || {};
    if (!this._kc[k]) {
      const first = CRY.fromUtf8(CRY.b64d(k < 2 ? this.SECRET : this.SECRET_ALT));
      this._kc[k] = (k % 2 === 0) ? CRY.b64d(first) : CRY.utf8(first);
    }
    return this._kc[k];
  },
  key() { return this.keyOf((this.VARS[this.vi] || this.VARS[0]).k); },
  sign(method, accept, ctype, url, body, ts) {
    const mac = CRY.hmacMd5(this.key(), CRY.utf8(this.canonical(method, accept, ctype, url, body, ts)));
    return ts + '|2|' + CRY.b64e(mac);
  },
  headers(method, url, ctype, body, withToken) {
    const ts = Date.now(), accept = 'application/json', V = this.VARS[this.vi] || this.VARS[0];
    if (String(method).toUpperCase() === 'GET') { ctype = V.ct; } else { ctype = ctype || 'application/json'; }
    const h = {
      'user-agent': this.UA, accept, connection: 'keep-alive',
      'x-client-token': ts + ',' + CRY.hex(CRY.md5(CRY.utf8(String(ts).split('').reverse().join('')))),
      'x-tr-signature': this.sign(method, accept, ctype, url, body, ts),
      'x-client-info': this.info(), 'x-client-status': '0', 'x-client-build': this.BUILDS[this.build] || this.BUILDS[0]
    };
    if (ctype) { h['content-type'] = ctype; }
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
  /* find the signing variant the server accepts: try each on the cheap ranking call (its answer carries the visitor token) */
  async probe() {
    const path = '/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1';
    const start = this.vi;
    for (let n = 0; n < this.VARS.length; n++) {
      this.vi = (start + n) % this.VARS.length;
      const r = await this.raw('GET', path, null, 'application/json', false);
      let tok = ''; if (r.headers && r.headers['x-user']) { try { tok = JSON.parse(r.headers['x-user']).token || ''; } catch (e) {} }
      const sigBad = /signature/i.test(String(r.body || ''));
      if (r.status === 200 || tok) {
        BZ.log('MovieBox signing variant ' + this.vi + ' accepted (key ' + this.VARS[this.vi].k + ', content-type "' + this.VARS[this.vi].ct + '")');
        try { localStorage.setItem('mb_var', String(this.vi)); } catch (e) {}
        if (tok) { this.token = tok; try { localStorage.setItem('mb_tok', JSON.stringify({ v: tok, t: Date.now() })); } catch (e) {} }
        return true;
      }
      if (!sigBad) { BZ.log('MovieBox probe stopped: the answer is not a signature error (' + r.status + ')'); break; }
    }
    this.vi = start;
    return false;
  },
  login() { return this._lp || (this._lp = this.loginRun().finally(() => { this._lp = null; })); },
  async loginRun() {
    try { const t = JSON.parse(localStorage.getItem('mb_tok') || 'null'); if (t && t.v && Date.now() - t.t < 4 * 3600000) { this.token = t.v; return; } } catch (e) {}
    try { const b = Number(localStorage.getItem('mb_build')); if (b >= 0 && b < this.BUILDS.length) { this.build = b; } } catch (e) {}
    try { const sv = Number(localStorage.getItem('mb_var')); if (sv >= 0 && sv < this.VARS.length) { this.vi = sv; } } catch (e) {}
    if (!this._probed) { this._probed = true; await this.probe(); if (this.token) { return; } }
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
  /* the server answers an "update your app" promo clip (and one-episode lists) to a client build it dislikes: switch build */
  rotate(why) {
    this.build = (this.build + 1) % this.BUILDS.length;
    try { localStorage.setItem('mb_build', String(this.build)); } catch (e) {}
    BZ.log('MovieBox: ' + why + ' -> switching to client build ' + (this.build + 1) + '/' + this.BUILDS.length);
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
      let seasons = [];
      for (let a = 0; a < this.BUILDS.length; a++) {
        try { seasons = (await this.call('GET', '/wefeed-mobile-bff/subject-api/season-info?subjectId=' + encodeURIComponent(id))).seasons || []; } catch (e) { BZ.log('MovieBox seasons: ' + e.message); }
        if (seasons.reduce((n, x) => n + (x.maxEp || 0), 0) > 1 || a === this.BUILDS.length - 1) { break; }
        this.rotate('season list has no episodes');
      }
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

  /* ask the CDN for 2 bytes with each header set until it answers 200/206, and keep the set that works (the player gets error 2004 when the CDN says 403/404) */
  async fit(st) {
    const host = this.curHost(), ck = st.cookie || '';
    /* non-empty Referer/Origin first: the app sends them as headers even when empty, and an empty header may be what the CDN refuses */
    const sets = [{ referer: host + '/', origin: host }, { referer: host + '/', origin: '' }, { referer: '', origin: '' }, { referer: 'https://moviebox.ph/', origin: 'https://moviebox.ph' }];
    let seen = '';
    for (const v of sets) {
      const h = { 'user-agent': this.UA, range: 'bytes=0-1', accept: '*/*' };
      if (ck) { h.cookie = ck; } if (v.referer) { h.referer = v.referer; } if (v.origin) { h.origin = v.origin; }
      const to = new Promise(res => setTimeout(() => res({ status: 0 }), 8000));
      let r; try { r = await Promise.race([BZ.nat(st.url, { method: 'GET', headers: h, ua: this.UA }), to]); } catch (e) { r = { status: 0 }; }
      seen += (seen ? ',' : '') + r.status;
      if (r.status === 200 || r.status === 206) { st.headers = { ua: this.UA, referer: v.referer, origin: v.origin }; st.ok = true; break; }
    }
    if (!this._diag) {
      this._diag = 1; /* log only: which header sets the CDN refuses (the player and the Test button send different ones) */
      const CH = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', G = 'https://www.google.com/';
      const T = [['cronet+identity', { 'user-agent': this.UA, 'accept-encoding': 'identity' }], ['chrome+google-referer', { 'user-agent': CH, referer: G, origin: 'https://www.google.com' }], ['chrome only', { 'user-agent': CH }], ['no ua', {}]];
      let o = '';
      for (const [n, h0] of T) {
        const h = Object.assign({ range: 'bytes=0-65535', accept: '*/*' }, h0); if (ck) { h.cookie = ck; }
        const to = new Promise(res => setTimeout(() => res({ status: 0 }), 8000));
        let r; try { r = await Promise.race([BZ.nat(st.url, { method: 'GET', headers: h, ua: h['user-agent'] || '' }), to]); } catch (e) { r = { status: 0 }; }
        o += (o ? ', ' : '') + n + '=' + r.status;
      }
      BZ.log('MovieBox CDN header test: ' + o + ' | url ' + st.url.slice(-60));
    }
    BZ.log('MovieBox link check ' + st.name + ' (cookie ' + (ck ? 'yes' : 'no') + '): ' + seen + (st.ok ? ' OK' : ' FAILED') + ' ' + st.url.replace(/^https?:\/\//, '').slice(0, 40));
  },

  async streams(key) {
    const [id, se, ep, dubs] = String(key).split('|');
    const targets = [{ sid: id, lang: 'Original' }].concat(String(dubs || '').split(',').filter(Boolean).map(x => { const i = x.indexOf(':'); return { sid: x.slice(0, i), lang: x.slice(i + 1) }; }));
    let out = [], promo = 0;
    for (let at = 0; at < this.BUILDS.length && !out.length; at++) {
      promo = 0;
      await Promise.all(targets.map(async t => {
        let list = [];
        for (const pth of ['play-info/v2', 'play-info']) {
          try {
            const d = await this.call('GET', '/wefeed-mobile-bff/subject-api/' + pth + '?subjectId=' + encodeURIComponent(t.sid) + '&se=' + (se || 0) + '&ep=' + (ep || 0));
            list = d.streams || [];
            if (list.length) { break; }
          } catch (e) { BZ.log('MovieBox ' + pth + ' (' + t.lang + '): ' + e.message); }
        }
        await Promise.all(list.map(async s => {
          const dsh = /\.mpd(\?|$)/i.test(s.url || '') || /^dash$/i.test(s.format || '');
          if (!s.url || !/^https?:/i.test(s.url) || (dsh && !window.BZ_DASH)) { return; } /* DASH needs app v41+ */
          const dur = Number(s.duration) || 0;
          if (dur > 0 && dur < 300) { promo++; return; } /* the 20-second "update the app" clip */
          const hls = /^hls$/i.test(s.format || '') || /\.m3u8/i.test(s.url);
          const q = String(s.resolutions || '').split(/[,\s]+/).map(x => parseInt(x, 10)).filter(Boolean).sort((a, b) => b - a)[0] || 0;
          const subs = s.id ? await this.captions(t.sid, s.id) : [];
          out.push({ name: this.lname(t.lang) + (q ? ' ' + q + 'p' : ''), url: s.url, type: dsh ? 'dash' : (hls ? 'hls' : 'mp4'), quality: q ? q + 'p' : '', h: q, cookie: s.signCookie || '', headers: { ua: this.UA }, subs });
        }));
      }));
      if (!out.length && at < this.BUILDS.length - 1) { this.rotate(promo ? 'only the update promo came back (' + promo + ' clips)' : 'no streams'); }
    }
    await Promise.all(out.map(x => this.fit(x)));
    const pl = String(BZ.pref('moviebox', 'lang', '') || '').toLowerCase(), pm = x => pl && (pl === 'original' ? /^original/i : new RegExp('^' + pl, 'i')).test(x.name) ? 1 : 0;
    out.sort((a, b) => ((b.ok ? 1 : 0) - (a.ok ? 1 : 0)) || (pm(b) - pm(a)) || ((b.h || 0) - (a.h || 0)));
    if (!out.length) { throw new Error(promo ? 'MovieBox only returned its "update the app" clip for this title on every client build' : 'MovieBox has no playable stream for this title'); }
    return out;
  }
});
