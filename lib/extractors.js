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
  json(t) { try { return JSON.parse(String(t || '').trim()); } catch (e) { return null; } },

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
      if ((m = src.match(/dailymotion\.com\/(?:embed\/)?video\/([a-z0-9]+)/i) || src.match(/geo\.dailymotion\.com\/player.*video=([a-z0-9]+)/i) || src.match(/dai\.ly\/([a-z0-9]+)/i))) { return await this.dailymotion(m[1], name); }
      if (/ok\.ru|odnoklassniki\.ru/i.test(src)) { return await this.okru(src, name); }
      if ((m = src.match(/rumble\.com\/embed\/(v[a-z0-9]+)/i))) { return await this.rumble(m[1], name); }
      if (/vkvideo\.ru|vk\.com\/video/i.test(src)) { return await this.vk(src, name); }
      if (this.DOOD.test(src)) { return await this.doodFull(src, name, referer); }
    } catch (e) { BZ.log('extract ' + name + ': ' + (e && e.message || e)); }
    return [];
  },

  async dailymotion(id, name) {
    const embed = 'https://www.dailymotion.com/embed/video/' + id;
    const r = await BZ.get('https://www.dailymotion.com/player/metadata/video/' + id, { referer: embed, ua: this.PUA });
    const j = this.json(r.body); if (!j) { BZ.log('dailymotion: not json (' + r.status + ')'); return []; }
    const subs = [];
    try { Object.keys((j.subtitles && j.subtitles.data) || {}).forEach(k => { const s = j.subtitles.data[k]; (s.urls || []).forEach(u => subs.push({ lang: s.label || k, url: u })); }); } catch (e) {}
    const out = [];
    ((j.qualities && j.qualities.auto) || []).forEach(q => { if (q.url && /\.m3u8/.test(q.url)) { out.push({ name, url: q.url, type: 'hls', subs, headers: { ua: this.PUA } }); } });
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
    const j = this.json(r.body); if (!j) { BZ.log('rumble: not json (' + r.status + ')'); return []; }
    const ua = j.ua || {}, hd = { referer: 'https://rumble.com/' }, out = [];
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
