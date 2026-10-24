// Every route of the panel (docs/18 §10). Signed-out visitors only reach
// the sign-in page; after signing in they return to where they were going.

import { Navigate, Route, Routes, useLocation } from "react-router";
import { MePage } from "@/features/account/index.js";
import { AccountPage, AccountsPage } from "@/features/accounts/index.js";
import { AuditPage } from "@/features/audit/index.js";
import { SignInPage } from "@/features/auth/index.js";
import { OffencesPage } from "@/features/offences/index.js";
import { PaymentPage, PaymentsPage } from "@/features/payments/index.js";
import { PublicNoticePage, SimulatorPage } from "@/features/public-notice/index.js";
import { CasePage, CasesPage } from "@/features/cases/index.js";
import { InboxPage } from "@/features/inbox/index.js";
import { NoticePage, NoticePrintPage, NoticesPage } from "@/features/notices/index.js";
import { PersonPage, VehiclePage } from "@/features/registers/index.js";
import { NewReportPage, ReportPage, ReportsPage } from "@/features/reports/index.js";
import { TimeLimitsPage } from "@/features/settings/index.js";
import { OrganisationPage, StationPage } from "@/features/organisation/index.js";
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
        {/* The addressee's page: no sign-in (docs/05 §6). */}
        <Route path="/notice" element={<PublicNoticePage />} />
        <Route path="/pay/sim/:session" element={<SimulatorPage />} />
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
        <Route path="/notice" element={<PublicNoticePage />} />
        <Route path="/pay/sim/:session" element={<SimulatorPage />} />
        {/* The printable notice: a page of its own, no menus. */}
        {can(user, "notices.view") ? (
          <Route path="/notices/:id/print" element={<NoticePrintPage />} />
        ) : null}
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to={homeFor(user)} replace />} />
          <Route path="me" element={<MePage />} />
          {sections.map((item) => (
            <Route
              key={item.to}
              path={item.to.slice(1)}
              element={BUILT[item.to] ?? <SectionPlaceholder item={item} />}
            />
          ))}
          {can(user, "users.view") ? <Route path="accounts/:id" element={<AccountPage />} /> : null}
          {can(user, "stations.view") ? (
            <Route path="stations/:id" element={<StationPage />} />
          ) : null}
          {can(user, "reports.record") ? (
            <Route path="reports/new" element={<NewReportPage />} />
          ) : null}
          {can(user, "reports.view") ? <Route path="reports/:id" element={<ReportPage />} /> : null}
          {can(user, "cases.view") ? <Route path="cases/:id" element={<CasePage />} /> : null}
          {can(user, "notices.view") ? <Route path="notices/:id" element={<NoticePage />} /> : null}
          {can(user, "payments.view") ? (
            <Route path="payments/:id" element={<PaymentPage />} />
          ) : null}
          {can(user, "cases.view") ? <Route path="vehicles/:id" element={<VehiclePage />} /> : null}
          {can(user, "persons.view") ? <Route path="persons/:id" element={<PersonPage />} /> : null}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <IdleWarning />
    </>
  );
}

/** Sections whose screens are built; the rest show their placeholder. @type {Record<string, import("react").ReactElement>} */
const BUILT = {
  "/accounts": <AccountsPage />,
  "/inbox": <InboxPage />,
  "/reports": <ReportsPage />,
  "/cases": <CasesPage />,
  "/notices": <NoticesPage />,
  "/payments": <PaymentsPage />,
  "/stations": <OrganisationPage />,
  "/audit": <AuditPage />,
  "/offences": <OffencesPage />,
  "/settings/time-limits": <TimeLimitsPage />,
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
