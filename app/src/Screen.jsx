/* Page shell used by every screen except the planner, which owns its own
   canvas layout. Title, one line of context, primary action right. */

export default function Screen({ title, context, action, children, wide }) {
  return (
    <div className={`screen ${wide ? 'screen--wide' : ''}`}>
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
