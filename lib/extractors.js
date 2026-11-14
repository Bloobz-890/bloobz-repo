/* BlooBZ shared video-host extractors.
   Logic ported from the CloudStream extractors (GPL-3.0, https://github.com/recloudstream/cloudstream).
   Edit this file, then run `python3 build.py` to copy it into every plugin. */
const EX = {
  UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
  /* the user-agent the phone uses for its own requests; Dailymotion signs the playlist link, so the player must send the same one */
  PUA: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  fix(b) { b = String(b || ''); return /<[a-z][a-z0-9]*\+[a-z-]+=/i.test(b) ? b.replace(/\+/g, ' ') : b; },
  host(u) { try { return new URL(u).origin; } catch (e) { return ''; } },
  type(u) { return /\.(m3u8|txt)(\?|$)/i.test(u) || /master\.txt/i.test(u) ? 'hls' : 'mp4'; },
  clean(u) { return String(u || '').replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&'); },
  /* episode list of an AnimeStream series page: real episode numbers (never the list index), ascending, plus the "latest/first episode" buttons the list can miss */
  eplist(d, base) {
    const out = [], seen = {};
    const num = (t, h) => {
      let m = String(t || '').match(/(?:eps?|episode)\.?\s*(\d+(?:\.\d+)?)/i) || String(h || '').match(/-(?:episode|ep)-(\d+(?:\.\d+)?)/i) || String(t || '').match(/^\s*(\d+(?:\.\d+)?)\s*$/);
      return m ? m[1] : '';
    };
    const add = (a, t, li) => {
      if (!a) { return; }
      const href = a.getAttribute('href'); if (!href) { return; }
      const id = new URL(href, base).pathname; if (seen[id]) { return; }
      const n = num((li && (li.querySelector('.epl-num') || {}).textContent) || t, href) || num(t, href);
      seen[id] = 1; out.push({ id, number: n, title: ((li && (li.querySelector('.epl-title') || {}).textContent) || '').trim() });
    };
    d.querySelectorAll('.eplister li').forEach(li => add(li.querySelector('a'), (li.querySelector('a') || {}).textContent, li));
    if (out.length) { d.querySelectorAll('.lastend a[href], .inepcx a[href]').forEach(a => add(a, a.textContent)); }
    out.forEach((e, i) => { if (e.number === '') { e.number = String(out.length - i); } });
    /* same number twice: keep the first (the site lists newest first); a "part 2" style page stays as N.5, other copies are dead/duplicate pages */
    const asc = out.slice().sort((x, y) => (parseFloat(x.number) || 0) - (parseFloat(y.number) || 0)), keep = [], drop = [], have = {};
    asc.forEach(e => {
      if (!have[e.number]) { have[e.number] = 1; keep.push(e); return; }
      if (/part|[-/]pt-?\d|-v2|-final/i.test(e.id)) { let n = parseFloat(e.number) + 0.5; while (have[String(n)]) { n += 0.1; } e.number = String(Math.round(n * 10) / 10); have[e.number] = 1; keep.push(e); } else { drop.push(e.number + ' ' + e.id.slice(-30)); }
    });
    keep.sort((x, y) => parseFloat(x.number) - parseFloat(y.number));
    if (drop.length) { try { BZ.log('episodes duplicate dropped: ' + drop.join(' | ')); } catch (e) {} }
    const srt = keep;
    try { BZ.log('episodes: ' + srt.length + ' (' + (srt[0] || {}).number + ' .. ' + (srt[srt.length - 1] || {}).number + '), lastend=' + (((d.querySelector('.lastend a') || {}).getAttribute || (() => ''))).call(d.querySelector('.lastend a') || {}, 'href') + ', page=' + (d.documentElement ? d.documentElement.outerHTML.length : 0) + 'b'); } catch (e) {}
    return srt;
  },
  /* the series page can lag behind: walk the "next episode" links from the newest listed episode */
  async more(eps, P) {
    try {
      if (!eps.length) { return eps; }
      const seen = {}; eps.forEach(e => { seen[e.id] = 1; });
      let cur = eps[eps.length - 1], n = parseFloat(cur.number) || eps.length;
      for (let k = 0; k < 6; k++) {
        const d = await P.get(cur.id);
        const a = d.querySelector('a[rel="next"][href], .naveps .rght a[href], .nvs.rght a[href]');
        const href = a && a.getAttribute('href');
        if (!href || href === '#' || /\/anime\/?$/.test(href)) { break; }
        const id = new URL(href, P.base).pathname; if (seen[id] || id === '/') { break; }
        const m = id.match(/-(?:episode|ep)-(\d+(?:\.\d+)?)/i);
        n = m && parseFloat(m[1]) > n ? parseFloat(m[1]) : n + 1;
        seen[id] = 1; cur = { id, number: String(n), title: '' }; eps.push(cur);
        BZ.log('latest episode found by next-link: ' + n);
      }
    } catch (e) { BZ.log('next-link: ' + e.message); }
    return eps;
  },

  /* JSON, also when a browser wrapped it in <html><pre>..</pre> (hidden-browser fallback) */
  json(t) {
    t = String(t || '').trim();
    try { return JSON.parse(t); } catch (e) {}
    if (t[0] === '<') {
      const x = t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const i = x.indexOf('{'), k = x.lastIndexOf('}');
      if (i >= 0 && k > i) { try { return JSON.parse(x.slice(i, k + 1)); } catch (e) {} }
    }
    return null;
  },

  /* Dean Edwards packer (pure string work, no eval). Unpacks every packed script found in the page. */
  unpack(html) {
    let out = '';
    const re = /\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/g;
    let m;
    while ((m = re.exec(html))) {
      let p = m[1].replace(/\\'/g, "'"), a = parseInt(m[2], 10), c = parseInt(m[3], 10);
      const k = m[4].split('|');
      const enc = n => (n < a ? '' : enc(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
      const d = {};
      while (c--) { d[enc(c)] = k[c] || enc(c); }
      out += '\n' + p.replace(/\b\w+\b/g, w => (d[w] !== undefined ? d[w] : w));
    }
    return out;
  },

  /* JWPlayer style: sources:[{file:"..."}] , falling back to any .m3u8 / master.txt string */
  jw(text) {
    const urls = [];
    const sm = text.match(/"?sources"?\s*:\s*(\[[\s\S]*?\])/);
    if (sm) { const re = /"?file"?\s*:\s*"([^"]+)"/g; let m; while ((m = re.exec(sm[1]))) { urls.push(this.clean(m[1])); } }
    if (!urls.length) { const re = /[:=]\s*"([^"\s]+(?:\.m3u8|master\.txt)[^"\s]*)/g; let m; while ((m = re.exec(text))) { urls.push(this.clean(m[1])); } }
    const subs = [];
    const tm = text.match(/"?tracks"?\s*:\s*(\[[\s\S]*?\])/);
    if (tm) { const re = /\{[^{}]*\}/g; let m; while ((m = re.exec(tm[1]))) { const f = m[0].match(/"?file"?\s*:\s*"([^"]+)"/), l = m[0].match(/"?label"?\s*:\s*"([^"]*)"/); if (f && /\.(vtt|srt)/i.test(f[1])) { subs.push({ lang: l ? l[1] : 'Sub', url: this.clean(f[1]) }); } } }
    return { urls: urls.filter((u, i) => urls.indexOf(u) === i), subs };
  },

  /* the only servers we use (same as the CloudStream plugins): Dailymotion / GeoDailymotion, Rumble, ok.ru, Doodstream family */
  DOOD: /(?:^|\/\/|\.)(?:dood[a-z0-9]*|d0+d|d000d|ds2(?:play|video)|dsvplay|vide0|vvide0|myvidplay|playmogo|do[o0]+d)\.[a-z]{2,}/i,
  allowed(src) { return /dailymotion\.com|ok\.ru|odnoklassniki\.ru|rumble\.com/i.test(src) || this.DOOD.test(src); },

  async resolve(src, name, referer) {
    referer = referer || '';
    try {
      src = String(src || '');
      if (src.indexOf('//') === 0) { src = 'https:' + src; }
      let m;
      if ((m = src.match(/dailymotion\.com\/(?:embed\/)?video\/([a-z0-9]+)/i) || src.match(/geo\.dailymotion\.com\/player.*video=([a-z0-9]+)/i) || src.match(/dai\.ly\/([a-z0-9]+)/i))) { return await this.dailymotion(m[1], name, /geo\.dailymotion/i.test(src)); }
      if (/ok\.ru|odnoklassniki\.ru/i.test(src)) { return await this.okru(src, name); }
      if ((m = src.match(/rumble\.com\/embed\/(v[a-z0-9]+)/i))) { return await this.rumble(m[1], name); }
      if (/vkvideo\.ru|vk\.com\/video/i.test(src)) { return await this.vk(src, name); }
      if (this.DOOD.test(src)) { return await this.doodFull(src, name, referer); }
    } catch (e) { BZ.log('extract ' + name + ': ' + (e && e.message || e)); }
    return [];
  },

  API: 'https://ani-api-x9f0.onrender.com',
  /* fetch through our own server (clean datacenter request, no browser quirks); never throws */
  async srv(url, o) { try { return await (BZ.server ? BZ.server(url, o || {}) : BZ.get(url, o || {})); } catch (e) { return { status: 0, body: '' }; } },

  async dailymotion(id, name, geo) {
    const embed = 'https://www.dailymotion.com/embed/video/' + id;
    const mu = 'https://www.dailymotion.com/player/metadata/video/' + id;
    /* 1) all through our server: metadata + playlist come from one IP, and the player gets a rewritten playlist */
    try {
      const sr = await this.srv(mu, { referer: embed });
      const sj = this.json(sr.body), su = sj && sj.qualities && sj.qualities.auto && (sj.qualities.auto.filter(q => q.url && /\.m3u8/.test(q.url))[0] || {}).url;
      if (su) {
        const mr = await this.srv(su, { referer: embed });
        const ok = String(mr.body || '').indexOf('#EXTM3U') === 0;
        BZ.log('dailymotion via server: manifest ' + mr.status + (ok ? ' ok' : ' not a playlist: ' + String(mr.body || '').slice(0, 50).replace(/\s+/g, ' ')));
        if (ok) {
          const subs0 = [];
          try { Object.keys((sj.subtitles && sj.subtitles.data) || {}).forEach(k => { const s2 = sj.subtitles.data[k]; (s2.urls || []).forEach(u => subs0.push({ lang: s2.label || k, url: u })); }); } catch (e) {}
          return [{ name, url: this.API + '/proxy?url=' + encodeURIComponent(su) + '&referer=' + encodeURIComponent(embed), type: 'hls', subs: subs0, headers: { ua: this.PUA } }];
        }
      } else { BZ.log('dailymotion via server: no m3u8 (' + sr.status + ')'); }
    } catch (e) { BZ.log('dailymotion via server: ' + e.message); }
    /* 2) fallback: from the phone */
    const r = await BZ.get(mu, { referer: embed, ua: this.PUA });
    const j = this.json(r.body); if (!j) { BZ.log('dailymotion: not json (' + r.status + ')'); return []; }
    const subs = [];
    try { Object.keys((j.subtitles && j.subtitles.data) || {}).forEach(k => { const s = j.subtitles.data[k]; (s.urls || []).forEach(u => subs.push({ lang: s.label || k, url: u })); }); } catch (e) {}
    const out = [];
    ((j.qualities && j.qualities.auto) || []).forEach(q => { if (q.url && /\.m3u8/.test(q.url)) { out.push({ name, url: q.url, type: 'hls', subs, headers: { ua: this.PUA } }); /* like CloudStream: no Referer/Origin on the manifest */ } });
    /* check the manifest from the phone too, so the Test log shows why a native player would fail */
    if (out.length) {
      try {
        const mr = await BZ.get(out[0].url, { referer: embed, ua: this.PUA });
        const mb = String(mr.body || '');
        BZ.log('dailymotion manifest: status ' + mr.status + ', ' + (mb.indexOf('#EXTM3U') === 0 ? 'ok, ' + (mb.match(/#EXT-X-STREAM-INF/g) || []).length + ' qualities' : 'not a playlist: ' + mb.slice(0, 60).replace(/\s+/g, ' ')));
      } catch (e) { BZ.log('dailymotion manifest: ' + e.message); }
      BZ.log('dailymotion link: ' + out[0].url.slice(0, 90));
    }
    if (!out.length) { BZ.log('dailymotion: no m3u8 (' + Object.keys(j).join(',') + (j.error ? ', ' + (j.error.title || j.error.message || '') : '') + ')'); }
    return out;
  },

  async okru(src, name) {
    const embed = src.replace(/\/video\//, '/videoembed/').replace(/\/videoembed\/(\d+).*/, '/videoembed/$1?nochat=1');
    const r = await BZ.get(embed, { referer: 'https://ok.ru/' });
    let body = this.fix(r.body);
    const out = [], hd = { referer: 'https://ok.ru/', origin: 'https://ok.ru' };
    const o = body.match(/data-options="([^"]+)"/i);
    if (o) {
      try {
        const opt = JSON.parse(o[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
        let md = opt.flashvars && opt.flashvars.metadata; if (typeof md === 'string') { md = JSON.parse(md); }
        md = md || {};
        const h = md.hlsManifestUrl || md.hlsMasterPlaylistUrl || md.ondemandHls;
        if (h) { out.push({ name, url: h, type: 'hls', headers: hd }); }
      } catch (e) { BZ.log('ok.ru options: ' + e.message); }
    }
    if (!out.length) {
      body = body.replace(/\\&quot;/g, '"').replace(/\\\\/g, '\\').replace(/\\u([0-9A-Fa-f]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16)));
      const vm = body.match(/"videos":(\[[^\]]*\])/);
      const vs = vm ? this.json(vm[1]) : null;
      const q = { MOBILE: '144p', LOWEST: '240p', LOW: '360p', SD: '480p', HD: '720p', FULL: '1080p', QUAD: '1440p', ULTRA: '4k' };
      (vs || []).slice().reverse().forEach(v => { if (v && v.url) { out.push({ name: name + ' ' + (q[String(v.name).toUpperCase()] || v.name), url: v.url.indexOf('//') === 0 ? 'https:' + v.url : v.url, type: 'mp4', quality: q[String(v.name).toUpperCase()] || '', headers: hd }); } });
    }
    if (!out.length) { BZ.log('ok.ru: nothing found (' + body.length + ' chars)'); }
    return out;
  },

  async rumble(id, name) {
    const r = await BZ.get('https://rumble.com/embedJS/u3/?request=video&ver=2&v=' + id, { referer: 'https://rumble.com/' });
    let j = this.json(r.body);
    const hd = { referer: 'https://rumble.com/' }, out = [];
    if (!j || !j.ua) {
      const sr = await this.srv('https://rumble.com/embedJS/u3/?request=video&ver=2&v=' + id, { referer: 'https://rumble.com/' });
      const sj = this.json(sr.body);
      BZ.log('rumble via server: ' + sr.status + (sj && sj.ua ? ' ok' : ' ' + String(sr.body || '').slice(0, 50).replace(/\s+/g, ' ')));
      if (sj && sj.ua) { j = sj; }
    }
    if (!j || !j.ua) {
      BZ.log('rumble: embedJS gave ' + r.status + ' ' + String(r.body || '').slice(0, 70).replace(/\s+/g, ' ') + ' - trying the embed page');
      const pr = await BZ.get('https://rumble.com/embed/' + id + '/', { referer: 'https://rumble.com/' });
      const pb = String(pr.body || '').replace(/\\\//g, '/');
      const seen = {};
      const re = /"url"\s*:\s*"(https?:\/\/[^"]+?\.(?:mp4|m3u8)[^"]*)"([^{}]{0,200})/g; let mm;
      while ((mm = re.exec(pb))) {
        const u = mm[1]; if (seen[u]) { continue; } seen[u] = 1;
        const h = (mm[2].match(/"h"\s*:\s*(\d{3,4})/) || [])[1];
        out.push({ name: name + (h ? ' ' + h + 'p' : ''), url: u, type: /\.m3u8/.test(u) ? 'hls' : 'mp4', headers: hd, h: parseInt(h) || 0 });
      }
      out.sort((x, y) => (y.type === 'mp4') - (x.type === 'mp4') || y.h - x.h);
      if (!out.length) { BZ.log('rumble: embed page ' + pr.status + ', ' + pb.length + ' chars, no video link'); }
      return out;
    }
    const ua = j.ua || {};
    /* every mp4 quality (best first, e.g. 2160p / 1440p / 1080p), plus the adaptive HLS */
    const mp4 = [];
    Object.keys(ua.mp4 || {}).filter(k => ua.mp4[k] && ua.mp4[k].url).forEach(k => {
      const m = ua.mp4[k].meta || {}, h = parseInt(m.h) || parseInt(k) || 0;
      mp4.push({ h, name: name + ' ' + (h || k) + 'p', url: ua.mp4[k].url, type: 'mp4', quality: (h || k) + 'p', headers: hd });
    });
    if (!mp4.length && j.u && j.u.mp4 && j.u.mp4.url) { mp4.push({ h: 0, name, url: j.u.mp4.url, type: 'mp4', headers: hd }); }
    mp4.sort((x, y) => y.h - x.h);
    let hls = (ua.hls && ua.hls.auto && ua.hls.auto.url) || (j.u && j.u.hls && j.u.hls.url) || '';
    if (/\/hls-vod\//.test(hls) && /playlist\.m3u8/.test(hls) && hls.indexOf('?') < 0) { hls += '?u=0&b=0'; }
    if (mp4.length) { out.push(mp4[0]); }
    if (hls) { out.push({ name: name + ' Auto', url: hls, type: 'hls', headers: hd }); }
    mp4.slice(1).forEach(x => out.push(x));
    if (!out.length) { BZ.log('rumble: no link (' + Object.keys(j).join(',') + ')'); }
    return out;
  },

  async vk(src, name) {
    const r = await BZ.get(src, { referer: 'https://vkvideo.ru/', ua: this.UA });
    const body = String(r.body || '');
    const hd = { referer: 'https://vkvideo.ru/', ua: this.UA }, out = [];
    let m; const re = /"url([0-9]+)":"([^"]*)"/gi;
    while ((m = re.exec(body))) { out.push({ name: name + ' ' + m[1] + 'p', url: m[2].replace(/\\/g, ''), type: 'mp4', quality: m[1] + 'p', headers: hd }); }
    out.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    const h = body.match(/"hls":"([^"]*)"/i);
    if (h) { out.unshift({ name, url: h[1].replace(/\\/g, ''), type: 'hls', headers: hd }); }
    if (!out.length) { BZ.log('vk: nothing found (' + body.length + ' chars)'); }
    return out;
  },

  /* Doodstream family: embed page -> /pass_md5/ token -> direct mp4 */
  async doodFull(src, name, referer) {
    const embed = src.replace('/d/', '/e/');
    const r = await BZ.get(embed, { referer: referer ? referer + '/' : this.host(embed) + '/' });
    const out = await this.dood(embed, name, this.fix(r.body));
    if (!out) { BZ.log('dood: no pass_md5 on ' + this.host(embed) + ' (' + String(r.body || '').length + ' chars)'); }
    return out || [];
  },

  async dood(src, name, body0) {
    const embed = src.replace('/d/', '/e/'), host = this.host(embed);
    const md = body0.match(/\/pass_md5\/[^']*/);
    if (!md) { return null; }
    const r = await BZ.get(host + md[0], { referer: embed });
    const al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let rnd = ''; for (let i = 0; i < 10; i++) { rnd += al[Math.floor(Math.random() * al.length)]; }
    const u = String(r.body || '').trim() + rnd + '?token=' + md[0].split('/').pop() + '&expiry=' + Date.now();
    if (!/^https?:/i.test(u)) { BZ.log('dood: bad link'); return []; }
    return [{ name, url: u, type: 'mp4', headers: { referer: host + '/' } }];
  },

  /* StreamWish / Filemoon / Vtbe / VidHide / Mp4Upload / MixDrop / Dood and other generic players */
  async packed(src, name, referer) {
    if (!/^https?:/i.test(src)) { return []; }
    let page = src.replace(/(streamwish[^/]*|wish[^/]*)\/f\//i, '$1/');
    let host = this.host(src);
    let r = await BZ.get(page, { referer: referer ? referer + '/' : host + '/' });
    let body = this.fix(r.body);
    if (/\/pass_md5\//.test(body)) { return (await this.dood(src, name, body)) || []; }
    const fi = body.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (fi && !/\.(m3u8|mp4)/.test(body) && !/p,a,c,k,e,d/.test(body)) {
      const ifr = new URL(this.clean(fi[1]), page).href;
      r = await BZ.get(ifr, { referer: page });
      body = this.fix(r.body); host = this.host(ifr) || host;
    }
    const pool = body + '\n' + this.unpack(body);
    const hd = { referer: this.host(src) + '/', origin: this.host(src) };
    const jw = this.jw(pool);
    const out = jw.urls.filter(u => /^(https?:)?\/\//i.test(u) || u[0] === '/').map(u => ({ name, url: u.indexOf('//') === 0 ? 'https:' + u : (u[0] === '/' ? host + u : u), type: this.type(u), headers: hd, subs: jw.subs }));
    if (!out.length) {
      const mp4 = pool.match(/player\.src\(\s*(?:\{[\s\S]*?src:\s*)?"([^"]+)"/) || pool.match(/wurl[\s\S]{0,20}?=\s*"([^"]+)";/);
      if (mp4) { const u = mp4[1].indexOf('//') === 0 ? 'https:' + mp4[1] : mp4[1]; out.push({ name, url: u, type: this.type(u), headers: hd }); }
    }
    if (!out.length) {
      const any = (pool.replace(/\\\//g, '/').match(/https?:\/\/[^'"\s<>\\]+\.m3u8[^'"\s<>\\]*/) || pool.replace(/\\\//g, '/').match(/https?:\/\/[^'"\s<>\\]+\.mp4[^'"\s<>\\]*/) || [])[0];
      if (any) { out.push({ name, url: any, type: this.type(any), headers: hd }); }
    }
    if (!out.length) { BZ.log('player ' + host + ': no video link (' + body.length + ' chars)'); }
    return out;
  }
};
