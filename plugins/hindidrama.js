/* HindiDrama.net plugin for BlooBZ: Korean / Chinese / Japanese / Indian dramas dubbed in Hindi.
   Written without access to the site's raw HTML, so it finds shows and episodes by their link patterns
   (/hindi-dubbed-online/watch-<show> and /hindi-dubbed/watch-<show>-eNN) and logs what it finds. */
BZ.register({
  id: 'hindidrama',
  name: 'HindiDrama',
  version: 1,
  base: 'https://hindidrama.net',
  test: 'love',

  SHOW: /\/hindi-dubbed-online\/watch-[^\/?#]+/i,
  EP: /\/hindi-dubbed\/watch-[^\/?#]+/i,

  async page(path, o) {
    const url = /^https?:/i.test(path) ? path : this.base + path;
    const to = new Promise(res => setTimeout(() => res({ status: 0, body: '', timeout: 1 }), 25000));
    let r;
    try { r = await Promise.race([BZ.get(url, Object.assign({ referer: this.base + '/' }, o || {})), to]); } catch (e) { r = { status: 0, body: String(e && e.message || e) }; }
    BZ.log('GET ' + url.replace('https://', '').slice(0, 60) + ' -> ' + r.status + (r.timeout ? ' (no answer in 25s)' : '') + ' ' + (r.status >= 200 && r.status < 300 ? (String(r.body).length + ' bytes') : String(r.body || '').slice(0, 100)));
    if (r.status < 200 || r.status >= 300) { throw new Error('HindiDrama ' + r.status + (r.timeout ? ' (no answer)' : '')); }
    return r;
  },
  pathOf(u) { try { const x = new URL(u, this.base); return x.pathname; } catch (e) { return String(u || ''); } },
  img(a) {
    const i = a.querySelector('img'); if (!i) { return ''; }
    const s = i.getAttribute('data-src') || i.getAttribute('data-original') || i.getAttribute('data-lazy-src') || i.getAttribute('src') || '';
    return s && !/^data:/i.test(s) ? BZ.abs(s, this.base) : '';
  },
  titleOf(a) {
    const i = a.querySelector('img');
    let t = a.getAttribute('title') || (i && (i.getAttribute('alt') || i.getAttribute('title'))) || '';
    if (!t) { const h = a.querySelector('h1,h2,h3,h4,h5,.title,.name'); t = h ? h.textContent : a.textContent; }
    return t.replace(/\s+/g, ' ').replace(/^watch\s+/i, '').replace(/\s*(hindi dubbed|online)\s*$/ig, '').trim();
  },
  /* every show card in a document, in page order, with the nearest heading above it */
  cards(doc) {
    const out = []; const seen = {}; let head = 'Latest';
    doc.querySelectorAll('h1,h2,h3,h4,a[href]').forEach(el => {
      if (el.tagName !== 'A') { if (!el.closest('a')) { const t = el.textContent.replace(/\s+/g, ' ').trim(); if (t && t.length < 40) { head = t; } } return; }
      const href = el.getAttribute('href') || ''; const m = href.match(this.SHOW); if (!m) { return; }
      const id = this.pathOf(href); if (seen[id]) { return; }
      const title = this.titleOf(el); const poster = this.img(el);
      if (!title) { return; }
      seen[id] = 1; out.push({ head, card: { id, title, poster, badge: '' } });
    });
    return out;
  },

  async home(page) {
    const r = await this.page(page > 1 ? '/?page=' + page : '/');
    const list = this.cards(BZ.html(r.body));
    BZ.log('home cards: ' + list.length);
    if (!list.length) { throw new Error('HindiDrama: no shows found on the home page (layout changed?)'); }
    const rows = [], idx = {};
    list.forEach(x => {
      if (idx[x.head] == null) { idx[x.head] = rows.length; rows.push({ title: x.head, items: [] }); }
      rows[idx[x.head]].items.push(x.card);
    });
    return { rows: rows.filter(r2 => r2.items.length) };
  },

  async search(q, page) {
    const enc = encodeURIComponent(q);
    const tries = ['/search?q=' + enc, '/?s=' + enc, '/search/' + enc, '/search?keyword=' + enc];
    for (const t of tries) {
      try {
        const r = await this.page(t);
        const list = this.cards(BZ.html(r.body)).map(x => x.card);
        if (list.length) { BZ.log('search worked with ' + t.split(enc)[0]); return list; }
      } catch (e) { /* try the next address */ }
    }
    return [];
  },

  async details(id) {
    const r = await this.page(id);
    const d = BZ.html(r.body);
    const meta = p => { const e = d.querySelector('meta[property="' + p + '"]'); return e ? (e.getAttribute('content') || '') : ''; };
    const h1 = d.querySelector('h1');
    const title = (h1 ? h1.textContent : meta('og:title')).replace(/\s+/g, ' ').replace(/^watch\s+/i, '').replace(/\s*(hindi dubbed|online).*$/i, '').trim();
    const eps = [], seen = {};
    d.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || ''; if (!this.EP.test(href)) { return; }
      const p = this.pathOf(href); if (seen[p]) { return; }
      const m = p.match(/-e(\d+)(?:-[a-z]+)?$/i) || p.match(/episode-?(\d+)/i); const n = m ? Number(m[1]) : 0;
      seen[p] = 1; eps.push({ n, id: p });
    });
    eps.sort((a, b) => a.n - b.n);
    BZ.log('episodes found: ' + eps.length);
    if (!eps.length) { throw new Error('HindiDrama: no episodes found on this page'); }
    return {
      title, poster: meta('og:image') ? BZ.abs(meta('og:image'), this.base) : '', description: (meta('og:description') || '').trim(), genres: [],
      episodes: eps.map((e, i) => ({ id: e.id, number: String(e.n || i + 1), title: 'Episode ' + (e.n || i + 1) }))
    };
  },

  async streams(epId) {
    const r = await this.page(epId);
    const html = String(r.body || '').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
    const out = [], seen = {};
    const add = (name, url, type, extra) => {
      url = String(url || '').trim(); if (!url) { return; }
      if (url.indexOf('//') === 0) { url = 'https:' + url; }
      if (!/^https?:\/\//i.test(url) || seen[url]) { return; }
      seen[url] = 1; out.push(Object.assign({ name, url, type, quality: '', headers: { referer: this.base + '/', origin: this.base } }, extra || {}));
    };
    // direct files anywhere in the page (video tags, player scripts)
    (html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/gi) || []).forEach((u, i) => add('HLS ' + (i + 1), u, 'hls'));
    (html.match(/https?:\/\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/gi) || []).forEach((u, i) => add('MP4 ' + (i + 1), u, 'mp4'));
    // player frames and server buttons
    const d = BZ.html(r.body);
    d.querySelectorAll('iframe').forEach((f, i) => {
      const u = f.getAttribute('src') || f.getAttribute('data-src') || f.getAttribute('data-lazy-src'); if (u) { add('Player ' + (i + 1), BZ.abs(u, this.base), 'embed'); }
    });
    d.querySelectorAll('[data-src],[data-embed],[data-video],[data-url],[data-link]').forEach(e => {
      ['data-embed', 'data-video', 'data-src', 'data-url', 'data-link'].forEach(k => {
        const u = e.getAttribute(k); if (!u || !/^(https?:)?\/\//i.test(u) || e.tagName === 'IMG') { return; }
        if (/\.(jpe?g|png|webp|gif|css|js)(\?|$)/i.test(u)) { return; }
        add((e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Server ' + (out.length + 1), u, /\.m3u8/i.test(u) ? 'hls' : /\.mp4/i.test(u) ? 'mp4' : 'embed');
      });
    });
    BZ.log('streams found: ' + out.length + ' (' + out.map(s => s.type + ':' + s.url.replace(/^https?:\/\//, '').slice(0, 28)).join(', ') + ')');
    if (!out.length) { throw new Error('HindiDrama: no player found on this episode page'); }
    // files first, web players last
    const rank = { hls: 0, mp4: 1, embed: 2 };
    return out.sort((a, b) => rank[a.type] - rank[b.type]);
  }
});
