import '@fontsource-variable/manrope';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-500-italic.css';
import { gsap } from 'gsap';
import { initAnimationSystem } from './animation-system.js';
import { initScrollEffects } from './scroll-effects.js';

// Inner pages share the homepage's motion and typography without loading its
// WebGL scenes or logo introduction. Original page scripts still own the UI.
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const animations = initAnimationSystem(motion);
const scrollEffects = initScrollEffects(motion);
let heroContext;

if (!motion.matches && !window.location.hash && window.scrollY < 10) {
  const hero = document.querySelector('.service-hero-content, .form-header');
  if (hero) heroContext = gsap.context(() => {
    gsap.fromTo([...hero.children], { opacity:0, y:24 }, {
      opacity:1,
      y:0,
      duration:0.95,
      stagger:0.1,
      ease:'power3.out',
      clearProps:'opacity,transform',
    });
  }, hero);
}

const onMotionChange = () => { if (motion.matches) heroContext?.revert(); };
motion.addEventListener('change', onMotionChange);
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  heroContext?.revert();
  animations.destroy();
  scrollEffects.destroy();
  motion.removeEventListener('change', onMotionChange);
});
