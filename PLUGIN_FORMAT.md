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
