import { useMemo, useState } from 'react';
import Screen, { Empty } from './Screen.jsx';
import { allParts, nestCfg } from './project.js';
import { nestProject } from './nesting.js';
import { downloadBlob, safeFileName, toCsv } from './storage.js';
import { Oversize } from './Nesting.jsx';

/* The cells carry text a person typed: the project name, a wall name, a board
   species. toCsv neutralises anything a spreadsheet would otherwise open as a
   formula, which is the difference between a cut list and a payload. */
function csv(rows) {
  const head = ['Part code', 'Cabinet', 'Wall', 'Name', 'Length', 'Width', 'Thickness', 'Material', 'Edging'];
  const body = rows.map((p) => [
    p.code, p.unitLabel ?? '', p.wallName, p.name, p.L, p.W, p.T, p.material, p.edging ?? '',
  ]);
  return toCsv([head, ...body]);
}

export default function CutList({ project, cut, setCut, onWorkshop }) {
  const parts = useMemo(() => allParts(project), [project]);
  const oversize = useMemo(() => nestProject(parts, nestCfg(project)).oversize, [parts, project]);
  const [group, setGroup] = useState('cabinet');   // cabinet | material | flat
  const [fCab, setFCab] = useState('all');
  const [fMat, setFMat] = useState('all');
  const [fThk, setFThk] = useState('all');

  const cabinets = useMemo(
    () => [...new Set(parts.map((p) => p.unitLabel).filter(Boolean))], [parts]);
  const materials = useMemo(() => [...new Set(parts.map((p) => p.material))], [parts]);
  const thicknesses = useMemo(
    () => [...new Set(parts.map((p) => p.T))].sort((a, b) => a - b), [parts]);

  const rows = useMemo(() => parts.filter((p) =>
    (fCab === 'all' || p.unitLabel === fCab) &&
    (fMat === 'all' || p.material === fMat) &&
    (fThk === 'all' || String(p.T) === fThk)), [parts, fCab, fMat, fThk]);

  const done = rows.filter((p) => cut.has(p.key)).length;
  const areaM2 = rows.reduce((a, p) => a + (p.L * p.W) / 1e6, 0);
  const edgeM = rows.reduce((a, p) => {
    if (!p.edging) return a;
    if (p.edging.startsWith('All')) return a + (2 * p.L + 2 * p.W) / 1000;
    if (p.edging.startsWith('One')) return a + p.L / 1000;
    return a + p.W / 1000;
  }, 0);

  const toggle = (key) => setCut((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = (list) => setCut((prev) => {
    const next = new Set(prev);
    const allDone = list.every((p) => next.has(p.key));
    for (const p of list) { if (allDone) next.delete(p.key); else next.add(p.key); }
    return next;
  });

  const groups = useMemo(() => {
    if (group === 'flat') return [['All parts', rows]];
    const key = group === 'cabinet' ? (p) => `${p.unitLabel} ${p.wallName}` : (p) => p.material;
    const m = new Map();
    for (const p of rows) {
      const k = key(p) || 'Unassigned';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    return [...m.entries()];
  }, [rows, group]);

  const download = () => downloadBlob(
    new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }),
    safeFileName(project.name, '-cut-list.csv'),
  );

  const action = (
    <div className="inline">
      <span className="progress-count">
        <span className="num">{done}</span> of <span className="num">{rows.length}</span> cut
      </span>
      <button className="btn btn--secondary" onClick={download} disabled={!rows.length}>Export CSV</button>
      <button className="btn btn--primary" onClick={onWorkshop} disabled={!parts.length}>Workshop view</button>
    </div>
  );

  return (
    <Screen title="Cut list" context="Every part in the project. Tick them off as you cut." action={action} wide>
      <Oversize list={oversize} />

      <div className="filters">
        <div className="seg" role="group" aria-label="Grouping">
          {[['cabinet', 'By cabinet'], ['material', 'By material'], ['flat', 'Flat']].map(([k, l]) => (
            <button key={k} className="seg__item" aria-pressed={group === k}
                    onClick={() => setGroup(k)}>{l}</button>
          ))}
        </div>
        {[['Cabinet', fCab, setFCab, cabinets], ['Material', fMat, setFMat, materials],
          ['Thickness', fThk, setFThk, thicknesses.map(String)]].map(([label, val, set, opts]) => (
          <label className="field compact filter" key={label}>
            <span className="field__label">{label}</span>
            <div className="input-shell select-shell">
              <select value={val} onChange={(e) => set(e.target.value)}>
                <option value="all">All</option>
                {opts.map((o) => <option key={o} value={o}>{label === 'Thickness' ? `${o} mm` : o}</option>)}
              </select>
            </div>
          </label>
        ))}
        {(fCab !== 'all' || fMat !== 'all' || fThk !== 'all') && (
          <button className="btn btn--ghost" onClick={() => { setFCab('all'); setFMat('all'); setFThk('all'); }}>
            Clear filters
          </button>
        )}
      </div>

      {!rows.length ? (
        <Empty text="No parts match those filters." />
      ) : (
        <div data-density="compact" className="cut-groups">
          {groups.map(([name, list]) => (
            <section key={name} className="cut-group">
              <div className="cut-group-head">
                <span className="field__label">{name}</span>
                <span className="cut-group-meta num">
                  {list.filter((p) => cut.has(p.key)).length} / {list.length}
                </span>
                <button className="btn btn--ghost" onClick={() => toggleAll(list)}>Toggle all</button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}><span className="sr-only">Cut</span></th>
                      <th>Part code</th><th>Name</th>
                      <th className="n">L</th><th className="n">W</th><th className="n">T</th>
                      <th>Material</th><th>Edging</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.code} data-done={cut.has(p.key)}>
                        <td>
                          <label className="check check--target">
                            <input type="checkbox" checked={cut.has(p.key)} onChange={() => toggle(p.key)}
                                   aria-label={`Mark ${p.code} cut`} />
                            <span className="check__box">
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                                   strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                            </span>
                          </label>
                        </td>
                        <td className="code">{p.code}</td>
                        <td>{p.name}</td>
                        <td className="n">{p.L}</td><td className="n">{p.W}</td><td className="n">{p.T}</td>
                        <td>{p.material}</td>
                        <td className="dim-cell">{p.edging || 'None'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="table-wrap totals-row">
            <table className="table">
              <tfoot>
                <tr>
                  <td>{rows.length} parts</td>
                  <td className="n">{areaM2.toFixed(2)} m2 board</td>
                  <td className="n">{edgeM.toFixed(1)} m edge tape</td>
                  <td className="n">{done} cut, {rows.length - done} to go</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Screen>
  );
}
