/* ===========================================================================
   How to use this thing.

   Every screen, every control, in the order you would meet them. Written as
   sentences rather than as a feature list, because a feature list tells you
   what exists and this has to tell you what to do.

   It is one file of content and one small component, deliberately. The
   alternative was help text scattered through the screens it describes, which
   is how you end up with three descriptions of the same button that disagree
   with each other, and with nowhere to send somebody who says "I do not know
   where to start".

   Nothing here is derived from the model. It is prose about the app, and it
   has to be kept true by hand: if you change what a control does, change the
   paragraph about it in the same commit.
   =========================================================================== */

import { useMemo, useState } from 'react';
import Screen from './Screen.jsx';

/* --- the content ----------------------------------------------------------

   One entry per screen or per idea worth its own heading. `topic` is what the
   search matches against, so it carries the words you would actually type
   looking for the thing, including the ones that are not in the prose.
   -------------------------------------------------------------------------- */

const GUIDE = [
  {
    id: 'start',
    group: 'Getting going',
    title: 'Starting a kitchen',
    topic: 'start new open save example load file project',
    body: [
      ['p', 'First time in, you get two choices. Load the example kitchen gives you a room with cabinets already in it, which is the fastest way to see what everything does. Start empty gives you one wall and nothing on it.'],
      ['p', 'Your work is saved in this browser as you go. There is no account and no server: nothing you draw leaves your machine. That also means clearing your browser data clears your kitchen, so use Save to file for anything you want to keep.'],
      ['list', [
        'Save to file writes a .json you can put somewhere safe or move to another machine.',
        'Open a file reads one back. It is checked on the way in, so an old or hand edited file cannot break the app.',
        'Share a link puts the whole design in the URL after the #, which never reaches any server. If the design is too big to survive being pasted into a chat app, the app says so rather than handing you a link that will break.',
        'The project name at the top is editable. It is what your exported files are named after.',
      ]],
    ],
  },
  {
    id: 'planner',
    group: 'Design',
    title: 'Planner',
    topic: 'planner add cabinet drag drop wall elevation move delete arrange',
    body: [
      ['p', 'This is where the kitchen gets drawn. The left rail is the catalog, the middle is the elevation of the wall you are on, and the right is the inspector for whatever is selected.'],
      ['h', 'Adding a cabinet'],
      ['p', 'Click one in the catalog and it lands in the first gap on the wall that it actually fits in. If it will not fit anywhere and the wall turns a corner, it goes on the next wall and the drawing follows it there. On an island, if the side you are looking at is full it goes on the other side and the view turns round to show you.'],
      ['p', 'Search cabinets narrows the list. The Base, Wall, Tall, Appliance and Filler buttons under it filter by kind.'],
      ['h', 'Moving one'],
      ['p', 'Drag it along the wall. It pulls to the joins that matter: the ends of the wall, the sides of its neighbours, and the corner. Dragged past the end of a wall that turns, it carries on round the corner onto the next wall.'],
      ['p', 'A cabinet you have dragged is pinned to that millimetre and everything else flows around it. Close gaps unpins the lot and packs them back together.'],
      ['h', 'The inspector'],
      ['p', 'Select a cabinet and everything about it is on the right: where it is, how big it is, how many doors or drawers, which finish, and Advanced for the per cabinet overrides. Anything you set there applies to that one cabinet only, and Back to project defaults undoes it.'],
      ['p', 'Duplicate copies the selected cabinet and selects the copy. Delete removes it. Both have keyboard shortcuts, listed under Keyboard below.'],
    ],
  },
  {
    id: 'walls',
    group: 'Design',
    title: 'Walls, room shape and islands',
    topic: 'wall island room shape L U add remove length depth corner blind free standing',
    body: [
      ['p', 'The Walls button at the top opens everything about what the kitchen is built against: add a wall, remove one, rename it, set its length, and choose the room shape.'],
      ['list', [
        'One wall is a straight run.',
        'L shape joins the first two walls at a corner, turning at the right hand end of the first.',
        'U shape adds a third coming back down the other side.',
      ]],
      ['p', 'Anything past the shape stands on its own. An island always does: it is free standing, it has a depth of its own rather than borrowing a cabinet’s, and it has two sides you can put cabinets on, back to back. Use the Front and Back switch over the drawing to work on each side.'],
      ['p', 'An island also has a position, set as how far along the back wall it sits and how far out into the room. That is what lets Checks measure the walkway either side of it.'],
      ['h', 'Corners'],
      ['p', 'Every corner needs a blind corner cabinet in it, and it can stand on either leg: at the end of the wall running in, or at the start of the wall running out with its corner set to the left. Whichever you pick, the other wall stops at its side, the drawing shows a hatched band where that cabinet is standing, and cabinets on that wall snap to it.'],
    ],
  },
  {
    id: 'bar',
    group: 'Design',
    title: 'Breakfast bar',
    topic: 'breakfast bar overhang stool seat island bracket knee leg corbel',
    body: [
      ['p', 'An island’s benchtop can run past its carcass far enough to sit at. Open Walls, find the island, and pick a side under Breakfast bar, then type how far it sticks out.'],
      ['p', 'Everything else follows from those two numbers. The note under the fields tells you how many stools fit, whether the overhang is deep enough to get knees under, and whether it needs holding up. If it does, the brackets appear on the order list and in the project total.'],
      ['p', 'The walkway behind a bar is measured to the edge of the slab, not to the cabinet, because the slab is what you walk into. Checks flags it separately if there is not enough floor to pull a stool out.'],
      ['p', 'All five figures behind that (knee depth, elbow room per stool, how far the top carries itself, bracket spacing, and floor behind a stool) are yours to set, under The figures on Checks. They depend on who is sitting and what the top is made of, so the defaults are starting points rather than rules.'],
    ],
  },
  {
    id: 'onwall',
    group: 'Design',
    title: 'What is already on the wall',
    topic: 'window door obstacle power point waste pipe water gas meter box beam service',
    body: [
      ['p', 'On this wall, under the catalog, is for everything that is there before you start: the window, the waste pipe, the meter box, the power points. Click one of the buttons at the bottom to add it, then set where it is and how big.'],
      ['p', 'Treat it as decides what the app does about it:'],
      ['list', [
        'In the way means a cabinet over it is wrong, and you get a warning.',
        'Build around it means a cabinet over it is fine and often the point, like a waste pipe inside a sink base. You get a note on the cabinet rather than a warning.',
        'Just a note draws it and says nothing.',
      ]],
      ['p', 'They are drawn on the elevation and in 3D, so a window is a hole in the wall with a reveal and a sill rather than a rectangle you have to remember.'],
    ],
  },
  {
    id: 'view3d',
    group: 'Design',
    title: 'The 3D view',
    topic: '3d view rotate orbit zoom walk eye camera open doors show hide render',
    body: [
      ['p', 'Drag to turn the room, scroll to zoom, right drag to pan. The buttons across the top are camera positions: Front, Left, Right, Top, Iso. Frame points the camera at whatever cabinet is selected.'],
      ['p', 'Eye stands you in the room at eye height. From there W, A, S and D walk, or the arrow keys.'],
      ['p', 'The Open slider swings every door and pulls every drawer out together, which is how you find the door that fouls the fridge before you build it.'],
      ['p', 'Show is a menu of what to draw: wall cabinets, appliances, the benchtop and splashback, the walls themselves, handles, fixtures, plumbing, door swing arcs, and a person for scale. Turn things off to see past them.'],
      ['p', 'The three way switch at the top right of the planner decides how much room the 3D gets: split with the elevation, tucked into a drawer under it, or the elevation on its own with the 3D in a corner.'],
    ],
  },
  {
    id: 'cabinet',
    group: 'Design',
    title: 'Cabinet',
    topic: 'cabinet detail exploded parts single viewer section dimensions',
    body: [
      ['p', 'One cabinet on its own, turned any way you like, with every part labelled. Select a cabinet in the planner and this screen is about that one.'],
      ['p', 'Explode pulls the parts apart along the axis they assemble on, so you can see the joint. Section cuts through it. Dimensions writes the overall sizes on. The drilling strip at the bottom folds away when you are looking at the model and comes back when you are at the bench.'],
    ],
  },
  {
    id: 'checks',
    group: 'Design',
    title: 'Checks',
    topic: 'checks clearance walkway warnings errors rules design review problems',
    body: [
      ['p', 'Every question the app knows how to ask, in one place. Things to fix, things to look at, and things worth knowing, in that order.'],
      ['p', 'The walkway table measures every pair of runs that face each other across the room, including both sides of an island. The Clear column is the gap; Along is how much of it they actually share.'],
      ['h', 'The figures'],
      ['p', 'Every clearance the checks use is a typed setting with a default, not a rule this app is asserting. They vary by appliance, by who is cooking, and some of them are regulated and the regulation changes.'],
      ['p', 'Nothing on that screen is a code compliance check. Check anything that matters against your appliance instructions and the current standard, set your number here, and the drawing is measured against yours.'],
    ],
  },
  {
    id: 'reference',
    group: 'Design',
    title: 'Reference',
    topic: 'reference standard sizes heights 32mm system dimensions',
    body: [
      ['p', 'The standard figures this app is built on: bench height, carcass depth, wall cabinet mounting height, the 32mm system spacings. Read only. It is there so you can check what the defaults mean before you change them.'],
    ],
  },
  {
    id: 'cutlist',
    group: 'Make',
    title: 'Cut list',
    topic: 'cut list parts board sizes tick export csv edging',
    body: [
      ['p', 'Every part in the kitchen as a rectangle: length, width, thickness, material, which edges get taped, and which cabinet it belongs to.'],
      ['p', 'Tick parts off as you cut them. The ticks are stored against a key that survives editing, so renumbering a cabinet does not lose your place.'],
      ['p', 'Export CSV writes the lot out. Open it in a spreadsheet or hand it to whoever is cutting.'],
    ],
  },
  {
    id: 'nesting',
    group: 'Make',
    title: 'Nesting',
    topic: 'nesting sheets layout offcut waste kerf trim saw yield',
    body: [
      ['p', 'How the parts lay out on real sheets, per material. Every sheet is drawn with the parts on it, so you can see what is left and where.'],
      ['p', 'The saw settings are yours: blade width, how much you trim off each sheet edge, and the smallest offcut worth keeping. They are used by everything that nests, so the sheet count here is the same one that costing and the order list are using.'],
      ['p', 'Anything too big for any sheet you own is called out separately rather than quietly dropped.'],
    ],
  },
  {
    id: 'drilling',
    group: 'Make',
    title: 'Drilling',
    topic: 'drilling holes hinge cup shelf pin 32mm system boring pattern',
    body: [
      ['p', 'Every hole, per panel, dimensioned from the edges you would actually measure from. Hinge cups, mounting plates, shelf pins on the 32mm system, and the joint holes.'],
      ['p', 'The boring distance and the hinge profile are settings, under Advanced design on the planner. The mounting plate you buy has to match what you drill, so that number is the one to check first.'],
    ],
  },
  {
    id: 'hardware',
    group: 'Make',
    title: 'Hardware',
    topic: 'hardware hinges runners handles bin extras own items cost',
    body: [
      ['p', 'Everything that is not board, grouped, with what it costs and which cabinets it is used in. Edit a unit cost and the project total follows.'],
      ['p', 'Your own hardware is for anything the app cannot work out: the handles you actually bought, a soft close kit, legs, screws. Type what it is, how many and what it costs, and it goes into the total and the print pack.'],
      ['p', 'Copy list gives you a plain text shopping list to paste into a message.'],
    ],
  },
  {
    id: 'workshop',
    group: 'Make',
    title: 'Workshop',
    topic: 'workshop bench mode large type cutting order tick',
    body: [
      ['p', 'The cut list at arm’s length. Large type, one thing at a time, for reading off a phone propped against a saw with sawdust on your hands.'],
      ['p', 'It ticks the same list the cut list screen does, so what you tick at the bench is ticked when you come back.'],
    ],
  },
  {
    id: 'costing',
    group: 'Money',
    title: 'Costing',
    topic: 'costing price total quote estimate board hardware benchtop savings',
    body: [
      ['p', 'What the kitchen comes to, broken into board, hardware and benchtop. Board cost comes from the real nesting run rather than from an area estimate, so it is the number of sheets you would actually buy.'],
      ['p', 'Against a quote lets you type what somebody has quoted you and see the difference.'],
      ['p', 'Everything on this screen is an estimate. Check it against a real quote before you commit to anything.'],
    ],
  },
  {
    id: 'purchase',
    group: 'Money',
    title: 'Order list',
    topic: 'order list buy purchase supplier pack sizes spare csv',
    body: [
      ['p', 'What to buy, rounded up to the sizes it is actually sold in. What a cut list says to make and what a cost says it comes to are neither of them what you hand a supplier.'],
      ['p', 'Pack sizes is where you tell it how your supplier sells things: hinges per box, runner pairs per box, edge tape roll length. The Spare column is what you are left with, which is not waste but is money spent now.'],
      ['p', 'Extra board is for the sheet you ruin. That is a different thing from the offcut the layout leaves, which is already inside the sheet count.'],
    ],
  },
  {
    id: 'print',
    group: 'Paper',
    title: 'Print',
    topic: 'print pdf paper pack labels elevation export drawings',
    body: [
      ['p', 'Everything on paper: the elevations, the cut list, the nesting diagrams, the drilling patterns, the hardware and the order list, in one document laid out for printing.'],
      ['p', 'Print from your browser and choose Save as PDF if you want a file. The layout is always light regardless of anything else, because that is what prints.'],
    ],
  },
  {
    id: 'settings',
    group: 'Settings',
    title: 'Settings, prices and sheet stock',
    topic: 'settings prices sheets stock material cost reset supplier board',
    body: [
      ['p', 'Prices and sheet stock. The cabinet sizes are not here: they are on the planner under Advanced design, next to the drawing they change.'],
      ['p', 'Nothing on this screen is a drop down. Every value is typed, including sheet sizes and sheet names, because your supplier’s stock list is not going to match a list somebody else picked.'],
      ['p', 'A material name has to match the board and thickness on the part, like Birch ply 16mm, or it has no price. Reset prices puts the seeded estimates back.'],
    ],
  },
  {
    id: 'advanced',
    group: 'Settings',
    title: 'Advanced design',
    topic: 'advanced defaults carcass thickness runner hinge reveal kick bench height drawer',
    body: [
      ['p', 'The button at the top of the planner. Project wide defaults: carcass and front thickness, bench height, kick height, wall cabinet mounting height, the gap between fronts, and the hinge and runner you are using.'],
      ['p', 'Drawer runners is one number, the gap between the inside of the carcass and the outside of the drawer box on each side. Everything else about the drawer box is worked out from it. Clear the field and it goes back to what the runner you picked is made for.'],
      ['p', 'Any cabinet can depart from all of it in its own panel, without changing anything else.'],
    ],
  },
  {
    id: 'numbers',
    group: 'How it works',
    title: 'Typing numbers',
    topic: 'number field type clear empty minimum maximum mm units',
    body: [
      ['p', 'Every number in this app is millimetres unless the field says otherwise, and every price is AUD.'],
      ['p', 'Number fields let you clear them out completely and start again. What you type is left alone while you are typing; the range is only applied when you leave the field, so backspacing 600 on the way to 800 does not fight you.'],
      ['p', 'Leaving a field empty means back to the default. On the prices and sheet screens it means zero, because a price of nothing is a real answer.'],
    ],
  },
  {
    id: 'estimates',
    group: 'How it works',
    title: 'What the numbers are worth',
    topic: 'estimate accuracy trust verify standard compliance disclaimer',
    body: [
      ['p', 'Every price in this app is an estimate, and it is labelled as one everywhere it appears. The seeded figures are plausible Australian numbers, not a quote. Replace them with your supplier’s before you rely on any total.'],
      ['p', 'Every clearance is a default you can change, not a rule being asserted. Nothing here is a code compliance check.'],
      ['p', 'What the app is actually good for is consistency: the cut list, the 3D, the nest, the drilling and the costing all read the same part list, so they cannot quietly disagree with each other about what you are building.'],
    ],
  },
  {
    id: 'keyboard',
    group: 'How it works',
    title: 'Keyboard',
    topic: 'keyboard shortcuts keys undo redo delete duplicate nudge arrows',
    body: [
      ['p', 'Press ? anywhere for the full list. The ones worth knowing:'],
      ['keys', [
        ['Arrow left and right', 'Nudge the selected cabinet 10mm'],
        ['Shift and arrow', 'Nudge it 50mm'],
        ['Ctrl or Cmd and D', 'Duplicate the selected cabinet'],
        ['Delete or Backspace', 'Remove it'],
        ['Ctrl or Cmd and Z', 'Undo'],
        ['Ctrl or Cmd and Shift and Z', 'Redo'],
        ['W A S D or the arrows', 'Walk, in the 3D Eye view'],
        ['?', 'The full shortcut sheet'],
      ]],
      ['p', 'Shortcuts do not fire while you are typing in a field, so pressing Delete in a number box deletes a digit rather than the cabinet.'],
    ],
  },
];

