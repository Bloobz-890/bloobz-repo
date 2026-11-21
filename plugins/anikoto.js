/* Anikoto plugin for BlooBZ. Uses the BlooBZ API (anikoto.cz scraper) for search, episodes and direct M3U8 streams, Sub and Dub together. */
/*HLS-START*/
const HLSQ = (() => {
  const abs = (u, base) => { try { return new URL(u, base).href; } catch (e) { return u; } };
  const attrs = s => { const o = {}; const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g; let m; while ((m = re.exec(s))) { o[m[1]] = m[2].replace(/^"|"$/g, ''); } return o; };
  const timed = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res({ status: 0, body: '' }), ms))]);
  /* A stream that points at an HLS master playlist hides its picture sizes. Read the playlist and give back one stream per size
     (best first) plus an "Auto" one, the way CloudStream lists 1080p / 720p / 480p. If the sound is a separate file, or the playlist
     cannot be read, the stream is kept whole and only labelled with its best size. */
  async function expand(st) {
    if (!st || st.type !== 'hls' || /\d{3,4}p/i.test(st.quality || '')) { return [st]; }
    let body = '';
    try {
      const h = st.headers || {}, hd = { accept: '*/*' };
      if (h.referer) { hd.referer = h.referer; } if (h.origin) { hd.origin = h.origin; } if (st.cookie) { hd.cookie = st.cookie; }
      const r = await timed(BZ.nat(st.url, { method: 'GET', headers: hd, ua: h.ua || '' }), 8000);
      if (r.status === 200) { body = String(r.body || ''); }
    } catch (e) { }
    if (!/#EXT-X-STREAM-INF/.test(body)) { return [st]; }
    const lines = body.split(/\r?\n/).map(x => x.trim()), vs = [];
    let separateAudio = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^#EXT-X-MEDIA:/.test(lines[i]) && /TYPE=AUDIO/.test(lines[i]) && /URI=/.test(lines[i])) { separateAudio = true; }
      if (!/^#EXT-X-STREAM-INF:/.test(lines[i])) { continue; }
      const a = attrs(lines[i].slice(18)), m = /(\d+)x(\d+)/.exec(a.RESOLUTION || '');
      let j = i + 1; while (j < lines.length && (!lines[j] || lines[j][0] === '#')) { j++; }
      if (j >= lines.length) { break; }
      vs.push({ h: m ? +m[2] : 0, bw: +a.BANDWIDTH || 0, url: abs(lines[j], st.url) });
    }
    if (!vs.length) { return [st]; }
    const best = {}; vs.forEach(v => { if (!best[v.h] || v.bw > best[v.h].bw) { best[v.h] = v; } });
    const list = Object.keys(best).map(k => best[k]).sort((a, b) => b.h - a.h);
    const top = list[0].h;
    if (separateAudio || list.length < 2 || !top) { return [Object.assign({}, st, top ? { quality: top + 'p', h: top } : {})]; }
    const base = st.name;
    return list.map(v => Object.assign({}, st, { name: base + ' ' + (v.h ? v.h + 'p' : Math.round(v.bw / 1000) + 'k'), url: v.url, quality: v.h ? v.h + 'p' : '', h: v.h }))
      .concat([Object.assign({}, st, { name: base + ' Auto', quality: 'Auto', h: top - 1 })]);
  }
  /* expand every stream, then order: highest picture first, web players last, unknown sizes before them */
  async function all(streams) {
    const parts = await Promise.all((streams || []).map(s => expand(s).catch(() => [s])));
    const flat = [].concat(...parts);
    const key = s => s.type === 'embed' ? -2 : (s.h || parseInt(s.quality, 10) || -1);
    return flat.map((s, i) => [s, i]).sort((a, b) => (key(b[0]) - key(a[0])) || (a[1] - b[1])).map(x => x[0]);
  }
  return { expand, all, attrs };
})();
/*HLS-END*/
BZ.register({
  id: 'anikoto',
  name: 'Anikoto',
  version: 2,
  base: 'https://anikoto.cz',
  test: 'one piece',

  async home() {
    const j = await BZ.api('/home');
    const mk = l => (l || []).slice(0, 18).map(a => ({ id: 'q:' + (a.title || a.romaji || ''), title: a.title || a.romaji || '', poster: a.poster || a.poster_small || '', badge: a.episodes ? a.episodes + ' eps' : '' })).filter(x => x.title);
    return { rows: [
      { title: 'Trending', items: mk(j.trending) },
      { title: 'Recent episodes', items: mk(j.recent) },
      { title: 'Popular', items: mk(j.popular) },
      { title: 'Airing now', items: mk(j.airing) }
    ] };
  },

  async search(q) {
    const j = await BZ.api('/search?q=' + encodeURIComponent(q) + '&type=sub&provider=anikoto2');
    return (j.results || []).map(r => ({ id: r.id, title: r.name, poster: '', badge: r.episodes ? Math.round(r.episodes) + ' eps' : '' }));
  },

  async details(id) {
    let real = id, title = '';
    if (id.indexOf('q:') === 0) {
      title = id.slice(2);
      const r = await this.search(title);
      if (!r.length) { throw new Error('Not found on Anikoto: ' + title); }
      real = r[0].id; title = r[0].title;
    }
    const get = t => BZ.api('/episodes?id=' + encodeURIComponent(real) + '&type=' + t).catch(() => null);
    const [sub, dub] = await Promise.all([get('sub'), get('dub')]);
    const list = (sub && sub.episodes && sub.episodes.length ? sub : dub) || { episodes: [] };
    return {
      title: title || 'Anime',
      poster: '',
      description: '',
      genres: [],
      episodes: list.episodes.map(e => ({ id: real + '|' + e.episode, number: e.episode, title: 'Episode ' + e.episode }))
    };
  },

  async streams(epId) {
    const k = epId.lastIndexOf('|');
    const id = epId.slice(0, k), ep = epId.slice(k + 1);
    const get = t => BZ.api('/stream?id=' + encodeURIComponent(id) + '&ep=' + encodeURIComponent(ep) + '&type=' + t).then(j => (j.streams || []).map(s => [t, s])).catch(() => []);
    const all = (await Promise.all([get('sub'), get('dub')])).flat();
    const seen = {};
    const list = all.map(([t, s]) => {
      let name = t.toUpperCase() + ' - ' + (s.provider || 'Server');
      seen[name] = (seen[name] || 0) + 1;
      if (seen[name] > 1) { name += ' ' + seen[name]; }
      const h = s.headers || {};
      return {
        name, url: s.url, type: s.hls === false ? 'mp4' : 'hls', quality: s.resolution || '',
        headers: { referer: h.referer || '', origin: h.origin || '' },
        subs: (s.subtitles || []).map(x => ({ lang: x.label, url: x.url }))
      };
    });
    return await HLSQ.all(list);
  }
});
