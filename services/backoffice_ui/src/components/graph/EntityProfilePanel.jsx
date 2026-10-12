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
    <div className="glass-panel" style={{
      width: '380px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
      overflowY: 'auto',
      flexShrink: 0,
      zIndex: 20
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>Entity Profile</h3>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-xs btn-circle"
          style={{ color: 'var(--text-muted)' }}
          title="Tutup Profil"
        >
          <X size={16} />
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
            <span className="badge badge-info font-bold text-xs" style={{ marginBottom: '8px' }}>{profile.type}</span>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em', wordBreak: 'break-word', lineHeight: '1.3' }}>
              {profile.entity}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
              {profile.description || 'Discovered entity in knowledge network.'}
            </p>
          </div>

          {/* Metadata Card */}
          <div style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'var(--bg-glass-2)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '0.05em' }}>
              Provenance & Stats
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Source:</span>
              <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>{profile.source}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Connections:</span>
              <span style={{ color: 'var(--accent-emerald)', fontWeight: '700' }}>{profile.total_connections}</span>
            </div>
          </div>

          {/* Relationship Connections */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Connected Relations</span>
              <span className="badge badge-ghost badge-sm font-semibold">{profile.network_connections?.length || 0}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {profile.network_connections?.map((conn, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectConnected && onSelectConnected(conn.connected_entity)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-glass-1)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.background = 'var(--bg-glass-2)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.background = 'var(--bg-glass-1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, marginRight: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {conn.relation}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginTop: '2px', wordBreak: 'break-word' }}>
                      {conn.connected_entity}
                    </div>
                  </div>
                  <ArrowRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
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
