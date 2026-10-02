import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Database, 
  Search, 
  RefreshCw, 
  Copy, 
  Check, 
  Trash2, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  FileText,
  Zap,
  Tag,
  Share2,
  ExternalLink
} from 'lucide-react';
import api from '../../api/client';
import { formatDateTimeWIB } from '../../utils/dateUtils';
import { ValidityBadge } from '../common/ValidityTierSelector';

export default function BankDataViewerModal({ isOpen, onClose, source }) {
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedIds, setExpandedIds] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [notification, setNotification] = useState(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1); // Reset to page 1 on new search
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchBankData = useCallback(async (targetPage = page, search = debouncedSearch) => {
    if (!source || !source.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/knowledge/sources/${source.id}/bank-data`, {
        params: {
          page: targetPage,
          page_size: pageSize,
          search: search || undefined
        }
      });
      if (res.data && res.data.success) {
        setItems(res.data.items || []);
        setTotalItems(res.data.total_items || 0);
        setTotalPages(res.data.total_pages || 1);
        setPage(res.data.page || 1);
      }
    } catch (err) {
      console.error('Error fetching bank data:', err);
      setError(err.response?.data?.detail || err.message || 'Gagal memuat data bank');
    } finally {
      setLoading(false);
    }
  }, [source, pageSize, page, debouncedSearch]);

  // Fetch when modal opens, source changes, page changes, or search changes
  useEffect(() => {
    if (isOpen && source?.id) {
      fetchBankData(page, debouncedSearch);
    } else {
      setItems([]);
      setTotalItems(0);
      setPage(1);
      setSearchTerm('');
      setDebouncedSearch('');
      setError(null);
      setExpandedIds({});
    }
  }, [isOpen, source?.id, page, pageSize, debouncedSearch]);

  if (!isOpen || !source) return null;

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteChunk = async (chunkId) => {
    if (!window.confirm(`Yakin ingin menghapus rekaman data bank ini?\nID: ${chunkId}`)) {
      return;
    }

    try {
      setDeletingId(chunkId);
      await api.delete(`/knowledge/sources/${source.id}/bank-data/${encodeURIComponent(chunkId)}`);
      setNotification({
        type: 'success',
        message: `Rekaman ${chunkId} berhasil dihapus dari data bank.`
      });
      setTimeout(() => setNotification(null), 4000);
      // Refresh list
      fetchBankData(page, debouncedSearch);
    } catch (err) {
      console.error('Error deleting chunk:', err);
      setNotification({
        type: 'error',
        message: 'Gagal menghapus rekaman: ' + (err.response?.data?.detail || err.message)
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setDeletingId(null);
    }
  };

  const isTool = (source.source_type === 'api' || source.source_type === 'database') && 
                 (source.config?.is_tool || source.sync_status?.includes('tool'));

  // Highlight search matches
  const renderHighlightedContent = (text, highlight) => {
    if (!highlight || !text) return text;
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} style={{ 
          background: 'rgba(245, 158, 11, 0.35)', 
          color: '#fbbf24', 
          padding: '0 2px', 
          borderRadius: '3px',
          fontWeight: '700' 
        }}>
          {part}
        </mark>
      ) : part
    );
  };

  const getSubjectQuery = () => {
    if (debouncedSearch && debouncedSearch.trim()) return debouncedSearch.trim();
    for (const it of items) {
      if (!it.document) continue;
      const mName = it.document.match(/(?:NAMA_LGKP|NAMA)\s*[:=]\s*([^\n\r,|]+)/i);
      if (mName && mName[1]?.trim() && mName[1].trim().length >= 3 && !mName[1].includes('{')) {
        return mName[1].trim();
      }
      const mParam = it.document.match(/nama=([^\n\r,&|]+)/i);
      if (mParam && mParam[1]?.trim() && mParam[1].trim().length >= 3) {
        return mParam[1].trim();
      }
    }
    return '';
  };

  const subjectQuery = getSubjectQuery();
  const networkGraphUrl = subjectQuery
    ? `/network?q=${encodeURIComponent(subjectQuery)}`
    : '/network';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1050 }}>
      <div 
        className="modal-content glass-panel" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          padding: '28px', 
          maxWidth: '1000px', 
          width: '95vw',
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column',
          gap: '18px',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.65)'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Database size={24} color="var(--accent-cyan)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.01em' }}>
                  Data Bank Terindeks
                </h2>
                <ValidityBadge
                  tier={source.validity_tier || source.config?.validity_tier}
                  score={source.validity_score !== undefined ? source.validity_score : source.config?.validity_score}
                  size="small"
                />
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: isTool ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                  color: isTool ? '#a5b4fc' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)'
                }}>
                  {source.source_type}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: '600', color: '#e2e8f0' }}>{source.name}</span>
                <span>•</span>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>
                  {totalItems.toLocaleString()} rekaman data tersimpan
                </span>
                {isTool && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Zap size={12} /> Auto-Saved on Tool Execution
                    </span>
                    <span>•</span>
                    <span style={{ color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Entitas & relasi otomatis tersimpan ke Neo4j Knowledge Graph">
                      <Share2 size={12} /> Network Graph Synced
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={networkGraphUrl}
              target="_blank"
              rel="noreferrer"
              title={subjectQuery ? `Buka Knowledge Graph untuk "${subjectQuery}" di tab baru` : "Buka Knowledge Graph Network Profiling di tab baru"}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 13px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#ffffff',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.35))',
                border: '1px solid rgba(168, 85, 247, 0.5)',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.65), rgba(168, 85, 247, 0.65))';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(168, 85, 247, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(168, 85, 247, 0.35))';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.25)';
              }}
            >
              <Share2 size={13} color="#c084fc" />
              <span>Network Graph</span>
              <ExternalLink size={11} color="#e9d5ff" />
            </a>

            <button
              type="button"
              onClick={onClose}
              title="Tutup Modal"
              style={{ 
                background: 'rgba(255, 255, 255, 0.05)', 
                border: '1px solid var(--border-color)', 
                color: 'var(--text-muted)', 
                cursor: 'pointer', 
                padding: '6px', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${notification.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            color: notification.type === 'success' ? '#34d399' : '#fca5a5'
          }}>
            <AlertCircle size={16} />
            <span>{notification.message}</span>
          </div>
        )}

        {/* Search & Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Cari dalam rekaman (Nama, NIK, No KK, Alamat, parameter, kata kunci)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                paddingLeft: '38px',
                paddingRight: searchTerm ? '34px' : '14px',
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }}
            />
            <Search 
              size={16} 
              color="var(--text-muted)" 
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} 
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px'
                }}
                title="Hapus pencarian"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Baris:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  color: '#ffffff',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fetchBankData(page, debouncedSearch)}
              disabled={loading}
              title="Muat ulang data"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Content Area / List */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          maxHeight: '52vh', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px',
          paddingRight: '4px'
        }}>
          {loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <RefreshCw size={32} className="spin" style={{ margin: '0 auto 12px auto', color: 'var(--accent-cyan)' }} />
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0' }}>Memuat data bank...</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Mengambil rekaman chunk dari ChromaDB vector store
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '13px'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '4px' }}>Terjadi Kesalahan:</div>
              <div>{error}</div>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px', 
              borderRadius: '12px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px dashed var(--border-color)'
            }}>
              <Database size={40} color="var(--text-muted)" style={{ margin: '0 auto 14px auto', opacity: 0.6 }} />
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>
                {debouncedSearch ? `Tidak ada data yang cocok dengan "${debouncedSearch}"` : 'Belum Ada Data Bank Tersimpan'}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto', lineHeight: '1.5' }}>
                {debouncedSearch 
                  ? 'Coba gunakan kata kunci pencarian yang lebih umum seperti nama lengkap, NIK, atau nomor dokumen.'
                  : isTool 
                    ? 'Sumber ini beroperasi sebagai On-Demand AI Tool. Setiap kali AI atau pengguna melakukan pencarian/eksekusi parameter (misal cari nama atau NIK), hasil data akan otomatis disimpan ke dalam Data Bank ini.'
                    : 'Dokumen belum disinkronisasi ke dalam database vektor. Silakan klik tombol Sync pada card sumber pengetahuan untuk mengekstrak dan mengindeks chunk dokumen.'}
              </p>
            </div>
          )}

          {!error && items.map((item, index) => {
            const isExpanded = !!expandedIds[item.id];
            const isBank = item.is_bank_data;
            const queryParams = item.query_params;
            const dateStr = item.queried_at ? formatDateTimeWIB(item.queried_at) : null;
            const isDeleting = deletingId === item.id;

            return (
              <div 
                key={item.id} 
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: isBank ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* Item Header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: '10px', 
                  flexWrap: 'wrap', 
                  gap: '8px' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                      padding: '2px 7px',
                      borderRadius: '4px'
                    }}>
                      #{(page - 1) * pageSize + index + 1}
                    </span>

                    {/* Chunk ID Badge */}
                    <span 
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                        color: isBank ? 'var(--accent-cyan)' : '#a5b4fc',
                        background: isBank ? 'rgba(6, 182, 212, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                        border: `1px solid ${isBank ? 'rgba(6, 182, 212, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                        padding: '2px 8px',
                        borderRadius: '5px',
                        fontWeight: '600'
                      }}
                      title={`ChromaDB Chunk ID: ${item.id}`}
                    >
                      {item.id}
                    </span>

                    {/* Bank Data Indicator */}
                    {isBank && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#34d399',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Zap size={11} /> Bank Data
                      </span>
                    )}

                    {/* Query parameters tag if available */}
                    {queryParams && Object.keys(queryParams).length > 0 && (
                      <span style={{
                        fontSize: '11px',
                        color: '#fbbf24',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontFamily: 'JetBrains Mono, monospace'
                      }}>
                        <Tag size={11} />
                        {Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join(', ')}
                      </span>
                    )}

                    {/* Date timestamp */}
                    {dateStr && (
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Calendar size={11} /> {dateStr}
                      </span>
                    )}
                  </div>

                  {/* Item Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Copy Content Button */}
                    <button
                      type="button"
                      onClick={() => handleCopy(item.id, item.document)}
                      style={{
                        background: copiedId === item.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${copiedId === item.id ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
                        color: copiedId === item.id ? '#34d399' : 'var(--text-secondary)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                      title="Salin isi data rekaman ini"
                    >
                      {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === item.id ? 'Tersalin' : 'Salin'}</span>
                    </button>

                    {/* Delete Chunk Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteChunk(item.id)}
                      disabled={isDeleting}
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#fca5a5',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: isDeleting ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: isDeleting ? 0.5 : 1,
                        transition: 'all 0.15s ease'
                      }}
                      title="Hapus rekaman ini dari data bank"
                    >
                      <Trash2 size={12} />
                      <span>{isDeleting ? 'Menghapus...' : 'Hapus'}</span>
                    </button>

                    {/* Item Network Graph Button */}
                    {(() => {
                      let itemSubj = '';
                      if (queryParams && typeof queryParams === 'object') {
                        itemSubj = queryParams.nama || queryParams.nama_lgkp || queryParams.name || '';
                      }
                      if (!itemSubj && item.document) {
                        const mName = item.document.match(/(?:NAMA_LGKP|NAMA)\s*[:=]\s*([^\n\r,|]+)/i);
                        if (mName && mName[1]?.trim() && !mName[1].includes('{')) {
                          itemSubj = mName[1].trim();
                        } else {
                          const mParam = item.document.match(/nama=([^\n\r,&|]+)/i);
                          if (mParam && mParam[1]?.trim()) {
                            itemSubj = mParam[1].trim();
                          }
                        }
                      }
                      if (!itemSubj) return null;
                      return (
                        <a
                          href={`/network?q=${encodeURIComponent(itemSubj)}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            color: '#c7d2fe',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: '600',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.35)'; e.currentTarget.style.color = '#ffffff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'; e.currentTarget.style.color = '#c7d2fe'; }}
                          title={`Telusuri relasi entitas "${itemSubj}" di Network Graph`}
                        >
                          <Share2 size={11} color="#a5b4fc" />
                          <span>Graph</span>
                        </a>
                      );
                    })()}

                    {/* Expand/Collapse Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      style={{
                        background: isExpanded ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                        border: `1px solid ${isExpanded ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                        color: isExpanded ? 'var(--accent-cyan)' : '#ffffff',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s ease'
                      }}
                      title={isExpanded ? 'Perkecil tampilan' : 'Tampilkan seluruh teks'}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? 'Sembunyikan' : 'Selengkapnya'}
                    </button>
                  </div>
                </div>

                {/* Content Box */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  color: '#e2e8f0',
                  maxHeight: isExpanded ? 'none' : '150px',
                  overflowY: isExpanded ? 'visible' : 'hidden',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  position: 'relative'
                }}>
                  {renderHighlightedContent(item.document, debouncedSearch)}

                  {!isExpanded && item.document && item.document.length > 250 && (
                    <div 
                      onClick={() => toggleExpand(item.id)}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '60px',
                        background: 'linear-gradient(to bottom, transparent, rgba(15, 23, 42, 1) 90%)',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        paddingBottom: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{
                        color: '#000000',
                        background: 'var(--accent-cyan)',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        boxShadow: '0 2px 8px rgba(6, 182, 212, 0.4)'
                      }}>
                        Klik untuk melihat selengkapnya ({item.char_count?.toLocaleString()} karakter)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer / Pagination */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderTop: '1px solid var(--border-color)', 
          paddingTop: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {totalItems > 0 ? (
              <>
                Menampilkan <span style={{ color: '#ffffff', fontWeight: '600' }}>{(page - 1) * pageSize + 1}</span> - <span style={{ color: '#ffffff', fontWeight: '600' }}>{Math.min(page * pageSize, totalItems)}</span> dari <span style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>{totalItems.toLocaleString()}</span> rekaman
              </>
            ) : (
              '0 rekaman ditemukan'
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                opacity: page <= 1 ? 0.4 : 1,
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={14} /> Sebelumnya
            </button>

            <span style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)', 
              padding: '0 8px',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              {page} / {totalPages}
            </span>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                opacity: page >= totalPages ? 0.4 : 1,
                cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Berikutnya <ChevronRight size={14} />
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              style={{
                padding: '6px 16px',
                fontSize: '12px',
                marginLeft: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff'
              }}
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
