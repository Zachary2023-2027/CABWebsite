/* ===========================================================================
   Notes.

   Everything about a kitchen that the model cannot derive and you cannot
   afford to lose: the measurement you took standing in the room, what the
   plumber said about where the waste can go, why the corner is the way it is,
   the thing to check before you order the stone.

   Two decisions shape this screen.

   It is sections of lines, not one block of text. A kitchen has half a dozen
   separate conversations going on at once, and one long paragraph is where
   all of them go to be lost. A section has a heading and lines under it, and
   a line can be ticked, because half of what goes in a list like this is a
   thing to do rather than a thing to remember.

   It is quiet. No toolbar, no formatting, no modes. You click a line and type
   in it. Everything saves with the project, exports with it, and prints with
   the pack, which is the whole reason to write it here rather than on the
   back of an envelope that will be on a different bench by Thursday.
   =========================================================================== */

import { useMemo, useRef, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { NOTE_LIMITS, newId } from './storage.js';

/* What a new project's notes start as. Not an empty page: an empty page is a
   screen you close again, and these are the four things everyone ends up
   writing down anyway. */
export const STARTER_NOTES = () => [
  { id: newId(), heading: 'Measured on site', lines: [] },
  { id: newId(), heading: 'Decisions', lines: [] },
  { id: newId(), heading: 'To check before ordering', lines: [] },
];

/* A textarea that grows with what is in it. A note you cannot see the end of
   is a note you stop writing. */
function Line({ line, onChange, onRemove, onEnter }) {
  const ref = useRef(null);

  const grow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <li className={`note-line ${line.done ? 'is-done' : ''}`}>
      <label className="check note-tick">
        <input type="checkbox" checked={line.done}
               onChange={() => onChange({ done: !line.done })} />
        <span className="check__box">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
        </span>
      </label>

      <textarea ref={(el) => { ref.current = el; grow(el); }}
                className="note-text" rows={1} value={line.text}
                maxLength={NOTE_LIMITS.text}
                placeholder="Write it down"
                onChange={(e) => { grow(e.target); onChange({ text: e.target.value }); }}
                onKeyDown={(e) => {
                  /* Enter starts the next line, the way a list behaves
                     everywhere else. Shift and Enter is a new line inside this
                     one, for a note that is a paragraph. */
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); }
                  /* Backspace on an empty line takes the line with it. */
                  if (e.key === 'Backspace' && line.text === '') { e.preventDefault(); onRemove(); }
                }} />

      <button className="btn btn--ghost note-remove" onClick={onRemove}
              title="Remove this line" aria-label="Remove this line">×</button>
    </li>
  );
}

function Section({ section, onChange, onRemove, onMove, first, last }) {
  const lines = section.lines || [];

  const setLine = (id, patch) => onChange({
    lines: lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  });
  const removeLine = (id) => onChange({ lines: lines.filter((l) => l.id !== id) });
  const addLine = (after = null) => {
    if (lines.length >= NOTE_LIMITS.lines) return;
    const line = { id: newId(), text: '', done: false };
    const at = after === null ? lines.length : lines.findIndex((l) => l.id === after) + 1;
    onChange({ lines: [...lines.slice(0, at), line, ...lines.slice(at)] });
  };

  const done = lines.filter((l) => l.done).length;

  return (
    <section className="card note-section">
      <div className="card__head">
        <input className="note-heading" value={section.heading}
               maxLength={NOTE_LIMITS.heading} placeholder="What is this about"
               onChange={(e) => onChange({ heading: e.target.value })} />
        <span className="inline">
          {lines.length > 0 && (
            <span className="badge badge--neutral badge--num">
              {done} of {lines.length}
            </span>
          )}
          <button className="btn btn--ghost" onClick={() => onMove(-1)} disabled={first}
                  title="Move this section up">Up</button>
          <button className="btn btn--ghost" onClick={() => onMove(1)} disabled={last}
                  title="Move this section down">Down</button>
          <button className="btn btn--ghost" onClick={onRemove}
                  title="Remove this section and everything in it">Remove</button>
        </span>
      </div>

      {lines.length > 0 && (
        <ul className="note-lines">
          {lines.map((l) => (
            <Line key={l.id} line={l}
                  onChange={(patch) => setLine(l.id, patch)}
                  onRemove={() => removeLine(l.id)}
                  onEnter={() => addLine(l.id)} />
          ))}
        </ul>
      )}

      <button className="btn btn--secondary note-add" onClick={() => addLine()}>
        Add a line
      </button>
    </section>
  );
}

