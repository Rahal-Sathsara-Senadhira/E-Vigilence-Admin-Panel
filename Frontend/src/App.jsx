// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import Violations from "./pages/violations/Violations";
import NewComplaint from "./pages/violations/NewComplaint";
import Reports from "./pages/reports/Reports";
import RegionalStations from "./pages/regionalStations/RegionalStations";
import Users from "./pages/users/Users";
import Notifications from "./pages/notifications/Notifications";
import Settings from "./pages/settings/Settings";
import Dashboard from "./pages/dashboard/Dashboard";

function Home() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <p className="text-slate-300">
        Welcome. Go to Violations → New Complaint.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        

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

        <Route
          path="/"
          element={
            <AdminLayout title="Dashboard">
              <Dashboard />
            </AdminLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
