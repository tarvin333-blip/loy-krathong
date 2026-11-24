"""Original background music for Loy Krathong Online.

Synthesised from scratch with numpy (no samples, no third-party recordings),
so the output belongs to the site owner and carries no licence obligations.
Run:  python3 tools/compose.py   (writes public/audio/*.mp3 via ffmpeg)
"""
import numpy as np, subprocess, os, tempfile, wave

SR = 44100
rng = np.random.default_rng(7)

# C major pentatonic, two and a half octaves
PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.5, 1174.7]

def env(n, a, d):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR)); e[:na] *= np.linspace(0, 1, na)
    return e

def khim(f, dur, vel=1.0):
    """Hammered zither: bright harmonic partials, fast-decaying highs, soft hammer click."""
    n = int((dur + 1.6) * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for k, (amp, dec) in enumerate([(1, 1.4), (.55, .9), (.35, .55), (.22, .35), (.14, .22), (.08, .15)], start=1):
        fk = f * k * (1 + .0006 * k * k)
        out += amp * np.sin(2 * np.pi * fk * t + rng.random() * 6) * np.exp(-t / dec)
    click = rng.standard_normal(n) * np.exp(-t / .004) * .15
    out = (out + click) * env(n, .002, 9) * vel
    return out

def khim_roll(f, dur, vel=1.0):
    """Khim tremolo on long notes: rapid repeated strikes."""
    n = int((dur + 1.6) * SR); out = np.zeros(n); step = 1 / 11
    k = 0
    while k * step < dur * .92:
        s = khim(f, .3, vel * (.85 if k == 0 else .45))
        i = int(k * step * SR); m = min(len(s), n - i); out[i:i + m] += s[:m]; k += 1
    return out

def ranat(f, dur, vel=1.0):
    """Ranat ek (wooden xylophone): woody inharmonic partials, short decay."""
    n = int(1.2 * SR); t = np.arange(n) / SR
    out = (np.sin(2 * np.pi * f * t) * np.exp(-t / .38)
           + .45 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / .09)
           + .2 * np.sin(2 * np.pi * f * 9.1 * t) * np.exp(-t / .03))
    out += rng.standard_normal(n) * np.exp(-t / .003) * .2
    return out * env(n, .001, 9) * vel

def ching(open_=True, vel=1.0):
    """Small Thai cymbals: 'ching' rings, 'chap' is damped."""
    d = .9 if open_ else .07
    n = int((d * 3 + .05) * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for f, a in [(2380, 1), (3570, .7), (5210, .5), (6890, .3), (8120, .2)]:
        out += a * np.sin(2 * np.pi * f * t + rng.random() * 6)
    out = out * np.exp(-t / d) + rng.standard_normal(n) * np.exp(-t / (d * .15)) * .4
    return out * vel * .12

def flute(f, dur, vel=1.0):
    """Khlui-like breathy flute with vibrato."""
    n = int((dur + .4) * SR); t = np.arange(n) / SR
    vib = 1 + .006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / .5, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = np.sin(ph) + .3 * np.sin(2 * ph) + .1 * np.sin(3 * ph)
    breath = np.convolve(rng.standard_normal(n), np.ones(40) / 40, 'same') * .25
    e = np.clip(t / .18, 0, 1) * np.clip((dur + .4 - t) / .35, 0, 1)
    return (tone + breath) * e * vel * .22

def pad(freqs, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for f in freqs:
        for det in (-.15, .15):
            out += np.sin(2 * np.pi * (f + det) * t + rng.random() * 6)
    lfo = .75 + .25 * np.sin(2 * np.pi * .07 * t)
    e = np.clip(t / 3, 0, 1) * np.clip((dur - t) / 3, 0, 1)
    return out / len(freqs) * lfo * e * vel * .06

def bell(f, vel=1.0, d=3.5):
    """Glass/temple bell with inharmonic partials for the secret theme."""
    n = int((d * 2) * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for r, a, dd in [(1, 1, d), (2.76, .5, d * .5), (5.4, .25, d * .25), (8.93, .12, d * .12)]:
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / dd)
    return out * env(n, .003, 99) * vel * .35

def thump(vel=1.0):
    """Soft taphon-like low drum."""
    n = int(.6 * SR); t = np.arange(n) / SR
    f = 95 * np.exp(-t / .12) + 55
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .16) * vel * .5

def place(buf, sig, at, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1]: return
    m = min(len(sig), buf.shape[1] - i)
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    buf[0, i:i + m] += sig[:m] * l; buf[1, i:i + m] += sig[:m] * r

def reverb(x, secs=2.4, mix=.28, seed=1):
    r = np.random.default_rng(seed); n = int(secs * SR); t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-t / (secs / 5)); ir[0] = 0; ir /= np.sqrt((ir ** 2).sum())
        L = x.shape[1] + n; N = 1 << (L - 1).bit_length()
        wet = np.fft.irfft(np.fft.rfft(x[ch], N) * np.fft.rfft(ir, N), N)[:x.shape[1]]
        out[ch] = x[ch] * (1 - mix) + wet * mix * 1.6
    return out

