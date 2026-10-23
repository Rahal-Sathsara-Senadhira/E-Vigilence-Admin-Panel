// An empty list: why it's empty, and what to do next (docs/18 §7).

/**
 * @param {{
 *   icon?: import("react").ReactNode,
 *   title: string,
 *   description?: import("react").ReactNode,
 *   action?: import("react").ReactNode,
 * }} props
 */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? (
        <span className="grid size-11 place-items-center rounded-full bg-sunken text-text-muted [&>svg]:size-5">
          {icon}
        </span>
      ) : null}
      <p className="mt-3 text-[15px] font-medium text-text">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
