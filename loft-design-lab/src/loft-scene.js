import * as THREE from 'three';

const TAU = Math.PI * 2;

class RibbonPath extends THREE.Curve {
  constructor(pulse = false) {
    super();
    this.pulse = pulse;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const a = t * TAU;
    if (this.pulse) {
      const radius = 1.65 + 0.16 * Math.cos(a * 5);
      return target.set(radius * Math.cos(a), radius * Math.sin(a), 0.45 * Math.sin(a * 3));
    }
    return target.set(
      1.68 * Math.cos(a) * (1 + 0.07 * Math.sin(a * 2)),
      1.77 * Math.sin(a),
      0.38 * Math.sin(a * 2),
    );
  }
}

/** A closed solid ribbon with a softly rounded rectangular cross section. */
function sweptRibbon(pulse = false) {
  const path = new RibbonPath(pulse);
  const longitudinal = 256;
  const radial = 40;
  const frames = path.computeFrenetFrames(longitudinal, true);
  const positions = [];
  const indices = [];
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (let i = 0; i <= longitudinal; i += 1) {
    const t = i / longitudinal;
    const phase = t * TAU;
    const twist = pulse ? phase + Math.sin(phase * 3) * 0.24 : phase + Math.sin(phase) * 0.34;
    path.getPointAt(t, point);
    normal.copy(frames.normals[i]).multiplyScalar(Math.cos(twist));
    normal.addScaledVector(frames.binormals[i], Math.sin(twist));
    binormal.copy(frames.binormals[i]).multiplyScalar(Math.cos(twist));
    binormal.addScaledVector(frames.normals[i], -Math.sin(twist));
    for (let j = 0; j <= radial; j += 1) {
      const angle = (j / radial) * TAU;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const exponent = pulse ? 0.8 : 0.52;
      const u = Math.sign(c) * Math.pow(Math.abs(c), exponent) * (pulse ? 0.38 : 0.67);
      const v = Math.sign(s) * Math.pow(Math.abs(s), exponent) * (pulse ? 0.23 : 0.105);
      positions.push(
        point.x + normal.x * u + binormal.x * v,
        point.y + normal.y * u + binormal.y * v,
        point.z + normal.z * u + binormal.z * v,
      );
      if (i < longitudinal && j < radial) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const average = (a, b) => {
    normal.fromBufferAttribute(normals, a);
    binormal.fromBufferAttribute(normals, b);
    normal.add(binormal).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z);
    normals.setXYZ(b, normal.x, normal.y, normal.z);
  };
  for (let i = 0; i <= longitudinal; i += 1) average(i * (radial + 1), i * (radial + 1) + radial);
  for (let j = 0; j <= radial; j += 1) average(j, longitudinal * (radial + 1) + j);
  geometry.computeBoundingSphere();
  return geometry;
}

function roundedRectangle(path, width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  return path;
}

function cinemaFrameGeometry() {
  const shape = roundedRectangle(new THREE.Shape(), 3.75, 3.75, 0.55);
  shape.holes.push(roundedRectangle(new THREE.Path(), 3.22, 3.22, 0.35));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.15,
    bevelEnabled: true,
    bevelSize: 0.065,
    bevelThickness: 0.065,
    bevelSegments: 4,
    steps: 1,
    curveSegments: 28,
  });
  geometry.translate(0, 0, -0.075);
  return geometry;
}

function createStudio(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x090909);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials = [];
  const add = (width, height, x, y, z, intensity) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(intensity, intensity * 0.985, intensity * 0.94),
      side: THREE.DoubleSide,
    });
    materials.push(material);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, y, z);
    panel.scale.set(width, height, 1);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  };
  add(4, 8, -5, 3, 4, 4.5);
  add(6, 2.4, 0, 6, 1, 3.4);
  add(1.35, 7, 5, 0, 2, 3);
  add(7, 0.5, 0, -4, 3, 1.7);
  add(2.4, 6, 1, 0, -5, 1.1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.035);
  geometry.dispose();
  materials.forEach((material) => material.dispose());
  studio.clear();
  pmrem.dispose();
  return environment;
}

