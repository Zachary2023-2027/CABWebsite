/* ===========================================================================
   Workshop view. Phone, in the shed, sawdust on your hands.

   One part at a time. The three numbers you are about to set on the saw are
   the biggest thing on the screen and they sit on separate lines, because
   reading 720 x 560 x 16 as one string at arm's length is how you cut the
   wrong piece. Everything else is secondary and small.

   Deliberately looks almost nothing like the rest of the app.
   =========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { allParts } from './project.js';

export default function Workshop({ project, cut, setCut, onExit }) {
  const all = useMemo(() => allParts(project), [project]);
  const [onlyRemaining, setOnlyRemaining] = useState(true);
  const [i, setI] = useState(0);
  const [swipe, setSwipe] = useState(0);
  const touch = useRef(null);

  const list = useMemo(
    () => (onlyRemaining ? all.filter((p) => !cut.has(p.key)) : all),
    [all, cut, onlyRemaining],
  );

  const idx = Math.min(i, Math.max(0, list.length - 1));
  const part = list[idx];
  const doneCount = all.filter((p) => cut.has(p.key)).length;

  const go = (d) => {
    setSwipe(0);
    setI((n) => Math.max(0, Math.min(list.length - 1, n + d)));
  };

  const tick = () => {
    if (!part) return;
    setCut((prev) => {
      const next = new Set(prev);
      next.add(part.key);
      return next;
    });
    // In remaining mode the list shrinks under us, so staying put shows the
    // next part. Otherwise step forward.
    if (!onlyRemaining) go(1);
  };

  const untick = () => {
    if (!part) return;
    setCut((prev) => {
      const next = new Set(prev);
      next.delete(part.key);
      return next;
    });
  };

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tick(); }
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const onStart = (e) => { touch.current = e.touches[0].clientX; };
  const onMove = (e) => {
    if (touch.current == null) return;
    setSwipe(e.touches[0].clientX - touch.current);
  };
  const onEnd = () => {
    if (Math.abs(swipe) > 60) go(swipe < 0 ? 1 : -1);
    else setSwipe(0);
    touch.current = null;
  };

  if (!all.length) {
    return (
      <div className="ws">
        <div className="ws-empty">
          <p>No parts yet.</p>
          <button className="ws-btn ws-btn--ghost" onClick={onExit}>Back</button>
        </div>
      </div>
    );
  }

  if (!part) {
    return (
      <div className="ws">
        <div className="ws-empty">
          <p className="ws-done-big">All cut</p>
          <p className="ws-done-sub">{doneCount} of {all.length} parts</p>
          <button className="ws-btn ws-btn--ghost" onClick={() => setOnlyRemaining(false)}>
            Show all parts
          </button>
          <button className="ws-btn ws-btn--ghost" onClick={onExit}>Back</button>
        </div>
      </div>
    );
  }

  const isCut = cut.has(part.key);

  return (
    <div className="ws" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
      <header className="ws-top">
        <button className="ws-close" onClick={onExit} aria-label="Leave workshop view">Back</button>
        <span className="ws-progress">
          {idx + 1} / {list.length}
          <span className="ws-progress-sub">{doneCount} of {all.length} cut</span>
        </span>
        <button className="ws-filter" aria-pressed={onlyRemaining}
                onClick={() => { setOnlyRemaining((v) => !v); setI(0); }}>
          {onlyRemaining ? 'To cut' : 'All'}
        </button>
      </header>

      <div className="ws-card" style={{ transform: `translateX(${swipe * 0.35}px)` }}>
        <div className="ws-code">{part.code}</div>
        <div className="ws-name">
          {part.name}
          {part.unitLabel && <span className="ws-cab">{part.unitLabel}</span>}
        </div>

        <dl className="ws-dims">
          <div><dt>Length</dt><dd>{part.L}</dd></div>
          <div><dt>Width</dt><dd>{part.W}</dd></div>
          <div><dt>Thick</dt><dd>{part.T}</dd></div>
        </dl>

        <div className="ws-meta">
          <div><span>Material</span><b>{part.material}</b></div>
          <div><span>Edging</span><b>{part.edging || 'None'}</b></div>
        </div>
      </div>

      <div className="ws-actions">
        <button className="ws-nav" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous part">
          Prev
        </button>
        {isCut ? (
          <button className="ws-btn ws-btn--undo" onClick={untick}>Cut. Undo</button>
        ) : (
          <button className="ws-btn ws-btn--cut" onClick={tick}>Mark cut</button>
        )}
        <button className="ws-nav" onClick={() => go(1)} disabled={idx >= list.length - 1}
                aria-label="Next part">Next</button>
      </div>

      <p className="ws-hint">Swipe to move. Space marks cut.</p>
    </div>
  );
}
