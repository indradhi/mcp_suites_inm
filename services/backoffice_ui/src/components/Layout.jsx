import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{
        marginLeft: '260px',
        flex: 1,
        padding: '32px 40px',
        maxWidth: '1600px',
        width: 'calc(100% - 260px)',
        minHeight: '100vh',
        boxSizing: 'border-box'
      }}>
        <Outlet />
      </main>
    </div>
  );
}
