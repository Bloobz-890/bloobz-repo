/* Animexin plugin for BlooBZ. Site uses the common AnimeStream WordPress theme. */
BZ.register({
  id: 'animexin',
  name: 'Animexin',
  version: 4,
  base: 'https://animexin.dev',
  test: 'soul land',

  async get(path) {
    const r = await BZ.get(BZ.abs(path, this.base), { referer: this.base + '/' });
    if (r.status < 200 || r.status >= 300) { throw new Error('Site answered ' + r.status + (r.status === 403 || r.status === 503 ? ' (blocked by Cloudflare)' : '')); }
    BZ.log('page ' + r.status + ', ' + String(r.body || '').length + ' chars, title: ' + ((String(r.body || '').match(/<title[^>]*>([^<]*)/i) || [])[1] || '-').trim().slice(0, 60));
    return BZ.html(r.body);
  },

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

  card(el) {
    const a = el.querySelector('a');
    const img = el.querySelector('img');
    const tt = el.querySelector('.tt');
    const t = tt ? (tt.querySelector('h2') || tt) : null;
    return {
      id: a ? new URL(a.getAttribute('href'), this.base).pathname : '',
      title: t ? t.textContent.trim() : (a ? (a.getAttribute('title') || '').trim() : ''),
      poster: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '',
      badge: (el.querySelector('.epx') || {}).textContent ? el.querySelector('.epx').textContent.trim() : ''
    };
  },

  async home() {
    const d = await this.get('/');
    const rows = [];
    d.querySelectorAll('.bixbox').forEach(box => {
      const h = box.querySelector('.releases h2, .releases h3');
      const items = [...box.querySelectorAll('.listupd article')].map(x => this.card(x)).filter(x => x.id);
      if (h && items.length) { rows.push({ title: h.textContent.trim(), items }); }
    });
    return { rows };
  },

  async search(q, page) {
    const d = await this.get('/page/' + (page || 1) + '/?s=' + encodeURIComponent(q));
    return [...d.querySelectorAll('.listupd article')].map(x => this.card(x)).filter(x => x.id);
  },

  async details(id) {
    const d = await this.get(id);
    const txt = s => { const e = d.querySelector(s); return e ? e.textContent.trim() : ''; };
    const img = d.querySelector('.thumb img');
    const eps = [...d.querySelectorAll('.eplister li')].map(li => {
      const a = li.querySelector('a');
      return a ? { id: new URL(a.getAttribute('href'), this.base).pathname, number: (li.getAttribute('data-index') || (li.querySelector('.epl-num') || {}).textContent || '').toString().trim(), title: ((li.querySelector('.epl-title') || {}).textContent || '').trim() } : null;
    }).filter(Boolean).reverse();
    return {
      title: txt('h1.entry-title'),
      poster: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '',
      description: txt('.entry-content'),
      genres: [...d.querySelectorAll('.genxed a')].map(a => a.textContent.trim()),
      episodes: eps
    };
  },

  async streams(id) {
    const d = await this.get(id);
    const out = [];
    for (const o of d.querySelectorAll('select.mirror option')) {
      const v = o.getAttribute('value');
      if (!v) { continue; }
      let html = '';
      try { html = atob(v); } catch (e) { continue; }
      const m = html.match(/src=["']([^"']+)["']/i);
      if (!m) { continue; }
      const src = BZ.abs(m[1], this.base);
      const name = o.textContent.trim() || 'Server';
      const dm = src.match(/dailymotion\.com\/(?:embed\/)?video\/([a-z0-9]+)/i) || src.match(/geo\.dailymotion\.com\/player.*video=([a-z0-9]+)/i);
      if (dm) {
        try {
          const r = await BZ.get('https://www.dailymotion.com/player/metadata/video/' + dm[1], { referer: 'https://www.dailymotion.com/' });
          const j = this.parse(r.body);
          const auto = j && j.qualities && j.qualities.auto && j.qualities.auto[0];
          if (auto && auto.url) { out.push({ name: name + ' (Dailymotion)', url: auto.url, type: 'hls', headers: { referer: 'https://www.dailymotion.com/' } }); continue; }
        } catch (e) { BZ.log('dailymotion: ' + e.message); }
      }
      out.push({ name, url: src, type: 'embed' });
    }
    return out;
  }
});
