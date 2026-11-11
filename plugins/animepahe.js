/* AnimePahe plugin for BlooBZ. Streams come from the Kwik player (packed script, unpacked here without eval). */
BZ.register({
  id: 'animepahe',
  name: 'AnimePahe',
  version: 3,
  base: 'https://animepahe.pw',

  /* JSON may arrive wrapped in an HTML page (browser view of a JSON url); unwrap it and show a snippet if it is still not JSON */
  parse(body) {
    let t = String(body || '').trim();
    if (t[0] === '<') {
      const m = t.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      if (m) { t = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
      else { const a = t.indexOf('{'), z = t.lastIndexOf('}'); if (a >= 0 && z > a) { t = t.slice(a, z + 1); } }
    }
    try { return JSON.parse(t); } catch (e) { throw new Error('Site sent a page, not data: ' + String(body || '').replace(/\s+/g, ' ').slice(0, 90)); }
  },

  async api(path) {
    const r = await BZ.get(this.base + path, { referer: this.base + '/' });
    BZ.log('api ' + r.status + ', ' + String(r.body || '').length + ' chars: ' + String(r.body || '').replace(/\s+/g, ' ').slice(0, 90));
    if (r.status < 200 || r.status >= 300) { throw new Error('Site answered ' + r.status + (r.status === 403 || r.status === 503 ? ' (blocked by protection page)' : '')); }
    return r;
  },

  async search(q) {
    const r = await this.api('/api?m=search&q=' + encodeURIComponent(q));
    const j = this.parse(r.body);
    return (j.data || []).map(a => ({ id: a.session, title: a.title, poster: a.poster, badge: [a.type, a.year].filter(Boolean).join(' - ') }));
  },

  async home() {
    const r = await this.api('/api?m=airing&page=1');
    const j = this.parse(r.body);
    return { rows: [{ title: 'Latest episodes', items: (j.data || []).map(a => ({ id: a.anime_session, title: a.anime_title, poster: a.snapshot, badge: 'EP ' + a.episode })) }] };
  },

  async details(id) {
    const eps = [];
    let page = 1, last = 1;
    do {
      const r = await this.api('/api?m=release&id=' + encodeURIComponent(id) + '&sort=episode_asc&page=' + page);
      const j = this.parse(r.body);
      last = j.last_page || 1;
      (j.data || []).forEach(e => eps.push({ id: id + '/' + e.session, number: String(e.episode), title: e.title || ('Episode ' + e.episode) }));
      page++;
    } while (page <= last && page <= 30);
    return { title: '', poster: '', description: '', genres: [], episodes: eps };
  },

  // Dean Edwards packer, the format Kwik uses. Pure string work, no eval.
  unpack(html) {
    const m = html.match(/\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/);
    if (!m) { return ''; }
    let p = m[1].replace(/\\'/g, "'"), a = parseInt(m[2], 10), c = parseInt(m[3], 10);
    const k = m[4].split('|');
    const enc = n => (n < a ? '' : enc(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    const d = {};
    while (c--) { d[enc(c)] = k[c] || enc(c); }
    return p.replace(/\b\w+\b/g, w => (d[w] !== undefined ? d[w] : w));
  },

  async streams(id) {
    const [anime, ep] = id.split('/');
    const r = await this.api('/play/' + anime + '/' + ep);
    const out = [];
    const re = /<button[^>]+data-src="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(r.body))) {
      const tag = m[0];
      const src = m[1];
      if (!/kwik\./.test(src)) { continue; }
      const res = (tag.match(/data-resolution="([^"]+)"/) || [])[1] || '';
      const aud = (tag.match(/data-audio="([^"]+)"/) || [])[1] || '';
      const fan = (tag.match(/data-fansub="([^"]+)"/) || [])[1] || '';
      try {
        const kr = await BZ.get(src, { referer: this.base + '/' });
        let u = (kr.body.match(/https?:\/\/[^'"\s<>]+\.m3u8[^'"\s<>]*/) || [])[0];
        if (!u) { const un = this.unpack(kr.body); u = (un.match(/https?:\/\/[^'"\s<>\\]+\.m3u8[^'"\s<>\\]*/) || [])[0]; }
        if (u) {
          const origin = new URL(src).origin;
          out.push({ name: [fan, res && res + 'p', aud === 'eng' ? 'DUB' : 'SUB'].filter(Boolean).join(' '), url: u, type: 'hls', quality: res ? res + 'p' : '', headers: { referer: origin + '/', origin } });
        } else { BZ.log('kwik: no m3u8 found for ' + src); }
      } catch (e) { BZ.log('kwik: ' + e.message); }
    }
    out.sort((x, y) => (parseInt(y.quality, 10) || 0) - (parseInt(x.quality, 10) || 0));
    return out;
  }
});
