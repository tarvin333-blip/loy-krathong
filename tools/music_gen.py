"""Generate the site's background music with PixelLab /music (same flow as the owner's game).
The PixelLab key is injected by the session's network proxy; nothing secret lives in this file.
Run: python3 tools/music_gen.py   -> public/audio/{main,magic}_{1,2}.mp3 and tools/music.json
"""
import json, os, subprocess, time, urllib.request
API = 'https://api.pixellab.ai/v2'
def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer injected-by-proxy', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'http_error': e.code, 'body': e.read().decode()[:1500]}
SONGS = {
 'main': "Gentle fantasy orchestral theme for a Thai floating-lantern festival on a moonlit river, instrumental: a Thai khim hammered dulcimer and a ranat xylophone carry a warm pentatonic melody, a soft bamboo flute answers, harp arpeggios and lush string pads underneath, light small hand cymbals keep time, magical, romantic and peaceful, steady tempo for looping, ends on a soft resolved chord.",
 'magic': "Mystical fantasy theme for a secret enchanted moonlit lake with a crystal castle and a sacred serpent spirit, instrumental: shimmering celesta and glass bells play a slow pentatonic melody, a distant wordless choir pad swells and fades, deep cello and a low drone underneath like an ancient serpent breathing, airy harp glissandos, wondrous and mysterious but calm, steady tempo for looping, ends on a sustained ethereal chord.",
}
SONGS['battle'] = ("Energetic heroic fantasy JRPG battle theme, original composition, instrumental, fast 160 bpm: driving rock drums and punchy bass, "
    "aggressive electric guitar riffs layered with soaring orchestral strings and staccato brass, a bright violin lead melody with a subtle Thai pentatonic flavor, "
    "rhythmic synth arpeggios, dramatic build-ups and a triumphant catchy hook, seamless loop")
SONGS['boss'] = ("Epic intense boss battle theme for a dark fantasy RPG, original composition, instrumental, 150 bpm: thundering taiko and rock drums, "
    "heavy distorted electric guitars, a massive orchestra with dark brass stabs and frantic strings, an ominous wordless choir chanting powerful 'ah' and 'oh' syllables, "
    "pipe organ swells, urgent tension, heroic climax, seamless loop")
import sys
if len(sys.argv) > 1: SONGS = {k: v for k, v in SONGS.items() if k in sys.argv[1:]}
os.makedirs('public/audio', exist_ok=True)
log = []
pending = {}
for name, style in SONGS.items():
    r = call('POST', '/music', {'style': style, 'instrumental': True, 'length_s': 100, 'name': 'loykrathong_' + name, 'exclude': 'vocals, singing, lyrics'})
    if 'http_error' in r: print(name, 'ERROR', r, flush=True); continue
    ids = r.get('song_ids') or [s.get('id') for s in r.get('songs', [])] or [r.get('id')]
    pending[name] = [i for i in ids if i]
    print(name, 'submitted', pending[name], flush=True)
done = {}
for _ in range(60):
    if all(len(done.get(n, [])) == len(ids) for n, ids in pending.items()): break
    time.sleep(10)
    for name, ids in pending.items():
        for k, sid in enumerate(ids):
            if (name, k) in [(n, kk) for n, lst in done.items() for kk, _ in lst]: continue
            j = call('GET', f'/music/{sid}'); s = j.get('song', j)
            if s.get('audio_url'):
                src = f'/tmp/{name}_{k + 1}_src.mp3'
                open(src, 'wb').write(urllib.request.urlopen(urllib.request.Request(s['audio_url'], headers={'User-Agent': 'curl/8'}), timeout=180).read())
                out = f'public/audio/{name}_{k + 1}.mp3'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-b:a', '112k', out], check=True)
                done.setdefault(name, []).append((k, out)); log.append({k2: s.get(k2) for k2 in ('id', 'name', 'duration_ms', 'style', 'created_at')})
                print(name, 'take', k + 1, 'ok', s.get('duration_ms'), 'ms ->', out, flush=True)
            elif s.get('status') in ('failed', 'error'):
                print(name, 'take', k + 1, 'FAILED', json.dumps(s)[:300], flush=True); done.setdefault(name, []).append((k, None))
old = json.load(open('tools/music.json')) if os.path.exists('tools/music.json') else []
json.dump(old + log, open('tools/music.json', 'w'), ensure_ascii=False, indent=1)
print('done', {n: [o for _, o in v] for n, v in done.items()})
