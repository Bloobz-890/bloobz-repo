#!/usr/bin/env python3
"""Build plugins/*.src.js (templates with /*CRY-START*//*CRY-END*/) into plugins/*.js with lib/crypto.js inserted."""
import glob, re
cry = open('lib/crypto.js').read().strip()
hls = open('lib/hls.js').read().strip()
for src in glob.glob('plugins/*.src.js'):
    s = open(src).read()
    s = re.sub(r'/\*CRY-START\*/.*?/\*CRY-END\*/', lambda m: '/*CRY-START*/\n' + cry + '\n/*CRY-END*/', s, flags=re.S)
    s = re.sub(r'/\*HLS-START\*/.*?/\*HLS-END\*/', lambda m: '/*HLS-START*/\n' + hls + '\n/*HLS-END*/', s, flags=re.S)
    out = src.replace('.src.js', '.js'); open(out, 'w').write(s); print('built', out)
