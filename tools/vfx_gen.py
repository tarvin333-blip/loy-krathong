"""PixelLab VFX helper (same flow as the owner's game). Key comes from the session proxy.
Usage: python3 tools/vfx_gen.py <name> "<description>"   -> tools/vfxgen/<name>.* and prints the cost."""
import json, os, sys, time, urllib.request
sys.path.insert(0, 'tools')
from krathong_art import call, gens
OUT = 'tools/vfxgen'
def fetch(url, path):
    open(path, 'wb').write(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'curl/8'}), timeout=120).read())
def make(name, desc, artist='lite'):
    before = gens()
    r = call('POST', '/vfx', {'description': desc, 'artist': artist, 'name': 'lk_' + name})
    if 'http_error' in r: print('ERROR', r); return
    job = r.get('background_job_id'); print(name, 'quote', r.get('quoted_generations'), flush=True)
    while True:
        time.sleep(8); j = call('GET', f'/background-jobs/{job}')
        if j.get('status') in ('completed', 'failed', 'error', 'cancelled'): break
    if j.get('status') != 'completed': print('JOB', json.dumps(j)[:600]); return
    lr = j['last_response']; files = lr.get('files') or {}
    meta = {k: lr.get(k) for k in ('effect_id', 'canvas', 'frames', 'fps', 'loop', 'anchor')}
    json.dump({'meta': meta, 'files': files}, open(f'{OUT}/{name}.meta.json', 'w'), ensure_ascii=False, indent=1)
    items = files.items() if isinstance(files, dict) else [(f.get('name', str(i)), f.get('url')) for i, f in enumerate(files)]
    for fname, url in items:
        if isinstance(url, dict): url = url.get('url')
        if not url or fname.endswith('.zip'): continue
        tag = 'normals.png' if 'normals' in fname else fname.split('.')[-1]
        fetch(url, f'{OUT}/{name}.{tag}')
    time.sleep(2); print(name, 'done; gens used', round(before - gens(), 2), '| canvas', meta['canvas'], 'frames', meta['frames'], 'fps', meta['fps'], '| files', [k for k, _ in items])
if __name__ == '__main__': make(sys.argv[1], sys.argv[2])
