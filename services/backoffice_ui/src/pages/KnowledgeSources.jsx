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
  Copy,
  Download,
  Upload
} from 'lucide-react';
import api from '../api/client';
import { formatDateTimeWIB } from '../utils/dateUtils';
import AddDatabaseModal from '../components/modals/AddDatabaseModal';
import AddApiModal from '../components/modals/AddApiModal';
import AddFileModal from '../components/modals/AddFileModal';
import AddWebsiteModal from '../components/modals/AddWebsiteModal';
import AddWebSearchModal from '../components/modals/AddWebSearchModal';
import AddGoogleDriveModal from '../components/modals/AddGoogleDriveModal';
import ImportCatalogModal from '../components/modals/ImportCatalogModal';

export default function KnowledgeSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'disabled'
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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

  const handleToggleActive = async (source) => {
    try {
      setTogglingId(source.id);
      const res = await api.patch(`/knowledge/sources/${source.id}/toggle-active`);
      const newActive = res.data.is_active;

      // Optimistically update state
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: newActive } : s));

      setNotification({
        type: 'success',
        message: res.data.message || `Knowledge Source '${source.name}' berhasil ${newActive ? 'diaktifkan' : 'dinonaktifkan'}.`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error('Error toggling active state:', err);
      setNotification({
        type: 'error',
        message: 'Gagal mengubah status: ' + (err.response?.data?.detail || err.message)
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setTogglingId(null);
    }
  };

  const handleSync = async (source) => {
    if (source.is_active === false) {
      alert("Knowledge Source sedang dinonaktifkan. Silakan aktifkan terlebih dahulu untuk melakukan sinkronisasi.");
      return;
    }
    try {
      await api.post(`/knowledge/sources/${source.id}/sync`);
      fetchSources();
      setNotification({
        type: 'success',
        message: `Sinkronisasi untuk '${source.name}' berhasil dimasukkan ke dalam antrean!`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      alert('Gagal memicu sinkronisasi: ' + (err.response?.data?.detail || err.message));
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

  const handleExportCatalog = async () => {
    try {
      setExporting(true);
      const res = await api.get('/knowledge/export');
      const dataStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `knowledge_catalog_export_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setNotification({
        type: 'success',
        message: `Katalog berhasil diekspor (${res.data.total_sources || res.data.sources?.length || 0} sumber)!`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error('Export error:', err);
      alert('Gagal mengekspor katalog: ' + (err.response?.data?.detail || err.message));
    } finally {
      setExporting(false);
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

  const activeCount = sources.filter(s => s.is_active !== false).length;
  const disabledCount = sources.filter(s => s.is_active === false).length;

  const filteredSources = sources.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      s.source_type.toLowerCase().includes(searchFilter.toLowerCase());
    
    if (!matchesSearch) return false;
    if (statusFilter === 'active') return s.is_active !== false;
    if (statusFilter === 'disabled') return s.is_active === false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            Knowledge Base Catalog
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Kelola dan sinkronisasi sumber pengetahuan lintas database, API, dokumen, website, dan web search
          </p>
        </div>

        {/* Action Buttons Dropdown / Row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Export & Import Tools */}
          <div style={{ display: 'flex', gap: '8px', paddingRight: '8px', borderRight: '1px solid var(--border-color)' }}>
            <button
              type="button"
              id="btn-export-catalog"
              className="btn-secondary"
              onClick={handleExportCatalog}
              disabled={exporting || sources.length === 0}
              title="Export seluruh katalog ke berkas JSON"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: 'rgba(99, 102, 241, 0.4)',
                color: 'var(--accent-primary)',
                background: 'rgba(99, 102, 241, 0.08)'
              }}
            >
              <Download size={15} />
              <span>{exporting ? 'Mengekspor...' : 'Export'}</span>
            </button>
            <button
              type="button"
              id="btn-import-catalog"
              className="btn-secondary"
              onClick={() => setIsImportModalOpen(true)}
              title="Import sumber pengetahuan dari berkas JSON"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                background: 'rgba(16, 185, 129, 0.08)'
              }}
            >
              <Upload size={15} />
              <span>Import</span>
            </button>
          </div>

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
            {notification.type === 'error' ? <AlertTriangle size={17} color="#f87171" /> : <CheckCircle size={17} color="#34d399" />}
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

      {/* Filter Bar with Status Tabs */}
      <div className="glass-panel" style={{ 
        padding: '14px 20px', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '380px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Filter berdasarkan nama atau tipe..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: '38px' }}
            />
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          </div>

          {/* Status Filter Tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            gap: '2px'
          }}>
            <button
              type="button"
              id="filter-status-all"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'all' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: statusFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
                transition: 'all 0.15s ease'
              }}
            >
              Semua ({sources.length})
            </button>
            <button
              type="button"
              id="filter-status-active"
              onClick={() => setStatusFilter('active')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'active' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                color: statusFilter === 'active' ? '#34d399' : 'var(--text-muted)',
                transition: 'all 0.15s ease'
              }}
            >
              Aktif ({activeCount})
            </button>
            <button
              type="button"
              id="filter-status-disabled"
              onClick={() => setStatusFilter('disabled')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'disabled' ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
                color: statusFilter === 'disabled' ? '#fca5a5' : 'var(--text-muted)',
                transition: 'all 0.15s ease'
              }}
            >
              Nonaktif ({disabledCount})
            </button>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Menampilkan {filteredSources.length} dari {sources.length} sumber
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
          const isActive = source.is_active !== false;

          return (
            <div key={source.id} className="glass-panel" style={{ 
              padding: '22px', 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between',
              border: !isActive 
                ? '1px dashed rgba(255, 255, 255, 0.15)' 
                : (isTool ? `1px solid ${accentBorder}` : '1px solid var(--border-color)'),
              background: !isActive
                ? 'rgba(15, 23, 42, 0.35)'
                : (isTool ? (isDbTool ? 'rgba(99, 102, 241, 0.03)' : 'rgba(6, 182, 212, 0.03)') : undefined),
              opacity: !isActive ? 0.72 : 1,
              transition: 'all 0.2s ease',
              position: 'relative'
            }}>
              <div>
                {/* Header of Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: !isActive ? 'rgba(255, 255, 255, 0.03)' : (isTool ? accentBg : 'rgba(255, 255, 255, 0.05)'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: !isActive ? '1px solid rgba(255, 255, 255, 0.1)' : (isTool ? `1px solid ${accentBorder}` : '1px solid var(--border-color)')
                    }}>
                      {isTool ? <Zap size={18} color={!isActive ? 'var(--text-muted)' : accentColor} /> : getSourceIcon(source.source_type)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: !isActive ? 'var(--text-muted)' : (isTool ? accentColor : 'var(--text-muted)'), letterSpacing: '0.05em' }}>
                          {isTool ? toolBadgeLabel : source.source_type}
                        </span>
                        {/* Active / Inactive Status Pill */}
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '1px 7px',
                          borderRadius: '10px',
                          background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                          color: isActive ? '#34d399' : '#94a3b8',
                          border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`
                        }}>
                          <span style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: isActive ? '#34d399' : '#64748b',
                            boxShadow: isActive ? '0 0 6px #34d399' : 'none'
                          }} />
                          {isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Badges & 1-Click Toggle Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isTool ? (
                      <span style={{
                        background: !isActive ? 'rgba(255, 255, 255, 0.05)' : accentBg,
                        color: !isActive ? 'var(--text-muted)' : accentColor,
                        padding: '3px 9px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: `1px solid ${!isActive ? 'var(--border-color)' : accentBorder}`
                      }}>
                        <Zap size={11} /> {paramCount} params
                      </span>
                    ) : (
                      <span className={`badge ${source.sync_status === 'completed' ? 'badge-success' : source.sync_status === 'running' ? 'badge-info' : 'badge-warning'}`} style={{ opacity: !isActive ? 0.6 : 1 }}>
                        {source.sync_status}
                      </span>
                    )}

                    {/* Modern Toggle Switch */}
                    <button
                      type="button"
                      id={`toggle-active-${source.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(source);
                      }}
                      disabled={togglingId === source.id}
                      title={isActive ? 'Klik untuk menonaktifkan sumber pengetahuan ini' : 'Klik untuk mengaktifkan sumber pengetahuan ini'}
                      style={{
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        width: '38px',
                        height: '20px',
                        borderRadius: '12px',
                        backgroundColor: isActive ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
                        border: 'none',
                        cursor: togglingId === source.id ? 'wait' : 'pointer',
                        padding: '2px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        outline: 'none',
                        opacity: togglingId === source.id ? 0.5 : 1,
                        boxShadow: isActive ? '0 0 8px rgba(16, 185, 129, 0.35)' : 'none'
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          transform: isActive ? 'translateX(18px)' : 'translateX(0)',
                          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      />
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '700', color: !isActive ? '#cbd5e1' : '#ffffff', marginBottom: '6px' }}>
                  {source.name}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
                  {source.description || 'No description provided'}
                </p>

                {/* Banner when Disabled */}
                {!isActive && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px dashed rgba(239, 68, 68, 0.25)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    color: '#fca5a5',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AlertTriangle size={13} color="#f87171" style={{ flexShrink: 0 }} />
                    <span>Sumber dinonaktifkan (dikecualikan dari AI Chat RAG & Dynamic Tool Calling)</span>
                  </div>
                )}

                {/* Parameter Chips if AI Tool */}
                {isTool && source.config?.parameters && source.config.parameters.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Code size={12} color={!isActive ? 'var(--text-muted)' : accentColor} /> <span style={{ color: !isActive ? '#cbd5e1' : '#ffffff', fontWeight: '600' }}>{toolSlug}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {source.config.parameters.map((p, pIdx) => (
                        <span key={pIdx} style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          color: !isActive ? 'var(--text-muted)' : (p.required ? accentColor : 'var(--text-secondary)'),
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
                  <span title={isTool ? "On-Demand Tool: Query langsung ke database/API secara real-time, dan setiap data otomatis disimpan ke ChromaDB sebagai Bank Data" : ""}>
                    {isTool ? (isDbTool ? '⚡ On-Demand (Auto Bank Data)' : '⚡ Live API (Auto Bank Data)') : `Last sync: ${source.last_synced_at ? formatDateTimeWIB(source.last_synced_at) : 'Never'}`}
                  </span>
                  <span style={{ color: !isActive ? 'var(--text-muted)' : (isTool ? accentColor : 'var(--text-secondary)') }}>
                    {isTool ? (source.document_count > 0 ? `📦 ${source.document_count} bank data tersimpan` : '⚡ MCP & Chat Ready') : `${source.document_count} chunks`}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  {!isTool && (
                    <button
                      className="btn-secondary"
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '12px',
                        opacity: !isActive ? 0.45 : 1,
                        cursor: !isActive ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => handleSync(source)}
                      disabled={!isActive}
                      title={!isActive ? "Aktifkan sumber terlebih dahulu untuk sinkronisasi" : "Trigger Resync"}
                    >
                      <RefreshCw size={14} /> Sync
                    </button>
                  )}
                  {isTool && (
                    <button
                      className="btn-secondary"
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '12px', 
                        color: !isActive ? 'var(--text-muted)' : accentColor, 
                        borderColor: !isActive ? 'var(--border-color)' : accentBorder 
                      }}
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
      <ImportCatalogModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          fetchSources();
          setNotification({
            type: 'success',
            message: 'Katalog berhasil diimpor dan diperbarui!'
          });
          setTimeout(() => setNotification(null), 5000);
        }}
        existingSources={sources}
      />
    </div>
  );
}
