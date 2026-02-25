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
import { isLoggedIn } from "./utils/auth";

function RequireAuth({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <AdminLayout title="Dashboard">
                <Dashboard />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/violations"
          element={
            <RequireAuth>
              <AdminLayout title="Violations">
                <Violations />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/violations/new"
          element={
            <RequireAuth>
              <AdminLayout title="Create New Complaint">
                <NewComplaint />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/violations/:id"
          element={
            <RequireAuth>
              <AdminLayout title="Violation Details">
                <ViolationDetails />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/reports"
          element={
            <RequireAuth>
              <AdminLayout title="Reports">
                <Reports />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/regional-stations"
          element={
            <RequireAuth>
              <AdminLayout title="Regional Stations">
                <RegionalStations />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/users"
          element={
            <RequireAuth>
              <AdminLayout title="User Management">
                <Users />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <AdminLayout title="Notifications">
                <Notifications />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/settings"
          element={
            <RequireAuth>
              <AdminLayout title="Settings">
                <Settings />
              </AdminLayout>
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}