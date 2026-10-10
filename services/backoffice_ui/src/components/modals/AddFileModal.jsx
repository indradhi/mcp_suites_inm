import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle, Sparkles, Edit2 } from 'lucide-react';
import api from '../../api/client';
import ValidityTierSelector from '../common/ValidityTierSelector';

export default function AddFileModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validityTier, setValidityTier] = useState('secondary');
  const [validityScore, setValidityScore] = useState(65);
  const [validityNotes, setValidityNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      const conf = initialData.config || {};
      setValidityTier(conf.validity_tier || 'secondary');
      setValidityScore(conf.validity_score !== undefined ? conf.validity_score : 65);
      setValidityNotes(conf.validity_notes || '');
      setFile(null);
    } else if (isOpen && !initialData) {
      setName('');
      setDescription('');
      setValidityTier('secondary');
      setValidityScore(65);
      setValidityNotes('');
      setFile(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      if (!name) setName(selected.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setUploading(true);

    try {
      if (file) {
        // New file upload / replacement
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        formData.append('description', description);
        formData.append('validity_tier', validityTier);
        formData.append('validity_score', validityScore);
        formData.append('validity_notes', validityNotes);

        await api.post('/knowledge/sources/upload-file', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else if (initialData) {
        // Updating existing document metadata
        await api.put(`/knowledge/sources/${initialData.id}`, {
          name,
          source_type: 'file',
          description,
          config: {
            ...(initialData.config || {}),
            validity_tier: validityTier,
            validity_score: validityScore,
            validity_notes: validityNotes
          }
        });
      } else {
        alert('Please select a file to upload');
        setUploading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      alert('Operation failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {initialData ? <Edit2 size={20} color="#f472b6" /> : <FileText size={20} color="var(--accent-primary)" />}
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>
              {initialData ? 'Edit Knowledge Document' : 'Upload Knowledge Document'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Tutup Modal"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.background = 'var(--border-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {initialData && initialData.config && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'var(--bg-glass-light)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
                  Current File: {initialData.config.filename || initialData.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Format: {initialData.config.file_type?.toUpperCase() || 'FILE'} • Size: {formatFileSize(initialData.config.file_size)}
                </div>
              </div>
              <span className="badge badge-success">Indexed</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              {initialData ? 'Replace Document File (Optional)' : 'File Selection (PDF, Excel, Word, Text)'}
            </label>
            <div style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '8px',
              padding: initialData ? '18px' : '30px',
              textAlign: 'center',
              cursor: 'pointer',
              background: file ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
              borderColor: file ? 'var(--accent-primary)' : 'var(--border-color)'
            }} onClick={() => document.getElementById('file-input').click()}>
              <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.csv,.md,.json"
                onChange={handleFileChange}
              />
              <Upload size={26} color={file ? 'var(--accent-primary)' : 'var(--text-muted)'} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
                {file ? file.name : (initialData ? 'Click to select a replacement file' : 'Click to select or drag and drop file')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                PDFs, Excel (.xlsx), Word (.docx), TXT, Markdown, CSV up to 100MB
              </div>
            </div>
          </div>

          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Sparkles size={18} color="var(--accent-primary)" />
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-main)' }}>Automatic OCR Enabled:</strong> If a PDF is image-based or scanned without digital text, Tesseract OCR will automatically extract the content.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Document Title
            </label>
            <input
              type="text"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Description (Optional)
            </label>
            <textarea
              className="input-field"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Q3 Financial Report & Risk Analysis"
            />
          </div>

          {/* Validity Tier Hierarchy Selector */}
          <ValidityTierSelector
            valueTier={validityTier}
            valueScore={validityScore}
            valueNotes={validityNotes}
            onChangeTier={setValidityTier}
            onChangeScore={setValidityScore}
            onChangeNotes={setValidityNotes}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={(!file && !initialData) || uploading}>
              {uploading ? 'Processing...' : (initialData ? (file ? 'Replace & Ingest' : 'Save Changes') : 'Upload & Process')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
