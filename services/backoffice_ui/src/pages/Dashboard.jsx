import React, { useEffect, useState } from 'react';
import { 
  Database, 
  Layers, 
  Network, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Server
} from 'lucide-react';
import api from '../api/client';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState({ total_sources: 0, total_jobs: 0, active_backends: 0, failed_jobs: 0 });
  const [graphMetrics, setGraphMetrics] = useState({ node_count: 0, edge_count: 0, density: 0 });
  const [recentJobs, setRecentJobs] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, jobsRes, graphRes, insightsRes] = await Promise.allSettled([
        api.get('/dashboard/stats'),
        api.get('/jobs?limit=5'),
        api.get('/graph/metrics'),
        api.get('/graph/insights')
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (jobsRes.status === 'fulfilled') setRecentJobs(jobsRes.value.data);
      if (graphRes.status === 'fulfilled') setGraphMetrics(graphRes.value.data);
      if (insightsRes.status === 'fulfilled') setInsights(insightsRes.value.data.insights || []);
    } catch (err) {
      console.error('Failed loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Knowledge Sources',
      value: stats.total_sources,
      subtext: 'Databases, APIs, Files, Web',
      icon: Database,
      color: '#6366f1'
    },
    {
      title: 'Graph Entities',
      value: graphMetrics.node_count,
      subtext: `${graphMetrics.edge_count} relation connections`,
      icon: Network,
      color: '#06b6d4'
    },
    {
      title: 'Active LLM Backends',
      value: stats.active_backends,
      subtext: 'vLLM / Ollama connected',
      icon: Cpu,
      color: '#8b5cf6'
    },
    {
      title: 'Ingestion Jobs',
      value: stats.total_jobs,
      subtext: `${stats.failed_jobs} failed`,
      icon: Layers,
      color: '#10b981'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            Mission Control
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Overview of indexed knowledge, relation networks, and MCP connectivity
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/knowledge" className="btn-primary">
            <Database size={16} />
            Add Knowledge
          </Link>
          <Link to="/network" className="btn-secondary">
            <Network size={16} />
            Explore Graph
          </Link>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>{card.title}</span>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: `${card.color}22`,
                  border: `1px solid ${card.color}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={20} color={card.color} />
                </div>
              </div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: '#ffffff', marginTop: '16px', letterSpacing: '-0.02em' }}>
                {card.value}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {card.subtext}
              </div>
            </div>
          );
        })}
      </div>

      {/* Integration Banner for OpenWebUI */}
      <div className="glass-panel" style={{
        padding: '24px',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="badge badge-info">OpenWebUI Compatible</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>MCP Server Ready</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '750px' }}>
              Connect OpenWebUI to this MCP Server via SSE endpoint. All vector search chunks and relation graph entity profiles will automatically be accessible during prompt processing and thinking.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <code style={{
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              http://localhost:8001/sse
            </code>
          </div>
        </div>
      </div>

      {/* Split Section: Recent Jobs & Top Profiling Insights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
        
        {/* Recent Jobs */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>Recent Ingest Jobs</h3>
            </div>
            <Link to="/jobs" style={{ fontSize: '13px', color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View all <ArrowUpRight size={14} />
            </Link>
          </div>

          {recentJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
              No ingestion jobs recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentJobs.map((job) => (
                <div key={job.id} style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>{job.source_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {job.chunks_created} chunks · {job.entities_extracted} entities extracted
                    </div>
                  </div>
                  <span className={`badge ${job.status === 'completed' ? 'badge-success' : job.status === 'processing' ? 'badge-info' : 'badge-danger'}`}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Network Profiling Insights */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--accent-cyan)" />
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>Network Profiling Insights</h3>
            </div>
            <Link to="/network" style={{ fontSize: '13px', color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Graph <ArrowUpRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {insights.slice(0, 3).map((ins, i) => (
              <div key={i} style={{
                padding: '14px 16px',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.05)',
                border: '1px solid rgba(6, 182, 212, 0.15)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>{ins.title}</span>
                  <span className="badge badge-info">{ins.category}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {ins.description}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
