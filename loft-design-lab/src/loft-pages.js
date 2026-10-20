import '@fontsource-variable/manrope';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-500-italic.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initAnimationSystem } from './animation-system.js';
import { initSiteChoreography } from './site-choreography.js';

gsap.registerPlugin(ScrollTrigger);

const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const animationSystem = initAnimationSystem(motion);
const choreography = initSiteChoreography(motion);
const cleanups = [];
let destroyed = false;
let entranceContext;
let entranceTimer = 0;

// Inner pages share the same wheel rhythm as the home page, while each hero
// arrives as a single editorial composition. Native links and forms are kept.
function revealPage() {
  clearTimeout(entranceTimer);
  entranceContext?.revert();
  entranceContext = undefined;
  if (destroyed || motion.matches) return;

  entranceContext = gsap.context(() => {
    const hero = document.querySelector('.service-hero-content');
    const formHeader = document.querySelector('.form-header');
    const entry = hero || formHeader;
    if (entry && entry.getBoundingClientRect().bottom > 0 && window.scrollY < 80) {
      const targets = [...entry.children];
      gsap.fromTo(targets, {
        y: index => 28 + index * 7,
        opacity: 0,
        rotationX: index => index === 1 ? 10 : 0,
        transformPerspective: 1200,
        transformOrigin: '50% 100%',
      }, {
        y: 0,
        opacity: 1,
        rotationX: 0,
        duration: 1.1,
        stagger: 0.11,
        ease: 'power4.out',
        clearProps: 'transform,opacity,transformOrigin',
      });
    }

    document.querySelectorAll('.service-grid').forEach(grid => {
      // Restored hashes are already at their target: do not conceal that content.
      if (grid.getBoundingClientRect().top < innerHeight * .9) return;
      gsap.fromTo(grid.querySelectorAll('.service-cell'), {
        y: 42,
        opacity: 0,
        rotationX: 5,
        transformPerspective: 1000,
      }, {
        y: 0,
        opacity: 1,
        rotationX: 0,
        duration: .95,
        stagger: .07,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: grid, start: 'top 90%', once: true },
      });
    });
  });
}

// The order page has its own loader. Wait for it rather than spending its
// entrance behind the overlay; a blocked loader must not trap readable content.
const loader = document.getElementById('loader');
let loaderObserver;
if (loader && !loader.classList.contains('hidden')) {
  loaderObserver = new MutationObserver(() => {
    if (!loader.classList.contains('hidden')) return;
    loaderObserver.disconnect();
    entranceTimer = window.setTimeout(revealPage, 70);
  });
  loaderObserver.observe(loader, { attributes: true, attributeFilter: ['class'] });
  cleanups.push(() => loaderObserver.disconnect());
} else {
  entranceTimer = window.setTimeout(revealPage, 40);
}

const syncMotion = () => {
  entranceContext?.revert();
  entranceContext = undefined;
};
motion.addEventListener('change', syncMotion);
cleanups.push(() => motion.removeEventListener('change', syncMotion));

const serviceHero = document.querySelector('.service-hero');
if (serviceHero) {
  const aura = document.createElement('div');
  aura.className = 'loft-service-aura';
  aura.setAttribute('aria-hidden', 'true');
  serviceHero.prepend(aura);
  let pointerFrame = 0;
  let lightTween;
  let pointer;

  const reset = () => {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    lightTween?.kill();
    serviceHero.style.removeProperty('--page-light-x');
    serviceHero.style.removeProperty('--page-light-y');
  };
  const onPointerMove = event => {
    if (destroyed || motion.matches || !finePointer.matches || event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const bounds = serviceHero.getBoundingClientRect();
      const x = gsap.utils.clamp(0, 100, (pointer.x - bounds.left) / bounds.width * 100);
      const y = gsap.utils.clamp(0, 100, (pointer.y - bounds.top) / bounds.height * 100);
      lightTween?.kill();
      lightTween = gsap.to(serviceHero, {
        '--page-light-x': `${x}%`,
        '--page-light-y': `${y}%`,
        duration: .8,
        ease: 'power3.out',
      });
    });
  };
  serviceHero.addEventListener('pointermove', onPointerMove, { passive: true });
  serviceHero.addEventListener('pointerleave', reset);
  finePointer.addEventListener('change', reset);
  motion.addEventListener('change', reset);
  window.addEventListener('blur', reset);
  cleanups.push(() => {
    reset();
    serviceHero.removeEventListener('pointermove', onPointerMove);
    serviceHero.removeEventListener('pointerleave', reset);
    finePointer.removeEventListener('change', reset);
    motion.removeEventListener('change', reset);
    window.removeEventListener('blur', reset);
    aura.remove();
  });
}

