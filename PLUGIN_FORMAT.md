# BlooBZ plugin format (v1)

A plugin is one `.js` file. It runs inside the BlooBZ page and calls `BZ.register({...})` once.

```js
BZ.register({
  id: 'animexin',          // unique, lowercase
  name: 'Animexin',
  version: 1,
  base: 'https://example.com',   // site address, changeable in one place

  // each function returns a Promise
  home(page)            // -> { rows: [ { title, items:[card] } ] }
  search(query, page)   // -> [card]
  details(id)           // -> { title, poster, description, genres:[], episodes:[{ id, number, title }] }
  streams(episodeId)    // -> [ stream ]
});
```

card   = `{ id, title, poster, badge? }`
stream = `{ name, url, type:'hls'|'mp4'|'embed', quality?, headers?:{ referer, origin }, subs?:[{ lang, url }] }`

`type:'embed'` opens the page in the web player, `hls`/`mp4` play in the native player.

## Helpers available as `BZ`
- `BZ.get(url, opts)` -> `{ status, url, body }` fetched through the BlooBZ API (adds headers, avoids CORS). `opts`: `referer`, `origin`, `ua`, `cookie`, `method`, `body`.
- `BZ.html(text)` -> a parsed `Document`.
- `BZ.json(text)` -> parsed object.
- `BZ.abs(url, base)` -> absolute URL.
- `BZ.log(msg)` -> shown in Settings > Repositories > plugin log.

## Plugin settings (app v39+)
A plugin can offer a Settings button (Settings > Repositories) by defining `settings` (an array or a getter):
```js
get settings() { return [
  { key: 'host', title: 'API host', type: 'choice', options: [{ v: '', label: 'Auto' }, { v: 'https://a.example', label: 'a.example' }] },
  { key: 'sections', title: 'Home sections', type: 'sections', items: ['Latest', 'Top'] }   // show / hide / reorder
]; }
```
Read the values with `BZ.pref('<plugin id>', key, default)`. A `sections` value is `{ order: [...], hidden: [...] }`.

## What a stream can carry (app 5.1 and newer)

A stream returned by `streams()` is `{ name, url, type, quality, headers, cookie, subs }`.

- `type`: `hls`, `mp4`, `dash` (a .mpd manifest, for example separate audio languages) or `embed` (a web player page).
- `headers`: `referer`, `origin` and `ua` are sent as they are. Any other key, or any key inside `headers.extra`, is sent with every request the player makes (for example `Authorization`, `X-Token`).
- `cookie`: a cookie header value, sent with every request.
- `subs`: a list of `{ lang, url }` or `{ lang, text }`. `text` may be WebVTT, SRT or ASS; the app saves it with the right ending. Give readable language names such as "English".
- A plugin can check what the installed app supports with `window.BZ_CAPS` (`dash`, `textSubs`, `extraHeaders`, `cookie`, `embed`). An older app has no `BZ_CAPS`, so test for it before using a newer option.

New sources only need a new file in `plugins/` and a line in `repo.json`; the app does not have to be rebuilt.
