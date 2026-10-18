import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Trash2, Shield, UserCheck, X, KeyRound } from 'lucide-react';
import api from '../api/client';
import ChangePasswordModal from '../components/modals/ChangePasswordModal';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState(2); // editor
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/users', {
        username,
        email,
        password,
        full_name: fullName,
        role_id: roleId
      });
      setShowModal(false);
      setUsername('');
      setEmail('');
      setPassword('');
      setFullName('');
      fetchUsers();
    } catch (err) {
      alert('Error creating user: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/users/${userId}`);
      fetchUsers();
    } catch (err) {
      alert('Error deleting user: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
            Users & Role-Based Access Control
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Manage administrative operators, editors, and viewer permissions stored in MySQL
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px' }}>Username</th>
              <th style={{ padding: '12px' }}>Full Name</th>
              <th style={{ padding: '12px' }}>Email</th>
              <th style={{ padding: '12px' }}>Role</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No users found. Click "Add User" to create one.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '14px' }}>
                  <td style={{ padding: '14px 12px', fontWeight: '700', color: 'var(--text-main)' }}>
                    {u.username}
                  </td>
                  <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                    {u.full_name || '-'}
                  </td>
                  <td style={{ padding: '14px 12px', color: 'var(--text-muted)' }}>
                    {u.email}
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'editor' ? 'badge-info' : 'badge-success'}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <span style={{ color: u.is_active ? 'var(--accent-emerald)' : 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                      <button
                        className="btn-ghost"
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}
                        title="Ganti Password"
                        onClick={() => setPasswordModalUser(u)}
                      >
                        <KeyRound size={14} />
                      </button>
                      {u.username !== 'admin' && (
                        <button
                          className="btn-danger"
                          style={{ padding: '6px 10px' }}
                          title="Hapus User"
                          onClick={() => handleDeleteUser(u.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>Create New Backoffice User</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Username
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Password
                </label>
                <input
                  type="password"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Role Assignment
                </label>
                <select
                  className="input-field"
                  style={{ background: 'var(--bg-glass-3)', color: 'var(--text-main)', borderColor: 'var(--border-subtle)' }}
                  value={roleId}
                  onChange={(e) => setRoleId(parseInt(e.target.value))}
                >
                  <option value={1} style={{ background: 'var(--bg-glass-1, #1e293b)', color: 'var(--text-main)' }}>Admin (Full Control)</option>
                  <option value={2} style={{ background: 'var(--bg-glass-1, #1e293b)', color: 'var(--text-main)' }}>Editor (Manage Knowledge & Models)</option>
                  <option value={3} style={{ background: 'var(--bg-glass-1, #1e293b)', color: 'var(--text-main)' }}>Viewer (Read-Only Access)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ChangePasswordModal
        isOpen={!!passwordModalUser}
        onClose={() => setPasswordModalUser(null)}
        mode="admin"
        targetUser={passwordModalUser}
        onSuccess={() => fetchUsers()}
      />
    </div>
  );
}
