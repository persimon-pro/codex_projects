import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const quat = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

/** Every component has four physical poses. Components retract into the solid
 * housing when unused; their materials remain opaque throughout the sequence. */
function pose(position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  return { position: v3(...position), scale: v3(...scale), quaternion: quat(...rotation) };
}
const tucked = (x = 0, y = 0, z = 0) => pose([x, y, z], [0.002, 0.002, 0.002]);

function studioEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x070909);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials = [];
  const panel = (w, h, x, y, z, color, brightness) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(brightness), side: THREE.DoubleSide,
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  };
  panel(4.5, 8, -4.8, 3.2, 4.5, 0xfff4df, 4.8);
  panel(5.5, 2.3, 0.4, 5.4, 1.5, 0xffffff, 4.2);
  panel(1.15, 7, 4.8, 0.2, 2.7, 0xdbe7f0, 3.9);
  panel(6, 0.65, -0.5, -4.2, 3.6, 0xf1e4cf, 2.4);
  panel(3, 5.4, 1, 0.5, -5, 0xffffff, 1.1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const result = pmrem.fromScene(studio, 0.045, 0.1, 50);
  geometry.dispose();
  materials.forEach((material) => material.dispose());
  pmrem.dispose();
  studio.clear();
  return result;
}

/** A bevelled, extruded rounded perimeter with a shared vertex topology. The
 * tiny central aperture closes the camera/microphone slabs; it opens into the
 * laptop bezel, then into the cast Instagram frame. No object is swapped. */
class MorphHousing {
  constructor(material, definitions) {
    this.definitions = definitions.map((definition) => ({
      ...definition,
      pose: pose(definition.position, [1, 1, 1], definition.rotation),
    }));
    this.samples = 96;
    this.rings = 20;
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.samples * this.rings * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const indices = [];
    for (let ring = 0; ring < this.rings; ring += 1) {
      for (let i = 0; i < this.samples; i += 1) {
        const a = ring * this.samples + i;
        const b = ring * this.samples + (i + 1) % this.samples;
        const c = ((ring + 1) % this.rings) * this.samples + i;
        const d = ((ring + 1) % this.rings) * this.samples + (i + 1) % this.samples;
        indices.push(a, c, b, b, c, d);
      }
    }
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.params = {};
    this.update(0, 0, 0);
  }

