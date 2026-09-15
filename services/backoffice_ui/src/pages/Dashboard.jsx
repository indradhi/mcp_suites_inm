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
  Server,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Globe,
  Link2,
  Info
} from 'lucide-react';
import api from '../api/client';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [stats, setStats] = useState({ total_sources: 0, total_jobs: 0, active_backends: 0, failed_jobs: 0 });
  const [graphMetrics, setGraphMetrics] = useState({ node_count: 0, edge_count: 0, density: 0 });
  const [recentJobs, setRecentJobs] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEndpointsExpanded, setIsEndpointsExpanded] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  const copyUrl = (text, key) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    }
  };

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

      {/* Collapsible Information Pane: Access Points & OpenWebUI Integration */}
      {(() => {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const currentPort = typeof window !== 'undefined' ? window.location.port : '';
        const isProdPort = !currentPort || currentPort === '80' || currentPort === '443';

        const accessPoints = [
          {
            id: 'mcp-prod',
            name: 'MCP SSE Endpoint (Nginx / Production)',
            url: `http://${currentHost}/sse`,
            badge: 'Production Default',
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeBorder: 'rgba(16, 185, 129, 0.4)',
            badgeColor: '#10b981',
            desc: 'Production SSE stream via Nginx reverse proxy (Port 80/443). Recommended for OpenWebUI.'
          },
          {
            id: 'mcp-direct',
            name: 'MCP SSE Direct (Port 8001)',
            url: `http://${currentHost}:8001/sse`,
            badge: 'Direct Container',
            badgeBg: 'rgba(99, 102, 241, 0.15)',
            badgeBorder: 'rgba(99, 102, 241, 0.4)',
            badgeColor: '#818cf8',
            desc: 'Direct container port bypass without reverse proxy. Ideal for local dev or internal Docker networks.'
          },
          {
            id: 'api-docs',
            name: 'Backoffice API Docs (Swagger)',
            url: isProdPort ? `http://${currentHost}/docs` : `http://${currentHost}:8002/docs`,
            badge: 'OpenAPI REST',
            badgeBg: 'rgba(6, 182, 212, 0.15)',
            badgeBorder: 'rgba(6, 182, 212, 0.4)',
            badgeColor: '#22d3ee',
            desc: 'Interactive Swagger UI to test ingestion, search, face recognition, and feedback endpoints.'
          },
          {
            id: 'neo4j',
            name: 'Neo4j Graph Visualizer',
            url: `http://${currentHost}:7474`,
            badge: 'Cypher UI',
            badgeBg: 'rgba(245, 158, 11, 0.15)',
            badgeBorder: 'rgba(245, 158, 11, 0.4)',
            badgeColor: '#fbbf24',
            desc: 'Interactive visual exploration of entities, graph relations, and connected network clusters.'
          },
          {
            id: 'backoffice-ui',
            name: 'Backoffice Web UI (This App)',
            url: isProdPort ? `http://${currentHost}` : `http://${currentHost}:5173`,
            badge: 'Current App',
            badgeBg: 'rgba(139, 92, 246, 0.15)',
            badgeBorder: 'rgba(139, 92, 246, 0.4)',
            badgeColor: '#c084fc',
            desc: 'Web dashboard for knowledge sources, graph explorer, jobs scheduler, and AI chat.'
          }
        ];

        return (
          <div className="glass-panel" style={{
            marginBottom: '28px',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.5) 0%, rgba(15, 23, 42, 0.7) 100%)',
            overflow: 'hidden'
          }}>
            {/* Collapsible Header */}
            <div 
              onClick={() => setIsEndpointsExpanded(!isEndpointsExpanded)}
              style={{
                padding: '18px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: isEndpointsExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(6, 182, 212, 0.3) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <Server size={20} color="var(--accent-cyan)" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                      System Access Points & OpenWebUI Integration
                    </h3>
                    <span className="badge badge-info" style={{ fontSize: '11px' }}>
                      OpenWebUI Ready
                    </span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11px',
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.12)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                      MCP SSE Active
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Click any access point URL to open in a new tab, or copy endpoints for OpenWebUI / Claude Desktop configuration.
                  </p>
                </div>
              </div>

              <button 
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-primary)',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {isEndpointsExpanded ? (
                  <>
                    <span>Hide Details</span>
                    <ChevronUp size={16} />
                  </>
                ) : (
                  <>
                    <span>Show Details</span>
                    <ChevronDown size={16} />
                  </>
                )}
              </button>
            </div>

            {/* Collapsible Content */}
            {isEndpointsExpanded && (
              <div style={{ padding: '24px' }}>
                
                {/* 1. Access Points Grid (Clickable links) */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <Globe size={16} color="var(--accent-cyan)" />
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      Available Service Access Points
                    </h4>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                    gap: '14px'
                  }}>
                    {accessPoints.map(ep => {
                      const isCopied = copiedKey === ep.id;
                      return (
                        <div 
                          key={ep.id}
                          style={{
                            background: 'rgba(15, 23, 42, 0.65)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '10px',
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px',
                            transition: 'border-color 0.2s ease'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
                                {ep.name}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: '600',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: ep.badgeBg,
                                border: `1px solid ${ep.badgeBorder}`,
                                color: ep.badgeColor
                              }}>
                                {ep.badge}
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                              {ep.desc}
                            </p>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(0, 0, 0, 0.35)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            gap: '8px'
                          }}>
                            {/* Clickable link */}
                            <a 
                              href={ep.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${ep.url} in new tab`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: 'var(--accent-cyan)',
                                textDecoration: 'none',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1
                              }}
                            >
                              <Link2 size={13} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.displayUrl}</span>
                              <ExternalLink size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                            </a>

                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyUrl(ep.url, ep.id);
                              }}
                              title="Copy URL"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: isCopied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                border: isCopied ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
                                color: isCopied ? '#10b981' : 'var(--text-secondary)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                flexShrink: 0,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {isCopied ? (
                                <>
                                  <Check size={12} />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Open WebUI Connection Guide */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 27, 75, 0.4) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-info">Open WebUI Guide</span>
                      <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                        How to Connect Open WebUI to this MCP Server
                      </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => copyUrl(`http://${currentHost}/sse`, 'mcp-rec-prod')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: copiedKey === 'mcp-rec-prod' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.25)',
                          border: copiedKey === 'mcp-rec-prod' ? '1px solid #10b981' : '1px solid rgba(99, 102, 241, 0.4)',
                          color: copiedKey === 'mcp-rec-prod' ? '#10b981' : '#ffffff',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedKey === 'mcp-rec-prod' ? <Check size={13} /> : <Copy size={13} />}
                        Copy Prod SSE URL (Port 80)
                      </button>

                      <button
                        type="button"
                        onClick={() => copyUrl(`http://${currentHost}:8001/sse`, 'mcp-rec-direct')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: copiedKey === 'mcp-rec-direct' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          border: copiedKey === 'mcp-rec-direct' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                          color: copiedKey === 'mcp-rec-direct' ? '#10b981' : 'var(--text-primary)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedKey === 'mcp-rec-direct' ? <Check size={13} /> : <Copy size={13} />}
                        Copy Direct SSE URL (:8001)
                      </button>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                    gap: '12px'
                  }}>
                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                        STEP 1
                      </div>
                      <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: '600' }}>
                        Open WebUI Settings
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                        In Open WebUI, open <strong>Admin Panel</strong> &gt; <strong>Settings</strong> &gt; <strong>Tools</strong> (or <strong>Connections</strong> &gt; <strong>MCP Servers</strong>).
                      </p>
                    </div>

                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                        STEP 2
                      </div>
                      <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: '600' }}>
                        Add New MCP Server
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                        Select Connection Type: <strong>SSE</strong> (Server-Sent Events) from the dropdown.
                      </p>
                    </div>

                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                        STEP 3
                      </div>
                      <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: '600' }}>
                        Paste SSE URL
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                        Paste <code style={{ color: 'var(--accent-cyan)' }}>http://{currentHost}/sse</code> (or direct port <code style={{ color: 'var(--accent-cyan)' }}>:8001/sse</code>).
                      </p>
                    </div>

                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                        STEP 4
                      </div>
                      <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: '600' }}>
                        Tools Auto-Discovered
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                        Save &amp; test. Tools (<code style={{ color: '#10b981' }}>search_knowledge_base</code>, <code style={{ color: '#10b981' }}>get_entity_network_profile</code>, <code style={{ color: '#10b981' }}>recognize_face</code>) are immediately ready!
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        );
      })()}

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
