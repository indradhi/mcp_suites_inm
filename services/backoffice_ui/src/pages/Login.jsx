import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, ArrowRight, ShieldCheck, Lock, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative bg-base-100">
      <div className="glass-panel max-w-[440px] w-full p-10 relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary inline-flex items-center justify-center mb-4 shadow-lg shadow-primary/40">
            <Layers size={30} className="text-primary-content" />
          </div>
          <h2 className="text-2xl font-bold text-base-content tracking-tight">
            MCP Knowledge Suite
          </h2>
          <p className="text-sm text-base-content/60 mt-2">
            Sign in to manage knowledge, backends & networks
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm mb-5 flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-semibold text-base-content/70 mb-2">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                className="input-field pl-10"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <User size={18} className="text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-base-content/70 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                className="input-field pl-10"
                placeholder="admin123"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Lock size={18} className="text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : (
              <>
                Sign In
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-7 pt-5 border-t border-base-300 flex items-center justify-center gap-2 text-xs text-base-content/50">
          <ShieldCheck size={16} className="text-success" />
          <span>Secured with MySQL RBAC & JWT Authentication</span>
        </div>
      </div>
    </div>
  );
}
