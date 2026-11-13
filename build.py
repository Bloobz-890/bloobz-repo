#!/usr/bin/env python3
"""Copy lib/extractors.js into every plugin that has the EXT markers."""
import re, glob
ext = open('lib/extractors.js').read().strip()
for p in glob.glob('plugins/*.js'):
    s = open(p).read()
    if '/*EXT-START*/' not in s: continue
    s = re.sub(r'/\*EXT-START\*/.*?/\*EXT-END\*/', lambda m: '/*EXT-START*/\n' + ext + '\n/*EXT-END*/', s, flags=re.S)
    open(p, 'w').write(s); print('updated', p)