const form = document.getElementById('orderForm');
if (form) {
  const track = document.createElement('div');
  track.className = 'loft-brief-progress';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('span');
  fill.dataset.briefFill = '';
  track.append(fill);
  const status = document.createElement('p');
  status.className = 'loft-brief-status';
  form.prepend(track, status);
  let progressTween;

  function updateProgress() {
    const firstName = form.elements.namedItem('firstName');
    const phone = form.elements.namedItem('phone');
    const activity = form.querySelector('[name="activityType"]:checked');
    const services = form.querySelector('[name="services"]:checked');
    const custom = form.elements.namedItem('customActivity');
    const hasActivity = activity && (activity.value !== 'Other' || custom?.value.trim());
    const completed = [firstName?.value.trim(), phone?.value.trim(), hasActivity, services].filter(Boolean).length;
    const value = completed * 25;
    const ru = document.documentElement.lang === 'ru';
    track.setAttribute('aria-label', ru ? 'Заполнение брифа' : 'Brief completion');
    track.setAttribute('aria-valuenow', String(value));
    track.setAttribute('aria-valuetext', `${completed} / 4`);
    status.textContent = ru ? `ВАША ИДЕЯ ОБРЕТАЕТ ФОРМУ · ${completed} / 4` : `YOUR IDEA IS TAKING SHAPE · ${completed} / 4`;
    progressTween?.kill();
    if (motion.matches) gsap.set(fill, { scaleX: value / 100 });
    else progressTween = gsap.to(fill, { scaleX: value / 100, duration: .65, ease: 'power3.out' });
  }
  const onFocus = event => {
    if (event.target.matches('.form-input,.form-textarea')) event.target.classList.add('loft-field-active');
  };
  const onBlur = event => event.target.classList?.remove('loft-field-active');
  const onReset = () => queueMicrotask(updateProgress);
  form.addEventListener('input', updateProgress);
  form.addEventListener('change', updateProgress);
  form.addEventListener('reset', onReset);
  form.addEventListener('focusin', onFocus);
  form.addEventListener('focusout', onBlur);
  motion.addEventListener('change', updateProgress);
  document.addEventListener('DOMContentLoaded', updateProgress, { once: true });
  window.addEventListener('pageshow', updateProgress);
  const language = new MutationObserver(updateProgress);
  language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  updateProgress();
  cleanups.push(() => {
    progressTween?.kill();
    form.removeEventListener('input', updateProgress);
    form.removeEventListener('change', updateProgress);
    form.removeEventListener('reset', onReset);
    form.removeEventListener('focusin', onFocus);
    form.removeEventListener('focusout', onBlur);
    motion.removeEventListener('change', updateProgress);
    document.removeEventListener('DOMContentLoaded', updateProgress);
    window.removeEventListener('pageshow', updateProgress);
    form.querySelectorAll('.loft-field-active').forEach(field => field.classList.remove('loft-field-active'));
    language.disconnect();
    track.remove();
    status.remove();
  });
}

const onPageShow = event => {
  if (event.persisted) choreography.refresh?.();
};
window.addEventListener('pageshow', onPageShow);
window.addEventListener('pagehide', event => {
  // Retained documents resume their existing listeners when restored.
  if (event.persisted || destroyed) return;
  destroyed = true;
  clearTimeout(entranceTimer);
  entranceContext?.revert();
  cleanups.forEach(cleanup => cleanup());
  choreography.destroy();
  animationSystem.destroy();
  window.removeEventListener('pageshow', onPageShow);
});
