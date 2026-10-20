import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TAU = Math.PI * 2;
const FORMS = [
  { color: '#d6d6d2', roughness: .19, metalness: 1, coat: .8 },
  { color: '#c6a974', roughness: .23, metalness: 1, coat: .7 },
  { color: '#747d86', roughness: .12, metalness: 1, coat: 1 },
];

// All three forms share a closed tube topology, so the metal actually changes
// shape between modes. No model download, crossfade, or duplicated canvas.
function makeSculptureGeometry(segments, sides) {
  const centers = [
    t => new THREE.Vector3(1.23 * Math.cos(t), 1.23 * Math.sin(t), .14 * Math.sin(t * 3)),
    t => {
      const radius = 1 + .38 * Math.cos(t * 3);
      return new THREE.Vector3(radius * Math.cos(t * 2), radius * Math.sin(t * 2), .48 * Math.sin(t * 3));
    },
    t => new THREE.Vector3(1.32 * Math.sin(t), .89 * Math.sin(t * 2), .55 * Math.cos(t)),
  ];
  const geometries = centers.map((centerAt, form) => {
    const positions = [], normals = [], uv = [], indices = [];
    const reference = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments * TAU;
      const center = centerAt(t);
      const tangent = centerAt(t + .0001).sub(centerAt(t - .0001)).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, reference).normalize();
      const binormal = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      // A closed sweep must end with a whole number of cross-section turns.
      // Half a turn joins opposite sides of the tube and leaves an open seam.
      const twist = form === 2 ? t * 2 : form === 1 ? t : 0;
      const broad = form === 0 ? .36 : form === 1 ? .32 : .36;
      const narrow = form === 2 ? .19 : broad;
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * TAU + twist;
        const wave = 1 + .035 * Math.cos(j / sides * TAU * 5);
        const radial = normal.clone().multiplyScalar(Math.cos(a) * broad * wave)
          .addScaledVector(binormal, Math.sin(a) * narrow * wave);
        const p = center.clone().add(radial);
        positions.push(p.x, p.y, p.z);
        radial.normalize();
        normals.push(radial.x, radial.y, radial.z);
        uv.push(i / segments, j / sides);
        if (i < segments && j < sides) {
          const a0 = i * (sides + 1) + j, b = a0 + sides + 1;
          indices.push(a0, b, a0 + 1, b, b + 1, a0 + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    return geometry;
  });
  const geometry = geometries[0];
  geometry.morphAttributes.position = geometries.map(form => form.getAttribute('position').clone());
  geometry.morphAttributes.normal = geometries.map(form => form.getAttribute('normal').clone());
  geometry.morphTargetsRelative = false;
  // Avoid clipping when a target extends outside the original ring.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.1);
  geometries.slice(1).forEach(form => form.dispose());
  return geometry;
}

/** A deliberately small, locally generated, interactive piece of digital metal. */
export function initLiquidSculpture(motionMediaQuery) {
  const section = document.getElementById('loft-lab');
  const viewport = section?.querySelector('.lab-viewport');
  if (!section || !viewport) return { destroy() {} };

  const motion = motionMediaQuery || matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const compact = matchMedia('(max-width: 800px)');
  const buttons = [...section.querySelectorAll('[data-lab-mode]')];
  const energyInput = section.querySelector('[data-lab-energy]');
  const resetButton = section.querySelector('[data-lab-reset]');
  const pauseButton = section.querySelector('[data-lab-pause]');
  const disposables = [];
  const removals = [];
  const state = { mode: 0, energy: .35, scroll: 0, dragX: 0, dragY: 0, paused: false };
  const pointer = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  const uniforms = { time: { value: 0 }, energy: { value: .35 }, motion: { value: motion.matches ? 0 : 1 } };
  let renderer, scene, camera, sculpture, group, dust, environment;
  let material, morphTween, colorTween, surfaceTween, scrollTrigger;
  let destroyed = false, booted = false, failed = false, visible = false;
  let frame = 0, lastTime = 0, elapsed = 0, dragging = false, pointerId;
  let lastPointer = { x: 0, y: 0 };
  let pointerOrigin = { x: 0, y: 0 };
  let touchPending = false;
  let resizeObserver;

  function listen(target, event, handler, options) {
    target?.addEventListener(event, handler, options);
    removals.push(() => target?.removeEventListener(event, handler, options));
  }

  function updateLabels() {
    const russian = document.documentElement.lang === 'ru';
    section.dataset.labMode = String(state.mode);
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.mode)));
    if (energyInput) energyInput.value = String(Math.round(state.energy * 100));
    const value = section.querySelector('[data-lab-energy-value]');
    if (value) value.textContent = `${Math.round(state.energy * 100)}%`;
    const index = section.querySelector('[data-lab-index]');
    if (index) index.textContent = `0${state.mode + 1}`;
    const name = section.querySelector('[data-lab-mode-name]');
    if (name) {
      const button = buttons[state.mode];
      const caption = button?.cloneNode(true);
      caption?.querySelector('.lab-mode-number')?.remove();
      name.textContent = button?.dataset.labLabel || button?.querySelector(russian ? '.lang-ru' : '.lang-en')?.textContent.trim() || caption?.textContent.trim() || '';
    }
    if (pauseButton) {
      pauseButton.setAttribute('aria-pressed', String(state.paused));
      pauseButton.setAttribute('aria-label', state.paused
        ? (russian ? 'Продолжить движение скульптуры' : 'Resume sculpture motion')
        : (russian ? 'Приостановить движение скульптуры' : 'Pause sculpture motion'));
      pauseButton.title = pauseButton.getAttribute('aria-label');
    }
    const status = section.querySelector('[data-lab-status]');
    if (status) status.textContent = failed || motion.matches
      ? (russian ? 'Статичная форма' : 'Still form')
      : state.paused ? (russian ? 'Движение приостановлено' : 'Motion paused')
      : (russian ? 'Живая материя' : 'Living matter');
  }

  function requestDraw() {
    if (destroyed || failed || !booted || !visible || document.hidden || frame) return;
    frame = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function draw(now) {
    frame = 0;
    if (destroyed || failed || !renderer || !visible || document.hidden) return;
    const delta = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0;
    lastTime = now;
    if (!motion.matches && !state.paused) elapsed += delta;
    uniforms.time.value = elapsed;
    uniforms.energy.value = state.energy;
    const factor = state.paused ? 1 : 1 - Math.exp(-delta * 5.5);
    smooth.x += (pointer.x - smooth.x) * factor;
    smooth.y += (pointer.y - smooth.y) * factor;
    const dynamic = motion.matches ? 0 : 1;
    group.rotation.x = -.35 + dynamic * (smooth.y * .2 + state.dragY + state.scroll * .3);
    group.rotation.y = .3 + dynamic * (elapsed * (.065 + state.energy * .055) + smooth.x * .3 + state.dragX + state.scroll * 1.3);
    group.rotation.z = -.25 + dynamic * Math.sin(elapsed * .3) * .07;
    group.position.y = dynamic * Math.sin(elapsed * .65) * .055;
    dust.rotation.z = elapsed * .015 * dynamic;
    dust.material.opacity = .4 + state.energy * .3;
    renderer.render(scene, camera);
    if (!motion.matches && !state.paused) requestDraw();
  }

  function resize() {
    if (!renderer || destroyed || failed) return;
    const { width, height } = viewport.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, compact.matches ? 1 : 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = compact.matches ? 5.8 : 7.3;
    camera.updateProjectionMatrix();
    group.position.x = compact.matches ? 0 : Math.min(1.25, camera.aspect * .6);
    // Keep the sculpture clear of the title on short landscape viewports.
    const size = compact.matches ? .9 : height < 650 ? .76 : .9;
    group.scale.setScalar(size);
    requestDraw();
  }

  function selectMode(mode, immediate = false) {
    state.mode = THREE.MathUtils.clamp(Number(mode) || 0, 0, 2);
    updateLabels();
    if (!sculpture) return;
    morphTween?.kill(); colorTween?.kill(); surfaceTween?.kill();
    const weights = { 0: 0, 1: 0, 2: 0 };
    weights[state.mode] = 1;
    const form = FORMS[state.mode], color = new THREE.Color(form.color);
    if (motion.matches || immediate) {
      sculpture.morphTargetInfluences.fill(0);
      sculpture.morphTargetInfluences[state.mode] = 1;
      material.color.copy(color);
      material.roughness = form.roughness;
      material.clearcoat = form.coat;
      requestDraw();
    } else {
      morphTween = gsap.to(sculpture.morphTargetInfluences, { ...weights, duration: 1.5, ease: 'power3.inOut', onUpdate: requestDraw });
      colorTween = gsap.to(material.color, { r: color.r, g: color.g, b: color.b, duration: 1.2, ease: 'power2.inOut', onUpdate: requestDraw });
      surfaceTween = gsap.to(material, { roughness: form.roughness, clearcoat: form.coat, duration: 1.2, onUpdate: requestDraw });
    }
  }

  function resetPointer() {
    pointer.x = pointer.y = 0;
    dragging = false;
    touchPending = false;
    if (pointerId !== undefined && viewport.hasPointerCapture?.(pointerId)) viewport.releasePointerCapture(pointerId);
    pointerId = undefined;
    viewport.classList.remove('is-dragging');
    requestDraw();
  }

  function syncMotion() {
    stop();
    resetPointer();
    state.dragX = state.dragY = 0;
    smooth.x = smooth.y = 0;
    uniforms.motion.value = motion.matches ? 0 : 1;
    scrollTrigger?.kill();
    scrollTrigger = undefined;
    if (!motion.matches && !destroyed) {
      scrollTrigger = ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: self => { state.scroll = self.progress; requestDraw(); },
      });
    }
    selectMode(state.mode, true);
    requestDraw();
  }

  function fallback() {
    failed = true;
    stop();
    section.dataset.labState = 'static';
    viewport.classList.remove('is-ready', 'is-dragging');
    renderer?.domElement.remove();
    updateLabels();
  }

  function boot() {
    if (destroyed || booted || failed) return;
    booted = true;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !compact.matches, alpha: true, powerPreference: 'low-power' });
      renderer.domElement.className = 'loft-lab-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.setClearColor(0x090a09, 0);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, 1, .1, 40);
      scene.add(new THREE.AmbientLight(0xe8e6df, .18));
      const key = new THREE.DirectionalLight(0xfff4dc, 1.8);
      key.position.set(-3, 5, 4); scene.add(key);
      const rim = new THREE.DirectionalLight(0xaebfdb, 2.5);
      rim.position.set(4, 0, -3); scene.add(rim);
      const room = new RoomEnvironment();
      // Dark studio walls with isolated softboxes preserve the deep reflections
      // that make chrome read as metal instead of an almost-white plastic.
      room.traverse(object => {
        if (object.isPointLight) object.intensity *= .1;
        if (!object.isMesh) return;
        if (object.material.isMeshStandardMaterial) object.material.color.set(0x1b1e19);
        if (object.material.emissiveIntensity) object.material.emissiveIntensity *= .35;
      });
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(room, .02);
      scene.environment = environment.texture;
      room.dispose(); pmrem.dispose();
      group = new THREE.Group(); scene.add(group);
      const geometry = makeSculptureGeometry(compact.matches ? 116 : 172, compact.matches ? 18 : 24);
      material = new THREE.MeshPhysicalMaterial({
        color: FORMS[0].color, metalness: 1, roughness: .19,
        clearcoat: .8, clearcoatRoughness: .18, envMapIntensity: 1.1,
      });
      material.onBeforeCompile = shader => {
        shader.uniforms.uLabTime = uniforms.time;
        shader.uniforms.uLabEnergy = uniforms.energy;
        shader.uniforms.uLabMotion = uniforms.motion;
        shader.vertexShader = `uniform float uLabTime;\nuniform float uLabEnergy;\nuniform float uLabMotion;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <displacementmap_vertex>', `
          #include <displacementmap_vertex>
          float ripple = sin(transformed.x * 5.0 + transformed.y * 3.0 + uLabTime * 1.2)
            * sin(transformed.z * 4.0 - uLabTime * .7);
          transformed += objectNormal * ripple * uLabEnergy * .075 * uLabMotion;
        `);
      };
      sculpture = new THREE.Mesh(geometry, material); group.add(sculpture);
      disposables.push(geometry, material);

      // Thin orbit paths establish scale without turning the composition into
      // a particle background. The small glints live in the same 3D space.
      const orbitMaterial = new THREE.LineBasicMaterial({ color: 0xc4ac7e, transparent: true, opacity: .18 });
      disposables.push(orbitMaterial);
      for (let index = 0; index < 2; index++) {
        const points = Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * TAU) * 2.05, Math.sin(i / 128 * TAU) * 2.05, 0));
        const orbitGeometry = new THREE.BufferGeometry().setFromPoints(points);
        disposables.push(orbitGeometry);
        const orbit = new THREE.Line(orbitGeometry, orbitMaterial);
        orbit.rotation.set(1.05 + index * .4, index * .8, index * .5);
        group.add(orbit);
      }
      const particlePositions = [];
      for (let i = 0; i < 50; i++) {
        const a = i * 2.399963, radius = 1.85 + (i % 7) / 10;
        particlePositions.push(Math.cos(a) * radius, Math.sin(a) * radius, Math.sin(i * 7.13) * .9);
      }
      const dustGeometry = new THREE.BufferGeometry();
      dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
      const dustMaterial = new THREE.PointsMaterial({ color: 0xe4d3b0, size: .014, transparent: true, opacity: .5, depthWrite: false });
      dust = new THREE.Points(dustGeometry, dustMaterial); group.add(dust);
      disposables.push(dustGeometry, dustMaterial);
      viewport.append(renderer.domElement);
      listen(renderer.domElement, 'webglcontextlost', event => { event.preventDefault(); fallback(); });
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(viewport);
      resize();
      selectMode(state.mode, true);
      section.dataset.labState = 'ready';
      viewport.classList.add('is-ready');
      requestDraw();
    } catch {
      // The CSS sculpture is present before this module, so lack of WebGL does
      // not remove the section, its copy, or any control.
      fallback();
    }
  }

  buttons.forEach((button, index) => listen(button, 'click', () => {
    boot();
    selectMode(button.getAttribute('data-lab-mode') ?? index);
  }));
  listen(energyInput, 'input', () => {
    state.energy = THREE.MathUtils.clamp(Number(energyInput.value) / 100, 0, 1);
    updateLabels(); requestDraw();
  });
  listen(resetButton, 'click', () => {
    state.energy = .35;
    state.dragX = state.dragY = 0;
    resetPointer();
    selectMode(0);
  });
  listen(pauseButton, 'click', () => {
    state.paused = !state.paused;
    stop();
    updateLabels();
    requestDraw();
  });
  listen(viewport, 'pointerdown', event => {
    if (motion.matches || event.button !== 0 || (event.pointerType !== 'touch' && !finePointer.matches)) return;
    boot();
    pointerId = event.pointerId;
    touchPending = event.pointerType === 'touch';
    dragging = !touchPending;
    lastPointer = { x: event.clientX, y: event.clientY };
    pointerOrigin = { ...lastPointer };
    if (dragging) {
      viewport.setPointerCapture?.(pointerId);
      viewport.classList.add('is-dragging');
    }
  });
  listen(viewport, 'pointermove', event => {
    if (motion.matches || (event.pointerType !== 'touch' && !finePointer.matches)) return;
    if (event.pointerType === 'touch') {
      if (event.pointerId !== pointerId) return;
      if (touchPending) {
        const dx = event.clientX - pointerOrigin.x, dy = event.clientY - pointerOrigin.y;
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { resetPointer(); return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
        touchPending = false;
        dragging = true;
        viewport.setPointerCapture?.(pointerId);
      }
      if (!dragging) return;
    }
    const bounds = viewport.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    pointer.y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
    if (dragging) {
      state.dragX += (event.clientX - lastPointer.x) * .006;
      state.dragY = THREE.MathUtils.clamp(state.dragY + (event.clientY - lastPointer.y) * .004, -.9, .9);
      lastPointer = { x: event.clientX, y: event.clientY };
    }
    requestDraw();
  }, { passive: true });
  listen(viewport, 'pointerup', resetPointer);
  listen(viewport, 'pointercancel', resetPointer);
  listen(viewport, 'pointerleave', () => { if (!dragging) resetPointer(); });
  listen(window, 'blur', resetPointer);
  listen(finePointer, 'change', resetPointer);
  listen(motion, 'change', syncMotion);
  listen(compact, 'change', resize);
  listen(document, 'visibilitychange', () => { if (document.hidden) stop(); else requestDraw(); });

  const preload = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { boot(); preload.disconnect(); }
  }, { rootMargin: '300px' });
  preload.observe(section);
  const visibility = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { boot(); requestDraw(); }
    else { stop(); resetPointer(); }
  });
  visibility.observe(section.querySelector('.lab-sticky') || viewport);
  const language = new MutationObserver(updateLabels);
  language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  updateLabels();
  syncMotion();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop(); resetPointer();
      removals.forEach(remove => remove());
      language.disconnect();
      preload.disconnect(); visibility.disconnect(); resizeObserver?.disconnect();
      scrollTrigger?.kill(); morphTween?.kill(); colorTween?.kill(); surfaceTween?.kill();
      disposables.forEach(resource => resource.dispose());
      environment?.dispose();
      renderer?.dispose(); renderer?.domElement.remove();
      viewport.classList.remove('is-ready');
    },
  };
}
