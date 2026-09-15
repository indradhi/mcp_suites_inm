import React, { useEffect, useState } from 'react';
import { Network, Sparkles, Route, RefreshCw, ZoomIn, Search, Layers, Compass } from 'lucide-react';
import api from '../api/client';
import CytoscapeGraph from '../components/graph/CytoscapeGraph';
import EntityProfilePanel from '../components/graph/EntityProfilePanel';
import PathFinderPanel from '../components/graph/PathFinderPanel';

export default function NetworkExplorer() {
  const [graphData, setGraphData] = useState({ elements: { nodes: [], edges: [] }, stats: { total_nodes: 0, total_edges: 0 } });
  const [metrics, setMetrics] = useState({ node_count: 0, edge_count: 0, density: 0, top_hubs: [] });
  const [insights, setInsights] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [layoutName, setLayoutName] = useState('cose');
  const [activeTab, setActiveTab] = useState('graph'); // 'graph', 'path', 'insights'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGraph();
    fetchMetrics();
    fetchInsights();
  }, []);

  const fetchGraph = async () => {
    try {
      setLoading(true);
      const res = await api.get('/graph/subgraph?limit=150');
      setGraphData(res.data);
    } catch (err) {
      console.error('Error fetching graph:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await api.get('/graph/metrics');
      setMetrics(res.data);
    } catch (err) {
      console.error('Error fetching metrics:', err);
    }
  };

  const fetchInsights = async () => {
    try {
      const res = await api.get('/graph/insights');
      setInsights(res.data.insights || []);
    } catch (err) {
      console.error('Error fetching insights:', err);
    }
  };

  const handleNodeClick = (node) => {
    setSelectedEntity(node.id);
  };

  const filteredNodes = graphData.elements.nodes.filter(n =>
    n.data.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 64px)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            Data Network & Relation Profiler
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
            Multi-hop relational network graph, centrality profiling, and algorithmic reasoning insights
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('graph')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'graph' ? 'var(--accent-primary)' : 'transparent',
              color: '#ffffff'
            }}
          >
            <Network size={15} /> Graph View
          </button>
          <button
            onClick={() => setActiveTab('path')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'path' ? 'var(--accent-primary)' : 'transparent',
              color: '#ffffff'
            }}
          >
            <Route size={15} /> Path Finder
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'insights' ? 'var(--accent-primary)' : 'transparent',
              color: '#ffffff'
            }}
          >
            <Sparkles size={15} /> AI Insights
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'graph' && (
        <div style={{ display: 'flex', flex: 1, gap: '16px', minHeight: 0, position: 'relative' }}>
          {/* Main Graph Card */}
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            
            {/* Graph Control Bar */}
            <div style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(10, 14, 23, 0.6)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search node..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '6px 10px 6px 30px', fontSize: '12px' }}
                  />
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {graphData.stats.total_nodes} nodes · {graphData.stats.total_edges} edges
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Layout:</span>
                <select
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color)',
                    color: '#ffffff',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                >
                  <option value="cose">Force-Directed (Cose)</option>
                  <option value="concentric">Concentric Circles</option>
                  <option value="circle">Circular</option>
                  <option value="breadthfirst">Hierarchical</option>
                </select>

                <button
                  onClick={fetchGraph}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Reload Graph"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>

            {/* Canvas Container */}
            <div style={{ flex: 1, position: 'relative' }}>
              <CytoscapeGraph
                elements={graphData.elements}
                onSelectNode={handleNodeClick}
                selectedNodeId={selectedEntity}
                layoutName={layoutName}
              />
            </div>
          </div>

          {/* Side Entity Profile Drawer */}
          {selectedEntity && (
            <EntityProfilePanel
              entityName={selectedEntity}
              onClose={() => setSelectedEntity(null)}
              onSelectConnected={(name) => setSelectedEntity(name)}
            />
          )}
        </div>
      )}

      {activeTab === 'path' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PathFinderPanel />
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="glass-panel" style={{ padding: '28px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Sparkles size={22} color="var(--accent-cyan)" />
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>Network Profiling Insights</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Continuous algorithmic synthesis of hub authority, communities, and cross-silo data relationships.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {insights.map((ins, i) => (
              <div key={i} style={{
                padding: '20px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className="badge badge-info">{ins.category}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: ins.importance === 'HIGH' ? '#f43f5e' : '#34d399' }}>
                      {ins.importance} PRIORITY
                    </span>
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '8px' }}>
                    {ins.title}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    {ins.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
