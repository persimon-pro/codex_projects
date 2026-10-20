// The actual LOFT brush mark, reconstructed from its alpha mask. Canvas 2D
// keeps the introduction independent from the heavier WebGL scenes below it.
export function initLogoIntro(motionMediaQuery) {
  const motion = motionMediaQuery || window.matchMedia('(prefers-reduced-motion: reduce)');
  const loader = document.querySelector('#loader.logo-intro');
  let resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  let complete = false;
  let locked = false;
  let frame = 0;
  let budgetTimer = 0;
  let reducedTimer = 0;
  let resizeObserver;
  const listeners = [];
  const inertRecords = [];
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.getPropertyValue('overflow');
  const previousOverflowPriority = document.body.style.getPropertyPriority('overflow');
  const stage = loader?.querySelector('.logo-intro-stage');
  const canvas = loader?.querySelector('canvas.logo-intro-canvas');
  const mark = loader?.querySelector('[data-intro-logo]');
  const skip = loader?.querySelector('[data-intro-skip]');
  const previousTabIndex = loader?.getAttribute('tabindex');
  let context;
  let width = 0;
  let height = 0;
  let logoWidth = 0;
  let logoHeight = 0;
  let groups = [];

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }

  function releasePage() {
    if (!locked) return;
    locked = false;
    inertRecords.forEach(({ element, wasInert }) => { element.inert = wasInert; });
    if (previousOverflow) document.body.style.setProperty('overflow', previousOverflow, previousOverflowPriority);
    else document.body.style.removeProperty('overflow');
    if (previousTabIndex === null) loader.removeAttribute('tabindex');
    else if (previousTabIndex !== undefined) loader.setAttribute('tabindex', previousTabIndex);
    // A hidden skip button must not keep keyboard focus after the overlay goes.
    if (document.activeElement === loader) {
      loader.blur();
    } else if (loader.contains(document.activeElement)) {
      const destination = previousFocus instanceof HTMLElement && previousFocus.isConnected
        && previousFocus !== document.body && previousFocus !== document.documentElement
        && !loader.contains(previousFocus) ? previousFocus : document.querySelector('.nav-logo');
      destination?.focus({ preventScroll: true });
    }
  }

  function finish() {
    if (complete) return;
    complete = true;
    cancelAnimationFrame(frame);
    clearTimeout(budgetTimer);
    clearTimeout(reducedTimer);
    listeners.splice(0).forEach(remove => remove());
    resizeObserver?.disconnect();
    if (loader) {
      loader.dataset.introState = 'complete';
      loader.setAttribute('aria-busy', 'false');
      loader.classList.remove('is-playing', 'is-formed', 'is-leaving');
      loader.classList.add('hidden');
      loader.removeAttribute('aria-modal');
    }
    document.documentElement.removeAttribute('data-loft-loading');
    releasePage();
    groups = [];
    resolveFinished();
  }

  const controller = { finished, destroy: finish };
  if (!loader || !(canvas instanceof HTMLCanvasElement) || !(mark instanceof HTMLImageElement) || !stage) {
    finish();
    return controller;
  }
  const initialStyle = getComputedStyle(loader);
  const restoredNavigation = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (loader.classList.contains('hidden') || initialStyle.display === 'none' || initialStyle.visibility === 'hidden'
    || window.location.hash || window.scrollY > 8 || restoredNavigation || document.hidden) {
    finish();
    return controller;
  }

  // This timer is registered before image decoding, focus management or canvas
  // setup. Every later error or blocked asset therefore has the same exit path.
  budgetTimer = window.setTimeout(finish, 3300);
  const focusControl = () => {
    if (complete) return;
    const target = skip instanceof HTMLElement ? skip : loader;
    target.focus({ preventScroll: true });
  };
  document.body.style.setProperty('overflow', 'hidden');
  [...document.body.children].forEach(element => {
    if (!(element instanceof HTMLElement) || element === loader || element.contains(loader)
      || /^(SCRIPT|STYLE|LINK)$/.test(element.tagName)) return;
    inertRecords.push({ element, wasInert: element.inert });
    element.inert = true;
  });
  locked = true;
  loader.setAttribute('tabindex', '-1');
  loader.setAttribute('role', 'dialog');
  loader.setAttribute('aria-modal', 'true');
  loader.setAttribute('aria-busy', 'true');
  loader.dataset.introState = motion.matches ? 'formed' : 'assembling';

  function updateLabels() {
    const ru = document.documentElement.lang === 'ru';
    loader.setAttribute('aria-label', ru ? 'LOFT Creative House — вступление' : 'LOFT Creative House introduction');
    skip?.setAttribute('aria-label', ru ? 'Пропустить вступление' : 'Skip introduction');
  }
  updateLabels();
  listen(skip || loader, 'click', event => { if (skip) { event.preventDefault(); finish(); } });
  listen(document, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); finish(); }
    else if (event.key === 'Tab') { event.preventDefault(); focusControl(); }
  }, true);
  listen(document, 'focusin', event => { if (!complete && !loader.contains(event.target)) focusControl(); }, true);
  listen(document, 'visibilitychange', () => { if (document.hidden) finish(); });
  listen(window, 'pagehide', finish);
  listen(loader, 'animationend', event => {
    if (event.target === loader && event.animationName === 'cinema-loader-dismiss') finish();
  });
  listen(motion, 'change', () => { if (motion.matches) finish(); });
  // Keep the quiet composition free of a button focus ring until keyboard
  // input requests it. Tab still lands directly on the visible skip control.
  loader.focus({ preventScroll: true });

  if (motion.matches) {
    loader.classList.add('is-playing', 'is-formed');
    reducedTimer = window.setTimeout(finish, 150);
    return controller;
  }

  const easeOut = value => 1 - (1 - value) ** 3;
  let seed = 271828;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function resize() {
    if (complete || !context) return;
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    logoWidth = Math.min(width * 0.82, window.innerWidth <= 600 ? 280 : 420);
    logoHeight = logoWidth * mark.naturalHeight / mark.naturalWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    stage.style.setProperty('--intro-logo-width', `${logoWidth}px`);
  }

  function prepareParticles() {
    const mask = document.createElement('canvas');
    mask.width = window.innerWidth <= 600 ? 280 : 420;
    mask.height = Math.round(mask.width * mark.naturalHeight / mark.naturalWidth);
    const maskContext = mask.getContext('2d', { willReadFrequently: true });
    if (!maskContext) throw new Error('Logo sampling is unavailable.');
    maskContext.drawImage(mark, 0, 0, mask.width, mask.height);
    const pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data;
    const candidates = [];
    for (let y = 0; y < mask.height; y += 2) {
      for (let x = 0; x < mask.width; x += 2) {
        if (pixels[(y * mask.width + x) * 4 + 3] < 55) continue;
        candidates.push({ x: (x + 0.5) / mask.width - 0.5, y: (y + 0.5) / mask.height - 0.5 });
      }
    }
    if (!candidates.length) throw new Error('The logo alpha mask is empty.');
    // Shuffle once, then sample evenly across the real mask, including the
    // small CREATIVE HOUSE lettering and the brush's irregular edges.
    for (let index = candidates.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
    }
    const count = Math.min(candidates.length, window.innerWidth <= 600 ? 2200 : 3200);
    groups = [[], [], []];
    for (let index = 0; index < count; index++) {
      const position = candidates[index];
      const angle = random() * Math.PI * 2;
      const radius = 0.28 + random() * 0.43;
      const shade = random();
      groups[shade > 0.86 ? 2 : shade > 0.67 ? 1 : 0].push({
        tx: position.x,
        ty: position.y,
        sx: Math.cos(angle) * radius,
        sy: Math.sin(angle) * radius * 0.8,
        spin: (random() - 0.5) * 2.1,
        delay: random() * 0.24,
        size: 0.75 + random() * 0.85,
      });
    }
    mask.width = mask.height = 1;
  }

  function draw(elapsed) {
    context.clearRect(0, 0, width, height);
    const colors = ['#eee9df', '#c4ac7e', '#92958a'];
    const alpha = [0.95, 0.9, 0.72];
    const appearance = Math.min(1, elapsed / 0.2);
    groups.forEach((particles, groupIndex) => {
      context.fillStyle = colors[groupIndex];
      context.globalAlpha = alpha[groupIndex] * appearance;
      context.beginPath();
      particles.forEach(particle => {
        const t = Math.max(0, Math.min(1, (elapsed - particle.delay) / 1.5));
        const remaining = 1 - easeOut(t);
        const targetX = width * 0.5 + particle.tx * logoWidth;
        const targetY = height * 0.5 + particle.ty * logoHeight;
        const dx = width * particle.sx - particle.tx * logoWidth;
        const dy = height * particle.sy - particle.ty * logoHeight;
        const turn = remaining * particle.spin;
        const x = targetX + (dx * Math.cos(turn) - dy * Math.sin(turn)) * remaining;
        const y = targetY + (dx * Math.sin(turn) + dy * Math.cos(turn)) * remaining;
        const size = particle.size * (0.8 + remaining * 0.35);
        context.rect(x - size * 0.5, y - size * 0.5, size, size);
      });
      context.fill();
    });
    context.globalAlpha = 1;
  }

  async function start() {
    try {
      if (!mark.complete || !mark.naturalWidth) await mark.decode();
      if (complete) return;
      if (!mark.naturalWidth || !mark.naturalHeight) throw new Error('Logo image is unavailable.');
      if (window.location.hash || window.scrollY > 8 || document.hidden) return finish();
      context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Canvas is unavailable.');
      prepareParticles();
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      listen(window, 'resize', resize, { passive: true });
      const startTime = performance.now();
      const tick = now => {
        frame = 0;
        if (complete) return;
        // Some mobile engines update the query before dispatching its change
        // event. Stop on the very next frame in either case.
        if (motion.matches) { finish(); return; }
        const elapsed = (now - startTime) / 1000;
        if (elapsed < 1.8) draw(elapsed);
        if (elapsed >= 1.8 && loader.dataset.introState === 'assembling') {
          draw(1.8);
          loader.dataset.introState = 'formed';
          loader.classList.add('is-formed');
        }
        if (elapsed >= 2.4) loader.classList.add('is-leaving');
        if (elapsed >= 2.95) finish();
        else frame = requestAnimationFrame(tick);
      };
      draw(0.01);
      loader.classList.add('is-playing');
      frame = requestAnimationFrame(tick);
    } catch {
      // Missing assets or unsupported canvas never turn an introduction into
      // a loading gate. The page is immediately usable through this same exit.
      finish();
    }
  }
  start();
  return controller;
}
