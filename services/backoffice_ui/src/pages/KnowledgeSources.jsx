import React, { useEffect, useState } from 'react';
import { 
  Database, 
  Globe, 
  FileText, 
  Search, 
  Plus, 
  RefreshCw, 
  Trash2, 
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle,
  FolderGit2,
  Edit2,
  Zap,
  Code,
  Copy
} from 'lucide-react';
import api from '../api/client';
import { formatDateTimeWIB } from '../utils/dateUtils';
import AddDatabaseModal from '../components/modals/AddDatabaseModal';
import AddApiModal from '../components/modals/AddApiModal';
import AddFileModal from '../components/modals/AddFileModal';
import AddWebsiteModal from '../components/modals/AddWebsiteModal';
import AddWebSearchModal from '../components/modals/AddWebSearchModal';
import AddGoogleDriveModal from '../components/modals/AddGoogleDriveModal';

export default function KnowledgeSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [notification, setNotification] = useState(null);

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'database', 'api', 'file', 'website', 'websearch', 'google_drive'
  const [editingSource, setEditingSource] = useState(null);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const res = await api.get('/knowledge/sources');
      setSources(res.data);
    } catch (err) {
      console.error('Error fetching sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (sourceId) => {
    try {
      await api.post(`/knowledge/sources/${sourceId}/sync`);
      fetchSources();
    } catch (err) {
      alert('Failed triggering sync: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (sourceId) => {
    if (!window.confirm('Are you sure you want to delete this knowledge source and all its indexed vectors?')) return;
    try {
      await api.delete(`/knowledge/sources/${sourceId}`);
      fetchSources();
    } catch (err) {
      alert('Failed deleting source: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setActiveModal(source.source_type);
  };

  const handleDuplicate = async (source) => {
    try {
      setDuplicatingId(source.id);
      const res = await api.post(`/knowledge/sources/${source.id}/duplicate`);
      const newSource = res.data;
      await fetchSources();
      setNotification({
        type: 'success',
        message: `Koneksi '${source.name}' berhasil diduplikat sebagai '${newSource.name}'!`,
        newSource: newSource
      });
      setTimeout(() => setNotification(null), 8000);
    } catch (err) {
      console.error('Error duplicating source:', err);
      alert('Gagal menduplikat koneksi: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDuplicatingId(null);
    }
  };

  const closeModals = () => {
    setActiveModal(null);
    setEditingSource(null);
  };

  const getSourceIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'database': return <Database size={18} color="var(--accent-primary)" />;
      case 'api': return <Globe size={18} color="var(--accent-cyan)" />;
      case 'file': return <FileText size={18} color="#f472b6" />;
      case 'website': return <Globe size={18} color="var(--accent-emerald)" />;
      case 'websearch': return <Search size={18} color="var(--accent-amber)" />;
      case 'google_drive': return <FolderGit2 size={18} color="#a78bfa" />;
      default: return <Database size={18} color="var(--text-muted)" />;
    }
  };

  const filteredSources = sources.filter(s => 
    s.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    s.source_type.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            Knowledge Base Catalog
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Configure and synchronize vector stores across databases, APIs, documents, websites, and web search
          </p>
        </div>

        {/* Action Buttons Dropdown / Row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => { setEditingSource(null); setActiveModal('database'); }}>
            <Database size={15} /> Database
          </button>
          <button className="btn-secondary" onClick={() => { setEditingSource(null); setActiveModal('api'); }}>
            <Globe size={15} /> API
          </button>
          <button className="btn-secondary" onClick={() => { setEditingSource(null); setActiveModal('file'); }}>
            <FileText size={15} /> Document (OCR)
          </button>
          <button className="btn-secondary" onClick={() => { setEditingSource(null); setActiveModal('website'); }}>
            <Globe size={15} /> Website
          </button>
          <button className="btn-secondary" onClick={() => { setEditingSource(null); setActiveModal('websearch'); }}>
            <Search size={15} /> Web Search
          </button>
          <button className="btn-secondary" onClick={() => { setEditingSource(null); setActiveModal('google_drive'); }}>
            <FolderGit2 size={15} /> Google Drive
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notification && (
        <div style={{
          background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
          borderRadius: '10px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          color: notification.type === 'error' ? '#f87171' : '#34d399',
          fontSize: '13px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={17} color="#34d399" />
            <span style={{ fontWeight: '500' }}>{notification.message}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {notification.newSource && (
              <button
                type="button"
                id="btn-edit-duplicated-source"
                onClick={() => {
                  handleEdit(notification.newSource);
                  setNotification(null);
                }}
                style={{
                  background: 'rgba(16, 185, 129, 0.25)',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  color: '#34d399',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Edit2 size={13} /> Edit Sekarang
              </button>
            )}
            <button
              type="button"
              onClick={() => setNotification(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0 4px',
                lineHeight: 1
              }}
              title="Tutup Notifikasi"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Filter by name or source type..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ paddingLeft: '38px' }}
          />
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Showing {filteredSources.length} of {sources.length} sources
        </div>
      </div>

      {/* Sources Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {filteredSources.map((source) => {
          const isTool = (source.source_type === 'api' || source.source_type === 'database') && (source.config?.is_tool || source.sync_status?.includes('tool'));
          const isDbTool = source.source_type === 'database' && isTool;
          const isApiTool = source.source_type === 'api' && isTool;
          const paramCount = source.config?.parameters?.length || 0;
          const defaultPrefix = source.source_type === 'database' ? 'db_' : 'api_';
          const toolSlug = source.config?.tool_name || `${defaultPrefix}${source.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
          const accentColor = isDbTool ? 'var(--accent-primary)' : 'var(--accent-cyan)';
          const accentBg = isDbTool ? 'rgba(99, 102, 241, 0.15)' : 'rgba(6, 182, 212, 0.15)';
          const accentBorder = isDbTool ? 'rgba(99, 102, 241, 0.4)' : 'rgba(6, 182, 212, 0.4)';
          const toolBadgeLabel = isDbTool ? 'AI DATABASE TOOL' : 'AI API TOOL';

          return (
            <div key={source.id} className="glass-panel" style={{ 
              padding: '22px', 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between',
              border: isTool ? `1px solid ${accentBorder}` : '1px solid var(--border-color)',
              background: isTool ? (isDbTool ? 'rgba(99, 102, 241, 0.03)' : 'rgba(6, 182, 212, 0.03)') : undefined
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: isTool ? accentBg : 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: isTool ? `1px solid ${accentBorder}` : '1px solid var(--border-color)'
                    }}>
                      {isTool ? <Zap size={18} color={accentColor} /> : getSourceIcon(source.source_type)}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: isTool ? accentColor : 'var(--text-muted)', letterSpacing: '0.05em' }}>
                      {isTool ? toolBadgeLabel : source.source_type}
                    </span>
                  </div>

                  {isTool ? (
                    <span style={{
                      background: accentBg,
                      color: accentColor,
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: `1px solid ${accentBorder}`
                    }}>
                      <Zap size={11} /> {paramCount} params
                    </span>
                  ) : (
                    <span className={`badge ${source.sync_status === 'completed' ? 'badge-success' : source.sync_status === 'running' ? 'badge-info' : 'badge-warning'}`}>
                      {source.sync_status}
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>
                  {source.name}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
                  {source.description || 'No description provided'}
                </p>

                {/* Parameter Chips if AI Tool */}
                {isTool && source.config?.parameters && source.config.parameters.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Code size={12} color={accentColor} /> <span style={{ color: '#ffffff', fontWeight: '600' }}>{toolSlug}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {source.config.parameters.map((p, pIdx) => (
                        <span key={pIdx} style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          color: p.required ? accentColor : 'var(--text-secondary)',
                          fontFamily: 'JetBrains Mono, monospace'
                        }}>
                          {p.name}{p.required ? '*' : ''} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({p.in || p.type || 'query'})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.25)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>{isTool ? (isDbTool ? 'Type: Dynamic DB Tool' : 'Type: Dynamic API Tool') : `Last sync: ${source.last_synced_at ? formatDateTimeWIB(source.last_synced_at) : 'Never'}`}</span>
                  <span style={{ color: isTool ? accentColor : 'var(--text-secondary)' }}>
                    {isTool ? '⚡ MCP & Chat Ready' : `${source.document_count} chunks`}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  {!isTool && (
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      onClick={() => handleSync(source.id)}
                      title="Trigger Resync"
                    >
                      <RefreshCw size={14} /> Sync
                    </button>
                  )}
                  {isTool && (
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', color: accentColor, borderColor: accentBorder }}
                      onClick={() => handleEdit(source)}
                      title="Configure Parameters & Test"
                    >
                      <Zap size={14} /> Test / Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    id={`btn-duplicate-${source.id}`}
                    style={{
                      padding: '6px 11px',
                      fontSize: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: '#a78bfa',
                      borderColor: 'rgba(167, 139, 250, 0.35)',
                      background: 'rgba(167, 139, 250, 0.08)'
                    }}
                    onClick={() => handleDuplicate(source)}
                    disabled={duplicatingId === source.id}
                    title="Duplikat koneksi ini (buat salinan konfigurasi)"
                  >
                    <Copy size={13} />
                    <span>{duplicatingId === source.id ? 'Menyalin...' : 'Duplikat'}</span>
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={() => handleEdit(source)}
                    title="Edit Source"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn-danger"
                    style={{ padding: '6px 10px' }}
                    onClick={() => handleDelete(source.id)}
                    title="Delete Source"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <AddDatabaseModal
        isOpen={activeModal === 'database'}
        onClose={closeModals}
        onSuccess={fetchSources}
        initialData={editingSource}
      />
      <AddApiModal
        isOpen={activeModal === 'api'}
        onClose={closeModals}
        onSuccess={fetchSources}
        initialData={editingSource}
      />
      <AddFileModal
        isOpen={activeModal === 'file'}
        onClose={closeModals}
        onSuccess={fetchSources}
        initialData={editingSource}
      />
      <AddWebsiteModal
        isOpen={activeModal === 'website'}
        onClose={closeModals}
        onSuccess={fetchSources}
        initialData={editingSource}
      />
      <AddWebSearchModal
        isOpen={activeModal === 'websearch'}
        onClose={closeModals}
        onSuccess={fetchSources}
        initialData={editingSource}
      />
      <AddGoogleDriveModal
        isOpen={activeModal === 'google_drive'}
        onClose={closeModals}
        onSuccess={fetchSources}
        initialData={editingSource}
      />
    </div>
  );
}
