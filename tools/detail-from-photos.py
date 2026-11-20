# Makes assets/tex/detail.png from scanned CC0 textures (Poly Haven, polyhaven.com, CC0):
#   red   = walls: metal_plate_02 (riveted plates, scratches), its colour photo times its AO map
#   green = floors: concrete_floor_worn_001, likewise
#   blue  = the procedural worn-plate texture from tools/detail-texture.py, kept as a spare
# Each channel is turned to greyscale, flattened (large-scale shading removed so the tile does not show),
# and normalised to a mean of 0.62 with a set contrast; the world shader multiplies by 1.6 x the value.
# Download the 1k JPG "Diffuse" and "AO" maps of both textures into one folder first, then:
#   python3 -I tools/detail-from-photos.py <folder> [out.png] [size]
import sys
import numpy as np
from PIL import Image, ImageFilter

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'assets/tex/detail.png'
N = int(sys.argv[3]) if len(sys.argv) > 3 else 512

def channel(name, contrast):
    diff = Image.open(f'{src}/{name}_Diffuse.jpg').convert('L').resize((N, N), Image.LANCZOS)
    ao = Image.open(f'{src}/{name}_AO.jpg').convert('L').resize((N, N), Image.LANCZOS)
    g = np.asarray(diff, dtype=np.float64) / 255 * (0.35 + 0.65 * np.asarray(ao, dtype=np.float64) / 255)
    # remove shading broader than an eighth of the tile; wrap so the result still tiles
    pad = np.pad(g, N // 4, mode='wrap')
    low = np.asarray(Image.fromarray((pad * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(N / 16)), dtype=np.float64) / 255
    low = low[N // 4:N // 4 + N, N // 4:N // 4 + N]
    hp = g - low
    hp = hp / max(1e-6, hp.std()) * contrast
    return np.clip(0.62 + hp, 0, 1)

walls = channel('metal_plate_02', 0.11)
floors = channel('concrete_floor_worn_001', 0.08)
try:
    spare = np.asarray(Image.open(out).convert('L').resize((N, N)), dtype=np.float64) / 255
except Exception:
    spare = np.full((N, N), 0.62)
rgb = np.stack([walls, floors, spare], axis=-1)
Image.fromarray((rgb * 255).astype(np.uint8), 'RGB').save(out, optimize=True)
print('wrote', out, f'{N}x{N}', 'means', [round(float(c.mean()), 3) for c in (walls, floors, spare)])
