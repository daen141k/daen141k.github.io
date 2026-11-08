/**
 * V11 — big, simple glass as background layers.
 *
 * Every placement gets its own canvas and its own small scene, so the objects
 * sit inside the page space instead of a box. Two objects per section — a ball
 * and a ring, a ball and a lens — all of them plain primitives, all of them
 * oversized on purpose so the section edges crop them. Simple forms read as
 * glass much better than clever ones: one unbroken silhouette, one clean
 * highlight, no tangle to hide the refraction failure of alpha blending.
 *
 * The glass is single-pass: alpha-blended `MeshPhysicalMaterial` with a studio
 * environment for reflections, no `transmission` second render pass. Real
 * refraction costs a full extra render of the scene per canvas per frame, and
 * that was starving the compositor — the marquee crawled. Alpha glass lets the
 * live page background show through for real, so the objects are transparent
 * in the literal sense as well.
 */
import * as THREE from "three";
import { onTick } from "./ticker.js";

const PALETTE = {
  light: {
    exposure: 1.02,
    env: 1.0,
    key: 0xffffff,
    keyI: 2.4,
    fill: 0xdbe7e2,
    fillI: 0.4,
    rim: 0xffffff,
    rimI: 2.0,
    // a touch darker than the paper: on white-on-white the pane would vanish
    glass: 0xc4ded8,
    accent: 0x9fd3ca,
  },
  dark: {
    exposure: 1.04,
    env: 0.8,
    key: 0xffffff,
    keyI: 1.9,
    fill: 0xa8c9c5,
    fillI: 0.7,
    rim: 0xa9efe2,
    rimI: 1.5,
    // on a dark page the body has to blend into the dark and let the highlights
    // do the drawing, otherwise a pale body reads as frosted plastic
    glass: 0x162624,
    accent: 0x1b3a35,
  },
};

/* one entry per placement: [x, y] are NDC, s is the size in world units */
/* `s` is a radius in frame units: 1 = exactly half the frame height, so a
   value above ~1 means the object is bigger than the canvas and gets cropped by
   construction — the point of the composition. */
const SCENES = {
  hero: {
    fov: 38,
    dist: 7.2,
    objects: [
      // the ball is nearly twice the frame height: only its left third shows
      { shape: "sphere", ndc: [0.92, 0.04], wide: [0.92, 0.04], tall: [0.62, -0.4], s: 1.45, ts: 0.86, z: 0, tint: "glass", spin: [0, 0, 0], rot: [0, 0, 0] },
      { shape: "ring", ndc: [0.3, -0.9], wide: [0.3, -0.9], tall: [-0.12, 0.62], s: 0.95, ts: 0.8, z: -0.7, tint: "accent", spin: [0.02, 0.045, 0.012], rot: [0.55, -0.22, 0.1] },
    ],
  },
  about: {
    fov: 34,
    dist: 7.0,
    objects: [
      { shape: "sphere", ndc: [-0.94, -0.3], wide: [-0.94, -0.3], tall: [-0.74, -0.68], s: 1.35, ts: 0.9, z: 0, tint: "glass", spin: [0, 0, 0], rot: [0, 0, 0] },
      // a lens: the same ball flattened to a fifth of its height, tipped over
      { shape: "sphere", form: [1, 0.2, 1], ndc: [1.0, -0.8], wide: [1.0, -0.8], tall: [0.6, 0.86], s: 1.2, ts: 0.85, z: -0.5, tint: "accent", spin: [0.03, 0.05, 0.012], rot: [0.85, 0.25, -0.35] },
    ],
  },
  contact: {
    fov: 34,
    dist: 7.0,
    objects: [
      { shape: "ring", ndc: [0.88, 0.0], wide: [0.88, 0.0], tall: [0.7, 0.06], s: 1.25, ts: 0.8, z: 0, tint: "accent", spin: [0.02, 0.045, 0.012], rot: [0.42, -0.3, 0.12] },
      { shape: "sphere", ndc: [-1.06, -0.92], wide: [-1.06, -0.92], tall: [-0.92, 0.92], s: 1.3, ts: 0.9, z: -0.6, tint: "glass", spin: [0, 0, 0], rot: [0, 0, 0] },
    ],
  },
};