  update(a, b, t) {
    const from = this.definitions[a];
    const to = this.definitions[b];
    const p = this.params;
    ['width', 'height', 'radius', 'depth', 'bevel', 'innerWidth', 'innerHeight', 'innerRadius'].forEach((key) => {
      p[key] = mix(from[key], to[key], t);
    });
    this.mesh.position.lerpVectors(from.pose.position, to.pose.position, t);
    this.mesh.quaternion.slerpQuaternions(from.pose.quaternion, to.pose.quaternion, t);
    const attribute = this.geometry.attributes.position;
    const positions = attribute.array;
    // Four quarter arcs around the outside and inside bevels, with flat front,
    // back, and wall strips between them. Normals are shared across the bevels.
    const sections = [];
    const bevel = Math.min(p.bevel, p.depth * 0.46, p.width * 0.2, p.height * 0.2);
    const innerBevel = Math.min(bevel, Math.max(0.00025, Math.min(p.innerWidth, p.innerHeight) * 0.22));
    const half = p.depth / 2;
    for (let j = 0; j < 5; j += 1) {
      const angle = j / 4 * PI / 2;
      sections.push([p.width - 2 * bevel * (1 - Math.sin(angle)), p.height - 2 * bevel * (1 - Math.sin(angle)), p.radius - bevel * (1 - Math.sin(angle)), half - bevel * (1 - Math.cos(angle))]);
    }
    for (let j = 0; j < 5; j += 1) {
      const angle = j / 4 * PI / 2;
      sections.push([p.width - 2 * bevel * (1 - Math.cos(angle)), p.height - 2 * bevel * (1 - Math.cos(angle)), p.radius - bevel * (1 - Math.cos(angle)), -half + bevel * (1 - Math.sin(angle))]);
    }
    for (let j = 0; j < 5; j += 1) {
      const angle = j / 4 * PI / 2;
      sections.push([p.innerWidth + 2 * innerBevel * (1 - Math.sin(angle)), p.innerHeight + 2 * innerBevel * (1 - Math.sin(angle)), p.innerRadius + innerBevel * (1 - Math.sin(angle)), -half + innerBevel * (1 - Math.cos(angle))]);
    }
    for (let j = 0; j < 5; j += 1) {
      const angle = j / 4 * PI / 2;
      sections.push([p.innerWidth + 2 * innerBevel * (1 - Math.cos(angle)), p.innerHeight + 2 * innerBevel * (1 - Math.cos(angle)), p.innerRadius + innerBevel * (1 - Math.cos(angle)), half - innerBevel * (1 - Math.sin(angle))]);
    }
    sections.forEach(([width, height, radius, z], ring) => {
      const r = clamp(radius, 0.0001, Math.min(width, height) / 2);
      for (let i = 0; i < this.samples; i += 1) {
        const quadrant = Math.floor(i / (this.samples / 4));
        const theta = (i % (this.samples / 4)) / (this.samples / 4) * PI / 2 + quadrant * PI / 2;
        const sx = quadrant === 0 || quadrant === 3 ? 1 : -1;
        const sy = quadrant < 2 ? 1 : -1;
        const index = (ring * this.samples + i) * 3;
        positions[index] = sx * (width / 2 - r) + Math.cos(theta) * r;
        positions[index + 1] = sy * (height / 2 - r) + Math.sin(theta) * r;
        positions[index + 2] = z;
      }
    });
    attribute.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

const housing = (width, height, radius, depth, bevel, position, rotation = [0, 0, 0], opening = [0.004, 0.004, 0.002]) => ({
  width, height, radius, depth, bevel, position, rotation,
  innerWidth: opening[0], innerHeight: opening[1], innerRadius: opening[2],
});

/** Camera → microphone → laptop → Instagram. The caller owns the timeline;
 * rendering is entirely on demand, including with reduced motion enabled. */
export function initDeviceMorph(container) {
  if (!container) throw new Error('A device morph container is required.');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x090a0a, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  const canvas = renderer.domElement;
  canvas.className = 'loft-device-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0, 11.8);
  let environment = studioEnvironment(renderer);
  scene.environment = environment.texture;
  const key = new THREE.DirectionalLight(0xfff6e7, 3.1);
  key.position.set(-3.5, 5, 6);
  const rim = new THREE.DirectionalLight(0xe8f2ff, 2.2);
  rim.position.set(5, 1.5, 3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(0, -3, 5);
  scene.add(key, rim, fill);

  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xc8c7c1, metalness: 1, roughness: 0.19, envMapIntensity: 1.18, clearcoat: 0.15, clearcoatRoughness: 0.24 });
  const satin = new THREE.MeshStandardMaterial({ color: 0xa9aaa6, metalness: 0.94, roughness: 0.29, envMapIntensity: 1.2 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x181b1c, metalness: 0.62, roughness: 0.31, envMapIntensity: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101212, metalness: 0.18, roughness: 0.56 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x10191c, metalness: 0.65, roughness: 0.14, envMapIntensity: 0.72, clearcoat: 1, clearcoatRoughness: 0.08 });
  const optical = new THREE.MeshPhysicalMaterial({ color: 0x071315, metalness: 0.55, roughness: 0.055, clearcoat: 1, envMapIntensity: 0.65 });
  const materials = [chrome, satin, graphite, rubber, glass, optical];

  const rig = new THREE.Group();
  const sculpture = new THREE.Group();
  rig.add(sculpture);
  scene.add(rig);
  const geometries = [];
  const box = new RoundedBoxGeometry(1, 1, 1, 3, 0.15);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 64, 1, false);
  const ring = new THREE.TorusGeometry(1, 0.095, 12, 80);
  const fineRing = new THREE.TorusGeometry(1, 0.038, 10, 80);
  const sphere = new THREE.SphereGeometry(1, 32, 16);
  geometries.push(box, cylinder, ring, fineRing, sphere);
  const parts = [];
  const addPart = (geometry, material, states) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    sculpture.add(mesh);
    parts.push({ mesh, states });
    return mesh;
  };
  const panels = [];
  const addHousing = (material, definitions) => {
    const component = new MorphHousing(material, definitions);
    sculpture.add(component.mesh);
    panels.push(component);
    geometries.push(component.geometry);
    return component;
  };

  // One continuous solid shell is the camera body, capsule, laptop bezel, and
  // social icon. The aperture opens in the actual vertex geometry.
  addHousing(chrome, [
    housing(3.65, 2.24, 0.28, 0.84, 0.085, [0, 0, 0]),
    housing(1.38, 2.12, 0.64, 1.02, 0.15, [0, 0.72, 0]),
    housing(4.05, 2.55, 0.13, 0.17, 0.035, [0, 0.42, -1.17], [-0.22, 0, 0], [3.72, 2.22, 0.055]),
    housing(3.5, 3.5, 0.88, 0.34, 0.075, [0, 0, 0], [0, 0, 0], [2.72, 2.72, 0.5]),
  ]);

  // The same inset glass grows from the camera's lens into a capsule grille and
  // the laptop's screen, then slides inside the final sculpture.
  addHousing(glass, [
    housing(1.37, 1.37, 0.685, 0.055, 0.016, [-0.3, -0.04, 1.405]),
    housing(1.12, 1.81, 0.54, 0.065, 0.022, [0, 0.76, 0.525]),
    housing(3.73, 2.23, 0.065, 0.032, 0.01, [0, 0.42 + Math.sin(0.22) * 0.09, -1.17 + Math.cos(0.22) * 0.09], [-0.22, 0, 0]),
    housing(0.015, 0.015, 0.007, 0.015, 0.003, [0, -1.57, 0]),
  ]);

  // Raised shutter housing → microphone stem → trackpad → upper-right dot.
  addHousing(satin, [
    housing(1.02, 0.42, 0.12, 0.6, 0.055, [-0.15, 1.16, -0.03]),
    housing(0.23, 1.02, 0.11, 0.23, 0.045, [0, -1.12, 0]),
    housing(1.28, 0.63, 0.08, 0.022, 0.006, [0, -0.879, 0.75], [-PI / 2, 0, 0]),
    housing(0.43, 0.43, 0.215, 0.24, 0.045, [0.96, 0.97, 0.06]),
  ]);

  // Camera's proud hand grip becomes the weighted mic foot and laptop deck.
  addPart(box, satin, [
    pose([1.37, -0.03, 0.14], [0.81, 2.2, 1.02]),
    pose([0, -1.71, 0], [1.96, 0.19, 1.38]),
    pose([0, -0.99, 0.13], [4.26, 0.17, 2.65]),
    tucked(0, -1.56, 0),
  ]);
  addHousing(rubber, [
    housing(0.62, 1.94, 0.19, 0.1, 0.025, [1.39, -0.03, 0.68]),
    housing(0.01, 0.01, 0.005, 0.01, 0.002, [0, -0.1, 0]),
    housing(3.48, 1.2, 0.1, 0.022, 0.006, [0, -0.892, -0.23], [-PI / 2, 0, 0]),
    housing(0.01, 0.01, 0.005, 0.01, 0.002, [0, -1.56, 0]),
  ]);

  // Lens barrel rotates upright into the mic collar, then sideways into the
  // laptop's hinge. All transformations occur within this stable component pool.
  addPart(cylinder, graphite, [
    pose([-0.3, -0.04, 0.88], [0.94, 0.86, 0.94], [PI / 2, 0, 0]),
    pose([0, -0.28, 0], [0.51, 0.23, 0.41]),
    pose([0, -0.855, -1.0], [0.1, 3.55, 0.1], [0, 0, -PI / 2]),
    tucked(0, -1.56, 0),
  ]);
  addPart(ring, chrome, [
    pose([-0.3, -0.04, 1.26], [0.885, 0.885, 0.75]),
    pose([0, -0.14, 0], [0.60, 0.44, 0.57], [PI / 2, 0, 0]),
    pose([-1.72, -0.855, -1.0], [0.12, 0.12, 0.16], [0, PI / 2, 0]),
    pose([0, 0, 0.07], [0.87, 0.87, 1.0]),
  ]);
  addPart(fineRing, satin, [
    pose([-0.3, -0.04, 1.36], [0.775, 0.775, 1]),
    pose([0, 1.49, 0], [0.40, 0.36, 0.9], [PI / 2, 0, 0]),
    pose([1.72, -0.855, -1.0], [0.12, 0.12, 0.2], [0, PI / 2, 0]),
    tucked(0, -1.56, 0),
  ]);
  addPart(fineRing, chrome, [
    pose([-0.3, -0.04, 1.417], [0.684, 0.684, 0.8]),
    pose([0, -0.01, 0], [0.60, 0.44, 0.7], [PI / 2, 0, 0]),
    pose([0, -0.855, -1.0], [0.12, 0.12, 0.2], [0, PI / 2, 0]),
    tucked(0, -1.56, 0),
  ]);
  addPart(sphere, optical, [
    pose([-0.3, -0.04, 1.438], [0.285, 0.285, 0.023]),
    tucked(0, 0.72, 0),
    pose([0, 1.57, -1.33], [0.026, 0.026, 0.012], [-0.22, 0, 0]),
    tucked(0, -1.56, 0),
  ]);

  // Camera top controls become the swivel screws at the microphone's shoulders.
  [-1, 1].forEach((side) => {
    addPart(cylinder, chrome, [
      pose([side === 1 ? 1.34 : -1.27, 1.17, 0.10], [side === 1 ? 0.20 : 0.27, 0.12, side === 1 ? 0.20 : 0.27]),
      pose([side * 0.79, 0.40, 0], [0.17, 0.18, 0.17], [0, 0, PI / 2]),
      pose([side * 1.99, -0.96, 0.78], [0.045, 0.018, 0.045]),
      tucked(side * 1.55, -1.55, 0),
    ]);
    addPart(box, satin, [
      tucked(side * 1.4, 0, 0),
      pose([side * 0.86, -0.02, 0], [0.16, 1.10, 0.25]),
      tucked(side * 1.8, -0.96, -0.95),
      tucked(side * 1.55, -1.55, 0),
    ]);
  });
  addPart(box, satin, [
    tucked(0, -0.8, 0),
    pose([0, -0.56, 0], [1.83, 0.17, 0.26]),
    tucked(0, -0.96, -0.95),
    tucked(0, -1.55, 0),
  ]);

  // Machined details retain their original solid geometry and material split.
  // Two instance pools avoid 57 separate draw calls on low-power/software GPUs.
  const detailPools = [
    new THREE.InstancedMesh(box, satin, 16),
    new THREE.InstancedMesh(box, graphite, 41),
  ];
  detailPools.forEach((pool) => {
    pool.frustumCulled = false;
    pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sculpture.add(pool);
  });
  for (let i = 0; i < 57; i += 1) {
    const angle = i / 57 * TAU;
    const cameraPose = pose([-0.3 + Math.cos(angle) * 0.949, -0.04 + Math.sin(angle) * 0.949, 0.99], [0.032, 0.072, 0.19], [0, 0, angle]);
    let microphonePose = tucked(0, 0.72, 0);
    if (i < 16) {
      const y = -0.04 + i * 0.108;
      const dy = Math.max(0, Math.abs(y - 0.76) - 0.365);
      const halfWidth = 0.555 - 0.50 + Math.sqrt(Math.max(0.0001, 0.5 ** 2 - dy ** 2));
      microphonePose = pose([0, y, 0.585], [Math.min(1.1, halfWidth * 2), 0.045, 0.085]);
    }
    let laptopPose;
    if (i < 52) {
      const row = Math.floor(i / 13);
      const col = i % 13;
      laptopPose = pose([(col - 6) * 0.253, -0.863, -0.67 + row * 0.225], [0.222, 0.035, 0.172]);
    } else {
      const bottom = [
        [-1.46, 0.33], [-1.07, 0.33], [0, 1.66], [1.07, 0.33], [1.46, 0.33],
      ][i - 52];
      laptopPose = pose([bottom[0], -0.863, 0.23], [bottom[1], 0.035, 0.172]);
    }
    parts.push({
      mesh: new THREE.Object3D(),
      states: [cameraPose, microphonePose, laptopPose, tucked(0, -1.56, 0)],
      instancePool: detailPools[i < 16 ? 0 : 1],
      instanceIndex: i < 16 ? i : i - 16,
    });
  }

  // Two barely raised side seams give the camera a readable manufactured body.
  addPart(box, graphite, [
    pose([-1.1, 0.78, 0.435], [0.43, 0.16, 0.035]),
    tucked(0, 0.7, 0), tucked(0, -0.95, 0), tucked(0, -1.56, 0),
  ]);

  const rigPoses = [
    pose([0, 0, 0], [1, 1, 1], [0.15, -0.40, 0.075]),
    pose([0, 0.03, 0], [1, 1, 1], [0.08, -0.29, -0.065]),
    pose([0, -0.05, 0], [0.9, 0.9, 0.9], [0.37, -0.30, -0.04]),
    pose([0, 0, 0], [1, 1, 1], [0.12, -0.24, -0.075]),
  ];

  let disposed = false;
  let paused = false;
  let visible = true;
  let contextLost = false;
  let frameId = 0;
  let progress = 0;
  let renderedProgress = -1;
  let renderedPose = -1;
  let renderedPointerX = NaN;
  let renderedPointerY = NaN;
  let forceDraw = true;
  let pointerX = 0;
  let pointerY = 0;
  let baseScale = 1;
  let baseY = 0;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let previousFrameTime = 0;
  let renderRequestedAt = 0;
  let lastRenderEnded = 0;
  let slowFrames = 0;
  const resetRenderBudget = () => {
    previousFrameTime = 0;
    lastRenderEnded = 0;
    slowFrames = 0;
  };
  const pointerQuaternion = new THREE.Quaternion();
  const pointerEuler = new THREE.Euler();

  const canRender = () => !disposed && visible && !document.hidden && !contextLost;
  const render = (now = 0) => {
    frameId = 0;
    if (!canRender()) return;
    const value = motionPreference.matches ? Math.round(progress * 3) / 3 : progress;
    const progressDelta = Math.abs(value - renderedProgress);
    const hadProgress = renderedProgress >= 0;
    renderedProgress = value;
    const scaled = value * 3;
    const a = Math.min(2, Math.floor(scaled));
    const b = a + 1;
    const t = ease(clamp((scaled - a - 0.16) / 0.68, 0, 1));
    // a+t is canonical across adjacent pairs: (camera,mic,1) and
    // (mic,laptop,0) are the exact same physical microphone pose.
    const poseValue = a + t;
    const poseChanged = poseValue !== renderedPose;
    const effectivePointerX = motionPreference.matches || paused ? 0 : pointerX;
    const effectivePointerY = motionPreference.matches || paused ? 0 : pointerY;
    const pointerChanged = effectivePointerX !== renderedPointerX || effectivePointerY !== renderedPointerY;
    if (!forceDraw && !poseChanged && !pointerChanged) {
      // Timeline progress still advances through a hold, but geometry, matrices,
      // and the framebuffer remain untouched. Holds are idle budget samples.
      resetRenderBudget();
      renderRequestedAt = 0;
      return;
    }
    // Measure an active stream of small progress updates using RAF timestamps.
    // Static jumps, pointer-only frames, and resumed tabs do not count as slow
    // animation frames. Long GPU stalls can still trigger the fallback.
    const activeMotion = now > 0 && !paused && !motionPreference.matches
      && hadProgress && poseChanged && progressDelta > 0 && progressDelta < 0.18;
    const elapsed = previousFrameTime ? now - previousFrameTime : 0;
    const idle = lastRenderEnded ? Math.max(0, renderRequestedAt - lastRenderEnded) : Infinity;
    if (activeMotion && elapsed > 0 && idle < 1200) {
      slowFrames = elapsed > 55 ? slowFrames + 1 : 0;
      if (slowFrames >= 2 && renderer.getPixelRatio() > 0.6) {
        renderer.setPixelRatio(Math.max(0.6, renderer.getPixelRatio() * 0.7));
        renderer.setSize(viewportWidth, viewportHeight, false);
        slowFrames = 0;
      }
    } else slowFrames = 0;
    previousFrameTime = activeMotion ? now : 0;
    renderRequestedAt = 0;
    if (poseChanged) {
      panels.forEach((panel) => panel.update(a, b, t));
      parts.forEach(({ mesh, states, instancePool, instanceIndex }) => {
        mesh.position.lerpVectors(states[a].position, states[b].position, t);
        mesh.scale.lerpVectors(states[a].scale, states[b].scale, t);
        mesh.quaternion.slerpQuaternions(states[a].quaternion, states[b].quaternion, t);
        if (instancePool) {
          mesh.updateMatrix();
          instancePool.setMatrixAt(instanceIndex, mesh.matrix);
        }
      });
      detailPools.forEach((pool) => { pool.instanceMatrix.needsUpdate = true; });
    }
    const from = rigPoses[a];
    const to = rigPoses[b];
    sculpture.position.lerpVectors(from.position, to.position, t);
    sculpture.scale.lerpVectors(from.scale, to.scale, t);
    sculpture.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t);
    pointerEuler.set(effectivePointerY * 0.055, effectivePointerX * 0.085, effectivePointerX * -0.012);
    pointerQuaternion.setFromEuler(pointerEuler);
    sculpture.quaternion.premultiply(pointerQuaternion);
    rig.scale.setScalar(baseScale);
    rig.position.y = baseY;
    renderer.render(scene, camera);
    renderedPose = poseValue;
    renderedPointerX = effectivePointerX;
    renderedPointerY = effectivePointerY;
    forceDraw = false;
    lastRenderEnded = performance.now();
  };
  const requestRender = () => {
    if (canRender() && !frameId) {
      renderRequestedAt = performance.now();
      frameId = requestAnimationFrame(render);
    }
  };
  const stopFrame = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    renderRequestedAt = 0;
    resetRenderBudget();
  };
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    viewportWidth = width;
    viewportHeight = height;
    forceDraw = true;
    resetRenderBudget();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const viewWidth = viewHeight * camera.aspect;
    // The widest form is the open laptop; the microphone sets the vertical fit.
    // This uses the actual visual container, with no desktop-specific x offset.
    baseScale = Math.min(viewWidth / 5.0, viewHeight / 5.15) * (width < 600 ? 0.94 : 1.03);
    baseY = viewHeight * 0.012;
    requestRender();
  };
  const onVisibility = () => {
    resetRenderBudget();
    if (document.hidden) stopFrame(); else requestRender();
  };
  const onMotionPreference = () => {
    forceDraw = true;
    resetRenderBudget();
    renderedProgress = -1;
    requestRender();
  };
  const onContextLost = (event) => {
    event.preventDefault();
    contextLost = true;
    stopFrame();
    container.dispatchEvent(new CustomEvent('device-scene-context-lost'));
  };
  const onContextRestored = () => {
    environment.dispose();
    environment = studioEnvironment(renderer);
    scene.environment = environment.texture;
    contextLost = false;
    forceDraw = true;
    resetRenderBudget();
    renderedProgress = -1;
    container.dispatchEvent(new CustomEvent('device-scene-context-restored'));
    requestRender();
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  const visibilityObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resetRenderBudget();
    if (visible) requestRender(); else stopFrame();
  }, { rootMargin: '0px', threshold: 0 }) : null;
  document.addEventListener('visibilitychange', onVisibility);
  motionPreference.addEventListener('change', onMotionPreference);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  container.appendChild(canvas);
  resizeObserver?.observe(container);
  visibilityObserver?.observe(container);
  if (!resizeObserver) window.addEventListener('resize', resize, { passive: true });
  resize();
  // The controller can reveal this canvas immediately after synchronous init.
  stopFrame();
  render();

  return {
    setProgress(value) {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      const bounded = clamp(next, 0, 1);
      if (bounded === progress && renderedProgress !== -1) return;
      progress = bounded;
      requestRender();
    },
    setPointer(x, y = 0) {
      if (typeof x === 'object' && x !== null) { y = x.y ?? 0; x = x.x ?? 0; }
      const nextX = paused ? 0 : clamp(Number(x) || 0, -1, 1);
      const nextY = paused ? 0 : clamp(Number(y) || 0, -1, 1);
      if (nextX === pointerX && nextY === pointerY) return;
      pointerX = nextX;
      pointerY = nextY;
      requestRender();
    },
    setPaused(value) {
      const next = Boolean(value);
      if (next === paused) return;
      paused = next;
      resetRenderBudget();
      if (paused) { pointerX = 0; pointerY = 0; }
      // There is no ambient animation. Pausing suppresses pointer motion, while
      // explicit progress/resize updates can still produce a single new frame.
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopFrame();
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      motionPreference.removeEventListener('change', onMotionPreference);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      detailPools.forEach((pool) => pool.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      environment.dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
