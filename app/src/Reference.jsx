import Screen from './Screen.jsx';

/* Sheet sizes sold in Australia. The two families do not nest the same and
   the difference decides whether a 1200 part fits across the sheet. */
const SHEETS = [
  { size: '2440 x 1220', materials: 'Birch ply, hoop pine ply, MDF, HMR MDF, melamine faced MDF', thk: '12, 16, 18' },
  { size: '2400 x 1200', materials: 'HMR melamine, MDF, structural ply', thk: '12, 16, 18' },
  { size: '3600 x 1800', materials: 'Melamine faced board', thk: '16, 18' },
  { size: '1800 x 1200', materials: 'Melamine faced MDF', thk: '16, 18' },
];

const BACKS = [
  { size: '2440 x 1220', materials: 'Hardboard', thk: '3, 4.5' },
  { size: '2440 x 1220', materials: 'Ply', thk: '4, 6' },
  { size: '2400 x 1200', materials: 'MDF', thk: '6' },
];

const HANDY = ['2400 x 600', '1800 x 600', '1200 x 600', '2400 x 900', '1800 x 900', '2400 x 450', '1200 x 450'];

const STANDARD = [
  ['Benchtop height', '900', 'Finished, floor to top'],
  ['Kickboard height', '150', 'Set back 50 to 60 from the front'],
  ['Base carcass height', '720', '900 less 150 kick less 30 top'],
  ['Base carcass depth', '560', 'Benchtop 600, so a 40 overhang'],
  ['Wall cabinet underside', '1500', 'Gives a 600 splashback'],
  ['Wall cabinet height', '720', '600 and 900 also common'],
  ['Wall cabinet depth', '320', '300 to 350 depending on supplier'],
  ['Tall cabinet height', '2100', 'Plus 150 kick, 2250 overall'],
  ['Ceiling', '2400', '2550 and 2700 also common in new builds'],
];

const APPLIANCES = [
  ['Freestanding cooker', '600, 700, 900', 'Breaks the benchtop. Allow 5 clearance each side'],
  ['Wall oven', '600', '590 cavity height, 560 deep'],
  ['Cooktop, gas or induction', '600, 900', 'Cut into the benchtop, check the template'],
  ['Dishwasher', '600', '450 slimline also sold'],
  ['Fridge, family', '900 to 1200', 'Allow 30 either side and 50 above for airflow'],
  ['Microwave, built in', '600', 'Check the trim kit before cutting'],
  ['Rangehood, undermount', '600, 900', 'Match the cooktop or go wider'],
];

const RUNNERS = [
  ['400', '450 to 500', 'Shallow base, island back'],
  ['450', '500 to 520', 'Standard shallow'],
  ['500', '560 to 580', 'The usual pick for a 560 carcass'],
  ['550', '600 to 620', 'Deep base'],
  ['600', '650 and over', 'Pantry drawers'],
];

const SPANS = [
  ['16mm melamine', '800', 'Sags past this under weight'],
  ['18mm melamine', '900', 'Better, still not for tins'],
  ['16mm birch ply', '900', 'Stiffer than melamine'],
  ['18mm birch ply', '1000', 'Fine for most things'],
  ['Any, with a centre support', 'No practical limit', 'Add a vertical divider'],
];

function Table({ head, rows }) {
  return (
    <div className="table-wrap" data-density="compact">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={h} className={i > 0 && i < head.length - 1 ? 'n' : ''}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j > 0 && j < r.length - 1 ? 'n' : (j === r.length - 1 ? 'dim-cell' : '')}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reference() {
  return (
    <Screen title="Reference" context="Australian sizes and limits, in plain terms.">
      <section className="ref-block">
        <h2 className="ref-title">The 40mm that catches people out</h2>
        <p className="ref-text">
          Two sheet families are sold here and they are not interchangeable.
          A 1220 wide sheet gives you 1200 of usable width after a 10mm trim off each edge.
          A 1200 wide sheet gives you 1180. So a 1200mm part fits across a 2440 x 1220 sheet
          and does not fit across a 2400 x 1200 sheet. The same applies along the length:
          2440 gives 2420, and 2400 gives 2380.
        </p>
        <div className="ref-compare">
          <div className="card ref-card">
            <span className="card__title">2440 x 1220</span>
            <p className="num ref-big">1200 usable across</p>
            <p className="note">A 1200 part fits. Ply and MDF are usually this size.</p>
          </div>
          <div className="card ref-card">
            <span className="card__title">2400 x 1200</span>
            <p className="num ref-big">1180 usable across</p>
            <p className="note">A 1200 part does not fit. HMR melamine is usually this size.</p>
          </div>
        </div>
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Standard dimensions</h2>
        <Table head={['What', 'mm', 'Note']} rows={STANDARD} />
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Cabinet width increments</h2>
        <p className="ref-text">
          Base and wall cabinets are usually made in 50mm steps from 300 to 1000.
          Anything wider than 1000 on doors will drop over time. Anything wider than
          900 on drawers is past standard runner sizes. Fill the leftover with a filler
          rather than stretching a cabinet.
        </p>
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Appliance cavities</h2>
        <Table head={['Appliance', 'Width mm', 'Note']} rows={APPLIANCES} />
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Runner length against cabinet depth</h2>
        <Table head={['Runner mm', 'Carcass depth mm', 'Note']} rows={RUNNERS} />
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Shelf span limits</h2>
        <Table head={['Material', 'Max span mm', 'Note']} rows={SPANS} />
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Sheet sizes</h2>
        <Table head={['Size mm', 'Sold as', 'Thickness mm']}
               rows={SHEETS.map((s) => [s.size, s.materials, s.thk])} />
        <h3 className="ref-sub">Backs</h3>
        <Table head={['Size mm', 'Sold as', 'Thickness mm']}
               rows={BACKS.map((s) => [s.size, s.materials, s.thk])} />
        <h3 className="ref-sub">Handy panels</h3>
        <p className="ref-text">
          Sold in 16 and 18mm: {HANDY.join(', ')}. Useful for one or two parts
          without buying a full sheet, and they are already trimmed square.
        </p>
      </section>

      <section className="ref-block">
        <h2 className="ref-title">Edge tape</h2>
        <p className="ref-text">
          21mm covers a 16mm edge, 26mm covers an 18mm edge. Both leave enough to trim
          back flush. Buy the wider one if you are only buying one roll.
        </p>
      </section>

      <section className="ref-block">
        <h2 className="ref-title">The 32mm system</h2>
        <p className="ref-text">
          Holes run up the side panels at 32mm pitch, 5mm diameter, on two lines:
          37mm in from the front edge and 37mm in from the back. Hinge plates, runners
          and shelf pins all land on those lines, so one jig does the lot. The first
          hole sits 32mm above the bottom of the panel.
        </p>
      </section>
    </Screen>
  );
}
