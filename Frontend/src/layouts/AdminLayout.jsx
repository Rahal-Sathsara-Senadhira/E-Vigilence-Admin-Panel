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
        {/* Figma Geometric Background Accents */}
        <div className="absolute top-0 right-0 pointer-events-none -z-10">
          <svg width="350" height="350" viewBox="0 0 350 350" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-20 mix-blend-multiply dark:mix-blend-screen dark:opacity-30">
            <polygon points="350,0 350,350 0,0" fill="#2171B5" />
            <polygon points="350,0 350,180 170,0" fill="#F27D22" />
          </svg>
        </div>
        <div className="absolute bottom-0 left-0 pointer-events-none -z-10 lg:left-72">
          <svg width="250" height="250" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-20 mix-blend-multiply dark:mix-blend-screen dark:opacity-30">
            <polygon points="0,250 250,250 0,0" fill="#F27D22" />
            <polygon points="0,250 120,250 0,130" fill="#2171B5" />
          </svg>
        </div>

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
