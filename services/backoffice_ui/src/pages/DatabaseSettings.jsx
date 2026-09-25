import React, { useState, useEffect } from 'react';
import { Database, Server, Save, Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function DatabaseSettings() {
  const [settings, setSettings] = useState({
    VECTOR_DB_PROVIDER: 'chroma',
    CHROMADB_HOST: 'localhost',
    CHROMADB_PORT: 8000,
    CHROMADB_COLLECTION: 'knowledge_chunks',
    QDRANT_HOST: 'localhost',
    QDRANT_PORT: 6333,
    QDRANT_COLLECTION: 'knowledge_chunks',
    QDRANT_API_KEY: '',
    QDRANT_HTTPS: false,
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'password'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/database', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
      } else {
        showNotification('Failed to load database settings', 'error');
      }
    } catch (error) {
      showNotification('Network error while loading settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch('/api/settings/database/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setTestResults(data.results);
        showNotification('Connection tests completed.', 'success');
      } else {
        showNotification('Failed to run connection tests', 'error');
      }
    } catch (error) {
      showNotification('Network error during connection test', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/database', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        showNotification('Database settings saved successfully. Clients will re-initialize on next use.', 'success');
      } else {
        showNotification('Failed to save settings', 'error');
      }
    } catch (error) {
      showNotification('Network error while saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  const renderTestStatus = (key) => {
    if (!testResults || !testResults[key]) return null;
    const result = testResults[key];
    return (
      <div style={{
        marginTop: '16px',
        padding: '12px',
        borderRadius: '8px',
        background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        border: `1px solid ${result.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        {result.success ? (
          <CheckCircle size={18} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} />
        ) : (
          <XCircle size={18} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: result.success ? '#10b981' : '#ef4444' }}>
            {result.success ? 'Connection Successful' : 'Connection Failed'}
          </div>
          {result.message && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', wordBreak: 'break-word' }}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: '40px', textAlign: 'center' }}>Loading settings...</div>;
  }

  const provider = settings.VECTOR_DB_PROVIDER || 'chromadb';


  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {notification && (
        <div style={{
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          color: notification.type === 'error' ? '#fca5a5' : '#6ee7b7',
          animation: 'fadeIn 0.3s ease'
        }}>
          {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <span style={{ fontSize: '14px', fontWeight: '500' }}>{notification.message}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#ffffff', marginBottom: '8px', letterSpacing: '-0.02em' }}>Database Config</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Manage endpoints and credentials for Neo4j and Vector Store.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleTest}
            disabled={testing || saving}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '10px 16px',
              borderRadius: '8px',
              cursor: testing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600',
              transition: 'all 0.2s',
              opacity: (testing || saving) ? 0.7 : 1
            }}
            onMouseEnter={(e) => !testing && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
            onMouseLeave={(e) => !testing && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
          >
            <Activity size={18} />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving || testing}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.2s',
              opacity: (saving || testing) ? 0.7 : 1
            }}
            onMouseEnter={(e) => !saving && (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => !saving && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Neo4j Settings */}
        <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '10px' }}>
              <Database size={24} color="#818cf8" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff' }}>Graph Database</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Neo4j connection settings</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>Connection URI</label>
              <input type="text" name="NEO4J_URI" value={settings.NEO4J_URI || ''} onChange={handleChange} className="input-field" placeholder="bolt://localhost:7687" style={{ width: '100%', fontSize: '14px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>Username</label>
              <input type="text" name="NEO4J_USER" value={settings.NEO4J_USER || ''} onChange={handleChange} className="input-field" placeholder="neo4j" style={{ width: '100%', fontSize: '14px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>Password</label>
              <input type="password" name="NEO4J_PASSWORD" value={settings.NEO4J_PASSWORD || ''} onChange={handleChange} className="input-field" placeholder="••••••••" style={{ width: '100%', fontSize: '14px' }} />
            </div>
          </div>
          
          {renderTestStatus('neo4j')}
        </div>

        {/* Vector DB Settings */}
        <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div style={{ padding: '10px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '10px' }}>
              <Server size={24} color="#c084fc" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff' }}>Vector Database</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Embedding store settings</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>Vector Engine Provider</label>
              <select name="VECTOR_DB_PROVIDER" value={provider} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }}>
                <option value="chromadb">ChromaDB (Local/Server)</option>
                <option value="qdrant">Qdrant (Server/Cloud)</option>
              </select>
            </div>

            {provider === 'chromadb' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Host / IP Address</label>
                    <input type="text" name="CHROMADB_HOST" value={settings.CHROMADB_HOST || ''} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Port</label>
                    <input type="number" name="CHROMADB_PORT" value={settings.CHROMADB_PORT || ''} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Collection Name</label>
                  <input type="text" name="CHROMADB_COLLECTION" value={settings.CHROMADB_COLLECTION || ''} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }} />
                </div>
              </div>
            )}

            {provider === 'qdrant' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Host / IP Address</label>
                    <input type="text" name="QDRANT_HOST" value={settings.QDRANT_HOST || ''} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Port</label>
                    <input type="number" name="QDRANT_PORT" value={settings.QDRANT_PORT || ''} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Collection Name</label>
                  <input type="text" name="QDRANT_COLLECTION" value={settings.QDRANT_COLLECTION || ''} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>API Key (Optional)</label>
                  <input type="password" name="QDRANT_API_KEY" value={settings.QDRANT_API_KEY || ''} onChange={handleChange} className="input-field" placeholder="Secret Key" style={{ width: '100%', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                  <input type="checkbox" name="QDRANT_HTTPS" checked={settings.QDRANT_HTTPS || false} onChange={handleChange} id="qdrant_https" style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                  <label htmlFor="qdrant_https" style={{ color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>
                    Connect via HTTPS (TLS/SSL)
                  </label>
                </div>
              </div>
            )}
          </div>
          
          {renderTestStatus('vector_db')}
        </div>
      </div>
    </div>
  );
}
