import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import ToastContainer from "../components/Toast";

export default function AdminLayout({ children, title = "Create New Complaint" }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-200 dark:bg-slate-950 text-slate-900 dark:text-slate-200 transition-colors">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden">
        <Topbar onMenu={() => setSidebarOpen((prev) => !prev)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full relative">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            </div>
            {children}
          </div>
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
