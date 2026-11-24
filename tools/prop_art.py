"""Scene props as PixelLab pixel-art sprites (transparent), matching the krathong sprites.
Usage: python3 tools/prop_art.py <name> [<name> ...]  -> tools/art/<name>_0.png"""
import sys, time, base64
sys.path.insert(0, 'tools')
from krathong_art import call, find_images, gens
STYLE = ", isolated object, highly detailed pixel art with soft painterly shading, night scene lighting, no background, no text"
PROPS = {
 'lantern': ((64, 80), "a single Thai Yi Peng sky lantern (khom loi) floating upward, glowing warm orange paper cylinder with thin bamboo ribs and a small bright flame at the open bottom, soft inner glow"),
 'fish':    ((80, 48), "a single orange and white koi carp fish leaping sideways out of water, side view facing right, glossy scales, a few water droplets"),
 'pad':     ((112, 64), "a single flat round green lotus leaf floating on water seen from a low three-quarter angle, with a small notch, subtle veins, moonlit sheen"),
 'bud':     ((112, 96), "a single green lotus leaf floating flat with one closed pink lotus bud standing on a short stem in the middle, seen from a low three-quarter angle"),
 'bloom':   ((112, 104), "a single green lotus leaf floating flat with one fully open pink and white lotus flower in the middle with a golden center, seen from a low three-quarter angle"),
 'boat':    ((224, 96), "a long Thai river dinner cruise boat at night seen from the side, dark wooden hull, rows of warm glowing windows, strings of colorful fairy lights along the roof, small Thai-style roof ornaments"),
 'otter':   ((112, 128), "a cute chibi otter wizard standing upright facing the viewer, brown fur with cream belly and face, happy open-mouth smile, wearing a big dark purple witch hat with a gold crescent moon and a gold star emblem and a purple bow, a short black cape with lavender trim and a purple gem brooch, holding a twisted wooden staff topped with a glowing purple crystal orb"),
}
if __name__ == '__main__':
    before = gens()
    for n in sys.argv[1:]:
        (w, h), d = PROPS[n]
        r = call('POST', '/create-image-pro-flash', {'description': d + STYLE, 'image_size': {'width': w, 'height': h}, 'no_background': True})
        if 'http_error' in r: print(n, 'ERROR', r, flush=True); continue
        job = r.get('background_job_id')
        while job:
            time.sleep(5); j = call('GET', f'/background-jobs/{job}')
            if j.get('status') in ('completed', 'failed', 'error', 'cancelled'): r = j; break
        imgs = find_images(r, [])
        for i, b in enumerate(imgs): open(f'tools/art/{n}_{i}.png', 'wb').write(base64.b64decode(b))
        print(n, 'images', len(imgs), r.get('status'), flush=True)
    after = gens(); print('generations used', None if before is None or after is None else round(before - after, 2), 'left', after)
