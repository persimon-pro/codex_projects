import { gsap } from 'gsap';
import { animate, hover } from 'motion';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

// Each library owns a separate layer: GSAP reveals the copy, Motion gives links
// and card details a spring response, and Lenis smooths native wheel input.
export function initAnimationSystem(motionMediaQuery) {
  const reducedMotion = motionMediaQuery || window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
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
      copyTween = gsap.fromTo(targets, {
        autoAlpha: 0,
        y: index => index === 0 ? 52 : 26,
        rotationX: index => index === 0 ? 16 : 9,
        transformPerspective: 1200,
        transformOrigin: '50% 100%',
        clipPath: 'inset(0% -4% 100% -4%)',
      }, {
        autoAlpha: 1,
        y: 0,
        rotationX: 0,
        clipPath: 'inset(-16% -4% -22% -4%)',
        duration: 1.15,
        stagger: 0.16,
        ease: 'power4.out',
        clearProps: 'opacity,visibility,transform,transformOrigin,clipPath',
      });
    }, copyElement);
  }

  const arrowEffects = [...document.querySelectorAll('.cinema-cta')].flatMap(link => {
    const arrow = link.querySelector('svg');
    if (!arrow) return [];
    const originalTransform = arrow.style.getPropertyValue('transform');
    const originalPriority = arrow.style.getPropertyPriority('transform');
    const originalLinkTransform = link.style.getPropertyValue('transform');
    const originalLinkPriority = link.style.getPropertyPriority('transform');
    let control;
    let magneticControl;
    let magneticFrame = 0;
    let magneticBounds;
    let pointer;
    let hovering = false;
    let focused = link.matches(':focus');

    const restoreMagnet = () => {
      cancelAnimationFrame(magneticFrame);
      magneticFrame = 0;
      magneticBounds = undefined;
      magneticControl?.stop();
      magneticControl = undefined;
      if (originalLinkTransform) link.style.setProperty('transform', originalLinkTransform, originalLinkPriority);
      else link.style.removeProperty('transform');
    };
    const moveMagnet = (x, y) => {
      magneticControl?.stop();
      magneticControl = animate(link, { x, y }, {
        type: 'spring',
        stiffness: 260,
        damping: 24,
        mass: 0.6,
      });
    };
    const releaseMagnet = () => {
      cancelAnimationFrame(magneticFrame);
      magneticFrame = 0;
      magneticBounds = undefined;
      if (destroyed || reducedMotion.matches || !finePointer.matches) restoreMagnet();
      else moveMagnet(0, 0);
    };
    const onPointerMove = event => {
      if (destroyed || reducedMotion.matches || !finePointer.matches || focused || event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!magneticBounds) {
        const bounds = link.getBoundingClientRect();
        // Store document coordinates so scrolling never feeds the link's own
        // animated transform back into the magnetic target.
        magneticBounds = {
          left: bounds.left + window.scrollX,
          top: bounds.top + window.scrollY,
          width: bounds.width,
          height: bounds.height,
        };
      }
      if (magneticFrame) return;
      magneticFrame = requestAnimationFrame(() => {
        magneticFrame = 0;
        if (destroyed || reducedMotion.matches || !finePointer.matches || focused || !magneticBounds) return;
        const x = (pointer.x + window.scrollX - magneticBounds.left) / Math.max(1, magneticBounds.width) * 2 - 1;
        const y = (pointer.y + window.scrollY - magneticBounds.top) / Math.max(1, magneticBounds.height) * 2 - 1;
        moveMagnet(Math.max(-1, Math.min(1, x)) * 8, Math.max(-1, Math.min(1, y)) * 5);
      });
    };
    const restore = () => {
      control?.stop();
      control = undefined;
      if (originalTransform) arrow.style.setProperty('transform', originalTransform, originalPriority);
      else arrow.style.removeProperty('transform');
      restoreMagnet();
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
      return () => { hovering = false; update(); releaseMagnet(); };
    });
    const onFocus = () => { focused = true; restoreMagnet(); update(); };
    const onBlur = () => { focused = false; update(); };
    link.addEventListener('pointermove', onPointerMove, { passive: true });
    link.addEventListener('pointercancel', releaseMagnet);
    link.addEventListener('focus', onFocus);
    link.addEventListener('blur', onBlur);

    return [{
      update,
      syncPointer() { restoreMagnet(); },
      destroy() {
        stopHover();
        link.removeEventListener('pointermove', onPointerMove);
        link.removeEventListener('pointercancel', releaseMagnet);
        link.removeEventListener('focus', onFocus);
        link.removeEventListener('blur', onBlur);
        restore();
      },
    }];
  });

  const cardEffects = [...document.querySelectorAll('.pricing-card, .client-card')].flatMap(card => {
    const detail = card.querySelector('.pricing-card-price-box, .client-info');
    if (!detail) return [];
    const originalTransform = detail.style.getPropertyValue('transform');
    const originalPriority = detail.style.getPropertyPriority('transform');
    let control;
    let hovering = false;
    const restore = () => {
      control?.stop();
      control = undefined;
      if (originalTransform) detail.style.setProperty('transform', originalTransform, originalPriority);
      else detail.style.removeProperty('transform');
    };
    const update = () => {
      if (destroyed || reducedMotion.matches || !finePointer.matches || document.hidden || document.body.style.overflow === 'hidden') {
        restore();
        return;
      }
      if (!hovering && !control) return;
      control?.stop();
      control = animate(detail, { y: hovering ? -4 : 0 }, {
        type: 'spring', stiffness: 220, damping: 24, mass: 0.7,
      });
    };
    const stopHover = hover(card, () => {
      hovering = true;
      update();
      return () => { hovering = false; update(); };
    });
    return [{
      update,
      syncPointer() { hovering = false; restore(); },
      destroy() { stopHover(); restore(); },
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
    cardEffects.forEach(effect => effect.update());
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
    cardEffects.forEach(effect => effect.update());
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
  const syncPointer = () => [...arrowEffects, ...cardEffects].forEach(effect => effect.syncPointer());
  finePointer.addEventListener('change', syncPointer);
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
      cardEffects.forEach(effect => effect.destroy());
      bodyLockObserver.disconnect();
      reducedMotion.removeEventListener('change', syncMotion);
      finePointer.removeEventListener('change', syncPointer);
      document.removeEventListener('visibilitychange', syncTicker);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onAnchorClick);
    },
  };
}
