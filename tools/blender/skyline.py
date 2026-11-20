# Renders the panoramic backgrounds for the game: the inside of the Meridian Spire seen from a street
# district, and the Hollow's cavern. Everything is built from code: tower blocks with procedural window
# grids, neon strips, cables, the tower's lit ceiling, haze. Output is an equirectangular JPEG.
#   python -I tools/blender/skyline.py <city|hollow> <out.jpg> [width] [samples]
import bpy, math, random, sys

args = sys.argv[1:]
kind, out = args[0], args[1]
W = int(args[2]) if len(args) > 2 else 2048
SAMPLES = int(args[3]) if len(args) > 3 else 48
rng = random.Random(7 if kind == 'city' else 11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def emit_mat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*color, 1); e.inputs[1].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0])
    return m

def tower_mat(name, base, window, density, seed):
    """Dark plate with a grid of lit windows: some on, some off, a few tinted."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    # windows are laid out in world metres, so every block gets the same size of window whatever its scale
    tc = nt.nodes.new('ShaderNodeNewGeometry')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.6, 1.6, 1.6)
    nt.links.new(tc.outputs['Position'], mp.inputs['Vector'])
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.35
    br.inputs['Brick Width'].default_value = 1.6
    br.inputs['Row Height'].default_value = 3.2
    br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (0.2, 0.2, 0.2, 1)
    br.inputs['Mortar'].default_value = (0, 0, 0, 1)
    br.offset = 0.0; br.squash = 1.0
    nt.links.new(mp.outputs['Vector'], br.inputs['Vector'])
    # which windows are lit: a per-window random value from the brick colour, thresholded
    noise = nt.nodes.new('ShaderNodeTexWhiteNoise'); noise.noise_dimensions = '3D'
    snap = nt.nodes.new('ShaderNodeVectorMath'); snap.operation = 'SNAP'; snap.inputs[1].default_value = (1.6, 1.6, 3.2)
    nt.links.new(mp.outputs['Vector'], snap.inputs[0]); nt.links.new(snap.outputs[0], noise.inputs['Vector'])
    thr = nt.nodes.new('ShaderNodeMath'); thr.operation = 'GREATER_THAN'; thr.inputs[1].default_value = 1 - density
    nt.links.new(noise.outputs['Value'], thr.inputs[0])
    lit = nt.nodes.new('ShaderNodeMath'); lit.operation = 'MULTIPLY'
    nt.links.new(br.outputs['Fac'], lit.inputs[0])
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    nt.links.new(br.outputs['Fac'], inv.inputs[1])
    nt.links.new(inv.outputs[0], lit.inputs[0])
    lit2 = nt.nodes.new('ShaderNodeMath'); lit2.operation = 'MULTIPLY'
    nt.links.new(lit.outputs[0], lit2.inputs[0]); nt.links.new(thr.outputs[0], lit2.inputs[1])
    # window colour varies: warm mostly, some cyan and pink
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    cr.elements[0].position = 0.0; cr.elements[0].color = (*window, 1)
    cr.elements[1].position = 0.82; cr.elements[1].color = (0.25, 0.85, 1.0, 1)
    e3 = cr.elements.new(0.93); e3.color = (1.0, 0.25, 0.6, 1)
    n2 = nt.nodes.new('ShaderNodeTexWhiteNoise'); n2.noise_dimensions = '3D'
    off = nt.nodes.new('ShaderNodeVectorMath'); off.operation = 'ADD'; off.inputs[1].default_value = (seed, seed * 2, 0)
    nt.links.new(snap.outputs[0], off.inputs[0]); nt.links.new(off.outputs[0], n2.inputs['Vector'])
    nt.links.new(n2.outputs['Value'], ramp.inputs['Fac'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 3.2
    nt.links.new(lit2.outputs[0], st.inputs[0]); nt.links.new(st.outputs[0], em.inputs['Strength'])
    dif = nt.nodes.new('ShaderNodeEmission'); dif.inputs[0].default_value = (*base, 1); dif.inputs[1].default_value = 1.0
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs[0], add.inputs[0]); nt.links.new(dif.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs[0])
    return m

def box(x, y, z, sx, sy, sz, mat, rz=0.0):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z), rotation=(0, 0, rz))
    o = bpy.context.object; o.scale = (sx / 2, sy / 2, sz / 2)
    o.data.materials.append(mat)
    return o

def world(top, horizon, strength=1.0):
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs[1].default_value = strength
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    cr.elements[0].position = 0.45; cr.elements[0].color = (*horizon, 1)
    cr.elements[1].position = 0.75; cr.elements[1].color = (*top, 1)
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs[0]); nt.links.new(bg.outputs[0], o.inputs[0])

def haze(density, color):
    """A volume of thin coloured haze: depth for the far towers."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 150)); v = bpy.context.object
    v.scale = (900, 900, 300)
    m = bpy.data.materials.new('haze'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density; vol.inputs['Color'].default_value = (*color, 1)
    vol.inputs['Emission Strength'].default_value = 0.0
    nt.links.new(vol.outputs[0], o.inputs['Volume']); v.data.materials.append(m)

if kind == 'city':
    world((0.004, 0.003, 0.012), (0.05, 0.025, 0.09), 1.0)
    shell = [tower_mat(f't{i}', (0.006, 0.006, 0.012), (1.0, 0.72, 0.38), d, i * 7.1) for i, d in enumerate([0.16, 0.26, 0.1, 0.2])]
    neon = [emit_mat('n_pink', (1.0, 0.15, 0.55), 18), emit_mat('n_cyan', (0.15, 0.85, 1.0), 16), emit_mat('n_violet', (0.55, 0.3, 1.0), 14), emit_mat('n_amber', (1.0, 0.6, 0.15), 14)]
    dark = emit_mat('dark', (0.004, 0.004, 0.008), 1.0)
    ceiling_lamp = emit_mat('lamp', (0.85, 0.9, 1.0), 9)
    # rings of tower blocks round the camera: near ones low and dark, far ones tall and full of windows
    # rings of blocks well away from the street, so from the ground they sit on the horizon instead of overhead
    for ring, (r0, r1, hmin, hmax, n) in enumerate([(220, 320, 25, 70, 60), (330, 460, 50, 130, 80), (470, 640, 90, 230, 96)]):
        for k in range(n):
            a = (k + rng.random() * 0.6) / n * math.tau
            r = rng.uniform(r0, r1)
            sx, sy = rng.uniform(14, 40), rng.uniform(14, 40)
            h = rng.uniform(hmin, hmax)
            x, y = math.cos(a) * r, math.sin(a) * r
            box(x, y, h / 2 - 5, sx, sy, h, rng.choice(shell), rz=a + rng.uniform(-0.3, 0.3))
            # vertical neon strips and a sign on some blocks
            if rng.random() < 0.45:
                box(x - math.cos(a) * (sx / 2 + 0.6), y - math.sin(a) * (sy / 2 + 0.6), rng.uniform(h * 0.2, h * 0.6), 1.2, 1.2, rng.uniform(10, h * 0.5), rng.choice(neon), rz=a)
            if rng.random() < 0.3:
                box(x - math.cos(a) * (sx / 2 + 1), y - math.sin(a) * (sy / 2 + 1), rng.uniform(15, h * 0.8), 10, 1, 4, rng.choice(neon), rz=a + math.pi / 2)
    # walkways and cables strung between blocks, high up
    for k in range(70):
        a = rng.random() * math.tau; r = rng.uniform(240, 420); z = rng.uniform(30, 140)
        box(math.cos(a) * r, math.sin(a) * r, z, rng.uniform(40, 120), 1.6, 1.2, dark, rz=rng.random() * math.pi)
        if rng.random() < 0.4: box(math.cos(a) * r, math.sin(a) * r, z - 0.9, rng.uniform(30, 90), 0.4, 0.15, rng.choice(neon), rz=rng.random() * math.pi)
    # the tower's ceiling, far above: a grid of service lights in a dark slab
    box(0, 0, 640, 2400, 2400, 20, dark)
    for gx in range(-12, 13):
        for gy in range(-12, 13):
            if rng.random() < 0.55: box(gx * 80 + rng.uniform(-10, 10), gy * 80 + rng.uniform(-10, 10), 629, 14, 3, 1, ceiling_lamp)
    # huge support pillars rising to the ceiling
    for k in range(9):
        a = k / 9 * math.tau + 0.2; r = rng.uniform(380, 520)
        box(math.cos(a) * r, math.sin(a) * r, 320, 50, 50, 660, dark)
        box(math.cos(a) * (r - 26), math.sin(a) * (r - 26), 320, 2, 2, 660, rng.choice(neon))
    haze(0.0009, (0.55, 0.4, 0.75))
elif kind == 'hollow':
    world((0.002, 0.001, 0.006), (0.04, 0.015, 0.07), 1.0)
    rock = emit_mat('rock', (0.008, 0.005, 0.014), 1.0)
    vein = [emit_mat('v1', (0.6, 0.3, 1.0), 10), emit_mat('v2', (0.35, 0.9, 0.7), 6)]
    for k in range(120):
        a = rng.random() * math.tau; r = rng.uniform(70, 420); h = rng.uniform(40, 500)
        x, y = math.cos(a) * r, math.sin(a) * r
        o = box(x, y, h / 2 - 10, rng.uniform(10, 50), rng.uniform(10, 50), h, rock, rz=rng.random() * 3)
        o.rotation_euler[0] = rng.uniform(-0.15, 0.15); o.rotation_euler[1] = rng.uniform(-0.15, 0.15)
        if rng.random() < 0.6:
            for v in range(rng.randint(1, 3)):
                box(x - math.cos(a) * 12, y - math.sin(a) * 12, rng.uniform(5, h * 0.8), 0.8, 0.8, rng.uniform(6, 40), rng.choice(vein), rz=rng.random() * 3)
    box(0, 0, 560, 2400, 2400, 40, rock)
    haze(0.0028, (0.45, 0.3, 0.7))

cam = bpy.data.cameras.new('cam'); cam.type = 'PANO'
try: cam.panorama_type = 'EQUIRECTANGULAR'
except Exception: cam.cycles.panorama_type = 'EQUIRECTANGULAR'
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
co.location = (0, 0, 2); co.rotation_euler = (math.pi / 2, 0, 0)
scene.camera = co
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.volume_step_rate = 4.0
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.resolution_x = W; scene.render.resolution_y = W // 2
scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 82
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('wrote', out)
