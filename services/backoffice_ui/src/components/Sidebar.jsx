import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import ThemeSwitcher from './ThemeSwitcher';
import ChangePasswordModal from './modals/ChangePasswordModal';
import { 
  LayoutDashboard, 
  Database, 
  Network, 
  Cpu, 
  Activity, 
  Users, 
  Sparkles,
  Layers,
  MessageSquare,
  Workflow,
  LogOut,
  Key
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/chat', label: 'AI Knowledge Chat', icon: MessageSquare },
    { to: '/orchestrator', label: 'Data Orchestrator', icon: Workflow },
    { to: '/knowledge', label: 'Knowledge Sources', icon: Database },
    { to: '/network', label: 'Network Explorer', icon: Network },
    { to: '/llm-backends', label: 'LLM Backends', icon: Cpu },
    { to: '/personality', label: 'MCP Personality', icon: Sparkles },
    { to: '/jobs', label: 'Ingest Jobs', icon: Activity },
  ];

  if (isAdmin()) {
    navItems.push({ to: '/db-settings', label: 'Database Config', icon: Database });
    navItems.push({ to: '/keys', label: 'API Keys', icon: Key });
    navItems.push({ to: '/users', label: 'Users & Roles', icon: Users });
  }

  return (
    <aside className="w-[260px] h-screen fixed left-0 top-0 bg-base-200/90 backdrop-blur-xl border-r border-base-300 flex flex-col z-40">
      {/* Brand Header */}
      <div className="px-5 py-6 flex items-center gap-3 border-b border-base-300">
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.12)'
        }}>
          <Layers size={22} color="#ffffff" />
        </div>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>MCP Suite</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-emerald)', marginTop: '2px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }}></span>
            Server Online
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0 12px 6px', letterSpacing: '0.05em' }}>
          Platform
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary/10 text-primary border-l-4 border-primary font-semibold' 
                    : 'text-base-content/70 hover:bg-base-300 hover:text-base-content border-l-4 border-transparent'
                }`
              }
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }} className="bg-base-200/50">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ overflow: 'hidden' }}>
            <div className="text-base-content font-semibold text-sm truncate">
              {user?.full_name || user?.username || 'Admin'}
            </div>
            <div className="text-base-content/60 text-xs capitalize">
              {user?.role || 'Administrator'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button 
              onClick={() => setShowPasswordModal(true)}
              title="Ganti Password"
              className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-primary"
            >
              <Key size={17} />
            </button>
            <button 
              onClick={handleLogout}
              title="Logout"
              className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-error"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <ThemeSwitcher />
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        mode="self"
      />
    </aside>
  );
}
