import { gsap } from 'gsap';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => value * value * (3 - 2 * value);

// The particles are sampled from the real, transparent LOFT artwork. The
// canvas belongs only to this short introduction and never requires WebGL.
export function initLogoIntro() {
  const loader = document.querySelector('#loader.logo-intro');
  const root = document.documentElement;
  if (!loader) {
    root.removeAttribute('data-loft-loading');
    return { finished: Promise.resolve(), destroy() {} };
  }

  const canvas = loader.querySelector('.logo-intro-canvas');
  const image = loader.querySelector('.logo-intro-image');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cleanups = [];
  let resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  let complete = false;
  let timeline;
  let resizeObserver;
  let watchdog = 0;
  let assetTimeout = 0;
  let stillTimeout = 0;
  let cancelAssetWait;
  let context;
  let particles = [];
  let width = 1;
  let height = 1;
  let logoWidth = 1;
  let logoHeight = 1;
  let particleSize = 1;
  let sourceInkArea = 1;
  const state = { gather: 0, dissolve: 0, image: 0 };

  const listen = (target, name, callback, options) => {
    target.addEventListener(name, callback, options);
    cleanups.push(() => target.removeEventListener(name, callback, options));
  };
  const phase = name => { loader.dataset.introPhase = name; };

  function finish() {
    if (complete) return;
    complete = true;
    timeline?.kill();
    timeline = undefined;
    clearTimeout(watchdog);
    clearTimeout(assetTimeout);
    clearTimeout(stillTimeout);
    cancelAssetWait?.();
    resizeObserver?.disconnect();
    cleanups.splice(0).forEach(cleanup => cleanup());
    particles = [];
    context?.clearRect(0, 0, width, height);
    phase('complete');
    loader.dataset.introState = 'done';
    loader.classList.remove('is-playing');
    loader.removeAttribute('data-intro-active');
    loader.classList.add('hidden');
    root.removeAttribute('data-loft-intro-active');
    root.removeAttribute('data-loft-loading');
    resolveFinished();
    window.dispatchEvent(new CustomEvent('loft:intro-complete'));
  }

  const navigation = performance.getEntriesByType?.('navigation')[0];
  if (document.hidden || window.location.hash || window.scrollY > 10
    || navigation?.type === 'back_forward' || loader.classList.contains('hidden')
    || getComputedStyle(loader).visibility === 'hidden') {
    finish();
    return { finished, destroy: finish };
  }

  loader.dataset.introState = 'playing';
  loader.classList.add('is-playing');
  loader.setAttribute('data-intro-active', '');
  // A broken asset, interrupted timeline, or backgrounded tab cannot leave a
  // full-screen overlay over the page. CSS provides a separate bootstrap guard.
  watchdog = window.setTimeout(finish, 5000);
  root.setAttribute('data-loft-intro-active', '');
  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(name => {
    listen(window, name, finish, { capture: true, passive: true });
  });
  listen(document, 'visibilitychange', () => { if (document.hidden) finish(); });
  listen(motion, 'change', finish);

  if (motion.matches) {
    phase('assembled');
    stillTimeout = window.setTimeout(finish, 160);
    return { finished, destroy: finish };
  }

  function fallback() {
    if (complete) return;
    timeline?.kill();
    loader.classList.remove('is-canvas-ready');
    phase('assembled');
    timeline = gsap.to(loader, {
      autoAlpha: 0,
      duration: 0.28,
      ease: 'power1.out',
      onComplete: finish,
    });
  }

  function waitForImage() {
    if (!image) return Promise.resolve(false);
    if (image.complete) return Promise.resolve(image.naturalWidth > 0);
    return new Promise(resolve => {
      let settled = false;
      const settle = ready => {
        if (settled) return;
        settled = true;
        clearTimeout(assetTimeout);
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        cancelAssetWait = undefined;
        resolve(ready);
      };
      const onLoad = () => settle(image.naturalWidth > 0);
      const onError = () => settle(false);
      cancelAssetWait = () => settle(false);
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      assetTimeout = window.setTimeout(onError, 900);
    });
  }

  function draw() {
    if (complete || !context) return;
    context.clearRect(0, 0, width, height);
    const particleOpacity = 1 - state.image;
    for (const warm of [false, true]) {
      context.fillStyle = warm ? '#c9b58d' : '#eeeae1';
      for (const particle of particles) {
        if (particle.warm !== warm) continue;
        const gathered = smooth(clamp((state.gather - particle.delay * 0.17) / 0.83));
        const dissolved = smooth(clamp((state.dissolve - particle.delay * 0.16) / 0.84));
        const targetX = width / 2 + particle.u * logoWidth;
        const targetY = height / 2 + particle.v * logoHeight;
        const curl = Math.sin((1 - gathered) * Math.PI);
        const x = targetX + particle.startX * width * (1 - gathered)
          + Math.sin(particle.angle + gathered * 2.8) * curl * logoWidth * 0.12
          + particle.driftX * width * dissolved;
        const y = targetY + particle.startY * height * (1 - gathered)
          + Math.cos(particle.angle + gathered * 2.2) * curl * logoWidth * 0.07
          + particle.driftY * height * dissolved;
        const alpha = particle.alpha * (0.22 + gathered * 0.78)
          * Math.pow(1 - dissolved, 1.35) * particleOpacity;
        if (alpha < 0.006) continue;
        context.globalAlpha = alpha;
        const size = particleSize * particle.size * (1 - dissolved * 0.42);
        context.fillRect(x - size / 2, y - size / 2, size, size * particle.aspect);
      }
    }
    if (state.image > 0) {
      context.globalAlpha = state.image;
      context.drawImage(image, (width - logoWidth) / 2, (height - logoHeight) / 2, logoWidth, logoHeight);
    }
    context.globalAlpha = 1;
  }

  function resize() {
    if (complete || !context) return;
    width = Math.max(1, loader.clientWidth || window.innerWidth);
    height = Math.max(1, loader.clientHeight || window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const rect = image.getBoundingClientRect();
    logoWidth = rect.width || Math.min(430, Math.max(180, width * 0.34));
    logoHeight = logoWidth * image.naturalHeight / image.naturalWidth;
    particleSize = Math.max(0.9, Math.sqrt(sourceInkArea / particles.length) * logoWidth / image.naturalWidth);
    draw();
  }

  async function prepare() {
    const ready = await waitForImage();
    if (complete) return;
    if (!ready || !canvas) { fallback(); return; }
    try {
      context = canvas.getContext('2d', { alpha: true });
      if (!context) { fallback(); return; }
      const sampling = document.createElement('canvas');
      sampling.width = image.naturalWidth;
      sampling.height = image.naturalHeight;
      const sampleContext = sampling.getContext('2d', { willReadFrequently: true });
      if (!sampleContext) { fallback(); return; }
      sampleContext.drawImage(image, 0, 0);
      const pixels = sampleContext.getImageData(0, 0, sampling.width, sampling.height).data;
      const candidates = [];
      for (let y = 0; y < sampling.height; y += 2) {
        for (let x = 0; x < sampling.width; x += 2) {
          const alpha = pixels[(y * sampling.width + x) * 4 + 3] / 255;
          if (alpha < 0.3) continue;
          candidates.push({ u: (x + 0.5) / sampling.width - 0.5, v: (y + 0.5) / sampling.height - 0.5, alpha });
        }
      }
      if (!candidates.length) { fallback(); return; }
      sourceInkArea = candidates.length * 4;
      let seed = 19457;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
      }
      particles = candidates.slice(0, window.innerWidth <= 600 ? 950 : 2100).map(target => ({
        ...target,
        startX: (random() - 0.5) * 1.25,
        startY: (random() - 0.5) * 0.95,
        driftX: (random() - 0.5) * 0.62,
        driftY: -(0.12 + random() * 0.45),
        angle: random() * Math.PI * 2,
        delay: random(),
        size: 0.75 + random() * 0.5,
        aspect: 0.65 + random() * 0.5,
        warm: random() < 0.07,
      }));
      resize();
      loader.classList.add('is-canvas-ready');
      phase('assembling');
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(loader);
      } else listen(window, 'resize', resize, { passive: true });
      timeline = gsap.timeline({ onUpdate: draw, onComplete: finish });
      timeline.to(state, { gather: 1, duration: 1.3, ease: 'power3.out' }, 0)
        .to(state, { image: 1, duration: 0.18, ease: 'none' }, 1.12)
        .call(() => phase('assembled'), [], 1.3)
        .call(() => phase('dissolving'), [], 1.85)
        .to(state, { image: 0, duration: 0.24, ease: 'none' }, 1.85)
        .to(state, { dissolve: 1, duration: 1, ease: 'power2.in' }, 1.85)
        .to(loader, { autoAlpha: 0, duration: 0.45, ease: 'power2.inOut' }, 2.65);
    } catch {
      fallback();
    }
  }

  prepare().catch(fallback);
  return { finished, destroy: finish };
}
