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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route
          path="/dashboard"
          element={
            <AdminLayout title="Dashboard">
              <Dashboard />
            </AdminLayout>
          }
        />

        <Route
          path="/violations"
          element={
            <AdminLayout title="Violations">
              <Violations />
            </AdminLayout>
          }
        />

        <Route
          path="/violations/new"
          element={
            <AdminLayout title="Create New Complaint">
              <NewComplaint />
            </AdminLayout>
          }
        />

        <Route
          path="/violations/:id"
          element={
            <AdminLayout title="Violation Details">
              <ViolationDetails />
            </AdminLayout>
          }
        />

        <Route
          path="/reports"
          element={
            <AdminLayout title="Reports">
              <Reports />
            </AdminLayout>
          }
        />

        <Route
          path="/regional-stations"
          element={
            <AdminLayout title="Regional Stations">
              <RegionalStations />
            </AdminLayout>
          }
        />

        <Route
          path="/users"
          element={
            <AdminLayout title="User Management">
              <Users />
            </AdminLayout>
          }
        />

        <Route
          path="/notifications"
          element={
            <AdminLayout title="Notifications">
              <Notifications />
            </AdminLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <AdminLayout title="Settings">
              <Settings />
            </AdminLayout>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
