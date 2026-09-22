import React, { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Check, Copy, AlertCircle, Power, PowerOff, X } from 'lucide-react';
import api from '../api/client';

export default function ApiKeys() {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newKeyData, setNewKeyData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api-keys');
      setApiKeys(res.data.api_keys || []);
    } catch (err) {
      console.error('Error fetching API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
      };
      const res = await api.post('/api-keys', payload);
      setNewKeyData(res.data);
      fetchApiKeys();
    } catch (err) {
      alert('Error generating API key: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleKey = async (id, currentStatus) => {
    try {
      await api.patch(`/api-keys/${id}/toggle`, { is_active: !currentStatus });
      fetchApiKeys();
    } catch (err) {
      alert('Error toggling API key: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteKey = async (id, keyName) => {
    if (!window.confirm(`Are you sure you want to delete the API key "${keyName}"? This action cannot be undone and any applications using this key will lose access immediately.`)) return;
    try {
      await api.delete(`/api-keys/${id}`);
      fetchApiKeys();
    } catch (err) {
      alert('Error deleting API key: ' + (err.response?.data?.detail || err.message));
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setName('');
    setExpiresAt('');
    setNewKeyData(null);
    setCopied(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            API Keys
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Manage API keys for MCP Server access.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Generate New Key
        </button>
      </div>

      {/* Integration Snippets */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={18} style={{ color: 'var(--accent-primary)' }} />
          MCP Server Connection
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>OpenWebUI Configuration</h3>
            <div style={{ 
              background: 'rgba(0,0,0,0.3)', 
              padding: '16px', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)', 
              fontFamily: 'monospace', 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              whiteSpace: 'pre',
              overflowX: 'auto'
            }}>
{`{
  "mcp": {
    "knowledge_server": {
      "command": "http://<mcp-host>:8001/sse",
      "env": {
        "AUTHORIZATION": "Bearer mcp_your_api_key_here"
      }
    }
  }
}`}
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Claude Desktop Configuration</h3>
            <div style={{ 
              background: 'rgba(0,0,0,0.3)', 
              padding: '16px', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color)', 
              fontFamily: 'monospace', 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              whiteSpace: 'pre',
              overflowX: 'auto'
            }}>
{`{
  "mcpServers": {
    "knowledge_server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sse", "http://<mcp-host>:8001/sse"],
      "env": {
        "AUTHORIZATION": "Bearer mcp_your_api_key_here"
      }
    }
  }
}`}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px' }}>Name</th>
              <th style={{ padding: '12px' }}>Prefix</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px' }}>Created By</th>
              <th style={{ padding: '12px' }}>Created At</th>
              <th style={{ padding: '12px' }}>Expires At</th>
              <th style={{ padding: '12px' }}>Last Used</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading API keys...
                </td>
              </tr>
            ) : apiKeys.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No API keys generated yet. Click "Generate New Key" to create one.
                </td>
              </tr>
            ) : (
              apiKeys.map((key) => (
                <tr key={key.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '14px' }}>
                  <td style={{ padding: '14px 12px', fontWeight: '700', color: '#ffffff' }}>{key.name}</td>
                  <td style={{ padding: '14px 12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{key.key_prefix}...</td>
                  <td style={{ padding: '14px 12px' }}>
                    <span style={{ 
                      color: key.is_active ? 'var(--accent-emerald)' : 'var(--text-muted)', 
                      fontSize: '12px', 
                      fontWeight: '600',
                      padding: '4px 8px',
                      background: key.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px'
                    }}>
                      {key.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>{key.created_by || 'System'}</td>
                  <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                    {new Date(key.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                    {key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => handleToggleKey(key.id, key.is_active)}
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: key.is_active ? 'var(--text-secondary)' : 'var(--accent-emerald)', 
                          cursor: 'pointer',
                          padding: '6px'
                        }}
                        title={key.is_active ? "Disable Key" : "Enable Key"}
                      >
                        {key.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                      </button>
                      <button
                        onClick={() => handleDeleteKey(key.id, key.name)}
                        className="btn-danger"
                        style={{ padding: '6px 10px' }}
                        title="Delete Key"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Generate Key Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>Generate New API Key</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            {!newKeyData ? (
              <form onSubmit={handleGenerateKey} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Key Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. OpenWebUI Production"
                    className="input-field"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Expiration (Optional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="input-field"
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary"
                    style={{ flex: 1, opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? 'Generating...' : 'Generate Key'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ 
                  background: 'rgba(245, 158, 11, 0.1)', 
                  border: '1px solid rgba(245, 158, 11, 0.3)', 
                  borderRadius: '8px', 
                  padding: '16px', 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: '12px' 
                }}>
                  <AlertCircle style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} size={20} />
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#fcd34d', marginBottom: '4px' }}>Please copy your API key now</h4>
                    <p style={{ fontSize: '13px', color: 'rgba(252, 211, 77, 0.8)', lineHeight: '1.5' }}>
                      For security reasons, this key will not be shown again. If you lose it, you will need to generate a new one.
                    </p>
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Your new API key</label>
                  <div style={{ position: 'relative', display: 'flex' }}>
                    <input
                      type="text"
                      readOnly
                      value={newKeyData.api_key}
                      className="input-field"
                      style={{ fontFamily: 'monospace', paddingRight: '100px', color: '#ffffff' }}
                    />
                    <button
                      onClick={() => copyToClipboard(newKeyData.api_key)}
                      style={{ 
                        position: 'absolute', 
                        right: '8px', 
                        top: '8px', 
                        bottom: '8px', 
                        padding: '0 12px', 
                        background: 'rgba(255,255,255,0.1)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: '4px', 
                        color: '#ffffff', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        transition: 'all 0.2s'
                      }}
                    >
                      {copied ? <Check size={14} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={closeModal}
                  className="btn-primary"
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
