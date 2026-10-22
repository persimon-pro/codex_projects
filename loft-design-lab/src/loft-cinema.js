import '@fontsource-variable/manrope';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-500-italic.css';
import { initImageMorph } from './image-morph-scene.js';
import { initAnimationSystem } from './animation-system.js';
import { initScrollEffects } from './scroll-effects.js';
import { initCameraShowcase } from './camera-showcase.js';

const story = document.querySelector('.cinema-story');
const visual = document.querySelector('.cinema-visual');
const stage = document.querySelector('.cinema-stage');
const fallback = document.querySelector('.cinema-fallback');
const chapters = [...document.querySelectorAll('button[data-chapter]')];
const copies = [...document.querySelectorAll('[data-cinema-copy]')];
const pause = document.getElementById('cinemaPause');
const chapterNumber = document.querySelector('.cinema-current');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const animationSystem = initAnimationSystem(motion);
const scrollEffects = initScrollEffects(motion);
const cameraShowcase = initCameraShowcase(motion);
const cleanups = [];
const images = window.__LOFT_CINEMA_IMAGES__ || ['obsidian', 'aurea', 'alba'].map(name => `/assets/images/cinema/${name}.webp`);

if (story && visual && stage && fallback && pause) {
  let renderer;
  let disposed = false;
  let progress = 0;
  let chapter = -1;
  let manuallyPaused = false;
  let automatic = !motion.matches && !window.location.hash && window.scrollY < 10;
  let visible = true;
  let frame = 0;
  let lastTime = 0;
  let direction = 1;
  let pointerFrame = 0;
  const pointer = { x: 0, y: 0 };

  const resetPointer = () => {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pointer.x = pointer.y = 0;
    stage.style.removeProperty('--cinema-copy-x');
    stage.style.removeProperty('--cinema-copy-y');
    renderer?.setPointer(0, 0);
  };
  const onPointerMove = event => {
    if (!finePointer.matches || motion.matches || event.pointerType === 'touch') return;
    const bounds = stage.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    pointer.y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      stage.style.setProperty('--cinema-copy-x', `${(pointer.x * 9).toFixed(2)}px`);
      stage.style.setProperty('--cinema-copy-y', `${(pointer.y * 6).toFixed(2)}px`);
      renderer?.setPointer(pointer.x, -pointer.y);
    });
  };
  stage.addEventListener('pointermove', onPointerMove, { passive: true });
  stage.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);
  finePointer.addEventListener('change', resetPointer);
  motion.addEventListener('change', resetPointer);

  function applyProgress(value) {
    progress = Math.max(0, Math.min(1, value));
    renderer?.setProgress(progress);
    stage.style.setProperty('--cinema-progress', `${progress * 100}%`);
    stage.dataset.progress = progress.toFixed(3);
    // Each text arrives when its corresponding material has become dominant.
    const next = Math.min(2, Math.round(progress * 2));
    if (next !== chapter) {
      chapter = next;
      stage.dataset.currentChapter = String(chapter);
      chapters.forEach((button, index) => button.setAttribute('aria-pressed', String(index === chapter)));
      copies.forEach((copy, index) => { copy.hidden = index !== chapter; });
      animationSystem.animateCopy(copies[chapter]);
      chapterNumber.textContent = `0${chapter + 1}`;
      fallback.src = images[chapter];
    }
  }

  function labels() {
    const ru = document.documentElement.lang === 'ru';
    const names = ru ? ['Исток', 'Превращение', 'Новая реальность'] : ['Origin', 'Transformation', 'New reality'];
    chapters.forEach((button, index) => button.setAttribute('aria-label', `${ru ? 'Глава' : 'Chapter'} ${index + 1}: ${names[index]}`));
    pause.setAttribute('aria-label', manuallyPaused ? (ru ? 'Продолжить движение' : 'Resume motion') : (ru ? 'Приостановить движение' : 'Pause motion'));
    pause.title = pause.getAttribute('aria-label');
  }

  function scrollProgress() {
    const top = story.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(1, story.offsetHeight - window.innerHeight);
    return (window.scrollY - top) / range;
  }

  function tick(now) {
    frame = 0;
    if (disposed || !visible || document.hidden || !automatic || manuallyPaused || motion.matches) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;
    let next = progress + direction * dt / 24;
    if (next >= 1) { direction = -1; next = 1; }
    if (next <= 0) { direction = 1; next = 0; }
    applyProgress(next);
    frame = requestAnimationFrame(tick);
  }
  function requestTick() {
    if (!frame && automatic && visible && !document.hidden && !manuallyPaused && !motion.matches) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  function stopAutomatic() {
    automatic = false;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  let scrollFrame = 0;
  const updateScroll = () => {
    scrollFrame = 0;
    // A restored hash/scroll position and native browser navigation both work.
    if (!automatic) applyProgress(scrollProgress());
  };
  const onScroll = () => {
    if (window.scrollY > 4) stopAutomatic();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', stopAutomatic, { passive: true });
  story.addEventListener('touchstart', stopAutomatic, { passive: true });

  chapters.forEach((button, index) => button.addEventListener('click', () => {
    stopAutomatic();
    const top = story.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(1, story.offsetHeight - window.innerHeight);
    // Immediate chapter jumps also update Lenis' internal scroll position.
    animationSystem.scrollTo(top + range * index / 2, { immediate: true });
    applyProgress(index / 2);
  }));

  pause.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;
    pause.setAttribute('aria-pressed', String(manuallyPaused));
    renderer?.setPaused(manuallyPaused);
    if (manuallyPaused) { cancelAnimationFrame(frame); frame = 0; }
    else { automatic = true; requestTick(); }
    labels();
  });

  const resize = new ResizeObserver(() => { if (!automatic) applyProgress(scrollProgress()); });
  resize.observe(story);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) requestTick();
    else { cancelAnimationFrame(frame); frame = 0; resetPointer(); }
  });
  visibility.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestTick();
  });
  motion.addEventListener('change', () => {
    if (motion.matches) { cancelAnimationFrame(frame); frame = 0; }
    else requestTick();
  });
  const languageObserver = new MutationObserver(labels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  labels();
  applyProgress(automatic ? 0 : scrollProgress());
  initImageMorph(visual, images).then(controller => {
    if (disposed) { controller.dispose(); return; }
    renderer = controller;
    renderer.setProgress(progress);
    renderer.setPointer(pointer.x, -pointer.y);
    renderer.setPaused(manuallyPaused);
    visual.classList.add('is-ready');
    requestTick();
  }).catch(error => {
    visual.classList.add('is-static');
    console.warn('LOFT cinema: static artwork is active.', error);
  });

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true;
    resetPointer();
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerleave', resetPointer);
    window.removeEventListener('blur', resetPointer);
    finePointer.removeEventListener('change', resetPointer);
    motion.removeEventListener('change', resetPointer);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(scrollFrame);
    resize.disconnect();
    visibility.disconnect();
    languageObserver.disconnect();
    animationSystem.destroy();
    renderer?.dispose();
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
  cameraShowcase.destroy();
  scrollEffects.destroy();
  cleanups.forEach(cleanup => cleanup());
});
