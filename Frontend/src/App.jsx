// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import Violations from "./pages/violations/Violations";
import NewComplaint from "./pages/violations/NewComplaint";

function Home() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <p className="text-slate-300">Welcome. Go to Violations → New Complaint.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AdminLayout title="Home">
              <Home />
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
      </Routes>
    </BrowserRouter>
  );
}
