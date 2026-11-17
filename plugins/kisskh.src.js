/* KissKH plugin for BlooBZ (Korean / Chinese / Asian drama). Logic ported from the CloudStream "Kisskh" provider by phisher98 (GPL-3.0). */
/*CRY-START*//*CRY-END*/
BZ.register({
  id: 'kisskh',
  name: 'KissKH',
  version: 2,
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
  async j(path, o) {
    o = o || {};
    let last = 'no answer';
    const order = [this.base].concat(this.BASES.filter(b => b !== this.base));
    for (let i = 0; i < order.length; i++) {
      const b = order[i], t0 = Date.now();
      const to = new Promise(res => setTimeout(() => res({ status: 0, body: '', timeout: 1 }), 20000));
      let r;
      try { r = await Promise.race([BZ.get(b + path, Object.assign({ referer: b + '/' }, o)), to]); } catch (e) { r = { status: 0, body: String(e && e.message || e) }; }
      BZ.log('GET ' + b.replace('https://', '') + path.split('?')[0].slice(0, 40) + ' -> ' + r.status + (r.timeout ? ' (no answer in 20s)' : '') + ' [' + (Date.now() - t0) + 'ms]');
      if (r.status >= 200 && r.status < 300) {
        try { const j = JSON.parse(r.body); this.base = b; return j; } catch (e) { last = 'unreadable answer from ' + b; continue; }
      }
      last = r.status + ' from ' + b;
    }
    throw new Error('KissKH ' + last);
  },
  card(m) { return { id: String(m.id), title: m.title || '', poster: m.thumbnail || '', badge: m.label || (m.episodesCount ? m.episodesCount + ' eps' : '') }; },

  async home() {
    const rows = [];
    await Promise.all(this.ROWS.map(async ([title, q], i) => {
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
    const dec = line => { const data = CRY.b64d(line.trim()); for (const [k, iv] of pairs) { try { return CRY.fromUtf8(CRY.aesCbcDec(data, k, iv, true)); } catch (e) {} } throw new Error('subtitle key'); };
    const chunks = String(raw).split(/^\s*\d+\s*$/m).map(c => c.trim()).filter(Boolean);
    let out = 'WEBVTT\n\n', n = 0;
    for (const c of chunks) {
      const lines = c.split(/\r?\n/); const when = lines.shift() || ''; if (!/-->/.test(when)) { continue; }
      let text = ''; try { text = lines.filter(x => x.trim()).map(dec).join('\n'); } catch (e) { continue; }
      out += (++n) + '\n' + when.replace(/,/g, '.') + '\n' + text + '\n\n';
    }
    if (!n) { throw new Error('no subtitle lines'); }
    return out;
  },

  async subs(epId) {
    const res = [];
    try {
      const list = await this.j('/api/Sub/' + epId + '?kkey=' + this.kkey(epId, this.SUB_GUID));
      for (const s of (Array.isArray(list) ? list : [])) {
        if (!s.src) { continue; }
        const lang = s.label || 'Subtitle';
        if (/\.txt(\?|$)/i.test(s.src)) {
          try { const r = await BZ.get(s.src, { referer: this.base + '/' }); if (r.status === 200) { res.push({ lang, text: this.decryptSub(r.body) }); } } catch (e) { BZ.log('KissKH sub ' + lang + ': ' + e.message); }
        } else { res.push({ lang, url: s.src }); }
      }
    } catch (e) { BZ.log('KissKH subs: ' + e.message); }
    /* English first */
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
