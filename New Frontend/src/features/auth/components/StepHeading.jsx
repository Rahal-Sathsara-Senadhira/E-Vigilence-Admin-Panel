/** Title and one-line explanation at the top of each sign-in step. */
/** @param {{ title: string, children?: import("react").ReactNode }} props */
export function StepHeading({ title, children }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
      {children ? <p className="mt-1.5 text-sm text-text-muted">{children}</p> : null}
    </header>
  );
}
