import React, { useState } from 'react';
import { Route, ArrowRight, Search, AlertCircle } from 'lucide-react';
import api from '../../api/client';

export default function PathFinderPanel() {
  const [sourceEntity, setSourceEntity] = useState('');
  const [targetEntity, setTargetEntity] = useState('');
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!sourceEntity || !targetEntity) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/graph/connections?source=${encodeURIComponent(sourceEntity)}&target=${encodeURIComponent(targetEntity)}`);
      setPaths(res.data.paths || []);
    } catch (err) {
      console.error('Error finding path:', err);
      setPaths([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <Route size={20} color="var(--accent-primary)" />
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>Relationship Path Finder</h3>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Trace multi-hop relationship chains and bridging paths between any two entities in your data network.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Source Entity
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. MySQL Database"
            value={sourceEntity}
            onChange={(e) => setSourceEntity(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Target Entity
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. Finance API"
            value={targetEntity}
            onChange={(e) => setTargetEntity(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading} style={{ height: '42px' }}>
          <Search size={16} />
          {loading ? 'Tracing...' : 'Find Paths'}
        </button>
      </form>

      {/* Path Results */}
      {searched && (
        <div style={{ marginTop: '16px' }}>
          {paths.length === 0 ? (
            <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
              No direct or multi-hop path found within 4 degrees of separation.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {paths.map((p, idx) => (
                <div key={idx} style={{ padding: '16px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: '8px' }}>
                    Path Option {idx + 1} ({p.path_nodes?.length || 0} nodes)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    {p.path_nodes?.map((node, nIdx) => (
                      <React.Fragment key={nIdx}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'var(--bg-glass-3)',
                          border: '1px solid var(--border-color)',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: 'var(--text-main)'
                        }}>
                          {node.name} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({node.type})</span>
                        </span>
                        {nIdx < p.path_nodes.length - 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-primary)', fontSize: '11px' }}>
                            <ArrowRight size={14} />
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
