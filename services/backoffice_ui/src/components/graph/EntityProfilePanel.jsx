import React, { useEffect, useState } from 'react';
import { X, Network, Share2, Info, ArrowRight } from 'lucide-react';
import api from '../../api/client';

export default function EntityProfilePanel({ entityName, onClose, onSelectConnected }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entityName) {
      fetchProfile(entityName);
    }
  }, [entityName]);

  const fetchProfile = async (name) => {
    try {
      setLoading(true);
      const res = await api.get(`/graph/profile/${encodeURIComponent(name)}`);
      setProfile(res.data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!entityName) return null;

  return (
    <div style={{
      width: '380px',
      background: 'rgba(11, 15, 25, 0.95)',
      backdropFilter: 'blur(16px)',
      borderLeft: '1px solid var(--border-color)',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>Entity Profile</h3>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Analyzing relation profile...
        </div>
      ) : profile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Main Info */}
          <div>
            <span className="badge badge-info" style={{ marginBottom: '8px' }}>{profile.type}</span>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              {profile.entity}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
              {profile.description || 'Discovered entity in knowledge network.'}
            </p>
          </div>

          {/* Metadata Card */}
          <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Provenance & Stats
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Source:</span>
              <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>{profile.source}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Connections:</span>
              <span style={{ color: 'var(--accent-emerald)', fontWeight: '700' }}>{profile.total_connections}</span>
            </div>
          </div>

          {/* Relationship Connections */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '12px' }}>
              Connected Relations ({profile.network_connections?.length || 0})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {profile.network_connections?.map((conn, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectConnected && onSelectConnected(conn.connected_entity)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-glass-3)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                      {conn.relation}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginTop: '2px' }}>
                      {conn.connected_entity}
                    </div>
                  </div>
                  <ArrowRight size={14} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Select a node on the graph to view its detailed profile.
        </div>
      )}
    </div>
  );
}
