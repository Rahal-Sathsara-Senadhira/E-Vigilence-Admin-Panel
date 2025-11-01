import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <AdminLayout title="Create New Complaint">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {/* Add more routes and pages here */}
        </Routes>
      </AdminLayout>
    </BrowserRouter>
  );
}
