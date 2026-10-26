import { gsap } from 'gsap';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => value * value * (3 - 2 * value);

// Curved centre lines follow the handwriting in the original LOFT artwork:
// L downstroke and sweep, O loop, F stem and bars, then T bar and downstroke.
// They control a soft ink mask; the actual transparent PNG supplies every edge.
const brushStrokes = [
  { width: 7.5, weight: 0.32, curves: [[[35, 7], [31, 15], [26, 26], [11, 40]]] },
  { width: 7, weight: 0.22, curves: [[[11, 39], [18, 34], [33, 31], [45, 26]]] },
  { width: 5.8, weight: 0.41, curves: [
    [[38.5, 16.8], [46, 10.5], [51, 15], [46, 23]],
    [[46, 23], [42, 29], [32, 33], [33, 25]],
    [[33, 25], [33, 20], [35, 17], [40, 16]],
  ] },
  { width: 6.8, weight: 0.28, curves: [[[56, 8], [53, 17], [47, 28], [44, 39]]] },
  { width: 6.5, weight: 0.2, curves: [[[52, 15], [58, 12], [65, 10], [72, 8]]] },
  { width: 5, weight: 0.15, curves: [[[48, 24], [54, 23], [60, 21], [66, 20]]] },
  { width: 7, weight: 0.23, curves: [[[63, 18], [72, 14], [87, 11], [98, 8]]] },
  { width: 7, weight: 0.24, curves: [[[75, 15], [73, 22], [69, 30], [67, 35]]] },
];

function prepareInk(image) {
  const layer = document.createElement('canvas');
  layer.width = image.naturalWidth;
  layer.height = image.naturalHeight;
  const inkContext = layer.getContext('2d', { willReadFrequently: true });
  if (!inkContext) return null;
  inkContext.drawImage(image, 0, 0);
  const original = inkContext.getImageData(0, 0, layer.width, layer.height);
  const frame = inkContext.createImageData(layer.width, layer.height);
  const totalWeight = brushStrokes.reduce((sum, stroke) => sum + stroke.weight, 0);
  const routes = [];
  let start = 0;
  for (const stroke of brushStrokes) {
    const points = [];
    for (const curve of stroke.curves) {
      for (let sample = 0; sample <= 32; sample += 1) {
        const t = sample / 32;
        const s = 1 - t;
        const value = axis => s ** 3 * curve[0][axis] + 3 * s * s * t * curve[1][axis]
          + 3 * s * t * t * curve[2][axis] + t ** 3 * curve[3][axis];
        points.push([value(0) / 100 * layer.width, value(1) / 46 * layer.height]);
      }
    }
    let length = 0;
    const segments = [];
    for (let index = 1; index < points.length; index += 1) {
      const [x, y] = points[index - 1];
      const dx = points[index][0] - x;
      const dy = points[index][1] - y;
      const square = dx * dx + dy * dy;
      if (!square) continue;
      const size = Math.sqrt(square);
      segments.push({ x, y, dx, dy, inverse: 1 / square, start: length, length: size });
      length += size;
    }
    routes.push({ segments, length, start, weight: stroke.weight, width: stroke.width });
    start += stroke.weight;
  }

  const ink = [];
  for (let offset = 0; offset < original.data.length; offset += 4) {
    const alpha = original.data[offset + 3];
    if (!alpha) continue;
    const x = (offset / 4) % layer.width + 0.5;
    const y = Math.floor(offset / 4 / layer.width) + 0.5;
    let arrival = 0.91;
    if (x < layer.width * 0.744 || y < layer.height * 0.744) {
      let best = Infinity;
      for (const route of routes) {
        for (const segment of route.segments) {
          const along = clamp(((x - segment.x) * segment.dx + (y - segment.y) * segment.dy) * segment.inverse);
          const dx = x - segment.x - segment.dx * along;
          const dy = y - segment.y - segment.dy * along;
          const distance = (dx * dx + dy * dy) / (route.width * route.width);
          if (distance >= best) continue;
          best = distance;
          arrival = (route.start + (segment.start + segment.length * along) / route.length * route.weight) / totalWeight * 0.94;
        }
      }
    }
    frame.data[offset] = original.data[offset];
    frame.data[offset + 1] = original.data[offset + 1];
    frame.data[offset + 2] = original.data[offset + 2];
    ink.push({ offset: offset + 3, alpha, arrival });
  }
  if (!ink.length) return null;
  return { layer, context: inkContext, frame, ink };
}

