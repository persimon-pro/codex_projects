import '@fontsource-variable/manrope';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-500-italic.css';
import { initDeviceMorph } from './device-morph-scene.js';
import { initAnimationSystem } from './animation-system.js';
import { initScrollEffects } from './scroll-effects.js';

const story = document.querySelector('.cinema-story');
const visual = document.querySelector('.cinema-visual');
const stage = document.querySelector('.cinema-stage');
const fallback = document.querySelector('.cinema-fallback');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const animationSystem = initAnimationSystem(motion);
const scrollEffects = initScrollEffects(motion);
const cleanups = [];
const forms = ['camera', 'microphone', 'laptop', 'instagram'];
const fallbacks = window.__LOFT_DEVICE_FALLBACKS__ || forms.map(name => `/assets/images/cinema/${name}.svg`);
const listen = (target, type, callback, options) => {
  target.addEventListener(type, callback, options);
  cleanups.push(() => target.removeEventListener(type, callback, options));
};
let scene;
let disposed = false;

if (story && visual && stage && fallback) {
  let progress = 0;
  let currentForm = -1;
  let paused = false;
  let automatic = !motion.matches && !window.location.hash && window.scrollY < 10;
  let visible = true;
  let frame = 0;
  let lastTime = 0;
  let direction = 1;
  let pointerFrame = 0;
  let scrollFrame = 0;
  const pointer = { x: 0, y: 0 };
  const blocked = () => document.body.style.overflow === 'hidden';

  const resetPointer = () => {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pointer.x = pointer.y = 0;
    stage.style.removeProperty('--cinema-copy-x');
    stage.style.removeProperty('--cinema-copy-y');
    scene?.setPointer(0, 0);
  };
  const onPointerMove = event => {
    if (!finePointer.matches || motion.matches || paused || blocked() || event.pointerType === 'touch') return;
    const bounds = stage.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    pointer.y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      stage.style.setProperty('--cinema-copy-x', `${(pointer.x * 7).toFixed(2)}px`);
      stage.style.setProperty('--cinema-copy-y', `${(pointer.y * 4).toFixed(2)}px`);
      scene?.setPointer(pointer.x, -pointer.y);
    });
  };
  listen(stage, 'pointermove', onPointerMove, { passive: true });
  listen(stage, 'pointerleave', resetPointer);
  listen(window, 'blur', resetPointer);
  listen(finePointer, 'change', resetPointer);

  function applyProgress(value) {
    progress = Math.max(0, Math.min(1, value));
    scene?.setProgress(progress);
    stage.dataset.progress = progress.toFixed(4);
    const next = Math.min(forms.length - 1, Math.round(progress * (forms.length - 1)));
    if (next !== currentForm) {
      currentForm = next;
      stage.dataset.currentForm = forms[next];
      fallback.src = fallbacks[next];
    }
  }
  function scrollProgress() {
    const top = story.getBoundingClientRect().top + window.scrollY;
    return (window.scrollY - top) / Math.max(1, story.offsetHeight - window.innerHeight);
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function stopAutomatic() {
    automatic = false;
    stopFrame();
  }
  function tick(now) {
    frame = 0;
    if (disposed || !visible || document.hidden || blocked() || !automatic || paused || motion.matches) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.12) : 0;
    lastTime = now;
    let next = progress + direction * dt / 27;
    if (next >= 1) { direction = -1; next = 1; }
    if (next <= 0) { direction = 1; next = 0; }
    applyProgress(next);
    frame = requestAnimationFrame(tick);
  }
  function requestTick() {
    if (!frame && !disposed && scene && automatic && visible && !document.hidden && !blocked() && !paused && !motion.matches) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  const updateScroll = () => {
    scrollFrame = 0;
    if (!automatic) applyProgress(scrollProgress());
  };
  const onScroll = () => {
    if (window.scrollY > 4) stopAutomatic();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  };
  listen(window, 'scroll', onScroll, { passive: true });
  listen(window, 'wheel', stopAutomatic, { passive: true });
  listen(story, 'touchstart', stopAutomatic, { passive: true });

  // The visual stays free of controls. Keyboard users can pause the focused
  // scene with Space; system reduced motion disables automatic transformations.
  const togglePause = event => {
    if (event.target !== story || event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    paused = !paused;
    stage.dataset.paused = String(paused);
    scene?.setPaused(paused || blocked());
    resetPointer();
    if (paused) stopFrame();
    else requestTick();
  };
  listen(story, 'keydown', togglePause);
  const onMotionChange = () => {
    resetPointer();
    if (motion.matches) stopAutomatic();
    scene?.setProgress(progress);
  };
  listen(motion, 'change', onMotionChange);
  const onVisibility = () => {
    if (document.hidden) { stopFrame(); resetPointer(); }
    else requestTick();
  };
  listen(document, 'visibilitychange', onVisibility);
  const syncLock = () => {
    scene?.setPaused(paused || blocked());
    if (blocked()) { stopFrame(); resetPointer(); }
    else requestTick();
  };
  const lockObserver = new MutationObserver(syncLock);
  lockObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  const resize = new ResizeObserver(() => { if (!automatic) applyProgress(scrollProgress()); });
  resize.observe(story);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    document.body.classList.toggle('cinema-hero-active', visible);
    if (visible) requestTick();
    else { stopFrame(); resetPointer(); }
  });
  visibility.observe(stage);
  document.body.classList.add('cinema-hero-active');
  const labels = () => {
    story.setAttribute('aria-label', document.documentElement.lang === 'ru'
      ? 'LOFT: фотоаппарат, микрофон, ноутбук и значок Instagram. Пробел — пауза.'
      : 'LOFT: camera, microphone, laptop and Instagram icon. Space pauses motion.');
  };
  const languageObserver = new MutationObserver(labels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  labels();
  stage.dataset.paused = 'false';
  listen(visual, 'device-scene-context-lost', () => {
    stopFrame();
    visual.classList.remove('is-ready');
    visual.classList.add('is-static');
  });
  listen(visual, 'device-scene-context-restored', () => {
    visual.classList.remove('is-static');
    visual.classList.add('is-ready');
    requestTick();
  });
  applyProgress(automatic ? 0 : scrollProgress());
  animationSystem.animateCopy(story.querySelector('[data-cinema-copy]'));
  try {
    scene = initDeviceMorph(visual);
    scene.setProgress(progress);
    visual.classList.add('is-ready');
    requestTick();
  } catch (error) {
    stopAutomatic();
    visual.classList.add('is-static');
    console.warn('LOFT: static device artwork is active.', error);
  }
  cleanups.push(() => {
    stopFrame();
    resetPointer();
    cancelAnimationFrame(scrollFrame);
    resize.disconnect();
    visibility.disconnect();
    languageObserver.disconnect();
    lockObserver.disconnect();
    document.body.classList.remove('cinema-hero-active');
  });
}

