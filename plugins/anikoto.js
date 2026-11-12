/* Anikoto plugin for BlooBZ. Uses the BlooBZ API (anikoto.cz scraper) for search, episodes and direct M3U8 streams, Sub and Dub together. */
BZ.register({
  id: 'anikoto',
  name: 'Anikoto',
  version: 1,
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
    return all.map(([t, s]) => {
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
  }
});