export function initLoftScene(container) {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x0c0c0c, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'loft-scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 60);
  camera.position.z = 11.6;
  const environment = createStudio(renderer);
  scene.environment = environment.texture;
  const key = new THREE.DirectionalLight(0xf0eee6, 2.5);
  key.position.set(-4, 6, 5);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(5, -2, 4);
  scene.add(key, rim);

  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xc3c2bd,
    metalness: 1,
    roughness: 0.19,
    envMapIntensity: 1.15,
    clearcoat: 0.2,
    clearcoatRoughness: 0.21,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d8b84,
    roughness: 0.3,
    metalness: 0.85,
  });

  const rig = new THREE.Group();
  const sculpture = new THREE.Group();
  rig.add(sculpture);
  scene.add(rig);
  const ribbonGeometry = sweptRibbon();
  const pulseGeometry = sweptRibbon(true);
  const frameGeometry = cinemaFrameGeometry();
  const forms = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  forms[0].add(new THREE.Mesh(ribbonGeometry, metal));
  for (let i = 0; i < 3; i += 1) {
    const frame = new THREE.Mesh(frameGeometry, metal);
    frame.rotation.z = (i - 1) * 0.31;
    frame.position.z = (i - 1) * 0.53;
    frame.scale.setScalar(1 - Math.abs(i - 1) * 0.05);
    forms[1].add(frame);
  }
  forms[2].add(new THREE.Mesh(pulseGeometry, metal));
  forms.forEach((form, index) => {
    form.visible = index === 0;
    sculpture.add(form);
  });

  // A single hairline picture frame recalls the viewfinder of a cinema camera.
  const outline = roundedRectangle(new THREE.Shape(), 5.0, 4.45, 1.1);
  const outlinePoints = outline.getPoints(64).map((point) => new THREE.Vector3(point.x, point.y, 0));
  const outlinePath = new THREE.CatmullRomCurve3(outlinePoints.slice(0, -1), true, 'centripetal');
  const outlineGeometry = new THREE.TubeGeometry(outlinePath, 192, 0.006, 6, true);
  const outlineMesh = new THREE.Mesh(outlineGeometry, edgeMaterial);
  outlineMesh.position.z = -0.85;
  outlineMesh.rotation.set(0.48, -0.5, -0.18);
  rig.add(outlineMesh);

  const dustPositions = new Float32Array(32 * 3);
  let seed = 902;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < dustPositions.length; i += 3) {
    dustPositions[i] = (random() - 0.5) * 13;
    dustPositions[i + 1] = (random() - 0.5) * 8;
    dustPositions[i + 2] = -1.5 - random() * 5;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ color: 0xddd9cb, size: 0.012, opacity: 0.27, transparent: true, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  let disposed = false;
  let visible = true;
  let paused = false;
  let frameId = 0;
  let lastTime = 0;
  let elapsed = 0;
  let scroll = 0;
  let scrollTarget = 0;
  let currentForm = 0;
  let pendingForm = null;
  let transitionScale = 1;
  let transitionStart = 0;
  let transitionFrom = 1;
  let growStart = 0;
  let baseX = 0;
  let baseY = 0;
  let baseScale = 1;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const pointer = new THREE.Vector2();
  const easedPointer = new THREE.Vector2();

  const render = (now) => {
    frameId = 0;
    if (disposed) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016;
    lastTime = now;
    const moving = !paused && !motionPreference.matches;
    if (moving) elapsed += dt;
    const blend = 1 - Math.exp(-dt * 5);
    scroll += (scrollTarget - scroll) * blend;
    easedPointer.lerp(pointer, blend);
    if (pendingForm !== null) {
      const amount = THREE.MathUtils.clamp((now - transitionStart) / 200, 0, 1);
      const eased = amount * amount * (3 - 2 * amount);
      transitionScale = THREE.MathUtils.lerp(transitionFrom, 0.035, eased);
      if (amount >= 1) {
        forms[currentForm].visible = false;
        currentForm = pendingForm;
        forms[currentForm].visible = true;
        pendingForm = null;
        growStart = now;
      }
    } else if (transitionScale < 1) {
      const amount = THREE.MathUtils.clamp((now - growStart) / 350, 0, 1);
      transitionScale = THREE.MathUtils.lerp(0.035, 1, 1 - Math.pow(1 - amount, 3));
    }

    const bob = motionPreference.matches ? 0 : Math.sin(elapsed * 0.65) * 0.08;
    rig.position.set(baseX, baseY + bob + scroll * 0.4, -scroll * 0.4);
    rig.scale.setScalar(baseScale * (1 - scroll * 0.055));
    sculpture.scale.setScalar(transitionScale);
    sculpture.rotation.set(
      0.22 + Math.sin(elapsed * 0.2) * 0.1 + easedPointer.y * 0.12 + dragY,
      -0.38 + elapsed * 0.075 + easedPointer.x * 0.17 + dragX + scroll * 0.65,
      -0.2 + Math.sin(elapsed * 0.14) * 0.07 - scroll * 0.15,
    );
    outlineMesh.rotation.z = -0.18 + Math.sin(elapsed * 0.15) * 0.035 + scroll * 0.1;
    dust.rotation.z = elapsed * 0.004;
    renderer.render(scene, camera);
    const changing = pendingForm !== null || Math.abs(transitionScale - 1) > 0.001
      || Math.abs(scrollTarget - scroll) > 0.001 || pointer.distanceToSquared(easedPointer) > 0.000001;
    if (visible && !document.hidden && (moving || changing)) frameId = requestAnimationFrame(render);
  };

  const requestRender = () => {
    if (!disposed && visible && !document.hidden && !frameId) {
      lastTime = 0;
      frameId = requestAnimationFrame(render);
    }
  };

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const mobile = width <= 800;
    camera.aspect = width / height;
    camera.fov = mobile ? 43 : 37;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;
    if (mobile) {
      baseScale = Math.min(0.87, visibleWidth / 5.95, visibleHeight * 330 / height / 5);
      baseX = 0.06;
      baseY = visibleHeight * 0.21;
    } else {
      baseScale = Math.min(1.06, visibleWidth * 0.098);
      baseX = visibleWidth * 0.24;
      baseY = visibleHeight * 0.05;
    }
    requestRender();
  };

  const onMove = (event) => {
    if (motionPreference.matches) return;
    const rect = container.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2,
      ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2,
    );
    if (dragging) {
      dragX += (event.clientX - lastPointerX) * 0.006;
      dragY += (event.clientY - lastPointerY) * 0.004;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    }
    requestRender();
  };
  const onDown = (event) => {
    if (event.pointerType !== 'mouse' || (event.target instanceof Element && event.target.closest('a,button,input,select,textarea'))) return;
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  };
  const onUp = () => { dragging = false; };
  const onLeave = () => { dragging = false; pointer.set(0, 0); };
  const onVisibility = () => {
    if (document.hidden && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else requestRender();
  };
  const onMotionPreference = () => { pointer.set(0, 0); requestRender(); };
  const onContextLost = (event) => {
    event.preventDefault();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  };
  const onContextRestored = () => requestRender();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) requestRender();
    else if (frameId) { cancelAnimationFrame(frameId); frameId = 0; }
  }, { rootMargin: '80px' });
  visibilityObserver.observe(container);
  container.addEventListener('pointermove', onMove, { passive: true });
  container.addEventListener('pointerdown', onDown, { passive: true });
  container.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  motionPreference.addEventListener('change', onMotionPreference);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  resize();

  return {
    setForm(index) {
      const value = Number(index);
      if (!Number.isFinite(value)) return;
      const next = ((Math.round(value) % forms.length) + forms.length) % forms.length;
      if (next === currentForm && pendingForm === null) return;
      if (motionPreference.matches) {
        forms[currentForm].visible = false;
        currentForm = next;
        forms[next].visible = true;
        pendingForm = null;
        transitionScale = 1;
      } else {
        pendingForm = next;
        transitionStart = performance.now();
        transitionFrom = transitionScale;
      }
      requestRender();
    },
    setPaused(value) {
      paused = Boolean(value);
      requestRender();
    },
    setProgress(value) {
      if (!Number.isFinite(value)) return;
      scrollTarget = THREE.MathUtils.clamp(value, 0, 1);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('visibilitychange', onVisibility);
      motionPreference.removeEventListener('change', onMotionPreference);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      [ribbonGeometry, pulseGeometry, frameGeometry, outlineGeometry, dustGeometry].forEach((geometry) => geometry.dispose());
      [metal, edgeMaterial, dustMaterial].forEach((material) => material.dispose());
      environment.dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
