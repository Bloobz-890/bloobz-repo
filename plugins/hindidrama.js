/* HindiDrama.net plugin for BlooBZ: Korean / Chinese / Japanese / Indian dramas dubbed in Hindi.
   Written without access to the site's raw HTML, so it finds shows and episodes by their link patterns
   (/hindi-dubbed-online/watch-<show> and /hindi-dubbed/watch-<show>-eNN) and logs what it finds. */
BZ.register({
  id: 'hindidrama',
  name: 'HindiDrama',
  version: 3,
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

  JUNK: /(google|gstatic|googletagmanager|google-analytics|doubleclick|facebook|twitter|instagram|schema\.org|w3\.org|cloudflare\.com\/(?:ajax|cdn-cgi)|cdnjs|jsdelivr|unpkg|fontawesome|jquery|bootstrapcdn|histats|statcounter|yandex|gravatar|wp\.com|youtube\.com\/(?:iframe_api|s\/)|ytimg|tailwindcss|disqus|addthis|sharethis|telegram|whatsapp|pinterest|reddit|tiktok)/i,
  ASSET: /\.(jpe?g|png|webp|gif|svg|ico|css|js|mjs|woff2?|ttf|otf|json|xml|map|vtt|srt)(\?|#|$)/i,

  async streams(epId) {
    const r = await this.page(epId);
    const html = String(r.body || '').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\u002F/gi, '/');
    const own = this.base.replace(/^https?:\/\//, '');
    const out = [], seen = {};
    const add = (name, url, type, extra) => {
      url = String(url || '').trim().replace(/[)\]}>,;]+$/, ''); if (!url) { return; }
      if (url.indexOf('//') === 0) { url = 'https:' + url; }
      if (!/^https?:\/\//i.test(url) || seen[url]) { return; }
      seen[url] = 1; out.push(Object.assign({ name, url, type, quality: '', headers: { referer: this.base + '/', origin: this.base } }, extra || {}));
    };
    // 1. direct files anywhere in the page
    (html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/gi) || []).forEach((u, i) => add('HLS ' + (i + 1), u, 'hls'));
    (html.match(/https?:\/\/[^"'\s<>\\]+\.mp4[^"'\s<>\\]*/gi) || []).forEach((u, i) => add('MP4 ' + (i + 1), u, 'mp4'));
    // 2. frames and buttons that carry an address
    const d = BZ.html(r.body);
    d.querySelectorAll('iframe').forEach((f, i) => { const u = f.getAttribute('src') || f.getAttribute('data-src') || f.getAttribute('data-lazy-src'); if (u) { add('Player ' + (i + 1), BZ.abs(u, this.base), 'embed'); } });
    const attrs = {};
    d.querySelectorAll('*').forEach(e => {
      if (e.tagName === 'IMG' || e.tagName === 'SCRIPT' || e.tagName === 'LINK' || e.tagName === 'A') { return; }
      Array.prototype.forEach.call(e.attributes, at => {
        if (/^data-/.test(at.name)) { attrs[at.name] = (attrs[at.name] || 0) + 1; }
        const v = at.value || '';
        if (/^data-|^src$/.test(at.name) && /^(https?:)?\/\//i.test(v) && !this.ASSET.test(v) && !this.JUNK.test(v)) { add((e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Server ' + (out.length + 1), v, /\.m3u8/i.test(v) ? 'hls' : /\.mp4/i.test(v) ? 'mp4' : 'embed'); }
      });
    });
    // 3. base64 blobs that decode to an address or an iframe (some sites hide the player this way)
    (html.match(/[A-Za-z0-9+\/=]{40,}/g) || []).slice(0, 60).forEach(b => {
      try { const t = atob(b); const m = t.match(/(?:src=["']|^)(https?:\/\/[^"'\s<>]+)/i); if (m && !this.ASSET.test(m[1]) && !this.JUNK.test(m[1])) { add('Player (coded)', m[1], /\.m3u8/i.test(m[1]) ? 'hls' : /\.mp4/i.test(m[1]) ? 'mp4' : 'embed'); } } catch (e) {}
    });
    // 4. any other outside address in the page that is not an image, style, script or advert (web player as a last resort)
    const hosts = {};
    (html.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>\\)]*/gi) || []).forEach(u => {
      const h = (u.match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || ''; if (!h || h.indexOf(own) >= 0) { return; }
      hosts[h] = (hosts[h] || 0) + 1;
      if (!this.ASSET.test(u) && !this.JUNK.test(u) && /embed|player|play|video|stream|watch|e\/|\/v\//i.test(u)) { add('Web ' + h.slice(0, 20), u, 'embed'); }
    });
    BZ.log('streams found: ' + out.length + ' (' + out.map(s => s.type + ':' + s.url.replace(/^https?:\/\//, '').slice(0, 30)).join(', ') + ')');
    if (!out.length) {
      BZ.log('outside hosts in page: ' + (Object.keys(hosts).slice(0, 12).join(', ') || 'none'));
      BZ.log('data- attributes: ' + (Object.keys(attrs).slice(0, 12).join(', ') || 'none'));
      const sc = []; d.querySelectorAll('script[src]').forEach(x => { const u = x.getAttribute('src') || ''; if (!this.JUNK.test(u)) { sc.push(u.replace(/^https?:\/\/[^\/]+/, '').slice(0, 40)); } });
      BZ.log('scripts: ' + (sc.slice(0, 8).join(' | ') || 'none'));
      const k = []; (html.match(/.{0,50}(?:player|sources?|embed_?url|iframe|ajax|\/api\/)[^<]{0,70}/gi) || []).slice(0, 5).forEach(x => k.push(x.replace(/\s+/g, ' ')));
      BZ.log('page hints: ' + (k.join(' ## ') || 'none'));
      const sj = []; d.querySelectorAll('script:not([src])').forEach(x => { const t = (x.textContent || '').trim(); if (t) { sj.push((x.getAttribute('type') || 'js') + ' ' + t.length + 'b: ' + t.slice(0, 200).replace(/\s+/g, ' ')); } });
      BZ.log('inline scripts: ' + sj.length); sj.slice(0, 7).forEach(x => BZ.log('  ' + x));
      const pc = d.body && d.body.querySelector('[class*=player],[class*=cover],[class*=noplayer],[id*=player],[class*=server]');
      if (pc) { BZ.log('player box: ' + pc.outerHTML.replace(/\s+/g, ' ').slice(0, 350)); }
      const oc = []; d.querySelectorAll('[onclick],[href^="javascript"],[href^="#"][class]').forEach(x => { if (oc.length < 6) { oc.push(x.tagName.toLowerCase() + ' ' + (x.getAttribute('onclick') || x.getAttribute('href') || '').slice(0, 70)); } });
      BZ.log('click handlers: ' + (oc.join(' | ') || 'none'));
      const bt = []; d.querySelectorAll('button,[role=button],.btn').forEach(x => { if (bt.length < 8) { bt.push((x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18) + '<' + x.tagName.toLowerCase() + ' ' + String(x.className || '').slice(0, 20) + '>'); } });
      BZ.log('buttons: ' + (bt.join(' | ') || 'none'));
      throw new Error('HindiDrama: no player found on this episode page (see the log below)');
    }
    const rank = { hls: 0, mp4: 1, embed: 2 };
    return out.sort((a, b) => rank[a.type] - rank[b.type]);
  }
});
