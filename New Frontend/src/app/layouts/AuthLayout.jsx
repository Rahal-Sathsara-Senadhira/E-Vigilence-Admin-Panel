// The frame around the sign-in steps (docs/18 §5).
// Laptop and up: navy brand panel on the left, form on the right.
// Phone and tablet: logo above the form.

import { Logo } from "@/ui/index.js";

/** @param {{ children: import("react").ReactNode }} props */
export function AuthLayout({ children }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <BrandPanel />
      <main className="flex min-w-0 flex-1 flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
        <div className="mx-auto mb-10 flex w-full max-w-[420px] items-center gap-3 lg:hidden">
          <Logo className="h-10 w-16" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-text">E-Vigilance</p>
            <p className="text-xs text-text-muted">Sri Lanka Police</p>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
          <div className="rounded-2xl border border-border bg-panel p-6 shadow-sm sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {children}
          </div>
        </div>
        <p className="mx-auto mt-10 w-full max-w-[420px] text-xs text-text-faint">
          Authorised use only. All activity is recorded.
        </p>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden w-[44%] max-w-[640px] flex-col justify-between overflow-hidden bg-rail p-12 text-rail-ink lg:flex">
      {/* Fine grid, fading out: a quiet texture behind the brand. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)",
        }}
      />
      <div className="relative flex items-center gap-3">
        <Logo className="h-11 w-[72px]" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Sri Lanka Police</p>
          <p className="text-xs text-rail-muted">Traffic Headquarters</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <p className="mb-4 inline-flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-rail-muted uppercase">
          <span className="size-1.5 rounded-full bg-attention" aria-hidden />
          Traffic enforcement
        </p>
        <h2 className="text-[40px] leading-[1.1] font-semibold tracking-tight">E-Vigilance</h2>
        <p className="mt-4 text-[17px] leading-relaxed text-rail-muted">
          Reports, cases and penalty notices — from the first report to the final outcome, in one
          place.
        </p>
      </div>

      <dl className="relative grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
        {[
          ["Reports", "Triage and evidence"],
          ["Cases", "Dispatch and decisions"],
          ["Notices", "Service and payment"],
        ].map(([title, text]) => (
          <div key={title}>
            <dt className="font-medium">{title}</dt>
            <dd className="mt-0.5 text-xs text-rail-muted">{text}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
