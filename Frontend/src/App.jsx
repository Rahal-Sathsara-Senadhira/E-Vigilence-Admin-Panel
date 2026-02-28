// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AdminLayout from "./layouts/AdminLayout";

import Dashboard from "./pages/dashboard/Dashboard";
import Violations from "./pages/violations/Violations";
import NewComplaint from "./pages/violations/NewComplaint";
import ViolationDetails from "./pages/violations/ViolationDetails";
import Reports from "./pages/reports/Reports";
import RegionalStations from "./pages/regionalStations/RegionalStations";
import Users from "./pages/users/Users";
import Notifications from "./pages/notifications/Notifications";
import Settings from "./pages/settings/Settings";

import Login from "./pages/auth/Login";
import { getUser, isLoggedIn } from "./utils/auth";

// ✅ Station pages
import StationInbox from "./pages/station/Inbox";
import AssignedViolations from "./pages/station/AssignedViolations";

function isStationRole(role) {
  return role === "station" || role === "station_admin" || role === "station_officer";
}

function isAdminRole(role) {
  // keep compatibility with your current "admin"
  return role === "admin";
}

// ✅ NEW: smart home redirect
function HomeRedirect() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  const role = getUser()?.role;
  if (isStationRole(role)) return <Navigate to="/station/inbox" replace />;
  return <Navigate to="/dashboard" replace />;
}

// ✅ Role-aware protection (fixed)
function RequireAuth({ children, roles }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  const user = getUser();
  const role = user?.role;

  // normalize role checks
  const roleAllowed =
    !roles || roles.length === 0
      ? true
      : roles.includes(role) ||
        (roles.includes("station") && isStationRole(role)) ||
        (roles.includes("admin") && isAdminRole(role));

  if (!roleAllowed) {
    // redirect user to correct home
    if (isStationRole(role)) return <Navigate to="/station/inbox" replace />;
    if (isAdminRole(role)) return <Navigate to="/dashboard" replace />;
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/login" element={<Login />} />

        {/* ✅ ADMIN ROUTES */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Dashboard">
                <Dashboard />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/violations"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Violations">
                <Violations />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/violations/new"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Create New Complaint">
                <NewComplaint />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/violations/:id"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Violation Details">
                <ViolationDetails />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/reports"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Reports">
                <Reports />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/regional-stations"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Regional Stations">
                <RegionalStations />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/users"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="User Management">
                <Users />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/notifications"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Notifications">
                <Notifications />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/settings"
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout title="Settings">
                <Settings />
              </AdminLayout>
            </RequireAuth>
          }
        />

        {/* ✅ STATION ROUTES */}
        <Route
          path="/station/inbox"
          element={
            <RequireAuth roles={["station"]}>
              <AdminLayout title="Station Inbox">
                <StationInbox />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/station/assigned"
          element={
            <RequireAuth roles={["station"]}>
              <AdminLayout title="Assigned Violations">
                <AssignedViolations />
              </AdminLayout>
            </RequireAuth>
          }
        />

        {/* fallback */}
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}