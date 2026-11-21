const HLSQ = (() => {
  const abs = (u, base) => { try { return new URL(u, base).href; } catch (e) { return u; } };
  const attrs = s => { const o = {}; const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g; let m; while ((m = re.exec(s))) { o[m[1]] = m[2].replace(/^"|"$/g, ''); } return o; };
  const timed = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res({ status: 0, body: '' }), ms))]);
  /* A stream that points at an HLS master playlist hides its picture sizes. Read the playlist and give back one stream per size
     (best first) plus an "Auto" one, the way CloudStream lists 1080p / 720p / 480p. If the sound is a separate file, or the playlist
     cannot be read, the stream is kept whole and only labelled with its best size. */
  async function expand(st, opt) {
    opt = opt || {};
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
    BZ.log('HLS ' + st.name + ': playlist offers ' + (list.map(v => v.h ? v.h + 'p' : Math.round(v.bw / 1000) + 'k').join(', ')) + (separateAudio ? ' (sound is a separate file, kept whole)' : ''));
    if (separateAudio || list.length < 2 || !top) { return [Object.assign({}, st, top ? { quality: top + 'p', h: top } : {})]; }
    const base = st.name;
    /* some sites list sizes whose playlists are protected: only list the ones that really open */
    if (opt.verify) {
      const hd2 = {}; const h2 = st.headers || {}; if (h2.referer) { hd2.referer = h2.referer; } if (h2.origin) { hd2.origin = h2.origin; } if (st.cookie) { hd2.cookie = st.cookie; }
      const ok = await Promise.all(list.map(async v => { try { const r = await timed(BZ.nat(v.url, { method: 'GET', headers: hd2, ua: h2.ua || '' }), 6000); return r.status === 200 && String(r.body || '').indexOf('#EXTM3U') >= 0; } catch (e) { return false; } }));
      const good = list.filter((v, i) => ok[i]);
      BZ.log('HLS ' + st.name + ': ' + good.length + ' of ' + list.length + ' sizes open to the player');
      if (good.length < 2) { return [Object.assign({}, st, good[0] ? { quality: good[0].h + 'p', h: good[0].h } : { quality: top + 'p', h: top })]; }
      list.length = 0; good.forEach(v => list.push(v));
    }
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
  const many = async (streams, opt) => [].concat(...await Promise.all((streams || []).map(s => expand(s, opt).catch(() => [s]))));
  return { expand, all, many, attrs };
})();
