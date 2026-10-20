import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// The existing reveal observer owns the outer containers. These effects use
// clipping and an inner image layer so hover, tilt and native scrolling agree.
export function initScrollEffects(motionMediaQuery) {
  const motion = motionMediaQuery || window.matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const layers = [];
  let context;
  let refreshFrame = 0;
  let rebuildFrame = 0;
  let destroyed = false;

  function clearEffects() {
    context?.revert();
    context = undefined;
    layers.splice(0).forEach(layer => {
      if (layer.parentNode) layer.replaceWith(...layer.childNodes);
    });
  }

  function refresh() {
    if (destroyed || motion.matches || refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      if (!destroyed && !motion.matches) ScrollTrigger.refresh();
    });
  }

  function reveal(target, from, duration) {
    if (seen.has(target)) return;
    // Arriving through a native hash must never briefly conceal the content
    // which the browser has already brought into view.
    if (target.getBoundingClientRect().top <= window.innerHeight * 0.91) {
      seen.add(target);
      return;
    }
    gsap.fromTo(target, { clipPath: from }, {
      clipPath: 'inset(-4% -2% -12% -2%)',
      duration,
      ease: 'power3.out',
      clearProps: 'clipPath',
      scrollTrigger: {
        trigger: target,
        start: 'top 91%',
        once: true,
        onEnter: () => seen.add(target),
      },
    });
  }

  function buildEffects() {
    clearEffects();
    if (destroyed || motion.matches) return;

    context = gsap.context(() => {
      document.querySelectorAll('.section-title, .manifesto-text, .contact-title').forEach(heading => {
        reveal(heading, 'inset(0% -2% 100% -2%)', 1.15);
      });

      document.querySelectorAll('.portfolio-thumb-wrapper').forEach(thumb => {
        const card = thumb.closest('.portfolio-card');
        if (!card || card.classList.contains('is-hidden')) return;

        if (!seen.has(thumb)) {
          if (thumb.getBoundingClientRect().top <= window.innerHeight * 0.94) {
            seen.add(thumb);
          } else {
            gsap.fromTo(thumb, { clipPath: 'inset(18% 7% 18% 7%)' }, {
              clipPath: 'inset(0% 0% 0% 0%)',
              duration: 1.2,
              ease: 'power4.out',
              clearProps: 'clipPath',
              scrollTrigger: {
                trigger: card,
                start: 'top 94%',
                once: true,
                onEnter: () => seen.add(thumb),
              },
            });
          }
        }

        const image = thumb.querySelector(':scope > img');
        if (!image) return;
        const layer = document.createElement('div');
        layer.className = 'cinema-media-depth';
        image.before(layer);
        layer.append(image);
        layers.push(layer);

        gsap.fromTo(layer, { yPercent: -5, scale: 1.16 }, {
          yPercent: 5,
          scale: 1.16,
          ease: 'none',
          scrollTrigger: {
            trigger: card,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        });
      });
    }, document.body);

    refresh();
  }

  function rebuild() {
    if (destroyed || rebuildFrame) return;
    rebuildFrame = requestAnimationFrame(() => {
      rebuildFrame = 0;
      buildEffects();
    });
  }

  const filterObserver = new MutationObserver(records => {
    if (records.some(record => record.target.matches('.portfolio-card')
      && (record.oldValue || '').split(/\s+/).includes('is-hidden') !== record.target.classList.contains('is-hidden'))) rebuild();
  });
  const grid = document.querySelector('#worksGrid');
  if (grid) filterObserver.observe(grid, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });

  const languageObserver = new MutationObserver(refresh);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const onMotionChange = () => {
    if (motion.matches) clearEffects();
    else rebuild();
  };
  motion.addEventListener('change', onMotionChange);
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('load', refresh, { once: true });
  document.fonts?.ready.then(refresh);
  buildEffects();

  return {
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(refreshFrame);
      cancelAnimationFrame(rebuildFrame);
      clearEffects();
      filterObserver.disconnect();
      languageObserver.disconnect();
      motion.removeEventListener('change', onMotionChange);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('load', refresh);
    },
  };
}
