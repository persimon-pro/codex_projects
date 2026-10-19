import { gsap } from 'gsap';
import { animate, hover } from 'motion';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// Each library owns a separate layer: GSAP reveals the copy, Motion moves the
// small CTA arrows, and Lenis smooths wheel input without replacing navigation.
export function initAnimationSystem(motionMediaQuery) {
  const reducedMotion = motionMediaQuery || window.matchMedia('(prefers-reduced-motion: reduce)');
  const nestedScroll = '#mobileMenu, #videoModal, [role="dialog"], [data-lenis-prevent], [id^="loftAi"]';
  let destroyed = false;
  let lenis;
  let ticking = false;
  let copyContext;
  let copyTween;

  function clearCopyAnimation() {
    copyTween?.kill();
    copyContext?.revert();
    copyTween = undefined;
    copyContext = undefined;
  }

  function animateCopy(copyElement) {
    clearCopyAnimation();
    if (destroyed || reducedMotion.matches || !copyElement || copyElement.hidden) return;
    const targets = [...copyElement.querySelectorAll('.cinema-title, .cinema-copy-bottom')];
    if (!targets.length) return;
    copyContext = gsap.context(() => {
      copyTween = gsap.fromTo(targets, { autoAlpha: 0, y: 22 }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.85,
        stagger: 0.12,
        ease: 'power3.out',
        clearProps: 'opacity,visibility,transform',
      });
    }, copyElement);
  }

  const arrowEffects = [...document.querySelectorAll('.cinema-cta')].flatMap(link => {
    const arrow = link.querySelector('svg');
    if (!arrow) return [];
    const originalTransform = arrow.style.getPropertyValue('transform');
    const originalPriority = arrow.style.getPropertyPriority('transform');
    let control;
    let hovering = false;
    let focused = link.matches(':focus');

    const restore = () => {
      control?.stop();
      control = undefined;
      if (originalTransform) arrow.style.setProperty('transform', originalTransform, originalPriority);
      else arrow.style.removeProperty('transform');
    };
    const update = () => {
      if (destroyed || reducedMotion.matches) { restore(); return; }
      control?.stop();
      const offset = hovering || focused ? 3 : 0;
      control = animate(arrow, { x: offset, y: -offset }, {
        duration: 0.22,
        ease: 'easeOut',
      });
    };
    const stopHover = hover(link, () => {
      hovering = true;
      update();
      return () => { hovering = false; update(); };
    });
    const onFocus = () => { focused = true; update(); };
    const onBlur = () => { focused = false; update(); };
    link.addEventListener('focus', onFocus);
    link.addEventListener('blur', onBlur);

    return [{
      update,
      destroy() {
        stopHover();
        link.removeEventListener('focus', onFocus);
        link.removeEventListener('blur', onBlur);
        restore();
      },
    }];
  });

  const tick = seconds => { lenis?.raf(seconds * 1000); };
  function stopTicker() {
    if (!ticking) return;
    gsap.ticker.remove(tick);
    ticking = false;
  }
  function destroyLenis() {
    stopTicker();
    lenis?.destroy();
    lenis = undefined;
  }
  function syncTicker() {
    if (!lenis) return;
    if (document.hidden || document.body.style.overflow === 'hidden') {
      stopTicker();
      lenis.stop();
    } else {
      lenis.start();
      if (!ticking) {
        gsap.ticker.add(tick);
        ticking = true;
      }
    }
  }
  function syncMotion() {
    if (destroyed) return;
    if (reducedMotion.matches) {
      clearCopyAnimation();
      destroyLenis();
    } else if (!lenis) {
      // Lenis needs elapsed wall time even when a heavy WebGL frame stalls.
      gsap.ticker.lagSmoothing(0);
      lenis = new Lenis({
        smoothWheel: true,
        syncTouch: false,
        anchors: false,
        autoRaf: false,
        autoResize: true,
        prevent: node => Boolean(node.closest(nestedScroll)),
      });
      syncTicker();
    }
    arrowEffects.forEach(effect => effect.update());
  }

  function scrollTo(top, { immediate = true } = {}) {
    if (destroyed) return;
    if (lenis) lenis.scrollTo(top, { immediate, force: true });
    else window.scrollTo({ top, behavior: 'instant' });
  }

  // Stop pending wheel inertia before the browser handles its own keyboard or
  // hash navigation. These listeners never cancel or replace the native event.
  const releaseWheelInertia = () => {
    lenis?.scrollTo(window.scrollY, { immediate: true, force: true });
  };
  const onKeyDown = event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    releaseWheelInertia();
  };
  const onAnchorClick = event => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const target = new URL(link.href, window.location.href);
    if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search && (target.hash || link.getAttribute('href')?.startsWith('#'))) {
      releaseWheelInertia();
    }
  };

  reducedMotion.addEventListener('change', syncMotion);
  const bodyLockObserver = new MutationObserver(syncTicker);
  bodyLockObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  document.addEventListener('visibilitychange', syncTicker);
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onAnchorClick);
  syncMotion();

  return {
    animateCopy,
    scrollTo,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearCopyAnimation();
      destroyLenis();
      arrowEffects.forEach(effect => effect.destroy());
      bodyLockObserver.disconnect();
      reducedMotion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncTicker);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onAnchorClick);
    },
  };
}
