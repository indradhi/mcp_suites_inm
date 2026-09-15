import React, { useState, useEffect } from 'react';
import { X, Search, Edit2 } from 'lucide-react';
import api from '../../api/client';

export default function AddWebSearchModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [crawlPages, setCrawlPages] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      setQuery(initialData.config?.query || '');
      setCrawlPages(initialData.config?.crawl_pages ?? true);
    } else if (isOpen && !initialData) {
      setName('');
      setQuery('');
      setCrawlPages(true);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name,
        source_type: 'websearch',
        description: `Web search query: "${query}"`,
        config: { query, crawl_pages: crawlPages }
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {initialData ? <Edit2 size={20} color="var(--accent-amber)" /> : <Search size={20} color="var(--accent-amber)" />}
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>
              {initialData ? 'Edit Web Search Knowledge Source' : 'Add Web Search Knowledge Source'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
              placeholder="e.g. Industry Regulations & Market Trends"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Search Query / Keywords
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. latest security compliance guidelines 2026"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="crawl-pages"
              checked={crawlPages}
              onChange={(e) => setCrawlPages(e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
            />
            <label htmlFor="crawl-pages" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Deep Crawl: Automatically download and vectorize the top 3 result pages
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : (initialData ? 'Update & Sync' : 'Execute Search & Ingest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
