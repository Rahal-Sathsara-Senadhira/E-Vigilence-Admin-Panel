import type { Permission } from "@ev/shared";
import { EmptyState, Spinner } from "@ev/ui";
import { Compass, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/AuthProvider";
import { ChangePasswordPage, ForcedPasswordChange } from "./auth/ChangePasswordPage";
import { LoginPage } from "./auth/LoginPage";
import { AppShell } from "./layout/AppShell";
import { AccountsPage } from "./pages/AccountsPage";
import { AuditPage } from "./pages/AuditPage";
import { HomePage } from "./pages/HomePage";
import { StationsPage } from "./pages/StationsPage";
import { SystemPage } from "./pages/SystemPage";
import { TimeLimitsPage } from "./pages/TimeLimitsPage";
import { OffencesPage } from "./pages/OffencesPage";
import { CaseDetailPage } from "./pages/cases/CaseDetailPage";
import { CasesListPage } from "./pages/cases/CasesListPage";
import { PersonPage, VehiclePage } from "./pages/cases/RegisterPages";
import { NoticeDetailPage } from "./pages/notices/NoticeDetailPage";
import { NoticesListPage } from "./pages/notices/NoticesListPage";
import { OutboxPage } from "./pages/notices/OutboxPage";
import { NewReportPage } from "./pages/reports/NewReportPage";
import { ReportDetailPage } from "./pages/reports/ReportDetailPage";
import { ReportsListPage } from "./pages/reports/ReportsListPage";

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { allowed } = useAuth();
  if (!allowed(permission)) {
    return (
      <EmptyState
        icon={<Lock className="size-5" />}
        title="You don't have access to this page"
        description="Ask HQ if you need it for your work."
        action={
          <Link to="/" className="text-sm font-medium text-primary hover:underline">
            Go to your dashboard
          </Link>
        }
      />
    );
  }
  return children;
}

export function App() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <div className="grid h-full place-items-center text-muted" aria-live="polite">
        <span className="flex items-center gap-2 text-sm">
          <Spinner /> Loading E-Vigilance
        </span>
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (user?.mustChangePassword) return <ForcedPasswordChange />;

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="accounts"
          element={
            <Guard permission="users.view">
              <AccountsPage />
            </Guard>
          }
        />
        <Route
          path="stations"
          element={
            <Guard permission="stations.view">
              <StationsPage />
            </Guard>
          }
        />
        <Route
          path="audit"
          element={
            <Guard permission="audit.view">
              <AuditPage />
            </Guard>
          }
        />
        <Route
          path="system"
          element={
            <Guard permission="system.health">
              <SystemPage />
            </Guard>
          }
        />
        <Route path="settings/time-limits" element={<TimeLimitsPage />} />
        <Route
          path="triage"
          element={
            <Guard permission="reports.triage">
              <ReportsListPage />
            </Guard>
          }
        />
        <Route
          path="reports"
          element={
            <Guard permission="reports.view">
              <ReportsListPage />
            </Guard>
          }
        />
        <Route
          path="reports/new"
          element={
            <Guard permission="reports.record">
              <NewReportPage />
            </Guard>
          }
        />
        <Route
          path="reports/:id"
          element={
            <Guard permission="reports.view">
              <ReportDetailPage />
            </Guard>
          }
        />
        <Route
          path="cases"
          element={
            <Guard permission="cases.view">
              <CasesListPage />
            </Guard>
          }
        />
        <Route
          path="cases/:id"
          element={
            <Guard permission="cases.view">
              <CaseDetailPage />
            </Guard>
          }
        />
        <Route
          path="notices"
          element={
            <Guard permission="notices.view">
              <NoticesListPage />
            </Guard>
          }
        />
        <Route
          path="notices/:id"
          element={
            <Guard permission="notices.view">
              <NoticeDetailPage />
            </Guard>
          }
        />
        <Route
          path="outbox"
          element={
            <Guard permission="notices.withdraw">
              <OutboxPage />
            </Guard>
          }
        />
        <Route
          path="vehicles/:id"
          element={
            <Guard permission="cases.view">
              <VehiclePage />
            </Guard>
          }
        />
        <Route
          path="persons/:id"
          element={
            <Guard permission="persons.view">
              <PersonPage />
            </Guard>
          }
        />
        <Route
          path="offences"
          element={
            <Guard permission="offences.view">
              <OffencesPage />
            </Guard>
          }
        />
        <Route path="account/password" element={<ChangePasswordPage />} />
        <Route
          path="*"
          element={
            <EmptyState
              icon={<Compass className="size-5" />}
              title="Page not found"
              action={
                <Link to="/" className="text-sm font-medium text-primary hover:underline">
                  Go to your dashboard
                </Link>
              }
            />
          }
        />
      </Route>
    </Routes>
  );
}