/* --- rendering ------------------------------------------------------------ */

function Block({ kind, value }) {
  if (kind === 'h') return <h3 className="guide-h">{value}</h3>;
  if (kind === 'list') {
    return (
      <ul className="guide-list">
        {value.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    );
  }
  if (kind === 'keys') {
    return (
      <dl className="guide-keys">
        {value.map(([k, what], i) => (
          <div className="guide-key" key={i}>
            <dt><kbd>{k}</kbd></dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <p>{value}</p>;
}

export default function Instructions() {
  const [q, setQ] = useState('');

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!term) return GUIDE;
    return GUIDE.filter((e) => {
      const hay = `${e.title} ${e.group} ${e.topic} ${JSON.stringify(e.body)}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [term]);

  /* Group headings come from the entries actually shown, so searching does not
     leave an empty heading behind with nothing under it. */
  const groups = useMemo(() => {
    const out = [];
    for (const e of shown) {
      const last = out[out.length - 1];
      if (last && last.name === e.group) last.items.push(e);
      else out.push({ name: e.group, items: [e] });
    }
    return out;
  }, [shown]);

  const action = (
    <div className="input-shell guide-search">
      <input type="text" value={q} placeholder="Search the instructions"
             aria-label="Search the instructions"
             onChange={(e) => setQ(e.target.value)} />
    </div>
  );

  return (
    <Screen title="Instructions"
            context="Every screen and every control, in the order you would meet them."
            action={action} flow>

      {!term && (
        <section className="card guide-intro">
          <p>
            This app draws a kitchen, works out every part it is made of, lays those
            parts on sheets, tells you where to drill them, and adds up what it costs.
            Everything is millimetres and everything is an estimate.
          </p>
          <p className="note">
            If you have never opened it before, load the example kitchen and press
            things. Nothing you do is destructive: Ctrl and Z undoes it, and your work
            lives in this browser rather than anywhere you can lose it by accident.
          </p>
        </section>
      )}

      {!shown.length && (
        <section className="card">
          <p className="note">Nothing in the instructions matches that.</p>
        </section>
      )}

      {groups.map((g) => (
        <section className="guide-group" key={g.name}>
          <span className="field__label guide-group__label">{g.name}</span>
          {g.items.map((e) => (
            <article className="card guide-card" key={e.id}>
              <h2 className="guide-title">{e.title}</h2>
              {e.body.map(([kind, value], i) => (
                <Block key={i} kind={kind} value={value} />
              ))}
            </article>
          ))}
        </section>
      ))}
    </Screen>
  );
}
