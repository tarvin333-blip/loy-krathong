"""Generate krathong sprites with PixelLab (/create-image-pro-flash, transparent background).
The key is injected by the session proxy. Usage: python3 tools/krathong_art.py <type> [<type> ...]
Writes tools/art/<type>_<n>.png (raw takes) and prints generations used."""
import base64, json, sys, time, urllib.request
API = 'https://api.pixellab.ai/v2'
def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer injected-by-proxy', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'http_error': e.code, 'body': e.read().decode()[:1500]}
def find_images(o, acc):
    if isinstance(o, dict):
        if isinstance(o.get('base64'), str) and len(o['base64']) > 100: acc.append(o['base64'])
        for v in o.values(): find_images(v, acc)
    elif isinstance(o, list):
        for v in o: find_images(v, acc)
    return acc
def gens():
    b = call('GET', '/balance'); return (b.get('subscription') or {}).get('generations') if isinstance(b, dict) else None
BASE = ("a single Thai Loy Krathong floating festival offering, {d}, one lit candle standing in the center with a small bright flame "
        "and two thin incense sticks, three-quarter view from slightly above, centered and whole, isolated object, "
        "highly detailed pixel art with soft painterly shading and warm candlelight glow, no water, no background, no text")
DESC = {
 'banana':  "classic krathong made of folded green banana leaves in layered pointed bai-si pleats around a round base, decorated with orange marigolds, white jasmine and pink rose petals",
 'lotus':   "krathong shaped like a fully blooming pink lotus flower with three layers of pointed petals and a golden lotus pod center, small green lotus leaf underneath",
 'bread':   "eco-friendly krathong made of golden baked bread shaped like a round flower with a scalloped bread-roll rim and sesame seeds, decorated with small orange marigolds",
 'coconut': "krathong made of a half coconut shell with brown fibrous husk, a rim of folded green banana leaves, filled with marigolds and white jasmine",
 'pride':   "rainbow krathong with a banana-leaf base and pleated petals in rainbow colors red orange yellow green blue purple, white jasmine flowers",
 'cat':     "cute cat-shaped krathong made of green banana leaves with two pointy cat ears and a happy cat face with whiskers on the front, pink flowers",
 'ganga':   "divine celestial krathong blessed by the Thai river goddess, layered white lotus petals edged with shining gold leaf, a small golden Thai naga serpent coiled around the base with its crested head raised, glowing turquoise water droplets and tiny golden sparkles floating around it, a golden-cyan sacred candle flame, majestic and holy",
 'skin_warrior':  "a fierce war krathong for a water warrior class, petals shaped like polished silver sword blades and spearheads layered in a ring, a round bronze war-shield base with a blue wave emblem, small blue battle banners on thin poles, a deep blue and silver color scheme",
 'skin_guardian': "a heavy fortress krathong for a guardian class, thick golden lotus petals shaped like armored plates with rivets, a sturdy round tower-like base with tiny crenellations, a large golden shield crest with a lotus emblem on the front, gold and ivory color scheme",
 'skin_mystic':   "an arcane krathong for a moon mage class, translucent violet crystal lotus petals with glowing silver rune engravings, a small floating crescent moon and orbiting tiny magic orbs above, a dark indigo base with a glowing magic circle, violet silver and midnight blue color scheme",
 'skin_racer':    "a sleek speed krathong for a rainbow racer class, a streamlined aerodynamic boat-like hull with swept-back fin petals like wings, rainbow light streaks along its sides, a pointed prow, white and rainbow gradient color scheme with motion lines",
 'adv_tidelord': "a majestic sea-lord war krathong, layered deep blue and silver blade petals like crashing waves, a coral and pearl crown, a golden trident standing beside the candle, foaming wave crests curling around the base, ornate and powerful",
 'adv_stormblade': "a storm swordsman krathong, slim dark steel sword-blade petals crackling with small cyan lightning, three crossed katana-like blades behind the candle, a dark grey storm-cloud base with lightning runes",
 'adv_paladin': "a holy lotus paladin krathong, radiant white and gold lotus petals shaped like knight armor with a glowing holy halo ring above, a white winged golden shield emblem on the front, soft divine light",
 'adv_yaksha': "a giant Thai temple guardian yaksha krathong, a fierce green-faced yaksha demon guardian mask with tusks and a tall golden crown on the front, a huge golden club across the base, red and gold Thai ornaments, heavy and imposing",
 'adv_chrono': "a time-mage krathong, translucent indigo crystal petals with glowing golden clock-face rings and roman numerals orbiting above, a small floating hourglass with glowing sand, cosmic blue and gold",
 'adv_solar': "a sun sorcerer krathong, blazing orange and gold flame-shaped petals radiating like a sun, a glowing solar disc with sun rays behind the candle, a ring of small floating fire runes, radiant and hot",
 'adv_phantom': "a phantom wind ninja krathong, sleek dark violet and black aerodynamic hull with flowing wind ribbons, faint translucent ghost after-images trailing behind it, small shuriken-shaped petals, mysterious",
 'adv_comet': "a rainbow comet racer krathong, a sleek white and gold streamlined comet-shaped hull with a long blazing rainbow comet tail trailing behind, star sparkles, wing fins, fast and dazzling",
 'star':    "magical crystal krathong with translucent glowing cyan and violet star-shaped crystal petals on a deep indigo base studded with golden sequins, tiny sparkles",
}
if __name__ == '__main__':
    before = gens()
    for t in sys.argv[1:]:
        body = {'description': BASE.format(d=DESC[t]), 'image_size': {'width': 192, 'height': 160}, 'no_background': True}
        r = call('POST', '/create-image-pro-flash', body)
        if 'http_error' in r: print(t, 'ERROR', r, flush=True); continue
        job = r.get('background_job_id')
        while job:
            time.sleep(5); j = call('GET', f'/background-jobs/{job}')
            if j.get('status') in ('completed', 'failed', 'error', 'cancelled'): r = j; break
        imgs = find_images(r, [])
        for i, b in enumerate(imgs): open(f'tools/art/{t}_{i}.png', 'wb').write(base64.b64decode(b))
        print(t, 'images', len(imgs), 'status', r.get('status'), flush=True)
    after = gens(); print('generations used', None if before is None or after is None else round(before - after, 2), 'left', after)
