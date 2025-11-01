import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

export default function AdminLayout({ children, title = "Create New Complaint" }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex w-full flex-col lg:pl-72">
        <Topbar onMenu={() => setSidebarOpen(true)} />

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
