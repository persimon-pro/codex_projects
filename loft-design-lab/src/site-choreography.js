import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animate } from 'motion';

gsap.registerPlugin(ScrollTrigger);

// Shared choreography uses its own inner layers and CSS properties. The
// cinematic hero, existing reveal observer and portfolio parallax keep their
// own transforms, so changing a filter or opening a modal never fights a tween.
export function initSiteChoreography(motionMediaQuery) {
  const motion = motionMediaQuery || window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const listeners = [];
  const wrappedWords = [];
  const lights = [];
  const springControls = new Set();
  const cardStates = [];
  const marqueeStates = [];
  const cleanupEffects = [];
  const originalBodyClass = document.body.classList.contains('motion-experience');
  let context;
  let refreshFrame = 0;
  let scrollFrame = 0;
  let ticking = false;
  let destroyed = false;
  let pointerInside = false;
  let lastScroll = window.scrollY;
  let scrollVelocity = 0;
  let cursorX;
  let cursorY;

  document.body.classList.add('motion-experience');
  const progress = document.createElement('div');
  progress.className = 'motion-page-progress';
  progress.setAttribute('aria-hidden', 'true');
  const progressFill = document.createElement('span');
  progress.append(progressFill);
  document.body.append(progress);

  const cursor = document.createElement('div');
  cursor.className = 'motion-case-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  const cursorLabel = document.createElement('span');
  const cursorArrow = document.createElement('span');
  cursorArrow.textContent = '↗';
  cursor.append(cursorLabel, cursorArrow);
  document.body.append(cursor);

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }

  function unavailable() {
    return destroyed || motion.matches || document.hidden || document.body.style.overflow === 'hidden';
  }

  function spring(element, keyframes, options = {}) {
    const control = animate(element, keyframes, { type: 'spring', stiffness: 230, damping: 24, mass: 0.7, ...options });
    springControls.add(control);
    control.finished?.then(() => springControls.delete(control)).catch(() => springControls.delete(control));
    return control;
  }

  function wordsFor(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
    }
    const words = [];
    nodes.forEach(node => {
      if (node.parentElement.closest('.motion-word')) return;
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(value => {
        if (!value) return;
        if (/^\s+$/.test(value)) fragment.append(document.createTextNode(value));
        else {
          const word = document.createElement('span');
          word.className = 'motion-word';
          word.textContent = value;
          fragment.append(word);
          words.push(word);
          wrappedWords.push(word);
        }
      });
      node.replaceWith(fragment);
    });
    return words;
  }

  const manifestos = [...document.querySelectorAll('.manifesto-text')].map(element => ({
    element,
    groups: [...element.querySelectorAll(':scope > .lang')].map(language => ({ language, words: wordsFor(language) })),
  }));

  document.querySelectorAll('.discipline, .service-cell').forEach(card => {
    const light = document.createElement('div');
    light.className = 'motion-card-light';
    light.setAttribute('aria-hidden', 'true');
    card.append(light);
    lights.push(light);
    card.classList.add('motion-responsive-card');
    const state = { card, frame: 0, active: false, x: 0.5, y: 0.5 };
    cardStates.push(state);

    const reset = () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.active = false;
      card.classList.remove('is-motion-active');
      ['--card-light-x', '--card-light-y', '--card-heading-x', '--card-heading-y'].forEach(property => card.style.removeProperty(property));
    };
    cleanupEffects.push(reset);
    const position = event => {
      if (unavailable() || !pointer.matches || event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      state.x = (event.clientX - rect.left) / Math.max(1, rect.width);
      state.y = (event.clientY - rect.top) / Math.max(1, rect.height);
      state.active = true;
      card.classList.add('is-motion-active');
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        if (unavailable()) return reset();
        card.style.setProperty('--card-light-x', `${Math.max(0, Math.min(1, state.x)) * 100}%`);
        card.style.setProperty('--card-light-y', `${Math.max(0, Math.min(1, state.y)) * 100}%`);
        card.style.setProperty('--card-heading-x', `${((state.x - 0.5) * 8).toFixed(2)}px`);
        card.style.setProperty('--card-heading-y', `${((state.y - 0.5) * 4).toFixed(2)}px`);
      });
    };
    listen(card, 'pointermove', position, { passive: true });
    listen(card, 'pointerleave', reset);
    listen(card, 'pointercancel', reset);
    listen(card, 'focusin', () => { if (!unavailable()) card.classList.add('is-motion-active'); });
    listen(card, 'focusout', event => { if (!card.contains(event.relatedTarget)) reset(); });
  });

  // Buttons keep their hit area anchored. Only an existing decorative arrow
  // moves; keyboard focus receives the same visual response as a pointer.
  document.querySelectorAll('.pricing-card-btn, .contact-icon-btn, .btn, .nav-cta-btn, .mobile-cta-header').forEach(button => {
    if (button.matches('.cinema-cta')) return;
    const arrow = button.querySelector('svg');
    const originalTransform = arrow?.style.getPropertyValue('transform');
    const originalTransformPriority = arrow?.style.getPropertyPriority('transform');
    let control;
    const restoreArrow = () => {
      if (!arrow) return;
      if (originalTransform) arrow.style.setProperty('transform', originalTransform, originalTransformPriority);
      else arrow.style.removeProperty('transform');
    };
    const stopControl = () => {
      if (!control) return;
      control.stop();
      springControls.delete(control);
      control = undefined;
    };
    const run = active => {
      stopControl();
      if (!arrow || unavailable()) {
        restoreArrow();
        return;
      }
      control = spring(arrow, { x: active ? 3 : 0, y: active ? -3 : 0, rotate: active && button.matches('.contact-icon-btn') ? -7 : 0 });
    };
    listen(button, 'pointerenter', () => { if (pointer.matches) run(true); });
    listen(button, 'pointerleave', () => { if (button !== document.activeElement) run(false); });
    listen(button, 'focus', () => run(true));
    listen(button, 'blur', () => run(false));
    cleanupEffects.push(() => { stopControl(); restoreArrow(); });
  });

  const marqueeObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = marqueeStates.find(item => item.element === entry.target);
      if (state) state.visible = entry.isIntersecting;
    });
    syncTicker();
  }, { rootMargin: '40px' });
  document.querySelectorAll('.cinema-marquee').forEach(element => {
    const line = element.firstElementChild;
    if (!line) return;
    const state = { element, line, setX: gsap.quickSetter(line, 'x', 'px'), x: 0, width: 0, speed: -22, visible: false };
    marqueeStates.push(state);
    marqueeObserver.observe(element);
  });

  function tick(time, deltaTime) {
    if (unavailable()) return syncTicker();
    const delta = Math.min(0.05, deltaTime / 1000);
    scrollVelocity *= Math.pow(0.04, delta);
    marqueeStates.forEach(state => {
      if (!state.visible || !state.width) return;
      const target = scrollVelocity < -30 ? 22 + Math.min(120, -scrollVelocity * 0.04) : -22 - Math.min(120, Math.abs(scrollVelocity) * 0.04);
      state.speed += (target - state.speed) * Math.min(1, delta * 5);
      state.x += state.speed * delta;
      if (state.x <= -state.width) state.x += state.width;
      if (state.x > 0) state.x -= state.width;
      state.setX(state.x);
    });
  }

  function syncTicker() {
    const shouldTick = !unavailable() && marqueeStates.some(state => state.visible);
    if (shouldTick && !ticking) { gsap.ticker.add(tick); ticking = true; }
    else if (!shouldTick && ticking) { gsap.ticker.remove(tick); ticking = false; }
  }

  function hideCursor() {
    if (!pointerInside) return;
    pointerInside = false;
    cursor.classList.remove('is-visible');
    // Pause only these two tweens. Searching GSAP's complete timeline on every
    // off-card pointer/scroll event adds work while the cursor is already gone.
    cursorX?.tween.pause();
    cursorY?.tween.pause();
  }

  listen(document, 'pointermove', event => {
    if (unavailable() || !pointer.matches || event.pointerType === 'touch') return hideCursor();
    const card = event.target instanceof Element ? event.target.closest('.portfolio-card:not(.is-hidden) .portfolio-thumb-wrapper') : null;
    if (!card) return hideCursor();
    if (!pointerInside) {
      pointerInside = true;
      gsap.set(cursor, { x: event.clientX, y: event.clientY });
      cursor.classList.add('is-visible');
    }
    cursorX?.(event.clientX);
    cursorY?.(event.clientY);
  }, { passive: true });
  listen(document.documentElement, 'pointerleave', hideCursor);
  listen(window, 'blur', hideCursor);
  listen(document, 'focusin', hideCursor);
  listen(document, 'click', hideCursor);

  function updateProgress() {
    scrollFrame = 0;
    if (destroyed) return;
    const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const amount = Math.max(0, Math.min(1, window.scrollY / range));
    progressFill.style.transform = `scaleX(${amount.toFixed(4)})`;
    scrollVelocity = Math.max(-3000, Math.min(3000, (window.scrollY - lastScroll) * 30));
    lastScroll = window.scrollY;
  }
  listen(window, 'scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProgress);
    hideCursor();
  }, { passive: true });

  function refresh() {
    if (destroyed || refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      marqueeStates.forEach(state => { state.width = state.line.scrollWidth / 2; });
      updateProgress();
      if (!motion.matches) ScrollTrigger.refresh();
    });
  }

  function build() {
    context?.revert();
    context = undefined;
    cursorX = cursorY = undefined;
    cleanupEffects.forEach(cleanup => cleanup());
    springControls.forEach(control => control.stop());
    springControls.clear();
    hideCursor();
    marqueeStates.forEach(state => {
      state.element.classList.toggle('motion-marquee-active', !motion.matches);
      state.line.style.removeProperty('transform');
      state.x = 0;
    });
    if (motion.matches || destroyed) {
      document.body.classList.remove('motion-enabled');
      syncTicker();
      return;
    }

    document.body.classList.add('motion-enabled');
    context = gsap.context(() => {
      cursorX = gsap.quickTo(cursor, 'x', { duration: 0.24, ease: 'power3.out' });
      cursorY = gsap.quickTo(cursor, 'y', { duration: 0.24, ease: 'power3.out' });
      manifestos.forEach(({ element, groups }) => {
        groups.forEach(({ words }) => {
          if (!words.length) return;
          gsap.fromTo(words, { color: '#686a60' }, {
            color: '#eee9df',
            stagger: 0.09,
            duration: 0.2,
            ease: 'none',
            scrollTrigger: { trigger: element, start: 'top 85%', end: 'bottom 40%', scrub: 0.45, invalidateOnRefresh: true },
          });
        });
      });

      document.querySelectorAll('.contact-title').forEach(title => {
        title.classList.add('motion-contact-heading');
        gsap.fromTo(title, { '--contact-glow': '0%' }, {
          '--contact-glow': '140%',
          ease: 'none',
          scrollTrigger: { trigger: title.closest('section') || title, start: 'top 90%', end: 'bottom 65%', scrub: 0.7 },
        });
      });

      document.querySelectorAll('.discipline-num, .service-cell-num').forEach(number => {
        gsap.fromTo(number, { '--number-shift': '24%' }, {
          '--number-shift': '-16%',
          ease: 'none',
          scrollTrigger: { trigger: number.closest('.discipline, .service-cell') || number, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
        });
      });

      // The portrait container receives a shutter; the video inside keeps its
      // native playback and hover transform. Client marks unfold independently
      // from the outer reveal observer, with no extra scroll distance.
      document.querySelectorAll('.artist-photo').forEach((portrait, index) => {
        if (portrait.getBoundingClientRect().top <= window.innerHeight * 0.94) return;
        gsap.fromTo(portrait, { clipPath: 'inset(12% 0% 12% 0%)' }, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.25,
          delay: (index % 3) * 0.08,
          ease: 'power4.out',
          clearProps: 'clipPath',
          scrollTrigger: { trigger: portrait, start: 'top 94%', once: true },
        });
      });
      document.querySelectorAll('.client-logo-wrapper').forEach((logo, index) => {
        if (logo.getBoundingClientRect().top <= window.innerHeight * 0.94) return;
        gsap.fromTo(logo, { y: 18, rotateX: 35, opacity: 0.5 }, {
          y: 0,
          rotateX: 0,
          opacity: 1,
          transformPerspective: 600,
          duration: 1.05,
          delay: (index % 3) * 0.07,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
          scrollTrigger: { trigger: logo, start: 'top 94%', once: true },
        });
      });
      document.querySelectorAll('.pattern-svg').forEach(motif => {
        gsap.fromTo(motif, { '--motif-rotation': '-35deg' }, {
          '--motif-rotation': '55deg',
          ease: 'none',
          scrollTrigger: { trigger: motif.parentElement, start: 'top bottom', end: 'bottom top', scrub: 1 },
        });
      });
    }, document.body);
    syncTicker();
    refresh();
  }

  const languageObserver = new MutationObserver(() => { updateCursorLabel(); refresh(); });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const lockObserver = new MutationObserver(() => {
    if (unavailable()) { hideCursor(); cleanupEffects.forEach(cleanup => cleanup()); }
    syncTicker();
  });
  lockObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  function updateCursorLabel() { cursorLabel.textContent = document.documentElement.lang === 'ru' ? 'Смотреть' : 'Explore'; }
  listen(motion, 'change', build);
  listen(pointer, 'change', () => { hideCursor(); cleanupEffects.forEach(cleanup => cleanup()); });
  listen(window, 'resize', refresh, { passive: true });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) { hideCursor(); cleanupEffects.forEach(cleanup => cleanup()); }
    syncTicker();
  });
  listen(window, 'pageshow', refresh);
  document.fonts?.ready.then(refresh);
  updateCursorLabel();
  updateProgress();
  build();

  return {
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(refreshFrame);
      cancelAnimationFrame(scrollFrame);
      context?.revert();
      cleanupEffects.forEach(cleanup => cleanup());
      springControls.forEach(control => control.stop());
      if (ticking) gsap.ticker.remove(tick);
      listeners.splice(0).forEach(remove => remove());
      languageObserver.disconnect();
      lockObserver.disconnect();
      marqueeObserver.disconnect();
      wrappedWords.forEach(word => word.replaceWith(...word.childNodes));
      lights.forEach(light => light.remove());
      cardStates.forEach(({ card }) => card.classList.remove('motion-responsive-card'));
      marqueeStates.forEach(({ element, line }) => { element.classList.remove('motion-marquee-active'); line.style.removeProperty('transform'); });
      document.querySelectorAll('.motion-contact-heading').forEach(title => title.classList.remove('motion-contact-heading'));
      document.body.classList.remove('motion-enabled');
      if (!originalBodyClass) document.body.classList.remove('motion-experience');
      cursor.remove();
      progress.remove();
    },
  };
}
