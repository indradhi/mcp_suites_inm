import React, { useState } from 'react';
import { X, KeyRound, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../api/client';

export default function ChangePasswordModal({
  isOpen,
  onClose,
  mode = 'self', // 'self' | 'admin'
  targetUser = null, // { id, username } if mode === 'admin'
  onSuccess = null
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccessMsg('');
    setLoading(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (mode === 'self' && !currentPassword) {
      setError('Password saat ini wajib diisi.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Password baru minimal 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'self') {
        const res = await api.put('/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword
        });
        setSuccessMsg(res.data?.message || 'Password berhasil diperbarui.');
      } else {
        const res = await api.put(`/users/${targetUser.id}/password`, {
          new_password: newPassword
        });
        setSuccessMsg(res.data?.message || `Password user ${targetUser.username} berhasil diubah.`);
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        handleClose();
      }, 1200);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Gagal mengubah password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={handleClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--bg-glass-panel, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--primary, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <KeyRound size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main, #f8fafc)', margin: 0 }}>
                {mode === 'self' ? 'Ganti Password Saya' : `Ganti Password: ${targetUser?.username || 'User'}`}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', margin: '2px 0 0' }}>
                {mode === 'self'
                  ? 'Perbarui password akun Anda saat ini'
                  : `Tetapkan password baru untuk akun pengguna ini`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-base-content"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                color: '#4ade80',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'self' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #cbd5e1)', marginBottom: '6px' }}>
                Password Saat Ini
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted, #94a3b8)', pointerEvents: 'none' }} />
                <input
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px', fontSize: '13px' }}
                  placeholder="Masukkan password saat ini"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #cbd5e1)', marginBottom: '6px' }}>
              Password Baru
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted, #94a3b8)', pointerEvents: 'none' }} />
              <input
                type="password"
                className="input-field"
                style={{ paddingLeft: '38px', fontSize: '13px' }}
                placeholder="Minimal 6 karakter"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #cbd5e1)', marginBottom: '6px' }}>
              Konfirmasi Password Baru
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted, #94a3b8)', pointerEvents: 'none' }} />
              <input
                type="password"
                className="input-field"
                style={{ paddingLeft: '38px', fontSize: '13px' }}
                placeholder="Ulangi password baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-ghost btn-sm"
              disabled={loading}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '110px', justifyContent: 'center' }}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <>
                  <KeyRound size={14} />
                  <span>Simpan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
