"""Collect the VFX sheets the battle uses into public/img/vfx/ + vfx.json.
Library sheets come from the owner's bara-duel game (web/art/vfx); lotus/fish/rainbow/meteor were made for this site (tools/vfxgen)."""
import json, shutil, sys, os
from PIL import Image
LIB = sys.argv[1] if len(sys.argv) > 1 else '/tmp/vfxlib'
USE_LIB = ['crescent', 'formation', 'barrier2', 'barrier', 'firstaid', 'evade', 'comfort', 'whirl', 'toxic', 'holyhand', 'leaves', 'crossclaw', 'crit', 'steam']
os.makedirs('public/img/vfx', exist_ok=True)
libmeta = json.load(open(f'{LIB}/vfx.json')); out = {}
for n in USE_LIB:
    m = libmeta[n]; shutil.copy(f'{LIB}/{n}.png', f'public/img/vfx/{n}.png')
    out[n] = {'w': m['w'], 'h': m['h'], 'n': m['n'], 'fps': m['fps']}
for n in ['lotus', 'fish', 'rainbow', 'meteor', 'impact']:
    m = json.load(open(f'tools/vfxgen/{n}.meta.json'))['meta']
    Image.open(f'tools/vfxgen/{n}.png').save(f'public/img/vfx/{n}.png', optimize=True)
    out[n] = {'w': m['canvas']['w'], 'h': m['canvas']['h'], 'n': m['frames'], 'fps': m['fps']}
json.dump(out, open('public/img/vfx/vfx.json', 'w'), separators=(',', ':'))
print(json.dumps(out, separators=(',', ':')))
