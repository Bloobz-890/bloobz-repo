/* BlooBZ shared crypto helpers (small, no dependencies): MD5, HMAC-MD5, AES-128-CBC, UTF-8 and Base64 for byte arrays. */
const CRY = (() => {
  const utf8 = s => { const o = []; s = String(s); for (let i = 0; i < s.length; i++) { let c = s.charCodeAt(i); if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } } if (c < 0x80) { o.push(c); } else if (c < 0x800) { o.push(0xc0 | c >> 6, 0x80 | c & 63); } else if (c < 0x10000) { o.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63); } else { o.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63); } } return o; };
  const fromUtf8 = b => { let s = ''; for (let i = 0; i < b.length;) { const c = b[i++]; if (c < 0x80) { s += String.fromCharCode(c); } else if (c < 0xe0) { s += String.fromCharCode((c & 31) << 6 | b[i++] & 63); } else if (c < 0xf0) { s += String.fromCharCode((c & 15) << 12 | (b[i++] & 63) << 6 | b[i++] & 63); } else { const u = ((c & 7) << 18 | (b[i++] & 63) << 12 | (b[i++] & 63) << 6 | b[i++] & 63) - 0x10000; s += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023)); } } return s; };
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b64e = b => { let s = ''; for (let i = 0; i < b.length; i += 3) { const n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0); s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < b.length ? B64[n >> 6 & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '='); } return s; };
  const b64d = t => { t = String(t).replace(/[^A-Za-z0-9+/\-_]/g, '').replace(/-/g, '+').replace(/_/g, '/'); const o = []; for (let i = 0; i < t.length; i += 4) { const a = B64.indexOf(t[i]), b = B64.indexOf(t[i + 1]), c = i + 2 < t.length ? B64.indexOf(t[i + 2]) : -1, d = i + 3 < t.length ? B64.indexOf(t[i + 3]) : -1; o.push(a << 2 | b >> 4); if (c >= 0) { o.push((b & 15) << 4 | c >> 2); } if (d >= 0) { o.push((c & 3) << 6 | d); } } return o; };
  const hex = b => b.map(x => (x < 16 ? '0' : '') + x.toString(16)).join('');
  /* MD5 */
  const K = [], R = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) { K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0; }
  const md5 = bytes => {
    const m = bytes.slice(), n = m.length; m.push(0x80); while (m.length % 64 !== 56) { m.push(0); }
    const bits = n * 8; for (let i = 0; i < 8; i++) { m.push(i < 4 ? bits >>> (8 * i) & 255 : Math.floor(n / 536870912) >>> (8 * (i - 4)) & 255); }
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < m.length; o += 64) {
      const w = []; for (let i = 0; i < 16; i++) { w[i] = m[o + i * 4] | m[o + i * 4 + 1] << 8 | m[o + i * 4 + 2] << 16 | m[o + i * 4 + 3] << 24; }
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = b & c | ~b & d; g = i; } else if (i < 32) { f = d & b | ~d & c; g = (5 * i + 1) % 16; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = 7 * i % 16; }
        const t = d; d = c; c = b; const x = (a + f + K[i] + w[g]) | 0; b = (b + (x << R[i] | x >>> 32 - R[i])) | 0; a = t;
      }
      a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }
    const out = []; [a0, b0, c0, d0].forEach(v => { for (let i = 0; i < 4; i++) { out.push(v >>> (8 * i) & 255); } }); return out;
  };
  const hmacMd5 = (key, msg) => {
    if (key.length > 64) { key = md5(key); } key = key.concat(new Array(64 - key.length).fill(0));
    return md5(key.map(x => x ^ 0x5c).concat(md5(key.map(x => x ^ 0x36).concat(msg))));
  };
  /* AES-128 */
  const SB = [], IS = []; (() => { let p = 1, q = 1; do { p = p ^ (p << 1 & 255) ^ (p & 128 ? 27 : 0); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 128) { q ^= 9; } const x = q ^ (q << 1 | q >> 7) & 255 ^ (q << 2 | q >> 6) & 255 ^ (q << 3 | q >> 5) & 255 ^ (q << 4 | q >> 4) & 255; SB[p] = (x ^ 99) & 255; IS[(x ^ 99) & 255] = p; } while (p !== 1); SB[0] = 99; IS[99] = 0; })();
  const xt = x => (x << 1 ^ (x & 128 ? 27 : 0)) & 255;
  const mul = (a, b) => { let r = 0; while (b) { if (b & 1) { r ^= a; } a = xt(a); b >>= 1; } return r; };
  const expand = key => { const w = []; for (let i = 0; i < 16; i++) { w[i] = key[i]; } let rc = 1; for (let i = 16; i < 176; i += 4) { let t = w.slice(i - 4, i); if (i % 16 === 0) { t = [SB[t[1]] ^ rc, SB[t[2]], SB[t[3]], SB[t[0]]]; rc = xt(rc); } for (let j = 0; j < 4; j++) { w[i + j] = w[i - 16 + j] ^ t[j]; } } return w; };
  const encBlock = (s, w) => {
    s = s.map((x, i) => x ^ w[i]);
    for (let r = 1; r <= 10; r++) {
      s = s.map(x => SB[x]);
      const t = s.slice(); for (let c = 0; c < 4; c++) { for (let rw = 0; rw < 4; rw++) { s[c * 4 + rw] = t[((c + rw) % 4) * 4 + rw]; } }
      if (r < 10) { for (let c = 0; c < 4; c++) { const a = s.slice(c * 4, c * 4 + 4); s[c * 4] = xt(a[0]) ^ (xt(a[1]) ^ a[1]) ^ a[2] ^ a[3]; s[c * 4 + 1] = a[0] ^ xt(a[1]) ^ (xt(a[2]) ^ a[2]) ^ a[3]; s[c * 4 + 2] = a[0] ^ a[1] ^ xt(a[2]) ^ (xt(a[3]) ^ a[3]); s[c * 4 + 3] = (xt(a[0]) ^ a[0]) ^ a[1] ^ a[2] ^ xt(a[3]); } }
      s = s.map((x, i) => x ^ w[r * 16 + i]);
    }
    return s;
  };
  const decBlock = (s, w) => {
    s = s.map((x, i) => x ^ w[160 + i]);
    for (let r = 9; r >= 0; r--) {
      const t = s.slice(); for (let c = 0; c < 4; c++) { for (let rw = 0; rw < 4; rw++) { s[((c + rw) % 4) * 4 + rw] = t[c * 4 + rw]; } }
      s = s.map(x => IS[x]); s = s.map((x, i) => x ^ w[r * 16 + i]);
      if (r > 0) { for (let c = 0; c < 4; c++) { const a = s.slice(c * 4, c * 4 + 4); s[c * 4] = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9); s[c * 4 + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13); s[c * 4 + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11); s[c * 4 + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14); } }
    }
    return s;
  };
  /* data must already be a multiple of 16 bytes for aesCbcEnc (no padding added) */
  const aesCbcEnc = (data, key, iv) => { const w = expand(key), out = []; let prev = iv; for (let i = 0; i < data.length; i += 16) { prev = encBlock(data.slice(i, i + 16).map((x, j) => x ^ prev[j]), w); out.push(...prev); } return out; };
  const aesCbcDec = (data, key, iv, unpad) => { const w = expand(key), out = []; let prev = iv; for (let i = 0; i < data.length; i += 16) { const c = data.slice(i, i + 16); out.push(...decBlock(c.slice(), w).map((x, j) => x ^ prev[j])); prev = c; } if (unpad) { const n = out[out.length - 1]; if (n < 1 || n > 16) { throw new Error('bad padding'); } for (let k = 1; k <= n; k++) { if (out[out.length - k] !== n) { throw new Error('bad padding'); } } out.length -= n; } return out; };
  return { utf8, fromUtf8, b64e, b64d, hex, md5, hmacMd5, aesCbcEnc, aesCbcDec };
})();
