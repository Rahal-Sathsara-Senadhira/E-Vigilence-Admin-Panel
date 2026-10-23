// A menu section whose screens come in a later phase (TODO.md). Says what
// the section will do and when, so nothing in the menu is a dead end.

import { Construction } from "lucide-react";
import { Link } from "react-router";
import { Page, Panel } from "@/ui/index.js";

const PHASES = {
  N0: "Foundations",
  N1: "Reference data",
  N2: "Reports and evidence",
  N3: "Cases and people",
  N4: "Penalty notices",
  N5: "Payments",
  N6: "Court cases",
  N7: "Time limits and notifications",
  N8: "Citizen rewards",
  N9: "Dashboards and reports",
};

/** @param {{ item: import("./navigation.js").NavItem }} props */
export function SectionPlaceholder({ item }) {
  return (
    <Page title={item.label} description={item.summary}>
      <Panel>
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sunken text-text-muted">
            <Construction className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-base font-semibold text-text">Being built</h2>
          <p className="mt-1 max-w-md text-sm text-text-muted">
            This section arrives in phase {item.phase} —{" "}
            {PHASES[/** @type {keyof typeof PHASES} */ (item.phase)] ?? "a later phase"}. Your
            access to it is already set up.
          </p>
        </div>
      </Panel>
    </Page>
  );
}

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <Panel>
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-text-muted">
            This page doesn&apos;t exist, or your role doesn&apos;t include it.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm font-medium text-action hover:underline"
          >
            Go to your home page
          </Link>
        </div>
      </Panel>
    </Page>
  );
}
