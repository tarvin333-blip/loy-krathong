"""Gacha relic icons (PixelLab /create-image-pro-flash, transparent). Usage: python3 tools/relic_art.py <id>... -> tools/art/r_<id>_0.png"""
import sys, time, base64
sys.path.insert(0, 'tools')
from krathong_art import call, find_images, gens
BASE = ("a single fantasy game item icon, {d}, centered, isolated object, highly detailed pixel art with soft painterly shading, {r}, no background, no text, no frame")
RARE = {'R': "simple but charming, soft glow", 'SR': "polished and shiny with a blue magic glow", 'SSR': "ornate and precious with a strong purple magical aura and sparkles", 'UR': "legendary, extremely ornate and radiant, golden-red divine aura, sparkles and light rays"}
D = {
 'scale':  ('R',  "a shimmering silver fish scale charm on a red string"),
 'feather':('R',  "a dark blue crow feather tied with a small bell"),
 'fang':   ('SR', "a curved black serpent fang pendant with a glowing violet gem"),
 'shell':  ('SR', "a small black stone turtle shell amulet engraved with runes"),
 'eye':    ('SSR',"a green glowing cursed skull eye gem set in bone"),
 'drop':   ('SSR',"a teardrop of deep abyssal water in a crystal vial glowing cyan"),
 'crown':  ('UR', "the crimson demon king's spiked black crown wreathed in hellfire"),
 'lotus':  ('UR', "a radiant golden lotus heart blossom with a holy flame inside"),
 'nagascale': ('SSR', "a large iridescent emerald and gold Thai naga serpent scale engraved with ornate Thai patterns"),
 'nagaorb':   ('UR',  "a glowing sacred naga jewel orb, a luminous turquoise pearl held in the coils of a tiny golden Thai naga with a crested head"),
 'moonpin':   ('SR',  "an elegant silver Thai hairpin topped with a crescent moon and small pearls"),
 'moonlantern':('SSR',"a small glowing paper lantern shaped like a full moon with a white rabbit silhouette on it, soft silver light"),
 'asuraring': ('SR',  "a heavy black iron ring with a fierce red Thai yaksha demon face, embers glowing in its eyes"),
 'asurablade':('SSR', "a curved Thai demon sword with a black and gold hilt shaped like a yaksha head and a blade wreathed in red fire"),
 'garudafeather':('SSR',"a long majestic golden-red Garuda feather with glowing wind swirls around it"),
 'garudawheel':('UR', "a radiant golden divine chakra wheel weapon with blades, wind currents and a Garuda wing motif, holy light"),
}
if __name__ == '__main__':
    before = gens()
    for n in sys.argv[1:]:
        r0, d = D[n]
        r = call('POST', '/create-image-pro-flash', {'description': BASE.format(d=d, r=RARE[r0]), 'image_size': {'width': 128, 'height': 128}, 'no_background': True})
        if 'http_error' in r: print(n, 'ERROR', r, flush=True); continue
        job = r.get('background_job_id')
        while job:
            time.sleep(5); j = call('GET', f'/background-jobs/{job}')
            if j.get('status') in ('completed', 'failed', 'error', 'cancelled'): r = j; break
        imgs = find_images(r, [])
        for i, b in enumerate(imgs[:1]): open(f'tools/art/r_{n}_{i}.png', 'wb').write(base64.b64decode(b))
        print(n, 'images', len(imgs), flush=True)
    after = gens(); print('generations used', None if before is None or after is None else round(before - after, 2), 'left', after)
