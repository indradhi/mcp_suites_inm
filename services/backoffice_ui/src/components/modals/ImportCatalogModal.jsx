import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Globe, 
  Search, 
  FolderGit2, 
  Zap, 
  RefreshCw,
  Check,
  Layers,
  ArrowRight
} from 'lucide-react';
import api from '../../api/client';
import { ValidityBadge } from '../common/ValidityTierSelector';

export default function ImportCatalogModal({ isOpen, onClose, onSuccess, existingSources = [] }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [collisionStrategy, setCollisionStrategy] = useState('rename'); // 'rename' | 'overwrite' | 'skip'
  const [autoSync, setAutoSync] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resultSummary, setResultSummary] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const existingNamesSet = new Set(
    (existingSources || []).map(s => (s.name || '').trim().toLowerCase())
  );

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const processFile = (fileObj) => {
    setFile(fileObj);
    setParseError(null);
    setResultSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const json = JSON.parse(text);

        let sourcesList = [];
        if (json && typeof json === 'object' && Array.isArray(json.sources)) {
          sourcesList = json.sources;
        } else if (Array.isArray(json)) {
          sourcesList = json;
        } else {
          throw new Error("Format JSON tidak sesuai. File harus memiliki array 'sources' atau daftar objek sumber pengetahuan.");
        }

        if (sourcesList.length === 0) {
          throw new Error("File JSON tidak memiliki entri sumber pengetahuan untuk diimpor.");
        }

        // Validate basic structure
        const validatedSources = sourcesList.map((item, idx) => {
          const conf = item.config || {};
          const isTool = (item.source_type === 'database' || item.source_type === 'api') && (conf.is_tool || conf.parameters);
          const defaultTier = isTool ? 'authoritative' : 'secondary';
          const defaultScore = defaultTier === 'authoritative' ? 95 : 65;
          const tier = item.validity_tier || conf.validity_tier || defaultTier;
          const score = item.validity_score !== undefined ? item.validity_score : (conf.validity_score !== undefined ? conf.validity_score : defaultScore);
          return {
            ...item,
            name: item.name || `Sumber Tanpa Nama #${idx + 1}`,
            source_type: item.source_type || 'database',
            validity_tier: tier,
            validity_score: score,
            config: {
              ...conf,
              validity_tier: tier,
              validity_score: score,
              validity_notes: item.validity_notes || conf.validity_notes || ''
            },
            is_active: item.is_active !== undefined ? item.is_active : true
          };
        });

        setParsedData({
          meta: {
            version: json.version || '1.0',
            exported_at: json.exported_at || null,
            total_in_file: sourcesList.length
          },
          sources: validatedSources
        });

        // Select all by default
        setSelectedIndices(validatedSources.map((_, i) => i));

      } catch (err) {
        console.error('Error parsing JSON:', err);
        setParseError(err.message || 'Gagal membaca format file JSON');
        setParsedData(null);
      }
    };
    reader.onerror = () => {
      setParseError('Gagal membaca isi file dari komputer.');
      setParsedData(null);
    };
    reader.readAsText(fileObj);
  };

  const toggleSelectIndex = (index) => {
    setSelectedIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const selectAll = () => {
    if (!parsedData) return;
    if (selectedIndices.length === parsedData.sources.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(parsedData.sources.map((_, i) => i));
    }
  };

  const handleImportSubmit = async () => {
    if (!parsedData || selectedIndices.length === 0) return;
    const sourcesToImport = selectedIndices.map(i => parsedData.sources[i]);

    try {
      setImporting(true);
      const res = await api.post('/knowledge/import', {
        collision_strategy: collisionStrategy,
        auto_sync: autoSync,
        sources: sourcesToImport
      });

      setResultSummary(res.data);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Gagal mengimpor katalog: ' + (err.response?.data?.detail || err.message));
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsedData(null);
    setParseError(null);
    setSelectedIndices([]);
    setResultSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getSourceIcon = (type) => {
    switch ((type || '').toLowerCase()) {
      case 'database': return <Database size={15} color="var(--accent-primary)" />;
      case 'api': return <Globe size={15} color="var(--accent-cyan)" />;
      case 'file': return <FileText size={15} color="#db2777" />;
      case 'website': return <Globe size={15} color="var(--accent-emerald)" />;
      case 'websearch': return <Search size={15} color="var(--accent-amber)" />;
      case 'google_drive': return <FolderGit2 size={15} color="#7c3aed" />;
      default: return <Database size={15} color="var(--text-muted)" />;
    }
  };

  return (
    <div className="modal-overlay">
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '720px', 
          width: '94%', 
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '28px',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UploadCloud size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Import Knowledge Base Catalog
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Impor koneksi database, API, dokumen, website, atau tool dari berkas JSON ekspor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Tutup Modal"
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer', 
              padding: '6px', 
              borderRadius: '6px',
              transition: 'background 0.15s ease'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Success Result View */}
          {resultSummary ? (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={32} color="var(--accent-emerald)" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent-emerald)' }}>
                    Import Berhasil Diselesaikan!
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {resultSummary.message}
                  </p>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px',
                marginTop: '6px'
              }}>
                <div style={{ background: 'var(--bg-glass-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dibuat Baru</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '4px' }}>{resultSummary.created_count}</div>
                </div>
                <div style={{ background: 'var(--bg-glass-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Diperbarui</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--accent-primary)', marginTop: '4px' }}>{resultSummary.updated_count}</div>
                </div>
                <div style={{ background: 'var(--bg-glass-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dilewati</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--accent-rose)', marginTop: '4px' }}>{resultSummary.skipped_count}</div>
                </div>
              </div>

              {resultSummary.created_sources?.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-main)' }}>Sumber baru: </strong>
                  {resultSummary.created_sources.join(', ')}
                </div>
              )}

              {resultSummary.updated_sources?.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-main)' }}>Sumber diperbarui: </strong>
                  {resultSummary.updated_sources.join(', ')}
                </div>
              )}

              {resultSummary.skipped_sources?.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-main)' }}>Sumber dilewati: </strong>
                  {resultSummary.skipped_sources.join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetImport}
                  style={{ fontSize: '13px' }}
                >
                  Import File Lain
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onClose}
                  style={{ fontSize: '13px' }}
                >
                  Selesai
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File Dropzone */}
              {!parsedData && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: isDragOver ? '2px dashed var(--accent-primary)' : '2px dashed var(--border-color)',
                    background: isDragOver ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-glass-1)',
                    borderRadius: '12px',
                    padding: '36px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'var(--bg-glass-2)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <UploadCloud size={28} color="var(--accent-primary)" />
                  </div>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>
                      Pilih atau tarik file berkas JSON katalog ke sini
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Mendukung format file <code>knowledge_catalog_export_*.json</code>
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Error Box */}
              {parseError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: 'var(--accent-rose)',
                  fontSize: '13px'
                }}>
                  <AlertTriangle size={18} color="var(--accent-rose)" style={{ flexShrink: 0 }} />
                  <div>{parseError}</div>
                </div>
              )}

              {/* Parsed Preview and Configuration */}
              {parsedData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* File Metadata Bar */}
                  <div style={{
                    background: 'var(--bg-glass-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={18} color="var(--accent-primary)" />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
                          {file?.name || 'knowledge_catalog.json'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {parsedData.sources.length} sumber terdeteksi • Versi {parsedData.meta.version}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={resetImport}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Ganti File
                    </button>
                  </div>

                  {/* Collision Strategy Options */}
                  <div style={{
                    background: 'var(--bg-glass-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '14px 16px'
                  }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '10px' }}>
                      Strategi Penanganan Duplikasi Nama
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        background: collisionStrategy === 'rename' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-1)',
                        border: collisionStrategy === 'rename' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}>
                        <input
                          type="radio"
                          name="collisionStrategy"
                          value="rename"
                          checked={collisionStrategy === 'rename'}
                          onChange={() => setCollisionStrategy('rename')}
                          style={{ marginTop: '2px' }}
                        />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Rename (Salin Baru)</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Beri akhiran <code>(Import)</code> pada nama duplikat
                          </div>
                        </div>
                      </label>

                      <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        background: collisionStrategy === 'overwrite' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-1)',
                        border: collisionStrategy === 'overwrite' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}>
                        <input
                          type="radio"
                          name="collisionStrategy"
                          value="overwrite"
                          checked={collisionStrategy === 'overwrite'}
                          onChange={() => setCollisionStrategy('overwrite')}
                          style={{ marginTop: '2px' }}
                        />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Overwrite (Timpa)</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Perbarui konfigurasi sumber yang sudah ada
                          </div>
                        </div>
                      </label>

                      <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        background: collisionStrategy === 'skip' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass-1)',
                        border: collisionStrategy === 'skip' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}>
                        <input
                          type="radio"
                          name="collisionStrategy"
                          value="skip"
                          checked={collisionStrategy === 'skip'}
                          onChange={() => setCollisionStrategy('skip')}
                          style={{ marginTop: '2px' }}
                        />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Skip (Lewati)</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Abaikan sumber yang sudah ada di katalog
                          </div>
                        </div>
                      </label>
                    </div>

                    {/* Auto-Sync Option */}
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={autoSync}
                          onChange={(e) => setAutoSync(e.target.checked)}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: '500' }}>
                          ⚡ Otomatis jalankan sinkronisasi data / ingestion untuk sumber yang diimpor
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Sources Preview List */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={parsedData.sources.length > 0 && selectedIndices.length === parsedData.sources.length}
                          onChange={selectAll}
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--accent-primary)' }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Pilih Sumber untuk Diimpor ({selectedIndices.length} dari {parsedData.sources.length} dipilih)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={selectAll}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}
                      >
                        {selectedIndices.length === parsedData.sources.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                      </button>
                    </div>

                    <div style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      background: 'var(--bg-glass-1)'
                    }}>
                      {parsedData.sources.map((src, idx) => {
                        const isSelected = selectedIndices.includes(idx);
                        const isConflict = existingNamesSet.has((src.name || '').trim().toLowerCase());
                        const isTool = (src.config?.is_tool || (src.config?.parameters && src.config.parameters.length > 0));

                        return (
                          <div
                            key={idx}
                            onClick={() => toggleSelectIndex(idx)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderBottom: idx < parsedData.sources.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                              background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                              cursor: 'pointer',
                              transition: 'background 0.1s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleSelectIndex(idx);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                style={{
                                  cursor: 'pointer',
                                  width: '16px',
                                  height: '16px',
                                  accentColor: 'var(--accent-primary)'
                                }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {getSourceIcon(src.source_type)}
                                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {src.name}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <ValidityBadge
                                tier={src.validity_tier || src.config?.validity_tier}
                                score={src.validity_score !== undefined ? src.validity_score : src.config?.validity_score}
                                size="small"
                              />
                              {isTool && (
                                <span style={{
                                  background: 'rgba(99, 102, 241, 0.15)',
                                  color: 'var(--accent-primary)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: '700'
                                }}>
                                  TOOL
                                </span>
                              )}
                              <span style={{
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-glass-2)',
                                border: '1px solid var(--border-subtle)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                {src.source_type}
                              </span>
                              {isConflict && (
                                <span style={{
                                  fontSize: '10px',
                                  color: 'var(--accent-amber)',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.35)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: '600'
                                }}>
                                  Sudah Ada
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Modal Footer */}
        {!resultSummary && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)',
            flexShrink: 0
          }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={importing}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!parsedData || selectedIndices.length === 0 || importing}
              onClick={handleImportSubmit}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {importing ? (
                <>
                  <RefreshCw size={14} className="spin" /> Mengimpor...
                </>
              ) : (
                <>
                  <UploadCloud size={14} /> Import ({selectedIndices.length}) Sumber
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
