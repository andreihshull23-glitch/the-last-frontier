// Post-processing without extra libraries: the scene renders into a linear HDR target, the bright parts
// are blurred at three sizes for bloom (neon, bolts, screens), and a last pass does the film tone curve,
// a little grading, a vignette and the conversion to sRGB that the renderer would otherwise do itself.

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `uniform sampler2D tSrc; uniform float threshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(threshold, threshold * 1.8, l), 1.0);
}`;

// 9-tap gaussian along one axis
const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + dir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL = `uniform sampler2D tScene; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2;
uniform float bloom; uniform float exposure; uniform float vignette; uniform vec3 lift; uniform float sat; uniform float time; uniform float fringe;
varying vec2 vUv;
vec3 lfRrtOdt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 lfAces(vec3 color) {
  const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  color *= exposure / 0.6;
  color = ACESInputMat * color; color = lfRrtOdt(color); color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 lfToSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
void main() {
  // a lens fringe that grows toward the corners: red and blue pulled apart a little
  vec2 dc = vUv - 0.5;
  vec2 off = dc * dot(dc, dc) * fringe;
  vec3 c = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b);
  vec3 b = texture2D(tB0, vUv).rgb * 0.5 + texture2D(tB1, vUv).rgb * 0.8 + texture2D(tB2, vUv).rgb * 1.1;
  c += b * bloom;
  c = lfAces(c);
  // grading: lift the shadows toward a cool tone, a touch more saturation
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, sat);
  c += lift * (1.0 - smoothstep(0.0, 0.35, l));
  vec2 d = vUv - 0.5;
  c *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
  // fine film grain, strongest in the mid-tones
  float n = fract(sin(dot(vUv * 1000.0 + fract(time * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c += n * 0.035 * (1.0 - abs(l * 2.0 - 1.0));
  gl_FragColor = vec4(lfToSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

export function createPost(gl) {
  const THREE = window.THREE;
  const caps = gl.capabilities;
  const half = caps.isWebGL2 || gl.extensions.has('OES_texture_half_float');
  const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type, depthBuffer: false, stencilBuffer: false };
  const MS = caps.isWebGL2 && THREE.WebGLMultisampleRenderTarget;
  let scene = null, levels = [], w = 0, h = 0, msaa = false;

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const bright = mat(BRIGHT, { tSrc: { value: null }, threshold: { value: 1.05 } });
  const blur = mat(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
  const final = mat(FINAL, {
    tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
    bloom: { value: 0.9 }, exposure: { value: 0.98 }, vignette: { value: 0.28 }, lift: { value: new THREE.Vector3(0.012, 0.01, 0.03) }, sat: { value: 1.08 }, time: { value: 0 }, fringe: { value: 0.008 },
  });

  function setSize(width, height, wantMsaa) {
    if (width === w && height === h && wantMsaa === msaa && scene) return;
    w = width; h = height; msaa = wantMsaa;
    if (scene) scene.dispose();
    for (const l of levels) { l.a.dispose(); l.b.dispose(); }
    scene = msaa && MS ? new MS(w, h, { ...opts, depthBuffer: true }) : new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
    if (msaa && MS) scene.samples = 4;
    levels = [2, 4, 8].map((k) => {
      const lw = Math.max(1, Math.round(w / k)), lh = Math.max(1, Math.round(h / k));
      return { w: lw, h: lh, a: new THREE.WebGLRenderTarget(lw, lh, opts), b: new THREE.WebGLRenderTarget(lw, lh, opts) };
    });
  }
  function pass(material, target) { quad.material = material; gl.setRenderTarget(target); gl.render(qScene, qCam); }

  return {
    final,
    /** Render `world` through the chain. Sizes are drawing-buffer pixels. */
    render(world, camera, width, height, { msaa: wantMsaa = true, bloom = 0.9 } = {}) {
      setSize(width, height, wantMsaa);
      const tm = gl.toneMapping;
      gl.setRenderTarget(scene);
      gl.render(world, camera);
      let src = scene.texture;
      for (const l of levels) {
        bright.uniforms.tSrc.value = src; pass(bright, l.a);
        blur.uniforms.tSrc.value = l.a.texture; blur.uniforms.dir.value.set(1 / l.w, 0); pass(blur, l.b);
        blur.uniforms.tSrc.value = l.b.texture; blur.uniforms.dir.value.set(0, 1 / l.h); pass(blur, l.a);
        src = l.a.texture;
      }
      final.uniforms.tScene.value = scene.texture;
      final.uniforms.tB0.value = levels[0].a.texture; final.uniforms.tB1.value = levels[1].a.texture; final.uniforms.tB2.value = levels[2].a.texture;
      final.uniforms.bloom.value = bloom;
      final.uniforms.time.value = performance.now() / 1000;
      final.uniforms.exposure.value = gl.toneMappingExposure;
      pass(final, null);
      gl.toneMapping = tm;
    },
    dispose() { if (scene) scene.dispose(); for (const l of levels) { l.a.dispose(); l.b.dispose(); } },
  };
}