// Quiet depth for the existing case studies. Pointer effects never alter links.
document.querySelectorAll('.portfolio-thumb-wrapper').forEach(card => {
  const image = card.querySelector('img');
  const showPoster = () => {
    if (image) image.hidden = true;
    card.classList.add('cinema-poster');
  };
  image?.addEventListener('error', showPoster, { once: true });
  if (image?.complete && !image.naturalWidth) showPoster();
  let frame = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    card.style.removeProperty('--cinema-tilt-x');
    card.style.removeProperty('--cinema-tilt-y');
    card.style.removeProperty('--cinema-light-x');
    card.style.removeProperty('--cinema-light-y');
  };
  const move = event => {
    if (!finePointer.matches || motion.matches || event.pointerType === 'touch') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const box = card.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      card.style.setProperty('--cinema-tilt-y', `${(x - .5) * 8}deg`);
      card.style.setProperty('--cinema-tilt-x', `${-(y - .5) * 6}deg`);
      card.style.setProperty('--cinema-light-x', `${x * 100}%`);
      card.style.setProperty('--cinema-light-y', `${y * 100}%`);
    });
  };
  card.addEventListener('pointermove', move, { passive: true });
  card.addEventListener('pointerleave', reset);
  motion.addEventListener('change', reset);
  finePointer.addEventListener('change', reset);
  cleanups.push(() => {
    reset();
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerleave', reset);
    motion.removeEventListener('change', reset);
    finePointer.removeEventListener('change', reset);
    image?.removeEventListener('error', showPoster);
  });
});

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  disposed = true;
  cleanups.forEach(cleanup => cleanup());
  animationSystem.destroy();
  scrollEffects.destroy();
  scene?.dispose();
});
