"""Villain krathong sprites for the dungeon (PixelLab /create-image-pro-flash, transparent).
Usage: python3 tools/monster_art.py <name> ... -> tools/art/m_<name>_0.png"""
import sys, time, base64
sys.path.insert(0, 'tools')
from krathong_art import call, find_images, gens
BASE = ("a single cursed villain version of a Thai Loy Krathong floating offering, {d}, three-quarter view from slightly above, "
        "centered and whole, isolated object, menacing but stylish, highly detailed pixel art with soft painterly shading, "
        "dramatic eerie glow, no water, no background, no text")
DESC = {
 'ghost':  "made of withered grey banana leaves with tattered ghostly cloth petals, a cold blue will-o-wisp flame instead of a candle, faint wispy spirits curling around it",
 'skull':  "bone-white petals shaped like ribs around a cracked skull in the center, a sickly green flame burning inside the skull, small dark candles",
 'swamp':  "rotting dark green swamp leaves dripping purple slime, toxic mushrooms and a purple poison candle with bubbling smoke",
 'serpent':"black scaled petals with two small black cobra heads rising from it with glowing yellow eyes, a dark violet candle",
 'hell':   "built from cracked black obsidian and glowing molten lava seams, jagged red petals and a roaring red-orange demon fire in the center",
 'titan':  "a colossal ancient abyssal demon-god krathong, towering and terrifying, many layers of jagged black obsidian and blood-red petals like dragon scales and blades, huge curved ram horns and a black spiked crown, a giant demon face with glowing crimson eyes and fanged maw in the front, chains and skulls hanging from its rim, a towering pillar of black and crimson hellfire rising from the top, embers and dark aura swirling, awe-inspiring and majestic",
 'wraith': "a frozen ghost-ice krathong of jagged pale blue ice crystal petals covered in frost, a cold cyan spectral flame, icy mist and tiny snowflakes around it",
 'spider': "a cursed black widow krathong with dark purple petals wrapped in sticky silver spider webs, eight spindly black spider legs sticking out from under it, a sickly green candle and red eyes peeking out",
 'lich':   "a necromancer lich krathong of black and bone-grey petals with ancient purple runes, a floating cracked skull wearing a tattered hood above a violet soul flame, green necrotic wisps rising",
 'kraken': "a deep-sea kraken krathong of dark teal and barnacled petals with several thick purple octopus tentacles curling out from it, a bioluminescent cyan candle flame, dripping seawater",
 'void':   "a colossal cosmic void emperor krathong, terrifying and majestic, layers of black obsidian petals edged with glowing violet and cyan cracks, a swirling black hole with a burning purple ring at its center like an eye, floating shattered rock fragments and stars orbiting it, a crown of dark crystal spikes, a towering pillar of violet void-fire rising from the top",
 'boss':   "large demon king krathong of dark crimson and black petals with curved demon horns, a jagged black crown, glowing red eyes in the center and a tall black-red infernal flame",
}
SIZES = {'boss': (224, 192), 'titan': (256, 256), 'void': (256, 256)}
if __name__ == '__main__':
    before = gens()
    for n in sys.argv[1:]:
        w, h = SIZES.get(n, (192, 160))
        r = call('POST', '/create-image-pro-flash', {'description': BASE.format(d=DESC[n]), 'image_size': {'width': w, 'height': h}, 'no_background': True})
        if 'http_error' in r: print(n, 'ERROR', r, flush=True); continue
        job = r.get('background_job_id')
        while job:
            time.sleep(5); j = call('GET', f'/background-jobs/{job}')
            if j.get('status') in ('completed', 'failed', 'error', 'cancelled'): r = j; break
        imgs = find_images(r, [])
        for i, b in enumerate(imgs): open(f'tools/art/m_{n}_{i}.png', 'wb').write(base64.b64decode(b))
        print(n, 'images', len(imgs), r.get('status'), flush=True)
    after = gens(); print('generations used', None if before is None or after is None else round(before - after, 2), 'left', after)
