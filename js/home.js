/* Front page behaviour. Three small jobs, nothing else.

   1. The centrepiece: which of the four drawings the pinned frame is showing.
      That is a state change driven by which step you are reading, not a
      per-frame animation, so an observer is the right tool and it costs
      nothing during a scroll.
   2. A reveal fallback for browsers without scroll-driven CSS animations.
      The CSS reveals live behind @supports, so those browsers get the page
      static. This puts the motion back with an observer, and only ever after
      JS has confirmed it can also take it away again.
   3. A progress bar fallback, same reason.

   Everything here is optional. With JS off the page is complete: the copy is
   in the markup, the first frame is showing, and nothing is hidden. */

(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nativeTimeline = CSS.supports('animation-timeline: view()');

  /* --- 1. The pinned frame ---------------------------------------------- */

  const journey = document.querySelector('.journey');
  const steps = journey ? [...journey.querySelectorAll('.step')] : [];

  if (journey && steps.length && 'IntersectionObserver' in window) {
    /* A band across the middle of the viewport. The step sitting in it is the
       one being read, and the frame follows it. */
    const stepObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) journey.dataset.step = entry.target.dataset.index;
      }
    }, { rootMargin: '-45% 0px -45% 0px' });

    steps.forEach((step) => stepObserver.observe(step));
  }

  /* --- 2. Reveals, only where CSS cannot do them ------------------------- */

  if (!nativeTimeline && !reduced && 'IntersectionObserver' in window) {
    const targets = [...document.querySelectorAll('.reveal')];
    if (targets.length) {
      document.documentElement.classList.add('js-reveal');

      const revealObserver = new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

      targets.forEach((el) => revealObserver.observe(el));
    }
  }

  /* --- 3. Progress bar, same condition ----------------------------------- */

  const bar = document.querySelector('.progress__bar');

  if (bar && !nativeTimeline && !reduced) {
    let queued = false;

    const paint = () => {
      queued = false;
      const scrollable = document.documentElement.scrollHeight - innerHeight;
      const ratio = scrollable > 0 ? scrollY / scrollable : 0;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    };

    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }, { passive: true });

    paint();
  }
})();
