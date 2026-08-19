/* ===========================================================================
   Design rules.

   One screen that asks every question. Everything the app knew was wrong used
   to be spread across four other screens, so you could finish a design with
   several things quietly telling you it will not work and never see any of
   them together.
   =========================================================================== */

import { useMemo, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { CLEARANCE_DEFAULTS, byLevel, runChecks, summarise, walkways } from './checks.js';
import {
  allParts, layoutFor, nestCfg, roomLayout, roomOffsets, unitWarnings, wallWarnings,
} from './project.js';
import { nestProject } from './nesting.js';
import { Num } from './Fields.jsx';
import { fmt } from './mm.js';

const DEPS = {
  roomLayout, layoutFor, roomOffsets, allParts, nestProject, nestCfg,
  unitWarnings, wallWarnings,
};

const LEVEL_NAME = {
  error: 'To fix',
  warn: 'To look at',
  note: 'Worth knowing',
};

/* The clearances, in the order you would think about them. Every one is a
   typed setting, because none of them is a number this app is in a position
   to assert. */
const SETTINGS = [
  ['walkwayMin', 'Walkway, at least'],
  ['walkwayComfortable', 'Walkway, comfortable'],
  ['splashbackMin', 'Benchtop to wall cabinets'],
  ['hoodAboveCooktop', 'Above the cooktop'],
  ['cooktopToWall', 'Beside the cooktop'],
  ['sinkToCooktop', 'Sink to cooktop'],
  ['reachHeight', 'Reach without standing on anything'],
  ['doorMinWidth', 'Narrowest door worth hanging'],
  ['doorMinSwing', 'Door has to open at least, degrees'],
];

export default function Checks({ project, onCfg }) {
  const [showSettings, setShowSettings] = useState(false);

  const findings = useMemo(() => {
    try {
      return runChecks(project, DEPS);
    } catch (e) {
      /* A rule that throws must not take the screen with it. Nobody can fix a
         kitchen from a blank page. */
      return [{
        level: 'error', rule: 'checks', where: null,
        text: `A check could not run: ${e.message}`,
      }];
    }
  }, [project]);

  const paths = useMemo(() => walkways(project, roomLayout(project)), [project]);
  const groups = byLevel(findings);
  const summary = summarise(findings);
  const cfg = { ...CLEARANCE_DEFAULTS, ...project.cfg };

  const action = (
    <div className="inline">
      <span className={`badge badge--${summary.level === 'ok' ? 'ok' : summary.level}`}>
        {summary.text}
      </span>
      <button className="btn btn--secondary" onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? 'Hide the figures' : 'The figures'}
      </button>
    </div>
  );

  return (
    <Screen title="Checks"
            context="Everything the drawing has to say about whether it will work, in one place."
            action={action} flow>

      {showSettings && (
        <section className="card checks-settings">
          <p className="note">
            Every figure here is a starting point, not a rule this app is asserting.
            They vary by appliance, by who is cooking, and some of them are regulated
            and the regulation changes. Nothing on this screen is a code compliance
            check. Check anything that matters against your appliance instructions
            and the current standard, then set it here and the drawing is measured
            against your number.
          </p>
          <div className="settings-grid">
            {SETTINGS.map(([key, label]) => (
              <Num key={key} label={label} value={cfg[key]}
                   unit={key === 'doorMinSwing' ? 'deg' : 'mm'}
                   onChange={(v) => onCfg({ [key]: v ?? CLEARANCE_DEFAULTS[key] })} />
            ))}
          </div>
        </section>
      )}

      {paths.length > 0 && (
        <section className="card">
          <div className="card__head"><span className="card__title">Walkways</span></div>
          <table className="table">
            <thead>
              <tr><th>Between</th><th className="num">Clear</th><th className="num">Along</th><th>Reads as</th></tr>
            </thead>
            <tbody>
              {paths.map((p, i) => (
                <tr key={i}>
                  <td>{p.between[0]} and {p.between[1]}</td>
                  <td className="num">{fmt(p.gap)}</td>
                  <td className="num">{fmt(p.overlap)}</td>
                  <td>{p.gap < cfg.walkwayMin ? 'Too tight'
                    : p.gap < cfg.walkwayComfortable ? 'One person' : 'Two can pass'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!findings.length ? (
        <Empty text="Nothing to report. Every rule this screen knows is satisfied." />
      ) : (
        ['error', 'warn', 'note'].map((level) => groups[level].length > 0 && (
          <section className="card" key={level}>
            <div className="card__head">
              <span className="card__title">{LEVEL_NAME[level]}</span>
              <span className="badge badge--neutral badge--num">{groups[level].length}</span>
            </div>
            <ul className={`check-list check-list--${level}`}>
              {groups[level].map((f, i) => (
                <li key={i}>
                  <span className={`check-dot check-dot--${level}`} />
                  <span className="check-text">
                    {f.text}
                    {f.where && <span className="check-where">{f.where}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Screen>
  );
}