def wrap_loop(buf, length):
    """Fold the tail past the loop point back onto the start so the loop is seamless."""
    n = int(length * SR); out = buf[:, :n].copy(); tail = buf[:, n:]
    out[:, :tail.shape[1]] += tail[:, :n]
    return out

def save(buf, path, kbps=112):
    buf = buf / (np.max(np.abs(buf)) + 1e-9) * .89
    pcm = (buf.T * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f: tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', path], check=True)
    os.remove(tmp); print(path, os.path.getsize(path) // 1024, 'KB')

# ------------------------------------------------------------------ main theme
def main_theme():
    bpm = 76; beat = 60 / bpm; bar = 4 * beat
    A  = [[(7,1),(6,.5),(5,.5),(4,1),(3,1)], [(4,.5),(5,.5),(6,1),(5,2)], [(7,1),(8,.5),(7,.5),(6,1),(5,1)], [(4,1),(3,1),(4,2)]]
    A2 = [[(7,1),(6,.5),(5,.5),(4,1),(3,1)], [(4,.5),(5,.5),(6,1),(7,2)], [(8,1),(9,.5),(8,.5),(7,1),(6,1)], [(5,3),(4,.5),(5,.5)]]
    B  = [[(3,1),(4,1),(5,1),(4,1)], [(3,.5),(2,.5),(1,1),(0,2)], [(2,1),(3,1),(4,.5),(5,.5),(4,1)], [(3,2),(2,1),(3,1)]]
    B2 = [[(3,1),(4,1),(5,1),(6,1)], [(7,.5),(6,.5),(5,1),(4,2)], [(5,1),(4,.5),(3,.5),(2,1),(1,1)], [(2,2),(4,1),(6,1)]]
    song = A + A2 + B + B2
    bars = len(song) * 2
    length = bars * bar
    buf = np.zeros((2, int((length + 4) * SR)))
    for rep in range(2):
        t0 = rep * len(song) * bar
        for bi, notes in enumerate(song):
            t = t0 + bi * bar
            for deg, b in notes:
                f = PENTA[deg]; d = b * beat
                if rep == 0:
                    place(buf, (khim_roll if b >= 2 else khim)(f, d, .9), t, -.2)
                else:
                    place(buf, ranat(f * 2 if deg < 6 else f, d, .55), t, .25)
                    place(buf, (khim_roll if b >= 2 else khim)(f / 2, d, .55), t + beat / 2, -.3)
                t += d
            bt = t0 + bi * bar
            for k in range(4):          # ching on off-beats, chap on the downbeat
                place(buf, ching(k % 2 == 1, .9 if k % 2 else .6), bt + k * beat, .4)
            if rep == 1 and bi % 2 == 0:
                place(buf, thump(.9), bt, 0); place(buf, thump(.5), bt + 2.5 * beat, 0)
            if bi % 4 == 0:
                root = [0, 3, 4, 1][(bi // 4) % 4]
                place(buf, pad([PENTA[root] / 2, PENTA[root] * .75], bar * 4 + 1.5), bt, 0)
            if rep == 1 and bi % 4 == 0:
                fd = song[bi][0][0]
                place(buf, flute(PENTA[fd], bar * 1.6, .8), bt + beat * .5, .1)
    buf = reverb(buf, 2.4, .3)
    return wrap_loop(buf, length)

# --------------------------------------------------------------- secret theme
def magic_theme():
    bpm = 58; beat = 60 / bpm; bar = 4 * beat
    # A-minor-pentatonic colour: A C D E G, gently descending arpeggios over a deep drone
    M = [4, 5, 6, 7, 8, 9, 10]   # indices into PENTA (A4 .. C6)
    arps = [[9,7,5,7], [8,6,4,6], [7,5,4,5], [6,4,2,4], [9,8,7,5], [8,7,5,4], [7,6,4,2], [4,5,7,9]]
    bars = 16; length = bars * bar
    buf = np.zeros((2, int((length + 7) * SR)))
    for bi in range(bars):
        bt = bi * bar
        a = arps[bi % len(arps)]
        for k, deg in enumerate(a):
            place(buf, bell(PENTA[deg], .5 + .2 * (k == 0), 3.2), bt + k * beat, (-.5 + k * .33))
        if bi % 2 == 1:   # sparkle answer, an octave up
            for k, deg in enumerate(a[::-1][:3]):
                place(buf, bell(PENTA[deg] * 2, .18, 2), bt + (k + .5) * beat * 1.0 + beat, .6 - k * .5)
        if bi % 4 == 0:
            root = [4, 2, 3, 0][(bi // 4) % 4]
            place(buf, pad([PENTA[root] / 4, PENTA[root] / 2, PENTA[root] * .75], bar * 4 + 4, 1.6), bt, 0)
        if bi % 4 == 2:
            place(buf, flute(PENTA[a[0]] / 2, bar * 1.5, .6), bt, -.15)
    buf = reverb(buf, 4.5, .45, seed=3)
    return wrap_loop(buf, length)

if __name__ == '__main__':
    os.makedirs('public/audio', exist_ok=True)
    save(main_theme(), 'public/audio/sainam-khuen-pen.mp3')
    save(magic_theme(), 'public/audio/mon-chanthra.mp3', 96)
