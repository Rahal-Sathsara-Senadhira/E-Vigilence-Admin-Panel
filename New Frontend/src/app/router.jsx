// Every route of the panel (docs/18 §10). Signed-out visitors only reach
// the sign-in page; after signing in they return to where they were going.

import { Navigate, Route, Routes, useLocation } from "react-router";
import { SignInPage } from "@/features/auth/index.js";
import { AccountSummaryPage } from "@/features/home/AccountSummaryPage.jsx";
import { useSession } from "@/lib/session-context.js";
import { Logo, Spinner } from "@/ui/index.js";
import { IdleWarning } from "./IdleWarning.jsx";
import { AuthLayout } from "./layouts/AuthLayout.jsx";

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

  const next = new URLSearchParams(location.search).get("next");
  return (
    <>
      <Routes>
        <Route path="/sign-in" element={<Navigate to={safeNext(next)} replace />} />
        <Route path="/" element={<AccountSummaryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <IdleWarning />
    </>
  );
}

/** Only same-site paths, so a link can't send someone elsewhere after signing in. @param {string | null} next */
function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
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
