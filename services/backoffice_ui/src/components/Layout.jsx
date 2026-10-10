import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-base-100">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8 md:p-10 max-w-[1600px] w-[calc(100%-260px)] min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
