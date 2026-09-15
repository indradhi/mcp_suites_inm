import React, { useState, useEffect } from 'react';
import { X, FolderGit2, CheckCircle, Edit2 } from 'lucide-react';
import api from '../../api/client';

export default function AddGoogleDriveModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [folderId, setFolderId] = useState('');
  const [credentialsJson, setCredentialsJson] = useState('{\n  "client_email": "",\n  "private_key": ""\n}');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      setAccountEmail(initialData.config?.account_email || '');
      setFolderId(initialData.config?.folder_id || '');
      if (initialData.config?.credentials) {
        setCredentialsJson(JSON.stringify(initialData.config.credentials, null, 2));
      }
    } else if (isOpen && !initialData) {
      setName('');
      setAccountEmail('');
      setFolderId('');
      setCredentialsJson('{\n  "client_email": "",\n  "private_key": ""\n}');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let parsedCreds = {};
      try {
        parsedCreds = JSON.parse(credentialsJson);
      } catch (e) {
        alert('Invalid JSON in Service Account credentials');
        setSubmitting(false);
        return;
      }

      const payload = {
        name,
        source_type: 'google_drive',
        description: `Google Drive Account: ${accountEmail}`,
        config: {
          account_email: accountEmail,
          folder_id: folderId,
          credentials: parsedCreds
        }
      };

      if (initialData) {
        await api.put(`/knowledge/sources/${initialData.id}?re_sync=true`, payload);
      } else {
        await api.post('/knowledge/sources', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {initialData ? <Edit2 size={20} color="var(--accent-primary)" /> : <FolderGit2 size={20} color="var(--accent-primary)" />}
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>
              {initialData ? 'Edit Google Drive Account' : 'Add Google Drive Account (Multi-Drive)'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Drive Label / Identifier
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Finance Team Google Drive"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Account Email
              </label>
              <input
                type="email"
                className="input-field"
                placeholder="service-account@project.iam.gserviceaccount.com"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Target Folder ID (Optional)
              </label>
              <input
                type="text"
                className="input-field font-mono"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Service Account Credentials JSON
            </label>
            <textarea
              className="input-field font-mono"
              rows={5}
              value={credentialsJson}
              onChange={(e) => setCredentialsJson(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Connecting...' : (initialData ? 'Update & Sync' : 'Save Drive Account')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
