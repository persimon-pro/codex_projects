import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initDeviceMorph } from './device-morph-scene.js';

gsap.registerPlugin(ScrollTrigger);

// A second, self-contained artwork: the existing three-image film keeps its
// original timeline, markup and renderer. Only the saved camera pose is used.
export function initCameraShowcase(motionMediaQuery) {
  const section = document.querySelector('.camera-showcase');
  const art = section?.querySelector('.camera-showcase-art');
  const title = section?.querySelector('.camera-showcase-title');
  if (!section || !art) return { destroy() {} };

  const motion = motionMediaQuery || window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const cleanups = [];
  let controller;
  let destroyed = false;
  let attempted = false;
  let contextLost = false;
  let manuallyPaused = false;
  let effects;
  let pointerFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  const bounds = section.getBoundingClientRect();
  let visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
  const blocked = () => document.body.style.overflow === 'hidden';
  const listen = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    cleanups.push(() => target.removeEventListener(type, callback, options));
  };

  const resetPointer = () => {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pointerX = pointerY = 0;
    controller?.setPointer(0, 0);
  };
  const syncPause = () => {
    if (destroyed) return;
    controller?.setPaused(manuallyPaused || blocked() || !visible || document.hidden || contextLost);
    section.dataset.paused = String(manuallyPaused);
    if (manuallyPaused || blocked() || !visible || document.hidden || contextLost) resetPointer();
  };
  const setLabels = () => {
    section.setAttribute('aria-label', document.documentElement.lang === 'ru'
      ? 'Объёмный фотоаппарат LOFT. Пробел — приостановить или продолжить вращение.'
      : 'LOFT three-dimensional camera. Space pauses or resumes rotation.');
  };

  function createScene() {
    if (destroyed || attempted) return;
    attempted = true;
    try {
      controller = initDeviceMorph(art);
      controller.setProgress(0);
      section.dataset.currentForm = 'camera';
      syncPause();
      art.classList.add('is-ready');
    } catch (error) {
      art.classList.add('is-static');
      console.warn('LOFT: static camera artwork is active.', error);
    }
  }

  function buildEffects() {
    effects?.revert();
    effects = undefined;
    if (destroyed || motion.matches) return;
    effects = gsap.context(() => {
      // Scroll transforms belong to the outside artwork element; the physical
      // camera and pointer rotation remain inside its own transparent canvas.
      gsap.fromTo(art, { yPercent: 7, scale: 0.9, rotation: -5 }, {
        yPercent: -6,
        scale: 1.03,
        rotation: 4,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.8,
          invalidateOnRefresh: true,
        },
      });
      if (title) gsap.fromTo(title, { yPercent: 16, opacity: 0.72 }, {
        yPercent: -10,
        opacity: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.65,
          invalidateOnRefresh: true,
        },
      });
    }, section);
  }

  listen(section, 'pointermove', event => {
    if (!finePointer.matches || motion.matches || manuallyPaused || blocked() || !visible || event.pointerType === 'touch') return;
    const rect = section.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    pointerY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * -2));
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      controller?.setPointer(pointerX, pointerY);
    });
  }, { passive: true });
  listen(section, 'pointerleave', resetPointer);
  listen(window, 'blur', resetPointer);
  listen(finePointer, 'change', resetPointer);
  listen(section, 'keydown', event => {
    if (event.target !== section || event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    manuallyPaused = !manuallyPaused;
    syncPause();
  });
  listen(document, 'visibilitychange', syncPause);
  listen(motion, 'change', () => {
    resetPointer();
    buildEffects();
    syncPause();
  });
  listen(art, 'device-scene-context-lost', () => {
    contextLost = true;
    art.classList.remove('is-ready');
    art.classList.add('is-static');
    syncPause();
  });
  listen(art, 'device-scene-context-restored', () => {
    contextLost = false;
    art.classList.remove('is-static');
    art.classList.add('is-ready');
    syncPause();
  });

  const lockObserver = new MutationObserver(syncPause);
  lockObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  const languageObserver = new MutationObserver(setLabels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const visibility = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) createScene();
    syncPause();
  }, { threshold: 0 }) : null;
  const proximity = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    createScene();
    proximity?.disconnect();
  }, { rootMargin: '250px 0px', threshold: 0 }) : null;
  visibility?.observe(section);
  proximity?.observe(section);
  if (!proximity) createScene();
  setLabels();
  syncPause();
  buildEffects();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resetPointer();
      visibility?.disconnect();
      proximity?.disconnect();
      lockObserver.disconnect();
      languageObserver.disconnect();
      effects?.revert();
      cleanups.forEach(cleanup => cleanup());
      controller?.dispose();
      art.classList.remove('is-ready', 'is-static');
    },
  };
}