// This short, self-contained Canvas 2D introduction never requires WebGL.
export function initLogoIntro() {
  const bootstrap = window.__LOFT_INTRO_BOOTSTRAP__;
  const interactedBeforeLoad = Boolean(bootstrap?.interacted);
  bootstrap?.dispose?.();
  delete window.__LOFT_INTRO_BOOTSTRAP__;
  const loader = document.querySelector('#loader.logo-intro');
  const root = document.documentElement;
  if (!loader) {
    root.removeAttribute('data-loft-loading');
    return { finished: Promise.resolve(), destroy() {} };
  }

  const canvas = loader.querySelector('.logo-intro-canvas');
  const image = loader.querySelector('.logo-intro-image');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const options = new URLSearchParams(window.location.search);
  const replay = options.get('intro') === 'brush';
  const fullMotion = replay && options.get('motion') === 'full';
  const cleanups = [];
  let resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  let complete = false;
  let started = false;
  let timeline;
  let resizeObserver;
  let watchdog = 0;
  let assetTimeout = 0;
  let stillTimeout = 0;
  let cancelAssetWait;
  let context;
  let paint;
  let width = 1;
  let height = 1;
  let logoWidth = 1;
  let logoHeight = 1;
  const state = { write: 0, dissolve: 0 };

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
    if (paint) { paint.layer.width = paint.layer.height = 1; paint = undefined; }
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
  if (interactedBeforeLoad || (!replay && (window.location.hash || window.scrollY > 10
    || navigation?.type === 'back_forward'))) {
    finish();
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
    if (complete || !context || !paint) return;
    context.clearRect(0, 0, width, height);
    // Every original ink pixel has an arrival time along a curved brush stroke.
    // A feathered front paints continuously, including the dry-brush texture;
    // nothing flies in and no final image swap changes the silhouette.
    for (const pixel of paint.ink) {
      const reveal = smooth(clamp((state.write - pixel.arrival) / 0.06));
      paint.frame.data[pixel.offset] = Math.round(pixel.alpha * reveal);
    }
    paint.context.putImageData(paint.frame, 0, 0);
    context.save();
    context.globalAlpha = Math.pow(1 - state.dissolve, 1.35);
    context.filter = state.dissolve ? `blur(${(state.dissolve * 7).toFixed(2)}px)` : 'none';
    context.drawImage(paint.layer, (width - logoWidth) / 2, (height - logoHeight) / 2, logoWidth, logoHeight);
    context.restore();
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
    draw();
  }

  async function prepare() {
    const ready = await waitForImage();
    if (complete) return;
    if (!ready || !canvas) { fallback(); return; }
    try {
      context = canvas.getContext('2d', { alpha: true });
      if (!context) { fallback(); return; }
      paint = prepareInk(image);
      if (!paint) { fallback(); return; }
      resize();
      loader.classList.add('is-canvas-ready');
      phase('assembling');
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(loader);
      } else listen(window, 'resize', resize, { passive: true });
      timeline = gsap.timeline({ onUpdate: draw, onComplete: finish });
      timeline.to(state, { write: 1, duration: 2.1, ease: 'sine.inOut' }, 0)
        .call(() => phase('assembled'), [], 2.1)
        .call(() => phase('dissolving'), [], 2.55)
        .to(state, { dissolve: 1, duration: 0.95, ease: 'sine.inOut' }, 2.55)
        .to(loader, { autoAlpha: 0, duration: 0.5, ease: 'sine.inOut' }, 3.05);
    } catch {
      fallback();
    }
  }

  function start() {
    if (complete || started || document.hidden) return;
    if (!replay && (window.location.hash || window.scrollY > 10)) {
      finish();
      return;
    }
    started = true;
    if (replay) {
      if (window.location.hash) {
        const replayUrl = new URL(window.location.href);
        replayUrl.hash = '';
        try {
          window.history.replaceState(window.history.state, '', replayUrl);
        } catch {
          // A browser history restriction must not prevent the intro guard.
        }
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    // The CSS guard may already have released a slow-loading page. Eligible
    // visits still play; the separate runtime animation restarts its guard.
    loader.hidden = false;
    loader.classList.remove('hidden');
    loader.style.removeProperty('opacity');
    loader.style.removeProperty('visibility');
    root.setAttribute('data-loft-loading', '');
    loader.dataset.introState = 'playing';
    loader.dataset.introEffect = 'brush';
    loader.classList.add('is-playing');
    loader.setAttribute('data-intro-active', '');
    // The runtime guard starts only when the page can actually show the intro.
    // CSS provides a separate bootstrap guard while the application loads.
    watchdog = window.setTimeout(finish, 5000);
    root.setAttribute('data-loft-intro-active', '');
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(name => {
      listen(window, name, finish, { capture: true, passive: true });
    });
    listen(motion, 'change', finish);
    if (motion.matches && !fullMotion) {
      phase('assembled');
      stillTimeout = window.setTimeout(finish, 160);
      return;
    }
    prepare().catch(fallback);
  }

  listen(document, 'visibilitychange', () => {
    if (complete) return;
    if (!started && !document.hidden) start();
    else if (started && document.hidden) finish();
  });
  if (document.hidden) {
    loader.dataset.introState = 'waiting';
    root.removeAttribute('data-loft-intro-active');
  } else start();
  return { finished, destroy: finish };
}
