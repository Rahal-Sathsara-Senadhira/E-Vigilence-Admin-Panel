// Every route of the panel (docs/18 §10). Signed-out visitors only reach
// the sign-in page; after signing in they return to where they were going.

import { FilePlus } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { MePage } from "@/features/account/index.js";
import { SignInPage } from "@/features/auth/index.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser, useSession } from "@/lib/session-context.js";
import { Logo, Spinner } from "@/ui/index.js";
import { IdleWarning } from "./IdleWarning.jsx";
import { AppLayout } from "./layouts/AppLayout.jsx";
import { AuthLayout } from "./layouts/AuthLayout.jsx";
import { homeFor, navItemsFor } from "./navigation.js";
import { NotFoundPage, SectionPlaceholder } from "./SectionPlaceholder.jsx";

export function AppRoutes() {
  const { status } = useSession();
  const location = useLocation();

  if (status === "loading") return <Splash />;

  if (status === "signedOut") {
    const next = location.pathname === "/sign-in" ? null : location.pathname + location.search;
    return (
      <Routes>
        <Route
          path="/sign-in"
          element={
            <AuthLayout>
              <SignInPage />
            </AuthLayout>
          }
        />
        <Route
          path="*"
          element={
            <Navigate
              to={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}
              replace
            />
          }
        />
      </Routes>
    );
  }

  return <SignedInRoutes />;
}

function SignedInRoutes() {
  const user = useCurrentUser();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next");
  const sections = navItemsFor(user);
  return (
    <>
      <Routes>
        <Route path="/sign-in" element={<Navigate to={safeNext(next, homeFor(user))} replace />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to={homeFor(user)} replace />} />
          <Route path="me" element={<MePage />} />
          {sections.map((item) => (
            <Route
              key={item.to}
              path={item.to.slice(1)}
              element={<SectionPlaceholder item={item} />}
            />
          ))}
          {can(user, "reports.record") ? (
            <Route path="reports/new" element={<SectionPlaceholder item={NEW_REPORT} />} />
          ) : null}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <IdleWarning />
    </>
  );
}

/** The phone "Add" tab's destination until reports are built. */
const NEW_REPORT = {
  to: "/reports/new",
  label: "New report",
  icon: FilePlus,
  anyOf: ["reports.record"],
  phase: "N2",
  summary: "Record a report from a walk-in, a phone call or your own observation.",
};

/**
 * Only same-site paths, so a link can't send someone elsewhere after signing in.
 * @param {string | null} next @param {string} fallback
 */
function safeNext(next, fallback) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-text-muted">
        <Logo className="h-12 w-20" />
        <span className="flex items-center gap-2 text-sm">
          <Spinner /> Loading E-Vigilance
        </span>
      </div>
    </div>
  );
}