export default function Notes({ project, setProject }) {
  const notes = project.notes || [];
  const [filter, setFilter] = useState('all');

  const set = (next) => setProject((p) => ({ ...p, notes: next }));

  const edit = (id, patch) => set(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const remove = (id) => set(notes.filter((n) => n.id !== id));
  const move = (id, dir) => {
    const i = notes.findIndex((n) => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= notes.length) return;
    const next = [...notes];
    const [it] = next.splice(i, 1);
    next.splice(j, 0, it);
    set(next);
  };
  const add = () => {
    if (notes.length >= NOTE_LIMITS.sections) return;
    set([...notes, { id: newId(), heading: '', lines: [{ id: newId(), text: '', done: false }] }]);
  };

  const counts = useMemo(() => {
    const all = notes.flatMap((n) => n.lines || []);
    const written = all.filter((l) => l.text.trim());
    return { lines: written.length, done: written.filter((l) => l.done).length };
  }, [notes]);

  /* Filtering is the one thing this screen does beyond holding text, because
     a list you have been adding to for a month is mostly things already
     done. */
  const shown = useMemo(() => {
    if (filter === 'all') return notes;
    return notes
      .map((n) => ({
        ...n,
        lines: (n.lines || []).filter((l) => (filter === 'open' ? !l.done : l.done)),
      }))
      .filter((n) => n.lines.length);
  }, [notes, filter]);

  const action = (
    <div className="inline">
      {counts.lines > 0 && (
        <span className="progress-count">
          <span className="num">{counts.done}</span> of <span className="num">{counts.lines}</span> ticked
        </span>
      )}
      {counts.lines > 0 && (
        <div className="seg" role="group" aria-label="Which lines">
          {[['all', 'All'], ['open', 'To do'], ['done', 'Done']].map(([k, label]) => (
            <button key={k} className="seg__item" aria-pressed={filter === k}
                    onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      )}
      <button className="btn btn--primary" onClick={add}>Add a section</button>
    </div>
  );

  return (
    <Screen title="Notes"
            context="Everything about this kitchen the drawing cannot tell you. Saved with the project, exported with it, and printed with the pack."
            action={action} flow>

      {!notes.length ? (
        <div className="card notes-empty">
          <Empty text="Nothing written down yet." />
          <p className="note">
            A kitchen is a month of small decisions and half of them are made standing in
            the room with a tape in your hand. This is where they go: what you measured,
            what you decided and why, and what to check before you order.
          </p>
          <button className="btn btn--primary" onClick={() => set(STARTER_NOTES())}>
            Start with the usual three
          </button>
          <button className="btn btn--secondary" onClick={add}>Start with a blank one</button>
        </div>
      ) : (
        <div className="notes-list">
          {shown.map((n) => {
            const i = notes.findIndex((x) => x.id === n.id);
            return (
              <Section key={n.id} section={filter === 'all' ? n : notes[i]}
                       first={i === 0} last={i === notes.length - 1}
                       onChange={(patch) => edit(n.id, patch)}
                       onRemove={() => remove(n.id)}
                       onMove={(dir) => move(n.id, dir)} />
            );
          })}
          {filter !== 'all' && !shown.length && (
            <Empty text={filter === 'open' ? 'Nothing left to do.' : 'Nothing ticked off yet.'} />
          )}
        </div>
      )}
    </Screen>
  );
}
