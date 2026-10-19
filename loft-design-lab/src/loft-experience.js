import { initLoftScene } from './loft-scene.js';

const stage = document.querySelector('.loft-stage');
const status = document.getElementById('loftSceneStatus');
const pause = document.getElementById('loftScenePause');
const forms = [...document.querySelectorAll('[data-loft-form]')];
const hero = document.querySelector('.loft-immersive');
let scene;
let state = 'loading';
let paused = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function updateLabels() {
  const ru = document.documentElement.lang === 'ru';
  const labels = {
    loading: ru ? 'Создаём новое измерение' : 'Entering a new dimension',
    ready: ru ? 'Скульптура в реальном времени' : 'Real-time sculpture',
    fallback: ru ? 'Кинематографичный режим' : 'Cinematic mode',
  };
  status.textContent = labels[state];
  pause.setAttribute('aria-label', paused ? (ru ? 'Продолжить анимацию' : 'Resume animation') : (ru ? 'Приостановить анимацию' : 'Pause animation'));
  pause.title = pause.getAttribute('aria-label');
  const ruForms = ['Лента', 'Кадр', 'Импульс'];
  const enForms = ['Ribbon', 'Frame', 'Pulse'];
  forms.forEach((button, index) => button.setAttribute('aria-label', `${ru ? 'Форма' : 'Form'} ${index + 1}: ${(ru ? ruForms : enForms)[index]}`));
}

if (stage && status && pause && hero) {
  try {
    scene = initLoftScene(stage);
    state = 'ready';
    stage.classList.add('is-ready');
    hero.classList.add('loft-webgl-ready');
    forms.forEach(button => { button.disabled = false; });
    pause.disabled = false;
  } catch (error) {
    state = 'fallback';
    hero.classList.add('loft-static-mode');
    console.warn('LOFT: the cinematic background is active because WebGL is unavailable.', error);
  }
  updateLabels();

  forms.forEach(button => button.addEventListener('click', () => {
    forms.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    scene?.setForm(Number(button.dataset.loftForm));
  }));
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    scene?.setPaused(paused);
    updateLabels();
  });

  let scrollFrame = 0;
  const updateProgress = () => {
    scrollFrame = 0;
    scene?.setProgress(Math.min(1, window.scrollY / Math.max(hero.clientHeight, 1)));
  };
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProgress);
  }, { passive: true });
  updateProgress();
  const languageObserver = new MutationObserver(updateLabels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // A small perspective shift adds depth to the existing work and pricing cards.
  // Touch screens retain native scrolling; reduced motion keeps everything still.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('.portfolio-thumb-wrapper, .pricing-card').forEach(card => {
    card.classList.add('loft-depth-card');
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      card.style.removeProperty('--loft-tilt-x');
      card.style.removeProperty('--loft-tilt-y');
      card.classList.remove('loft-tilting');
    };
    card.addEventListener('pointermove', event => {
      if (reducedMotion.matches || !finePointer.matches || event.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
        card.classList.add('loft-tilting');
        card.style.setProperty('--loft-tilt-x', `${-y * 4}deg`);
        card.style.setProperty('--loft-tilt-y', `${x * 5}deg`);
      });
    }, { passive: true });
    card.addEventListener('pointerleave', reset);
    reducedMotion.addEventListener('change', reset);
  });

  // Let a page restored from the back/forward cache keep its scene; release GPU
  // resources only when this document is actually discarded.
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    cancelAnimationFrame(scrollFrame);
    languageObserver.disconnect();
    scene?.dispose();
  });
}
