import React, { useState, useEffect } from 'react';
import { X, Globe, Edit2 } from 'lucide-react';
import api from '../../api/client';
import ValidityTierSelector from '../common/ValidityTierSelector';
import ScheduleSelector from '../common/ScheduleSelector';

export default function AddWebsiteModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [validityTier, setValidityTier] = useState('secondary');
  const [validityScore, setValidityScore] = useState(65);
  const [validityNotes, setValidityNotes] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      setUrl(initialData.config?.url || '');
      const conf = initialData.config || {};
      setValidityTier(conf.validity_tier || 'secondary');
      setValidityScore(conf.validity_score !== undefined ? conf.validity_score : 65);
      setValidityNotes(conf.validity_notes || '');
      setScheduleCron(initialData.schedule_cron || '');
    } else if (isOpen && !initialData) {
      setName('');
      setUrl('');
      setValidityTier('secondary');
      setValidityScore(65);
      setValidityNotes('');
      setScheduleCron('');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name,
        source_type: 'website',
        description: `Scraped website: ${url}`,
        config: {
          url,
          validity_tier: validityTier,
          validity_score: validityScore,
          validity_notes: validityNotes
        },
        schedule_cron: scheduleCron || null
      };
      if (initialData) {
        await api.put(`/knowledge/sources/${initialData.id}?re_sync=true`, payload);
      } else {
        await api.post('/knowledge/sources', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {initialData ? <Edit2 size={20} color="var(--accent-emerald)" /> : <Globe size={20} color="var(--accent-emerald)" />}
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>
              {initialData ? 'Edit Website Knowledge Source' : 'Add Website Knowledge Source'}
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
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Source Name
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Official Documentation Portal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Website URL
            </label>
            <input
              type="url"
              className="input-field font-mono"
              placeholder="https://docs.example.com/guide"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
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

          <ScheduleSelector
            value={scheduleCron}
            onChange={setScheduleCron}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : (initialData ? 'Update & Sync' : 'Crawl & Ingest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
