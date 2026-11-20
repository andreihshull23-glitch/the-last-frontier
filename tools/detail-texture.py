# Makes assets/tex/detail.png: a tileable greyscale texture of worn plate (grain, grime, faint panel
# seams, a few scratches). The world shader projects it onto every surface from three sides and lets it
# darken or lighten the base colour a little, so flat walls and floors stop looking like paint.
#   python3 -I tools/detail-texture.py [out.png] [size]
import sys
import numpy as np
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else 'assets/tex/detail.png'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 512
rng = np.random.default_rng(12)

def periodic_noise(scale, power=2.0):
    """Noise that tiles: white noise filtered in frequency space (wraps by construction)."""
    f = np.fft.fftfreq(N)[:, None] ** 2 + np.fft.fftfreq(N)[None, :] ** 2
    f[0, 0] = 1
    spec = np.fft.fft2(rng.standard_normal((N, N))) / (f ** (power / 2)) * np.exp(-f * (N / scale) ** 2 * 0.0)
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec))
    n -= n.min(); n /= n.max()
    return n

def band(scale_lo, scale_hi):
    f = np.sqrt(np.fft.fftfreq(N)[:, None] ** 2 + np.fft.fftfreq(N)[None, :] ** 2) * N
    keep = (f >= scale_lo) & (f <= scale_hi)
    spec = np.fft.fft2(rng.standard_normal((N, N))) * keep
    n = np.real(np.fft.ifft2(spec)); n -= n.min(); n /= max(1e-9, n.max())
    return n

grain = band(60, 220)                 # fine metal grain
grime = band(2, 10)                   # large stains
blotch = band(10, 30)                 # mid-size wear
img = 0.62 + (grain - 0.5) * 0.12 + (grime - 0.5) * 0.38 + (blotch - 0.5) * 0.16
# faint panel seams every quarter tile, broken up by the grime
seam = np.zeros((N, N))
step = N // 4
for k in range(0, N, step):
    seam[k:k + 2, :] = 1; seam[:, k:k + 2] = 1
img -= seam * 0.12 * (0.6 + grime * 0.6)
# rivets near the seams
for y in range(0, N, step):
    for x in range(0, N, step):
        for dx, dy in ((6, 6), (step - 8, 6), (6, step - 8), (step - 8, step - 8)):
            cy, cx = (y + dy) % N, (x + dx) % N
            img[cy - 1:cy + 2, cx - 1:cx + 2] += 0.08
# scratches: short bright lines at shallow angles
for _ in range(90):
    x0, y0 = rng.integers(0, N, 2)
    ang = rng.normal(0.3, 0.6); ln = rng.integers(12, 60)
    for t in range(ln):
        x = int(x0 + np.cos(ang) * t) % N; y = int(y0 + np.sin(ang) * t) % N
        img[y, x] += 0.07
img = np.clip(img, 0, 1)
Image.fromarray((img * 255).astype(np.uint8), 'L').save(out, optimize=True)
print('wrote', out, f'{N}x{N}')
