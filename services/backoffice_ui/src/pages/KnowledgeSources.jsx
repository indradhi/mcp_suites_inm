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
  Upload,
  BookOpen,
  Cpu,
  Terminal
} from 'lucide-react';
import api from '../api/client';
import { formatDateTimeWIB } from '../utils/dateUtils';
import AddDatabaseModal from '../components/modals/AddDatabaseModal';
import AddApiModal from '../components/modals/AddApiModal';
import AddMcpModal from '../components/modals/AddMcpModal';
import AddFileModal from '../components/modals/AddFileModal';
import AddWebsiteModal from '../components/modals/AddWebsiteModal';
import AddWebSearchModal from '../components/modals/AddWebSearchModal';
import AddGoogleDriveModal from '../components/modals/AddGoogleDriveModal';
import ImportCatalogModal from '../components/modals/ImportCatalogModal';
import BankDataViewerModal from '../components/modals/BankDataViewerModal';
import { ValidityBadge, VALIDITY_TIERS } from '../components/common/ValidityTierSelector';

export default function KnowledgeSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'disabled'
  const [validityFilter, setValidityFilter] = useState('all'); // 'all', 'authoritative', 'verified', 'secondary', 'unverified'
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'database', 'api', 'file', 'website', 'websearch', 'google_drive'
  const [editingSource, setEditingSource] = useState(null);
  const [bankDataModalSource, setBankDataModalSource] = useState(null);

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

  const handleRefreshMCPTools = async () => {
    try {
      setLoading(true);
      setNotification({
        type: 'info',
        message: 'Sedang merefresh alat dari semua Server MCP yang terhubung...'
      });
      const res = await api.post('/knowledge/mcp-tools/refresh-all');
      await fetchSources();
      setNotification({
        type: 'success',
        message: res.data.message || 'Berhasil merefresh alat MCP!'
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error('Refresh MCP Tools error:', err);
      alert('Gagal merefresh alat MCP: ' + (err.response?.data?.detail || err.message));
      setNotification(null);
    } finally {
      setLoading(false);
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
      case 'mcp':
      case 'mcp_server': return <Cpu size={18} color="#c084fc" />;
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

    if (validityFilter !== 'all') {
      const tier = s.validity_tier || s.config?.validity_tier || (
        (s.source_type === 'database' || s.source_type === 'api') && (s.config?.is_tool || s.config?.parameters) ? 'authoritative' : 'secondary'
      );
      if (tier !== validityFilter) return false;
    }

    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
            Knowledge Base Catalog
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Kelola dan sinkronisasi sumber pengetahuan lintas database, API, Server MCP, dokumen, website, dan web search
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
                color: 'var(--accent-emerald)',
                background: 'rgba(16, 185, 129, 0.08)'
              }}
            >
              <Upload size={15} />
              <span>Import</span>
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', paddingRight: '8px', borderRight: '1px solid var(--border-color)' }}>
            <button
              type="button"
              id="btn-refresh-mcp-tools"
              className="btn-secondary"
              onClick={handleRefreshMCPTools}
              title="Refresh dan perbarui definisi alat dari semua server MCP yang terhubung"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-main)',
                background: 'var(--bg-glass-2)'
              }}
            >
              <Cpu size={15} />
              <span>Refresh MCP Tools</span>
            </button>
          </div>

          <button className="btn-primary" onClick={() => { setEditingSource(null); setActiveModal('database'); }}>
            <Database size={15} /> Database
          </button>
          <button className="btn-secondary" onClick={() => { setEditingSource(null); setActiveModal('api'); }}>
            <Globe size={15} /> API
          </button>
          <button 
            type="button"
            id="btn-import-curl"
            className="btn-secondary" 
            onClick={() => { setEditingSource({ openCurlImport: true }); setActiveModal('api'); }}
            title="Import endpoint API dan parameter langsung dari perintah cURL"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: 'rgba(6, 182, 212, 0.4)',
              color: 'var(--accent-cyan)',
              background: 'rgba(6, 182, 212, 0.08)'
            }}
          >
            <Terminal size={15} /> Import cURL
          </button>
          <button 
            type="button"
            id="btn-add-mcp-source"
            className="btn-secondary" 
            onClick={() => { setEditingSource(null); setActiveModal('mcp'); }}
          >
            <Cpu size={15} /> Server MCP
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
          background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
          borderRadius: '10px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          color: notification.type === 'error' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
          fontSize: '13px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {notification.type === 'error' ? <AlertTriangle size={17} color="var(--accent-rose)" /> : <CheckCircle size={17} color="var(--accent-emerald)" />}
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
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: 'var(--accent-emerald)',
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
            background: 'var(--bg-glass-2)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
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
                background: statusFilter === 'all' ? 'var(--bg-glass-1)' : 'transparent',
                color: statusFilter === 'all' ? 'var(--text-main)' : 'var(--text-secondary)',
                boxShadow: statusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
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
                color: statusFilter === 'active' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
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
                color: statusFilter === 'disabled' ? '#dc2626' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              Nonaktif ({disabledCount})
            </button>
          </div>

          {/* Validity Filter Tabs */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-glass-2)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            gap: '2px',
            flexWrap: 'wrap'
          }}>
            <button
              type="button"
              onClick={() => setValidityFilter('all')}
              style={{
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: validityFilter === 'all' ? 'var(--bg-glass-1)' : 'transparent',
                color: validityFilter === 'all' ? 'var(--text-main)' : 'var(--text-secondary)',
                boxShadow: validityFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              Semua Validitas
            </button>
            <button
              type="button"
              onClick={() => setValidityFilter('authoritative')}
              style={{
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: validityFilter === 'authoritative' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                color: validityFilter === 'authoritative' ? 'var(--accent-emerald)' : 'var(--text-secondary)'
              }}
            >
              🟢 Tingkat 1 (Otoritatif)
            </button>
            <button
              type="button"
              onClick={() => setValidityFilter('verified')}
              style={{
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: validityFilter === 'verified' ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                color: validityFilter === 'verified' ? 'var(--accent-primary)' : 'var(--text-secondary)'
              }}
            >
              🔵 Tingkat 2 (Terverifikasi)
            </button>
            <button
              type="button"
              onClick={() => setValidityFilter('secondary')}
              style={{
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: validityFilter === 'secondary' ? 'rgba(245, 158, 11, 0.18)' : 'transparent',
                color: validityFilter === 'secondary' ? '#d97706' : 'var(--text-secondary)'
              }}
            >
              🟡 Tingkat 3 (Sekunder)
            </button>
            <button
              type="button"
              onClick={() => setValidityFilter('unverified')}
              style={{
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: validityFilter === 'unverified' ? 'var(--bg-glass-1)' : 'transparent',
                color: validityFilter === 'unverified' ? 'var(--text-main)' : 'var(--text-secondary)'
              }}
            >
              ⚪ Tingkat 4 (Pendukung)
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
          const isMcp = source.source_type === 'mcp' || source.source_type === 'mcp_server';
          const isTool = (source.source_type === 'api' || source.source_type === 'database' || isMcp) && (source.config?.is_tool || source.sync_status?.includes('tool') || isMcp);
          const isDbTool = source.source_type === 'database' && isTool;
          const isApiTool = source.source_type === 'api' && isTool;
          const isMcpTool = isMcp;
          const paramCount = isMcp ? (source.config?.tools?.length || 0) : (source.config?.parameters?.length || 0);
          const defaultPrefix = source.source_type === 'database' ? 'db_' : (isMcp ? 'mcp_' : 'api_');
          const toolSlug = isMcp 
            ? `${source.config?.tools?.length || 0} tools terdaftar` 
            : (source.config?.tool_name || `${defaultPrefix}${source.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`);
          const accentColor = isMcp ? 'var(--accent-primary)' : (isDbTool ? 'var(--accent-primary)' : 'var(--accent-cyan)');
          const accentBg = isMcp ? 'rgba(99, 102, 241, 0.12)' : (isDbTool ? 'rgba(99, 102, 241, 0.12)' : 'rgba(6, 182, 212, 0.12)');
          const accentBorder = isMcp ? 'rgba(99, 102, 241, 0.35)' : (isDbTool ? 'rgba(99, 102, 241, 0.35)' : 'rgba(6, 182, 212, 0.35)');
          const toolBadgeLabel = isMcp ? 'SERVER MCP / TOOLS' : (isDbTool ? 'AI DATABASE TOOL' : 'AI API TOOL');
          const isActive = source.is_active !== false;

          return (
            <div 
              key={source.id} 
              className="glass-panel" 
              onClick={() => setBankDataModalSource(source)}
              title="Klik card untuk melihat rekaman Data Bank yang tersimpan"
              style={{ 
                padding: '22px', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: !isActive 
                  ? '1px dashed var(--border-subtle)' 
                  : (isTool ? `1px solid ${accentBorder}` : '1px solid var(--border-color)'),
                background: !isActive
                  ? 'var(--bg-glass-3)'
                  : (isTool ? (isMcp ? 'rgba(168, 85, 247, 0.04)' : (isDbTool ? 'rgba(99, 102, 241, 0.03)' : 'rgba(6, 182, 212, 0.03)')) : undefined),
                opacity: !isActive ? 0.72 : 1,
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = isTool ? accentColor : 'var(--accent-cyan)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = !isActive 
                  ? 'var(--border-subtle)' 
                  : (isTool ? accentBorder : 'var(--border-color)');
              }}
            >
              <div>
                {/* Header of Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: !isActive ? 'var(--bg-glass-light)' : (isTool ? accentBg : 'var(--bg-glass-light)'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: !isActive ? '1px solid var(--border-subtle)' : (isTool ? `1px solid ${accentBorder}` : '1px solid var(--border-color)')
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
                          background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-glass-light)',
                          color: isActive ? '#059669' : 'var(--text-muted)',
                          border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}`
                        }}>
                          <span style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: isActive ? '#059669' : '#64748b',
                            boxShadow: isActive ? '0 0 6px rgba(16, 185, 129, 0.5)' : 'none'
                          }} />
                          {isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Badges & 1-Click Toggle Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <ValidityBadge
                      tier={source.validity_tier || source.config?.validity_tier}
                      score={source.validity_score !== undefined ? source.validity_score : source.config?.validity_score}
                      size="small"
                    />
                    {isTool ? (
                      <span style={{
                        background: !isActive ? 'var(--bg-glass-light)' : accentBg,
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
                        <Zap size={11} /> {isMcp ? `${paramCount} tools` : `${paramCount} params`}
                      </span>
                    ) : (
                      <span className={`badge ${source.sync_status === 'completed' ? 'badge-success' : source.sync_status === 'running' ? 'badge-info' : 'badge-warning'}`} style={{ opacity: !isActive ? 0.6 : 1 }}>
                        {source.sync_status}
                      </span>
                    )}

                    {/* Cache Badge */}
                    {isTool && source.cache_ttl_minutes && source.cache_ttl_minutes > 0 && (
                      <span
                        title={`Tool call results are cached for ${source.cache_ttl_minutes} minutes`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: !isActive ? 'var(--bg-glass-light)' : 'rgba(234, 179, 8, 0.12)',
                          color: !isActive ? 'var(--text-muted)' : 'var(--accent-amber)',
                          padding: '3px 9px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: '700',
                          border: `1px solid ${!isActive ? 'var(--border-color)' : 'rgba(234, 179, 8, 0.35)'}`,
                          letterSpacing: '0.02em'
                        }}
                      >
                        <Clock size={10} />
                        {source.cache_ttl_minutes >= 60
                          ? `Cache ${(source.cache_ttl_minutes / 60).toFixed(source.cache_ttl_minutes % 60 === 0 ? 0 : 1)}j`
                          : `Cache ${source.cache_ttl_minutes}m`}
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
                          backgroundColor: 'var(--text-main)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          transform: isActive ? 'translateX(18px)' : 'translateX(0)',
                          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      />
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '700', color: !isActive ? 'var(--text-sub)' : 'var(--text-main)', marginBottom: '6px' }}>
                  {source.name}
                </h3>
                {isMcp && source.config?.endpoint && (
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--accent-primary)',
                    fontFamily: 'JetBrains Mono, monospace',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    wordBreak: 'break-all'
                  }}>
                    <Globe size={12} color="var(--accent-primary)" />
                    <span>{source.config.endpoint}</span>
                    {source.config?.transport && (
                      <span style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '4px',
                        padding: '0 4px',
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        fontWeight: '700'
                      }}>
                        {source.config.transport}
                      </span>
                    )}
                  </div>
                )}
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
                    color: 'var(--accent-rose)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AlertTriangle size={13} color="var(--accent-rose)" style={{ flexShrink: 0 }} />
                    <span>Sumber dinonaktifkan (dikecualikan dari AI Chat RAG & Dynamic Tool Calling)</span>
                  </div>
                )}

                {/* MCP Tools Chips */}
                {isMcp && source.config?.tools && source.config.tools.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Cpu size={12} color="var(--accent-primary)" /> <span style={{ color: !isActive ? 'var(--text-muted)' : 'var(--text-main)', fontWeight: '600' }}>Alat MCP Terdaftar:</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {source.config.tools.slice(0, 6).map((t, tIdx) => (
                        <span key={tIdx} style={{
                          background: t.enabled !== false ? 'var(--bg-glass-2)' : 'var(--bg-glass-1)',
                          border: `1px solid ${t.enabled !== false ? 'var(--border-subtle)' : 'var(--border-subtle)'}`,
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          color: t.enabled !== false ? 'var(--text-main)' : 'var(--text-muted)',
                          fontFamily: 'monospace'
                        }}>
                          {t.name}
                        </span>
                      ))}
                      {source.config.tools.length > 6 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                          +{source.config.tools.length - 6} lainnya
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Parameter Chips if AI Tool */}
                {!isMcp && isTool && source.config?.parameters && source.config.parameters.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Code size={12} color={!isActive ? 'var(--text-muted)' : accentColor} /> <span style={{ color: !isActive ? 'var(--text-sub)' : 'var(--text-main)', fontWeight: '600' }}>{toolSlug}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {source.config.parameters.map((p, pIdx) => (
                        <span key={pIdx} style={{
                          background: 'var(--bg-glass-2)',
                          border: '1px solid var(--border-subtle)',
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

                {/* Field Definitions (Kamus Data) Indicator */}
                {source.config?.field_definitions && source.config.field_definitions.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <BookOpen size={12} color="var(--accent-primary)" />
                      <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Kamus Data:</span>
                      <span style={{
                        background: 'var(--bg-glass-2)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '10px',
                        color: 'var(--accent-primary)',
                        fontWeight: '700'
                      }}>
                        {source.config.field_definitions.length} field terdefinisi
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'var(--bg-glass-2)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span title={isTool ? (isMcp ? "Server MCP: Terhubung langsung ke Remote MCP Server melalui protokol SSE / JSON-RPC" : "On-Demand Tool: Query langsung ke database/API secara real-time, dan setiap data otomatis disimpan ke ChromaDB sebagai Bank Data") : ""}>
                    {isTool ? (isMcp ? `⚡ Server MCP Connected (${paramCount} Tools)` : (isDbTool ? '⚡ On-Demand (Auto Bank Data)' : '⚡ Live API (Auto Bank Data)')) : `Last sync: ${source.last_synced_at ? formatDateTimeWIB(source.last_synced_at) : 'Never'}`}
                  </span>
                  <span 
                    style={{ 
                      color: !isActive ? 'var(--text-muted)' : (isTool ? 'var(--accent-primary)' : 'var(--text-main)'),
                      background: 'var(--bg-glass-2)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBankDataModalSource(source);
                    }}
                    title="Klik untuk membuka Data Bank"
                  >
                    {isTool ? (source.document_count > 0 ? `📦 ${source.document_count} bank data tersimpan` : '⚡ MCP & Chat Ready') : `${source.document_count} chunks`}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    id={`btn-bank-data-${source.id}`}
                    style={{
                      padding: '6px 11px',
                      fontSize: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBankDataModalSource(source);
                    }}
                    title="Buka dan jelajahi data bank / rekaman vektor tersimpan"
                  >
                    <Database size={13} />
                    <span>Data Bank</span>
                  </button>
                  {!isTool && (
                    <button
                      className="btn-secondary"
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '12px',
                        opacity: !isActive ? 0.45 : 1,
                        cursor: !isActive ? 'not-allowed' : 'pointer'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSync(source);
                      }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(source);
                      }}
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
                      color: 'var(--accent-primary)',
                      borderColor: 'rgba(99, 102, 241, 0.35)',
                      background: 'rgba(99, 102, 241, 0.08)'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(source);
                    }}
                    disabled={duplicatingId === source.id}
                    title="Duplikat koneksi ini (buat salinan konfigurasi)"
                  >
                    <Copy size={13} />
                    <span>{duplicatingId === source.id ? 'Menyalin...' : 'Duplikat'}</span>
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(source);
                    }}
                    title="Edit Source"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn-danger"
                    style={{ padding: '6px 10px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(source.id);
                    }}
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
      <AddMcpModal
        isOpen={activeModal === 'mcp' || activeModal === 'mcp_server'}
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
      <BankDataViewerModal
        isOpen={!!bankDataModalSource}
        source={bankDataModalSource}
        onClose={() => {
          setBankDataModalSource(null);
          fetchSources();
        }}
      />
    </div>
  );
}
