/* Page shell used by every screen except the planner, which owns its own
   canvas layout. Title, one line of context, primary action right.

   By default the body scrolls inside the shell, which keeps the heading and
   its running total in view while you work down a long list. That is what
   you want on a cut list of two hundred rows.

   `flow` turns that off and lets the screen run to its natural height, so
   the page scrolls instead of a box inside it. That is what you want on a
   short screen, where a scrollbar around three rows of a table just makes
   the table look smaller than it is. */

export default function Screen({ title, context, action, children, wide, flow }) {
  return (
    <div className={`screen ${wide ? 'screen--wide' : ''} ${flow ? 'screen--flow' : ''}`}>
      <header className="screen-head">
        <div>
          <h1 className="screen-title">{title}</h1>
          <p className="screen-ctx">{context}</p>
        </div>
        {action && <div className="screen-action">{action}</div>}
      </header>
      <div className="screen-body">{children}</div>
    </div>
  );
}

export function Empty({ text, action }) {
  return (
    <div className="empty">
      <div className="empty__text">{text}</div>
      {action}
    </div>
  );
}

export function Est() {
  return <span className="badge badge--neutral">Estimate</span>;
}
