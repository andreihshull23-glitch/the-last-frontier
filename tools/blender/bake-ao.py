# Bakes ambient occlusion into a baked world pack (assets/<pack>.json) with Blender's Cycles renderer.
# Every model is rebuilt in Blender, stood on a ground plane, and its occlusion baked to a per-vertex
# value that darkens the stored colours: creases, seams, undersides and where things meet the floor.
#   python -I tools/blender/bake-ao.py <pack.json> [strength 0..1] [samples]
# The pack is rewritten in place; run it once per fresh bake (tools/bake-assets.mjs overwrites it).
import base64, json, struct, sys, time
import bpy

args = sys.argv[1:]
path = args[0]
STRENGTH = float(args[1]) if len(args) > 1 else 0.8
SAMPLES = int(args[2]) if len(args) > 2 else 24

with open(path) as f:
    pack = json.load(f)
if pack.get('ao'):
    print('already baked:', path); sys.exit(0)
raw = bytearray(base64.b64decode(pack['bin']))
V, I = pack['verts'], pack['indices']
pos = memoryview(raw)[0:V * 6].cast('h')
idx = memoryview(raw)[V * 6:V * 6 + I * 2].cast('H')
col_off = V * 6 + I * 2 + V * 3
col = memoryview(raw)[col_off:col_off + V * 4]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.device = 'CPU'
scene.render.bake.target = 'VERTEX_COLORS'
world = bpy.data.worlds.new('w'); scene.world = world

# a ground plane under every model: contact shadow where things stand on the floor
bpy.ops.mesh.primitive_plane_add(size=1)
ground = bpy.context.object
mat = bpy.data.materials.new('m')
start = time.time()
done = 0
for name, m in pack['models'].items():
    if '#' in name and m.get('vc', 0) < 4:
        continue
    # things that glow (signs, screens, pickups) keep their colours
    if pack['id'] == 'cyber' and name.split('#')[0].startswith(('sign-', 'tv-', 'collectible-', 'pickup-')):
        continue
    vo, vc, io, ic, q = m['vo'], m['vc'], m['io'], m['ic'], m['q']
    # game space is Y-up; Blender is Z-up: (x, y, z) -> (x, -z, y)
    verts = [(pos[(vo + i) * 3] / q, -pos[(vo + i) * 3 + 2] / q, pos[(vo + i) * 3 + 1] / q) for i in range(vc)]
    faces = [(idx[io + k], idx[io + k + 1], idx[io + k + 2]) for k in range(0, ic, 3)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    if len(me.vertices) != vc:
        print('skip (vertex count changed):', name); continue
    attr = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    bb = m.get('bb')
    if not bb:
        # character packs keep no box: work it out (in game axes) from the vertices
        xs = [pos[(vo + i) * 3] / q for i in range(vc)]; ys = [pos[(vo + i) * 3 + 1] / q for i in range(vc)]; zs = [pos[(vo + i) * 3 + 2] / q for i in range(vc)]
        bb = [min(xs), 99, min(zs), max(xs), max(ys), max(zs)]   # 99: never stood on the ground plane
    size = max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2], 0.1)
    world.light_settings.distance = min(1.2, max(0.15, size * 0.35))
    sits = bb[1] > -0.05 and bb[1] < 0.3
    ground.hide_render = not sits
    ground.location = (0, 0, bb[1] - 0.002)
    ground.scale = (size * 3, size * 3, 1)
    for o in scene.objects: o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    try:
        bpy.ops.object.bake(type='AO')
    except Exception as e:
        print('bake failed for', name, e)
        bpy.data.objects.remove(ob); bpy.data.meshes.remove(me); continue
    data = attr.data
    for i in range(vc):
        a = data[i].color[0]
        k = 1 - STRENGTH * (1 - a)
        o = (vo + i) * 4
        col[o] = max(0, min(255, round(col[o] * k)))
        col[o + 1] = max(0, min(255, round(col[o + 1] * k)))
        col[o + 2] = max(0, min(255, round(col[o + 2] * k)))
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    done += 1

pack['bin'] = base64.b64encode(bytes(raw)).decode('ascii')
pack['ao'] = {'strength': STRENGTH, 'samples': SAMPLES}
with open(path, 'w') as f:
    json.dump(pack, f, separators=(',', ':'))
print(f'{path}: {done} models in {time.time() - start:.0f}s')
