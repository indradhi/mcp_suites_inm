import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  Save, 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ShieldCheck
} from 'lucide-react';

export default function DatabaseSettings() {
  const [settings, setSettings] = useState({
    VECTOR_DB_PROVIDER: 'chroma',
    VECTOR_DB_DUAL_WRITE: false,
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

  // Vector Sync State
  const [vectorStats, setVectorStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDirection, setSyncDirection] = useState('chromadb_to_qdrant');
  const [cleanTarget, setCleanTarget] = useState(false);
  const [batchSize, setBatchSize] = useState(100);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    fetchSettings();
    fetchVectorStats();
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

  const fetchVectorStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/settings/database/vector-stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVectorStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch vector stats:', err);
    } finally {
      setLoadingStats(false);
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
        fetchVectorStats();
      } else {
        showNotification('Failed to save settings', 'error');
      }
    } catch (error) {
      showNotification('Network error while saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/settings/database/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          direction: syncDirection,
          clean_target: cleanTarget,
          batch_size: batchSize
        })
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.status === 'success') {
        showNotification(data.message || 'Vector synchronization finished successfully.', 'success');
        fetchVectorStats();
      } else {
        showNotification(data.message || 'Vector synchronization failed.', 'error');
      }
    } catch (error) {
      showNotification('Network error during vector DB synchronization', 'error');
    } finally {
      setSyncing(false);
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
    <div style={{ maxWidth: '1080px', margin: '0 auto', paddingBottom: '60px' }}>
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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px', letterSpacing: '-0.02em' }}>Database Config</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Manage endpoints, vector replication, and cross-database data synchronization.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleTest}
            disabled={testing || saving}
            style={{
              background: 'var(--bg-glass-light)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-subtle)',
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
            onMouseEnter={(e) => !testing && (e.currentTarget.style.background = 'var(--border-subtle)')}
            onMouseLeave={(e) => !testing && (e.currentTarget.style.background = 'var(--bg-glass-light)')}
          >
            <Activity size={18} />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving || testing}
            style={{
              background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
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

      {/* Database Connection Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Neo4j Settings */}
        <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '10px' }}>
              <Database size={24} color="#818cf8" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)' }}>Graph Database</h2>
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
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)' }}>Vector Database</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Embedding store settings & active provider</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>Active Vector Engine Provider</label>
              <select name="VECTOR_DB_PROVIDER" value={provider} onChange={handleChange} className="input-field" style={{ width: '100%', fontSize: '14px' }}>
                <option value="chromadb">ChromaDB (Local / Server)</option>
                <option value="qdrant">Qdrant (Server / Cloud)</option>
              </select>
            </div>

            {/* Real-time Dual-Write Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px',
              background: settings.VECTOR_DB_DUAL_WRITE ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-light)',
              border: `1px solid ${settings.VECTOR_DB_DUAL_WRITE ? 'rgba(99, 102, 241, 0.3)' : 'var(--bg-glass-light)'}`,
              borderRadius: '10px',
              transition: 'all 0.2s ease'
            }}>
              <input
                type="checkbox"
                name="VECTOR_DB_DUAL_WRITE"
                checked={settings.VECTOR_DB_DUAL_WRITE || false}
                onChange={handleChange}
                id="vector_db_dual_write"
                style={{ width: '18px', height: '18px', accentColor: '#6366f1', marginTop: '2px', cursor: 'pointer' }}
              />
              <label htmlFor="vector_db_dual_write" style={{ cursor: 'pointer', userSelect: 'none', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: settings.VECTOR_DB_DUAL_WRITE ? '#818cf8' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} /> Enable Real-Time Dual-Write (Replication)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: '1.4' }}>
                  Automatically replicate all ingested chunks and deletes simultaneously to both ChromaDB and Qdrant.
                </div>
              </label>
            </div>

            {provider === 'chromadb' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '18px', background: 'var(--bg-glass-2)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '14px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '18px', background: 'var(--bg-glass-2)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '14px' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--bg-glass-light)', borderRadius: '8px' }}>
                  <input type="checkbox" name="QDRANT_HTTPS" checked={settings.QDRANT_HTTPS || false} onChange={handleChange} id="qdrant_https" style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                  <label htmlFor="qdrant_https" style={{ color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
                    Connect via HTTPS (TLS/SSL)
                  </label>
                </div>
              </div>
            )}
          </div>
          
          {renderTestStatus('vector_db')}
        </div>
      </div>

      {/* Vector Synchronization & Migration Card */}
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '18px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', background: 'rgba(6, 182, 212, 0.1)', borderRadius: '10px' }}>
              <ArrowLeftRight size={24} color="#06b6d4" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-main)' }}>Vector DB Synchronization & Migration</h2>
                {vectorStats && (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: vectorStats.in_sync ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: vectorStats.in_sync ? '#34d399' : '#fbbf24',
                    border: `1px solid ${vectorStats.in_sync ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                  }}>
                    {vectorStats.in_sync ? (
                      <>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                        In Sync ({vectorStats.chromadb?.count || 0} chunks)
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={12} />
                        Out of Sync (Δ {vectorStats.diff} chunks)
                      </>
                    )}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Inspect live counts, re-embed dimensions, and migrate knowledge between ChromaDB and Qdrant.
              </p>
            </div>
          </div>

          <button
            onClick={fetchVectorStats}
            disabled={loadingStats || syncing}
            style={{
              background: 'var(--bg-glass-light)',
              color: 'var(--text-secondary)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: loadingStats ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => !loadingStats && (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => !loadingStats && (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <RefreshCw size={14} className={loadingStats ? 'animate-spin' : ''} style={{ animation: loadingStats ? 'spin 1s linear infinite' : 'none' }} />
            {loadingStats ? 'Checking...' : 'Refresh Stats'}
          </button>
        </div>

        {/* Side-by-Side DB State Overview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '20px', alignItems: 'center', marginBottom: '28px' }}>
          {/* ChromaDB Card */}
          <div style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'var(--bg-glass-light)',
            border: `1px solid ${settings.VECTOR_DB_PROVIDER === 'chromadb' ? 'rgba(99, 102, 241, 0.4)' : 'var(--bg-glass-light)'}`,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {settings.VECTOR_DB_PROVIDER === 'chromadb' && (
              <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Primary
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>ChromaDB</span>
              {vectorStats?.chromadb?.connected ? (
                <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span> Connected
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span> Offline
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
                {vectorStats?.chromadb?.count ?? '—'}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Indexed Chunks</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div><strong style={{ color: 'var(--text-muted)' }}>Collection:</strong> {vectorStats?.chromadb?.collection || settings.CHROMADB_COLLECTION || 'knowledge_base'}</div>
              <div><strong style={{ color: 'var(--text-muted)' }}>Vector Dim:</strong> 384 dimensions (Cosine)</div>
              <div><strong style={{ color: 'var(--text-muted)' }}>Target:</strong> {vectorStats?.chromadb?.host || settings.CHROMADB_HOST}:{vectorStats?.chromadb?.port || settings.CHROMADB_PORT}</div>
            </div>
          </div>

          {/* Center Connector Indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'var(--bg-glass-light)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              marginBottom: '6px'
            }}>
              {syncDirection === 'chromadb_to_qdrant' && <ArrowRight size={20} />}
              {syncDirection === 'qdrant_to_chromadb' && <ArrowLeft size={20} />}
              {syncDirection === 'bidirectional' && <ArrowLeftRight size={20} />}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
              {syncDirection === 'chromadb_to_qdrant' && 'Push'}
              {syncDirection === 'qdrant_to_chromadb' && 'Pull'}
              {syncDirection === 'bidirectional' && '2-Way'}
            </span>
          </div>

          {/* Qdrant Card */}
          <div style={{
            padding: '20px',
            borderRadius: '12px',
            background: 'var(--bg-glass-light)',
            border: `1px solid ${settings.VECTOR_DB_PROVIDER === 'qdrant' ? 'rgba(99, 102, 241, 0.4)' : 'var(--bg-glass-light)'}`,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {settings.VECTOR_DB_PROVIDER === 'qdrant' && (
              <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Primary
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>Qdrant</span>
              {vectorStats?.qdrant?.connected ? (
                <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span> Connected
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span> Offline
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
                {vectorStats?.qdrant?.count ?? '—'}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Indexed Points</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div><strong style={{ color: 'var(--text-muted)' }}>Collection:</strong> {vectorStats?.qdrant?.collection || settings.QDRANT_COLLECTION || 'mcp_ai'}</div>
              <div><strong style={{ color: 'var(--text-muted)' }}>Vector Dim:</strong> {vectorStats?.qdrant?.dim || 1024} dimensions (Cosine)</div>
              <div><strong style={{ color: 'var(--text-muted)' }}>Host:</strong> {vectorStats?.qdrant?.host || settings.QDRANT_HOST}</div>
            </div>
          </div>
        </div>

        {/* Sync Controls Section */}
        <div style={{
          padding: '20px',
          borderRadius: '12px',
          background: 'var(--bg-glass-2)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '10px', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
              Select Synchronization Mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* Option 1: Chroma to Qdrant */}
              <div
                onClick={() => setSyncDirection('chromadb_to_qdrant')}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: `1.5px solid ${syncDirection === 'chromadb_to_qdrant' ? '#6366f1' : 'var(--bg-glass-light)'}`,
                  background: syncDirection === 'chromadb_to_qdrant' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-light)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: syncDirection === 'chromadb_to_qdrant' ? '#818cf8' : '#fff' }}>
                    ChromaDB ➔ Qdrant
                  </span>
                  {syncDirection === 'chromadb_to_qdrant' && <CheckCircle2 size={16} color="#818cf8" />}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Export all Chroma chunks, re-embed to 1024-dim, and upsert into Qdrant server.
                </p>
              </div>

              {/* Option 2: Qdrant to Chroma */}
              <div
                onClick={() => setSyncDirection('qdrant_to_chromadb')}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: `1.5px solid ${syncDirection === 'qdrant_to_chromadb' ? '#6366f1' : 'var(--bg-glass-light)'}`,
                  background: syncDirection === 'qdrant_to_chromadb' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-light)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: syncDirection === 'qdrant_to_chromadb' ? '#818cf8' : '#fff' }}>
                    Qdrant ➔ ChromaDB
                  </span>
                  {syncDirection === 'qdrant_to_chromadb' && <CheckCircle2 size={16} color="#818cf8" />}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Pull all points from Qdrant, sanitize payload, re-embed to 384-dim, and store in ChromaDB.
                </p>
              </div>

              {/* Option 3: Bidirectional */}
              <div
                onClick={() => setSyncDirection('bidirectional')}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: `1.5px solid ${syncDirection === 'bidirectional' ? '#6366f1' : 'var(--bg-glass-light)'}`,
                  background: syncDirection === 'bidirectional' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-light)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: syncDirection === 'bidirectional' ? '#818cf8' : '#fff' }}>
                    Bidirectional Sync (⇄)
                  </span>
                  {syncDirection === 'bidirectional' && <CheckCircle2 size={16} color="#818cf8" />}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Compare chunk IDs between both DBs and synchronize the delta bidirectionally.
                </p>
              </div>
            </div>
          </div>

          {/* Sync Options & Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', paddingTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={cleanTarget}
                  disabled={syncDirection === 'bidirectional'}
                  onChange={(e) => setCleanTarget(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#ef4444', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px', color: syncDirection === 'bidirectional' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                  Clean / Reset target collection before copying
                </span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Batch Size:</span>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="input-field"
                  style={{ padding: '4px 10px', fontSize: '13px', width: '90px' }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSync}
              disabled={syncing || (vectorStats && (!vectorStats.chromadb?.connected || !vectorStats.qdrant?.connected))}
              style={{
                background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                padding: '10px 22px',
                borderRadius: '8px',
                cursor: syncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                fontSize: '14px',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                transition: 'all 0.2s',
                opacity: syncing ? 0.7 : 1
              }}
              onMouseEnter={(e) => !syncing && (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={(e) => !syncing && (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Synchronizing...' : 'Start Sync Now'}
            </button>
          </div>

          {/* Sync Result Box */}
          {syncResult && (
            <div style={{
              marginTop: '8px',
              padding: '16px',
              borderRadius: '10px',
              background: syncResult.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${syncResult.status === 'success' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {syncResult.status === 'success' ? (
                  <CheckCircle size={18} color="#10b981" />
                ) : (
                  <XCircle size={18} color="#ef4444" />
                )}
                <span style={{ fontSize: '14px', fontWeight: '600', color: syncResult.status === 'success' ? '#10b981' : '#ef4444' }}>
                  {syncResult.status === 'success' ? 'Sync Completed Successfully' : 'Sync Error'}
                </span>
                {syncResult.duration_seconds !== undefined && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Elapsed: {syncResult.duration_seconds}s
                  </span>
                )}
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {syncResult.message}
              </div>

              {syncResult.status === 'success' && (
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', flexWrap: 'wrap' }}>
                  <span>Source Chunks: <strong style={{ color: 'var(--text-main)' }}>{syncResult.source_count}</strong></span>
                  <span>Synced: <strong style={{ color: 'var(--accent-emerald)' }}>{syncResult.synced_count}</strong></span>
                  <span>Target Before: <strong style={{ color: 'var(--text-main)' }}>{syncResult.target_count_before}</strong></span>
                  <span>Target After: <strong style={{ color: 'var(--text-main)' }}>{syncResult.target_count_after}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
