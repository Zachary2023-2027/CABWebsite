/* ===========================================================================
   Appearance.

   What the kitchen looks like, in one place, next to the drawing it changes.

   The colours were already in the model: a finish per role, read by the
   elevation, the 3D and the print pack. They were only reachable through
   Advanced design, which is where you go once to set the heights you build
   to, and is the wrong place to go when you want to see the fronts in navy.

   Two of these settings are drawing only and the panel says so rather than
   letting you assume otherwise. A door style is a picture of a door: this app
   does not build one out of rails and stiles, so the cut list still says one
   rectangle of board. A handle style is a shape: every door and drawer
   already takes one handle in the fittings, so the count and the price do not
   move either. Colour is not in that category. Choose walnut fronts and the
   cut list, the labels and the print pack all say walnut, because that is
   what you are going to buy.
   =========================================================================== */

import { DOOR_STYLES, HANDLES, doorStyle, handleStyle } from './draw2d.js';
import {
  FINISH_GROUPS, FINISH_LIST, clearFinishes, finishFor, finishKey, isTwoTone,
} from './finishes.js';
import { Choice, Close } from './Fields.jsx';

/* a or an, so the sentence reads like a sentence. */
const article = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word.toLowerCase()}`;

/* ---------------------------------------------------------------------------
   One role's colour.

   Swatches rather than a list of names, because the thing being chosen is a
   colour and a list of colour names is a worse way to choose a colour than
   the colours are. Clicking the one already set clears it, which puts the
   role back to being read off the board species you typed.
   --------------------------------------------------------------------------- */

function Swatches({ label, role, cfg, onChange, hint }) {
  const current = finishFor(role, cfg);
  const chosen = cfg[finishKey(role)];

  return (
    <div className="finish-role">
      <span className="field__label">
        {label}
        {!chosen && <span className="note"> {hint || 'from the board name'}</span>}
      </span>
      <div className="finish-swatches" role="radiogroup" aria-label={`${label} colour`}>
        {FINISH_GROUPS.map((g) => (
          <span className="finish-run" key={g}>
            {FINISH_LIST.filter((f) => f.group === g).map((f) => (
              <button key={f.id} type="button" role="radio"
                      aria-checked={f.id === current.id}
                      className={`finish-chip ${f.id === current.id ? 'is-on' : ''}`}
                      style={{ background: f.hex }}
                      title={`${f.name}, ${g.toLowerCase()}`}
                      onClick={() => onChange({ [finishKey(role)]: f.id === chosen ? '' : f.id })}>
                <span className="sr-only">{f.name}</span>
              </button>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Appearance({ cfg, onChange, onClose }) {
  const front = finishFor('front', cfg);
  const carcass = finishFor('carcass', cfg);

  return (
    <div className="dialog-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog appearance-dialog" role="dialog" aria-modal="true"
           aria-label="Appearance">
        <div className="adv-head">
          <div>
            <span className="dialog__title">Appearance</span>
            <p className="note">
              How the kitchen looks. The drawing and the 3D follow as you change it.
            </p>
          </div>
          <Close onClick={onClose} />
        </div>

        <div className="adv-body">
          <section className="adv-group">
            <span className="field__label">Colour</span>
            <p className="note">
              What each part is actually going to be made of. Left alone, a colour is
              read off the board species you typed, so Charcoal melamine gives you a
              charcoal kitchen without setting it twice. Set one and it wins. This is
              not a drawing setting: it carries to the cut list and the print pack.
            </p>
            <div className="finish-roles">
              <Swatches label="Fronts" role="front" cfg={cfg} onChange={onChange} />
              <Swatches label="Carcass" role="carcass" cfg={cfg} onChange={onChange} />
              <Swatches label="Kickboard" role="kick" cfg={cfg} onChange={onChange}
                        hint="from the carcass" />
              <Swatches label="Benchtop" role="bench" cfg={cfg} onChange={onChange}
                        hint="stone" />
            </div>
            <div className="group-foot">
              <span className="note">
                {isTwoTone(cfg)
                  ? `Two tone: ${front.name} fronts on ${article(carcass.name)} carcass.`
                  : `One tone throughout, in ${carcass.name}.`}
              </span>
              <button className="btn btn--ghost" onClick={() => onChange(clearFinishes())}>
                Back to the board names
              </button>
            </div>
          </section>

          <section className="adv-group">
            <span className="field__label">Door style and handles</span>
            <p className="note">
              These two change the drawing and nothing else. A shaker door is still one
              rectangle of board on the cut list, and every door and drawer already
              takes one handle in the fittings, so the nest, the drilling and the price
              stay exactly where they are.
            </p>
            <div className="appearance-styles">
              <Choice label="Door style" value={doorStyle(cfg.doorStyle).id}
                      options={DOOR_STYLES.map((d) => ({ value: d.id, label: d.name }))}
                      onChange={(v) => onChange({ doorStyle: v })} />
              <Choice label="Handles" value={handleStyle(cfg.handle).id}
                      options={HANDLES.map((h) => ({ value: h.id, label: h.name }))}
                      onChange={(v) => onChange({ handle: v })} />
            </div>
          </section>
        </div>

        <div className="dialog__foot">
          <button className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
