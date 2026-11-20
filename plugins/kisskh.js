/* KissKH plugin for BlooBZ (Korean / Chinese / Asian drama). Logic ported from the CloudStream "Kisskh" provider by phisher98 (GPL-3.0). */
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
  const aesCbcDec = (data, key, iv, unpad) => { const w = expand(key), out = []; let prev = iv; for (let i = 0; i < data.length; i += 16) { const c = data.slice(i, i + 16); out.push(...decBlock(c.slice(), w).map((x, j) => x ^ prev[j])); prev = c; } if (unpad) { const n = out[out.length - 1]; if (n < 1 || n > 16) { throw new Error('bad padding'); } for (let k = 1; k <= n; k++) { if (out[out.length - k] !== n) { throw new Error('bad padding'); } } out.length -= n; } return out; };
  return { utf8, fromUtf8, b64e, b64d, hex, md5, hmacMd5, aesCbcEnc, aesCbcDec };
})();
/*CRY-END*/
BZ.register({
  id: 'kisskh',
  name: 'KissKH',
  version: 6,
  base: 'https://kisskh.is',
  test: 'love',
  VIDEO_GUID: '62f176f3bb1b5b8e70e39932ad34a0c7',
  SUB_GUID: 'VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp',
  KEY: [0x4f, 0x6b, 0xda, 0xa3, 0x9e, 0x2f, 0x8c, 0xb0, 0x7f, 0x5e, 0x72, 0x2d, 0x9e, 0xde, 0xf3, 0x14],
  IV: [0x01, 0x50, 0x4a, 0xf3, 0x56, 0xe6, 0x19, 0xcf, 0x2e, 0x42, 0xbb, 0xa6, 0x8c, 0x3f, 0x70, 0xf9],
  ROWS: [
    ['Latest', '&type=0&sub=0&country=0&status=0&order=2'],
    ['Top K-Drama', '&type=0&sub=0&country=2&status=0&order=1'],
    ['Top C-Drama', '&type=0&sub=0&country=1&status=0&order=1'],
    ['Movies, popular', '&type=2&sub=0&country=2&status=0&order=1'],
    ['TV series, popular', '&type=1&sub=0&country=2&status=0&order=1'],
    ['Anime, popular', '&type=3&sub=0&country=0&status=0&order=1'],
    ['Hollywood, popular', '&type=4&sub=0&country=0&status=0&order=1'],
    ['Upcoming', '&type=0&sub=0&country=0&status=3&order=2']
  ],

  BASES: ['https://kisskh.is', 'https://kisskh.ovh', 'https://kisskh.co'],
  get settings() {
    return [
      { key: 'domain', title: 'Website address', type: 'choice', options: [{ v: '', label: 'Auto (try every address)' }].concat(this.BASES.map(b => ({ v: b, label: b.replace('https://', '') }))) },
      { key: 'sections', title: 'Home sections (show, hide, reorder)', type: 'sections', items: this.ROWS.map(r => r[0]) }
    ];
  },
  async j(path, o) {
    o = o || {};
    let last = 'no answer';
    let fixed = ''; try { fixed = BZ.pref('kisskh', 'domain', ''); } catch (e) {}
    const order = this.BASES.indexOf(fixed) >= 0 ? [fixed] : [this.base].concat(this.BASES.filter(b => b !== this.base));
    for (let i = 0; i < order.length; i++) {
      const b = order[i], t0 = Date.now();
      const to = new Promise(res => setTimeout(() => res({ status: 0, body: '', timeout: 1 }), 20000));
      let r;
      try { r = await Promise.race([BZ.get(b + path, Object.assign({ referer: b + '/' }, o)), to]); } catch (e) { r = { status: 0, body: String(e && e.message || e) }; }
      BZ.log('GET ' + b.replace('https://', '') + path.split('?')[0].slice(0, 40) + ' -> ' + r.status + (r.timeout ? ' (no answer in 20s)' : '') + ' [' + (Date.now() - t0) + 'ms]');
      if (r.status >= 200 && r.status < 300) {
        try { const j = JSON.parse(r.body); this.base = b; return j; } catch (e) { last = 'unreadable answer from ' + b; BZ.log('  body starts: ' + JSON.stringify(String(r.body).slice(0, 80))); continue; }
      }
      last = r.status + ' from ' + b;
    }
    throw new Error('KissKH ' + last);
  },
  card(m) { return { id: String(m.id), title: m.title || '', poster: m.thumbnail || '', badge: m.label || (m.episodesCount ? m.episodesCount + ' eps' : '') }; },

  async home() {
    const rows = [];
    const st = BZ.pref('kisskh', 'sections', null) || {}, hidden = st.hidden || [], ord = st.order || [];
    const list = this.ROWS.filter(r => hidden.indexOf(r[0]) < 0).sort((a, b) => { const x = ord.indexOf(a[0]), y = ord.indexOf(b[0]); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    if (!list.length) { throw new Error('All KissKH home sections are hidden (Settings > KissKH > Settings)'); }
    await Promise.all(list.map(async ([title, q], i) => {
      try {
        const d = await this.j('/api/DramaList/List?page=1' + q);
        const items = (d.data || []).map(m => this.card(m)).filter(x => x.id && x.title);
        if (items.length) { rows[i] = { title, items }; }
      } catch (e) { BZ.log('KissKH row ' + title + ': ' + e.message); }
    }));
    return { rows: rows.filter(Boolean) };
  },

  async search(q, page) {
    const d = await this.j('/api/DramaList/Search?q=' + encodeURIComponent(q) + '&type=0');
    return (Array.isArray(d) ? d : (d.data || [])).map(m => this.card(m)).filter(x => x.id && x.title);
  },

  async details(id) {
    const d = await this.j('/api/DramaList/Drama/' + encodeURIComponent(id) + '?isq=false');
    const slug = String(d.title || '').replace(/[^a-zA-Z0-9]/g, '-');
    const eps = (d.episodes || []).map(e => ({ n: Number(e.number), id: e.id })).filter(e => e.id != null).sort((a, b) => a.n - b.n)
      .map(e => ({ id: e.id + '|' + id + '|' + e.n + '|' + slug, number: String(e.n), title: 'Episode ' + e.n }));
    if (!eps.length) { throw new Error('No episodes listed for this title'); }
    return {
      title: d.title || '', poster: d.thumbnail || '', description: String(d.description || '').trim(),
      genres: [d.type, d.country, d.status, d.releaseDate ? String(d.releaseDate).slice(0, 4) : ''].filter(Boolean),
      episodes: eps
    };
  },

  /* the key the site wants with every video / subtitle request (AES-128-CBC over a fixed string list) */
  kkey(id, guid) {
    const l = ['', String(id), '', 'mg3c3b04ba', '2.8.10', guid, '4830201', 'kisskh', 'kisskh', 'kisskh', 'kisskh', 'kisskh', 'kisskh', '00', ''];
    let h = 0; const s = l.join('|'); for (let i = 0; i < s.length; i++) { h = ((h << 5) | 0) - h + s.charCodeAt(i); }
    l[1] = String(h);
    let t = l.join('|'); const n = 16 - t.length % 16; t += String.fromCharCode(n).repeat(n);
    const bytes = []; for (let i = 0; i < t.length; i++) { bytes.push(t.charCodeAt(i) & 255); }
    return CRY.hex(CRY.aesCbcEnc(bytes, this.KEY, this.IV)).toUpperCase();
  },

  async fetchSources(epId, referer) {
    const url = '/api/DramaList/Episode/' + epId + '.png?err=false&ts=&time=&kkey=';
    try { const j = await this.j(url + this.kkey(epId, this.VIDEO_GUID), { referer }); if (j && (j.Video || j.ThirdParty)) { return j; } } catch (e) { BZ.log('KissKH source: ' + e.message); }
    /* the site sometimes wants a key made by its own script: ask the helper pages */
    for (const u of ['https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=', 'https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=']) {
      try {
        const r = await BZ.get(u + epId + '&version=2.8.10', {});
        const k = JSON.parse(r.body).key; if (!k) { continue; }
        const j = await this.j(url + k, { referer }); if (j && (j.Video || j.ThirdParty)) { return j; }
      } catch (e) {}
    }
    return null;
  },

  /* subtitle files that end in .txt are encrypted line by line; turn them into WebVTT text */
  decryptSub(raw) {
    const pairs = [['AmSmZVcH93UQUezi', [1382367819, 1465333859, 1902406224, 1164854838]], ['8056483646328763', [909653298, 909193779, 925905208, 892483379]], ['sWODXX04QRTkHdlZ', [946894696, 1634749029, 1127508082, 1396271183]]]
      .map(([k, iv]) => [CRY.utf8(k), iv.flatMap(v => [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255])]);
    const bad = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/;
    const decWith = (pair, line) => { const t = CRY.fromUtf8(CRY.aesCbcDec(CRY.b64d(line.trim()), pair[0], pair[1], true)); if (bad.test(t)) { throw new Error('garbled'); } return t; };
    const chunks = String(raw).replace(/\r/g, '').split(/^\s*\d+\s*$/m).map(c => c.trim()).filter(Boolean).map(c => { const l = c.split('\n'); return { when: l.shift() || '', lines: l.filter(x => x.trim()) }; }).filter(c => /-->/.test(c.when) && c.lines.length);
    /* one key opens the whole file: pick the one that reads cleanly on the first lines, so a wrong key can never leak garbage */
    const probe = chunks.slice(0, 6).flatMap(c => c.lines).slice(0, 8);
    let pair = null;
    for (const p of pairs) { let ok = 0; for (const l of probe) { try { decWith(p, l); ok++; } catch (e) {} } if (probe.length && ok === probe.length) { pair = p; break; } }
    if (!pair) { throw new Error('no subtitle key fits'); }
    let out = 'WEBVTT\n\n', n = 0;
    for (const c of chunks) {
      let text = ''; try { text = c.lines.map(l => decWith(pair, l)).join('\n'); } catch (e) { continue; }
      out += (++n) + '\n' + c.when.replace(/,/g, '.') + '\n' + text + '\n\n';
    }
    if (!n) { throw new Error('no subtitle lines'); }
    return out;
  },

  /* plain subtitle text (SRT or VTT) to WebVTT, which the player always understands */
  toVtt(raw) {
    const t = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (/^WEBVTT/.test(t)) { return t + '\n'; }
    return 'WEBVTT\n\n' + t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') + '\n';
  },

  async subs(epId) {
    const res = [];
    try {
      let list = null;
      try { list = await this.j('/api/Sub/' + epId + '?kkey=' + this.kkey(epId, this.SUB_GUID)); } catch (e) { BZ.log('KissKH subs own key refused: ' + e.message); }
      /* the site changes its key rules: ask the helper pages for a key made by the site's own script, like the CloudStream plugin does */
      if (!Array.isArray(list)) {
        for (const u of ['https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=', 'https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=']) {
          try {
            const r = await BZ.get(u + epId + '&version=2.8.10', {});
            const k = JSON.parse(r.body).key; if (!k) { continue; }
            const l = await this.j('/api/Sub/' + epId + '?kkey=' + k); if (Array.isArray(l)) { list = l; BZ.log('KissKH subs: helper key worked'); break; }
          } catch (e) { BZ.log('KissKH subs helper: ' + e.message); }
        }
      }
      const arr = Array.isArray(list) ? list : [];
      BZ.log('KissKH subtitles offered: ' + (arr.length ? arr.map(x => (x.label || '?') + ' ' + String(x.src || '').slice(-24)).join(' | ') : 'none'));
      arr.sort((a, b) => (/english/i.test(b.label || '') ? 1 : 0) - (/english/i.test(a.label || '') ? 1 : 0));
      await Promise.all(arr.slice(0, 8).map(async s => {
        if (!s.src) { return; }
        const lang = s.label || 'Subtitle';
        try {
          const r = await Promise.race([BZ.get(s.src, { referer: this.base + '/' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
          if (r.status !== 200 || !r.body) { throw new Error('status ' + r.status); }
          let text; try { text = this.decryptSub(r.body); } catch (e) { text = this.toVtt(r.body); }
          res.push({ lang, text });
        } catch (e) { BZ.log('KissKH sub ' + lang + ' failed (' + e.message + '), passing the address'); res.push({ lang, url: s.src }); }
      }));
    } catch (e) { BZ.log('KissKH subs: ' + e.message); }
    res.sort((a, b) => (/english/i.test(b.lang) ? 1 : 0) - (/english/i.test(a.lang) ? 1 : 0));
    return res;
  },

  async streams(epKey) {
    const [epId, dramaId, num, slug] = String(epKey).split('|');
    const referer = this.base + '/Drama/' + slug + '/Episode-' + num + '?id=' + dramaId + '&ep=' + epId + '&page=0&pageSize=100';
    const [src, subs] = await Promise.all([this.fetchSources(epId, referer), this.subs(epId)]);
    const out = [];
    const add = (u, name) => {
      if (!u || !/^https?:/i.test(u)) { return; }
      const hls = /\.m3u8|\/hls|mpegurl/i.test(u) || !/\.(mp4|mkv|webm)(\?|$)/i.test(u);
      out.push({ name, url: u, type: hls ? 'hls' : 'mp4', quality: '', headers: { referer: this.base + '/', origin: this.base }, subs });
    };
    if (src) { add(src.Video, 'KissKH'); if (src.ThirdParty && src.ThirdParty !== src.Video) { if (/\.(m3u8|mp4)/i.test(src.ThirdParty)) { add(src.ThirdParty, 'KissKH 2'); } } }
    if (!out.length) { throw new Error('KissKH gave no video for this episode'); }
    return out;
  }
});
