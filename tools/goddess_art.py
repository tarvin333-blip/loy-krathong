"""Ending scene: Phra Mae Khongkha (Thai river goddess) blessing sprite (PixelLab /create-image-pro-flash, transparent).
Usage: python3 tools/goddess_art.py [w h] -> tools/art/goddess_<i>.png"""
import sys, time, base64
sys.path.insert(0, 'tools')
from krathong_art import call, find_images, gens
DESC = ("Phra Mae Khongkha, the graceful Thai goddess of the river, a large serene and beautiful divine woman rising from the water, "
        "full body from the waist up emerging from the river surface, wearing an elegant traditional Thai golden crown (chada) and ornate gold jewelry, "
        "flowing white and gold Thai silk sabai draped over one shoulder, long black hair, kind gentle smile, "
        "both hands raised in a gentle blessing gesture with one palm open, holding a glowing golden lotus, "
        "soft divine golden halo light behind her, lotus petals and sparkles floating around, respectful and majestic, "
        "front view, centered, highly detailed pixel art with soft painterly shading, no background, no text")
if __name__ == '__main__':
    w, h = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (256, 256)
    before = gens()
    r = call('POST', '/create-image-pro-flash', {'description': DESC, 'image_size': {'width': w, 'height': h}, 'no_background': True})
    if 'http_error' in r: print('ERROR', r); sys.exit(1)
    job = r.get('background_job_id')
    while job:
        time.sleep(5); j = call('GET', f'/background-jobs/{job}')
        if j.get('status') in ('completed', 'failed', 'error', 'cancelled'): r = j; break
    imgs = find_images(r, [])
    for i, b in enumerate(imgs): open(f'tools/art/goddess_{i}.png', 'wb').write(base64.b64decode(b))
    after = gens(); print('images', len(imgs), r.get('status'), '| gens used', None if before is None or after is None else round(before - after, 2))