export function createGlass({ canvas, container, variant = "hero", onReady, onSlow, gate }) {
  const spec = SCENES[variant] || SCENES.hero;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const force = location.search.includes("3d=force");
  const hero = variant === "hero";
  let theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

  // probe first: constructing a renderer on a machine without WebGL makes three
  // log its own console errors, and a disabled GPU is not an error
  const probe = document.createElement("canvas");
  const gl2 = probe.getContext("webgl2") || probe.getContext("webgl");
  if (!gl2) return null;
  gl2.getExtension("WEBGL_lose_context")?.loseContext();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      // MSAA is off on purpose: the pixel budget below is what keeps the page
      // smooth, and soft glass shows the difference far less than a 2× fill cost
      antialias: false,
      alpha: true,
      powerPreference: hero ? "high-performance" : "low-power",
      stencil: false,
      depth: true,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  // software renderers (VM, remote desktop, CI) get the cheap path
  let software = false;
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    software = /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    /* ignore */
  }
  const lowPower = software || location.search.includes("3d=low");

  const CLEAR = { light: 0xeef4f0, dark: 0x0c1210 };
  renderer.setClearColor(CLEAR[theme], 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = PALETTE[theme].exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.fov, 1, 0.1, 60);
  camera.position.set(0, 0, spec.dist);

  /* ------------------------------------------------------------ environment
     A neutral studio: white softboxes left/right/top, one cool bounce. Kept
     almost colourless on purpose — the glass should read as glass, not candy. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const buildEnv = (p, dark) => {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(dark ? 0x0b1113 : 0xa9b8b3);
    const geo = new THREE.PlaneGeometry(1, 1);
    const emit = (color, power, pos, scale) => {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(power),
          side: THREE.DoubleSide,
        }),
      );
      m.position.set(pos[0], pos[1], pos[2]);
      m.scale.set(scale[0], scale[1], 1);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    emit(0xffffff, dark ? 3.0 : 4.0, [0, 5.2, 2.4], [7.4, 2.0]); // softbox above
    emit(0xffffff, 2.6, [-5.2, 0.4, 2.6], [2.6, 5.6]); // side kicker
    emit(0xe8fff8, 0.9, [5.2, -1.8, 2.2], [2.2, 3.6]); // cool fill
    emit(0x1b2725, dark ? 0.5 : 1.5, [2.2, 2.4, -5], [5, 3.4]); // dark card: edges
    emit(dark ? 0x070b0a : 0x141d1b, dark ? 0.2 : 0.7, [0, -5, -4.2], [8, 4]);
    const rt = pmrem.fromScene(envScene, 0.03);
    envScene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose?.();
        o.material.dispose?.();
      }
    });
    return rt;
  };
  let envRT = buildEnv(PALETTE[theme], theme === "dark");
  scene.environment = envRT.texture;
  pmrem.dispose();

  /* ------------------------------------------------------------------ lights */
  const p0 = PALETTE[theme];
  const key = new THREE.DirectionalLight(p0.key, p0.keyI);
  key.position.set(3.2, 4.4, 5.0);
  const fill = new THREE.DirectionalLight(p0.fill, p0.fillI);
  fill.position.set(-5, 0.4, 3.2);
  const rim = new THREE.DirectionalLight(p0.rim, p0.rimI);
  rim.position.set(-1.4, -3.2, -3.8);
  scene.add(key, fill, rim);

  /* --------------------------------------------------------------- materials */
  const glass = (tint, opts = {}) => {
    const p = PALETTE[theme];
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(tint === "accent" ? p.accent : p.glass),
      metalness: 0,
      roughness: 0.06,
      transparent: true,
      opacity: tint === "accent" ? 0.46 : 0.4,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      iridescence: 0,
      envMapIntensity: p.env,
      specularIntensity: 1,
      // one shell per mesh: the far side does not fight the near side for depth
      depthWrite: false,
      side: THREE.FrontSide,
      ...opts,
    });
  };

  /* ---------------------------------------------------------------- geometry */
  const d = lowPower ? 0.55 : 1;
  const geo = {};
  const shape = (name) => {
    if (geo[name]) return geo[name];
    let g;
    if (name === "ring") {
      // a thick ring with a flat-ish section: the highlight sweeps round in one
      // unbroken arc, which is what sells the glass
      g = new THREE.TorusGeometry(1, 0.3, Math.round(64 * d), Math.round(240 * d));
      g.scale(1, 1, 0.6);
    } else {
      // everything else is the plainest form there is
      g = new THREE.SphereGeometry(1, Math.round(96 * d), Math.round(64 * d));
    }
    geo[name] = g;
    return g;
  };

  const world = new THREE.Group();
  scene.add(world);

  const items = spec.objects.map((cfg) => {
    const geo = shape(cfg.shape);
    const front = glass(cfg.tint, cfg.mat || {});
    front.renderOrder = 1;
    const mesh = new THREE.Mesh(geo, front);
    mesh.name = cfg.shape;
    if (cfg.rot) mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
    mesh.frustumCulled = false;
    world.add(mesh);

    /* a second shell seen from inside: two blended faces read as volume, and it
       costs one extra draw call instead of a whole second render pass */
    const back = glass(cfg.tint, { ...(cfg.mat || {}), opacity: front.opacity * 0.6, side: THREE.BackSide });
    back.renderOrder = 0;
    const shell = new THREE.Mesh(geo, back);
    shell.position.copy(mesh.position);
    shell.rotation.copy(mesh.rotation);
    shell.frustumCulled = false;
    world.add(shell);

    return {
      cfg,
      mesh,
      shell,
      base: new THREE.Vector3(),
      form: cfg.form || [1, 1, 1],
      scale: cfg.s,
      spin: cfg.spin,
      phase: Math.random() * Math.PI * 2,
    };
  });

  /* ------------------------------------------------------------------ layout */
  const state = {
    pointer: new THREE.Vector2(),
    target: new THREE.Vector2(),
    time: 0,
    intro: reduce ? 1 : 0,
    introStart: 0,
    visible: false,
  };

  const resize = () => {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const cap = lowPower ? 1 : hero ? 1.15 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.position.z = spec.dist;
    camera.updateMatrixWorld();

    // portrait screens get a stacked composition; small square canvases do not
    const portrait = w / h < 0.95;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * spec.dist;
    // on a narrow frame the height-based unit would overflow the width entirely
    const unit = portrait ? Math.min(halfH, halfH * camera.aspect * 1.05) * 1.2 : halfH;
    const tmp = new THREE.Vector3();
    for (const item of items) {
      const ndc = portrait ? item.cfg.tall : item.cfg.wide;
      tmp.set(ndc[0], ndc[1], 0.5).unproject(camera).sub(camera.position).normalize();
      const dist = (item.cfg.z - camera.position.z) / tmp.z;
      item.base.copy(camera.position).addScaledVector(tmp, dist);
      // a narrow frame gets the same objects a size down: the copy column sits
      // right on top of them there
      item.scale = (portrait && item.cfg.ts ? item.cfg.ts : item.cfg.s) * unit;
      item.mesh.scale.set(item.scale * item.form[0], item.scale * item.form[1], item.scale * item.form[2]);
      item.shell.position.copy(item.mesh.position);
      item.shell.rotation.copy(item.mesh.rotation);
      item.shell.scale.copy(item.mesh.scale);
      if (!state.introStart) item.mesh.position.copy(item.base);
    }
  };

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ------------------------------------------------------------- interaction */
  const onPointer = (e) => {
    const r = container.getBoundingClientRect();
    state.target.set(
      THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1),
    );
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  /* ------------------------------------------------------------------- frame */
  const perf = { start: 0, frames: 0, done: !hero || force };
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  let stopTick = null;

  /* the page shares one rAF loop: 24 fps of very slowly turning glass is
     invisible next to the smoothness the marquee and the reveals gain back */
  let acc = 0;
  const STEP = 1 / 24;

  const frame = (rawDt) => {
    acc += rawDt;
    if (acc < STEP) return;
    const dt = acc;
    acc = 0;

    if (!perf.done) {
      if (!perf.start) perf.start = performance.now();
      perf.frames += 1;
      if (perf.frames === 6) perf.start = performance.now();
      if (perf.frames >= 36) {
        perf.done = true;
        const ms = (performance.now() - perf.start) / 30;
        if (ms > 46 && onSlow) {
          onSlow();
          return;
        }
        if (ms > 28) renderer.setPixelRatio(1);
      }
    }

    state.time += dt;
    const t = state.time;
    if (state.introStart) state.intro = Math.min(1, (performance.now() - state.introStart) / 1100);
    const e = easeOut(state.intro);

    state.pointer.lerp(state.target, 0.05);
    const px = state.pointer.x;
    const py = state.pointer.y;

    world.rotation.y = px * (hero ? 0.14 : 0.2);
    world.rotation.x = -py * 0.09;
    world.position.y = (1 - e) * -0.45;

    for (const item of items) {
      item.mesh.position.set(
        item.base.x + Math.sin(t * 0.4 + item.phase) * 0.05,
        item.base.y + Math.cos(t * 0.33 + item.phase) * 0.06 + (1 - e) * -0.4,
        item.base.z + Math.sin(t * 0.28 + item.phase) * 0.05 + px * 0.1,
      );
      item.mesh.position.x += px * 0.08;
      item.mesh.position.y += -py * 0.05;
      item.mesh.rotation.x += dt * item.spin[0];
      item.mesh.rotation.y += dt * item.spin[1];
      item.mesh.rotation.z += dt * item.spin[2];
      const k = item.scale * (0.88 + 0.12 * e);
      item.mesh.scale.set(k * item.form[0], k * item.form[1], k * item.form[2]);
      item.shell.position.copy(item.mesh.position);
      item.shell.rotation.copy(item.mesh.rotation);
      item.shell.scale.copy(item.mesh.scale);
    }

    renderer.render(scene, camera);
  };

  const allowed = () => !gate || gate();

  const subscribe = () => {
    if (stopTick || !allowed()) return;
    state.introStart = state.introStart || performance.now();
    stopTick = onTick(frame);
  };
  const unsubscribe = () => {
    if (stopTick) stopTick();
    stopTick = null;
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      state.visible = entry.isIntersecting;
      if (reduce) return;
      if (state.visible && allowed()) subscribe();
      else unsubscribe();
    },
    { rootMargin: "120px 0px", threshold: 0.01 },
  );
  io.observe(container);

  if (reduce) {
    state.intro = 1;
    for (const item of items) {
      item.mesh.position.copy(item.base);
      item.shell.position.copy(item.base);
    }
    renderer.render(scene, camera);
  }
  onReady?.();

  /* -------------------------------------------------------------------- theme */
  const setTheme = (next) => {
    theme = next === "dark" ? "dark" : "light";
    const p = PALETTE[theme];
    renderer.toneMappingExposure = p.exposure;
    renderer.setClearColor(CLEAR[theme], 0);
    key.color.set(p.key);
    key.intensity = p.keyI;
    fill.color.set(p.fill);
    fill.intensity = p.fillI;
    rim.color.set(p.rim);
    rim.intensity = p.rimI;
    for (const item of items) {
      for (const m of [item.mesh.material, item.shell.material]) {
        m.color.set(item.cfg.tint === "accent" ? p.accent : p.glass);
        m.envMapIntensity = p.env;
        m.needsUpdate = true;
      }
    }
    if (reduce || !state.visible) renderer.render(scene, camera);
  };

  // the page decides which sculpture is allowed to run; a stopped scene keeps
  // its last frame until it is picked again
  const refresh = () => {
    if (reduce) return;
    if (state.visible && allowed()) subscribe();
    else unsubscribe();
  };

  return {
    el: container,
    setTheme,
    start: subscribe,
    stop: unsubscribe,
    refresh,
    dispose() {
      unsubscribe();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      renderer.dispose();
      envRT.dispose?.();
      for (const g of Object.values(geo)) g.dispose();
      for (const item of items) {
        item.mesh.material.dispose();
        item.shell.material.dispose();
      }
    },
  };
}
