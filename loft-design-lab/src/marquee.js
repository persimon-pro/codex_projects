// Two equal, viewport-wide groups make the existing -50% loop seamless.
export function initMarquee() {
  const marquee = document.querySelector('.cinema-marquee');
  const track = marquee?.querySelector('.cinema-marquee-track');
  const unit = track?.querySelector('.cinema-marquee-unit')?.cloneNode(true);
  if (!track || !unit) return { destroy() {} };

  const original = [...track.childNodes];
  let destroyed = false;
  let frame = 0;
  let copies = 0;

  function fit() {
    frame = 0;
    if (destroyed) return;
    const width = track.querySelector('.cinema-marquee-unit')?.getBoundingClientRect().width;
    if (!width) return;
    const count = Math.max(1, Math.ceil((marquee.clientWidth + 1) / width));
    if (count === copies) return;
    copies = count;
    const group = document.createElement('div');
    group.className = 'cinema-marquee-group';
    for (let index = 0; index < count; index += 1) group.append(unit.cloneNode(true));
    track.replaceChildren(group, group.cloneNode(true));
    // Keep the original speed: one complete text unit passes every 45 seconds.
    track.style.setProperty('--cinema-marquee-duration', `${count * 45}s`);
  }

  function schedule() {
    if (!destroyed && !frame) frame = requestAnimationFrame(fit);
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  observer?.observe(marquee);
  if (!observer) window.addEventListener('resize', schedule, { passive: true });
  document.fonts?.ready.then(schedule);
  fit();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      track.replaceChildren(...original);
      track.style.removeProperty('--cinema-marquee-duration');
    },
  };
}
