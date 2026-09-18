import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Share2,
  GitFork,
  Database,
  Search,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ArrowRight,
  Tag,
  Layers,
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';
import api from '../../api/client';
import { formatDateTimeWIB, parseToDate } from '../../utils/dateUtils';

// Helper to color-code entity types
const getEntityTypeBadgeStyle = (type = '') => {
  const t = (type || '').toUpperCase();
  switch (t) {
    case 'PERSON':
      return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' };
    case 'LOCATION':
    case 'ADDRESS':
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
    case 'ORGANIZATION':
    case 'COMPANY':
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
    case 'DATABASE_RECORD':
    case 'DOCUMENT':
      return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' };
    case 'SYSTEM':
    case 'API':
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.4)' };
    case 'CONCEPT':
    default:
      return { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.4)' };
  }
};

export default function JobDetailModal({ isOpen, job, onClose }) {
  const [activeTab, setActiveTab] = useState('entities'); // 'entities' | 'relations' | 'chunks'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);
  const [expandedChunkIds, setExpandedChunkIds] = useState({});

  useEffect(() => {
    if (isOpen && job?.id) {
      fetchDetails(job.id);
    } else {
      setData(null);
      setError(null);
      setSearchQuery('');
      setSelectedTypeFilter('ALL');
      setCopiedId(null);
      setExpandedChunkIds({});
    }
  }, [isOpen, job?.id]);

  const fetchDetails = async (jobId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/jobs/${jobId}/details`);
      setData(res.data);
    } catch (err) {
      console.error('Error fetching job details:', err);
      setError(err.response?.data?.detail || err.message || 'Gagal memuat detail job.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpandChunk = (id) => {
    setExpandedChunkIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Extract available entity types for filtering
  const availableEntityTypes = useMemo(() => {
    if (!data?.entities) return [];
    const set = new Set();
    data.entities.forEach(e => {
      if (e.type) set.add(e.type);
    });
    return Array.from(set).sort();
  }, [data?.entities]);

  // Extract available relation types for filtering
  const availableRelationTypes = useMemo(() => {
    if (!data?.relations) return [];
    const set = new Set();
    data.relations.forEach(r => {
      if (r.relation) set.add(r.relation);
    });
    return Array.from(set).sort();
  }, [data?.relations]);

  // Filtered entities
  const filteredEntities = useMemo(() => {
    if (!data?.entities) return [];
    const q = searchQuery.toLowerCase().trim();
    return data.entities.filter(e => {
      const matchesType = selectedTypeFilter === 'ALL' || e.type === selectedTypeFilter;
      const matchesSearch = !q ||
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.type && e.type.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [data?.entities, searchQuery, selectedTypeFilter]);

  // Filtered relations
  const filteredRelations = useMemo(() => {
    if (!data?.relations) return [];
    const q = searchQuery.toLowerCase().trim();
    return data.relations.filter(r => {
      const matchesType = selectedTypeFilter === 'ALL' || r.relation === selectedTypeFilter;
      const matchesSearch = !q ||
        (r.source && r.source.toLowerCase().includes(q)) ||
        (r.target && r.target.toLowerCase().includes(q)) ||
        (r.relation && r.relation.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [data?.relations, searchQuery, selectedTypeFilter]);

  // Filtered chunks
  const filteredChunks = useMemo(() => {
    if (!data?.chunks) return [];
    const q = searchQuery.toLowerCase().trim();
    return data.chunks.filter(c => {
      if (!q) return true;
      const contentMatches = c.content && c.content.toLowerCase().includes(q);
      const idMatches = c.id && c.id.toLowerCase().includes(q);
      return contentMatches || idMatches;
    });
  }, [data?.chunks, searchQuery]);

  if (!isOpen || !job) return null;

  const currentJob = data?.job || job;
  const stats = data?.stats || {
    entities_count: currentJob.entities_extracted || 0,
    relations_count: currentJob.relations_created || 0,
    chunks_count: currentJob.chunks_created || 0
  };

  const startTime = parseToDate(currentJob.started_at);
  const endTime = parseToDate(currentJob.completed_at);
  const durationText = startTime && endTime ? `${Math.max(0, Math.round((endTime - startTime) / 1000))} detik` : startTime ? 'Sedang berjalan' : '-';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="modal-content glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '24px 28px',
          maxWidth: '1100px',
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.75)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(99, 102, 241, 0.2))',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Share2 size={24} color="var(--accent-cyan)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '19px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.01em', margin: 0 }}>
                  Detail Job Ingestion #{currentJob.id}
                </h2>
                <span className={`badge ${currentJob.status === 'completed' ? 'badge-success' : currentJob.status === 'processing' ? 'badge-info' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
                  {currentJob.status}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)'
                }}>
                  {currentJob.source_type || 'SOURCE'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '600', color: '#e2e8f0' }}>{currentJob.source_name}</span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                  <Clock size={12} /> {formatDateTimeWIB(currentJob.started_at)} ({durationText})
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fetchDetails(currentJob.id)}
              disabled={loading}
              title="Refresh Detail"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Tutup"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick Stats Summary Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}>
          <div style={{
            background: 'rgba(6, 182, 212, 0.07)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Share2 size={20} color="var(--accent-cyan)" />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                Entitas Graf (Neo4j)
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-cyan)' }}>
                {stats.entities_count.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{
            background: 'rgba(99, 102, 241, 0.07)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <GitFork size={20} color="#a5b4fc" />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                Relasi Graph (Neo4j)
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#a5b4fc' }}>
                {stats.relations_count.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{
            background: 'rgba(16, 185, 129, 0.07)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Database size={20} color="#34d399" />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                Chunk Vektor (ChromaDB)
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#34d399' }}>
                {stats.chunks_count.toLocaleString()}
                {stats.total_chunks_in_store ? (
                  <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    (dari {stats.total_chunks_in_store} total)
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selector & Search Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.04)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => { setActiveTab('entities'); setSelectedTypeFilter('ALL'); setSearchQuery(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: activeTab === 'entities' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: activeTab === 'entities' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              <Share2 size={14} />
              <span>Entitas ({stats.entities_count})</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('relations'); setSelectedTypeFilter('ALL'); setSearchQuery(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: activeTab === 'relations' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                color: activeTab === 'relations' ? '#a5b4fc' : 'var(--text-secondary)'
              }}
            >
              <GitFork size={14} />
              <span>Relasi ({stats.relations_count})</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('chunks'); setSelectedTypeFilter('ALL'); setSearchQuery(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: activeTab === 'chunks' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: activeTab === 'chunks' ? '#34d399' : 'var(--text-secondary)'
              }}
            >
              <Database size={14} />
              <span>Chunk Data ({stats.chunks_count})</span>
            </button>
          </div>

          {/* Search & Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1', maxWidth: '480px', minWidth: '260px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder={
                  activeTab === 'entities' ? 'Cari nama entitas atau deskripsi...' :
                  activeTab === 'relations' ? 'Cari entitas asal, relasi, target...' :
                  'Cari dalam isi chunk teks...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Type Filter Dropdown for Entities & Relations */}
            {activeTab === 'entities' && availableEntityTypes.length > 0 && (
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">Semua Tipe ({availableEntityTypes.length})</option>
                {availableEntityTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}

            {activeTab === 'relations' && availableRelationTypes.length > 0 && (
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">Semua Relasi ({availableRelationTypes.length})</option>
                {availableRelationTypes.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Content Body Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: '340px',
          maxHeight: '56vh',
          paddingRight: '6px'
        }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '14px', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="animate-spin" color="var(--accent-cyan)" />
              <div style={{ fontSize: '14px' }}>Mengambil entitas, relasi, dan chunk dari database...</div>
            </div>
          ) : error ? (
            <div style={{
              padding: '24px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <AlertCircle size={22} />
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px' }}>Terjadi Kesalahan</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>{error}</div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            /* TAB 1: ENTITIES */
            <div>
              {filteredEntities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <Share2 size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Tidak ada entitas yang ditemukan</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    {searchQuery ? 'Coba ubah kata kunci pencarian atau filter tipe.' : 'Job ini belum menghasilkan entitas di Neo4j graph.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                  {filteredEntities.map((ent, idx) => {
                    const badgeStyle = getEntityTypeBadgeStyle(ent.type);
                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          borderRadius: '10px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'border-color 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '14px', wordBreak: 'break-word' }}>
                            {ent.name}
                          </div>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: badgeStyle.bg,
                              color: badgeStyle.text,
                              border: `1px solid ${badgeStyle.border}`,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {ent.type || 'UNKNOWN'}
                          </span>
                        </div>

                        {ent.description && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', wordBreak: 'break-word' }}>
                            {ent.description}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                            {ent.degree || 0} relasi terhubung
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(`ent-${idx}`, ent.name)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedId === `ent-${idx}` ? '#34d399' : 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                            title="Salin Nama Entitas"
                          >
                            {copiedId === `ent-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedId === `ent-${idx}` ? 'Tersalin' : 'Salin'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'relations' ? (
            /* TAB 2: RELATIONS */
            <div>
              {filteredRelations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <GitFork size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Tidak ada relasi yang ditemukan</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    {searchQuery ? 'Coba ubah kata kunci pencarian.' : 'Job ini belum menghasilkan relasi graph di Neo4j.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredRelations.map((rel, idx) => {
                    const srcStyle = getEntityTypeBadgeStyle(rel.source_type);
                    const tgtStyle = getEntityTypeBadgeStyle(rel.target_type);

                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          borderRadius: '10px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}
                      >
                        {/* Source Entity */}
                        <div style={{ flex: '1', minWidth: '180px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: srcStyle.bg,
                              color: srcStyle.text,
                              border: `1px solid ${srcStyle.border}`
                            }}
                          >
                            {rel.source_type || 'ENT'}
                          </span>
                          <span style={{ fontWeight: '700', color: '#ffffff', fontSize: '13px' }}>
                            {rel.source}
                          </span>
                        </div>

                        {/* Edge / Relation Arrow */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          background: 'rgba(99, 102, 241, 0.12)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: '#a5b4fc',
                          fontSize: '11px',
                          fontWeight: '700'
                        }}>
                          <span>{rel.relation}</span>
                          {rel.weight ? (
                            <span style={{ fontSize: '10px', opacity: 0.7 }}>({rel.weight})</span>
                          ) : null}
                          <ArrowRight size={13} />
                        </div>

                        {/* Target Entity */}
                        <div style={{ flex: '1', minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <span style={{ fontWeight: '700', color: '#ffffff', fontSize: '13px', textAlign: 'right' }}>
                            {rel.target}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: tgtStyle.bg,
                              color: tgtStyle.text,
                              border: `1px solid ${tgtStyle.border}`
                            }}
                          >
                            {rel.target_type || 'ENT'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* TAB 3: CHUNKS */
            <div>
              {filteredChunks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <Database size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>Tidak ada chunk data yang ditemukan</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    {searchQuery ? 'Coba ubah kata kunci pencarian.' : 'Belum ada chunk vektor tersimpan untuk source ini.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredChunks.map((chunk, idx) => {
                    const isExpanded = !!expandedChunkIds[chunk.id];
                    const isBankData = chunk.metadata?.is_bank_data;

                    return (
                      <div
                        key={chunk.id || idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: isBankData ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '10px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        {/* Chunk Top Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: '11px',
                              color: 'var(--accent-cyan)',
                              fontWeight: '700',
                              background: 'rgba(6, 182, 212, 0.1)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid rgba(6, 182, 212, 0.2)'
                            }}>
                              {chunk.id}
                            </span>

                            {isBankData && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#34d399',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                <Sparkles size={10} /> Data Bank
                              </span>
                            )}

                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {chunk.char_count ? `${chunk.char_count.toLocaleString()} karakter` : ''}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleCopy(chunk.id, chunk.content)}
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: copiedId === chunk.id ? '#34d399' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Salin isi chunk"
                            >
                              {copiedId === chunk.id ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedId === chunk.id ? 'Tersalin' : 'Salin'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleExpandChunk(chunk.id)}
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              <span>{isExpanded ? 'Sembunyikan' : 'Selengkapnya'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Chunk Content Preview */}
                        <div
                          style={{
                            background: 'rgba(0, 0, 0, 0.35)',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '11px',
                            lineHeight: '1.6',
                            color: '#cbd5e1',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: isExpanded ? 'none' : '120px',
                            overflowY: isExpanded ? 'visible' : 'hidden',
                            position: 'relative'
                          }}
                        >
                          {chunk.content}
                          {!isExpanded && (
                            <div style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: '40px',
                              background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.95))',
                              pointerEvents: 'none'
                            }} />
                          )}
                        </div>

                        {/* Chunk Metadata Details if Expanded */}
                        {isExpanded && chunk.metadata && (
                          <div style={{
                            padding: '10px',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            fontSize: '11px',
                            color: 'var(--text-secondary)'
                          }}>
                            <div style={{ fontWeight: '700', color: '#e2e8f0', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Tag size={12} /> Metadata:
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px' }}>
                              {Object.entries(chunk.metadata).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', gap: '6px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                                  <span style={{ color: '#ffffff', wordBreak: 'break-word' }}>{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Menampilkan data tersimpan di Knowledge Graph (Neo4j) & Vector Store (ChromaDB)
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '13px' }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
