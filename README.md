# BlooBZ Repo

Provider plugins for the BlooBZ app. In the app: Settings > Repositories > add the link to this repo's `repo.json`.

Plugins live in `plugins/`. Each one is a single `.js` file (see `PLUGIN_FORMAT.md`).

## Video hosts
`lib/extractors.js` holds the shared video-host extractors (Dailymotion, ok.ru, Rumble, VK, Doodstream, StreamWish/Filemoon/Vtbe-style packed players, Mp4Upload, MixDrop). Their logic is ported from the CloudStream extractors (GPL-3.0, https://github.com/recloudstream/cloudstream), so this repository is distributed under GPL-3.0 as well. After editing that file run `python3 build.py` to copy it into the plugins.
