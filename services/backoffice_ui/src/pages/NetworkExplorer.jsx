import React, { useEffect, useState, useRef } from 'react';
import { 
  Network, 
  Sparkles, 
  Route, 
  RefreshCw, 
  Search, 
  X, 
  Share2, 
  Target, 
  Layers, 
  CircleDot, 
  LayoutGrid, 
  Shuffle, 
  ChevronDown, 
  Check, 
  SlidersHorizontal 
} from 'lucide-react';
import api from '../api/client';
import CytoscapeGraph from '../components/graph/CytoscapeGraph';
import EntityProfilePanel from '../components/graph/EntityProfilePanel';
import PathFinderPanel from '../components/graph/PathFinderPanel';

const NETWORK_LAYOUTS = [
  {
    id: 'cose',
    name: 'Force-Directed (Cose)',
    shortName: 'Force-Directed',
    tag: 'Rekomendasi',
    tagBg: 'rgba(99, 102, 241, 0.2)',
    tagColor: '#818cf8',
    icon: Share2,
    accent: '#6366f1',
    description: 'Simulasi fisika gaya pegas; mengelompokkan klaster relasi secara dinamis dan organik.'
  },
  {
    id: 'concentric',
    name: 'Konsentris (Circles)',
    shortName: 'Konsentris',
    tag: 'Sentralitas',
    tagBg: 'rgba(6, 182, 212, 0.2)',
    tagColor: '#22d3ee',
    icon: Target,
    accent: '#06b6d4',
    description: 'Menyusun node dalam cincin melingkar bertingkat berdasarkan derajat sentralitas koneksi.'
  },
  {
    id: 'breadthfirst',
    name: 'Hierarkis (Tree)',
    shortName: 'Hierarkis',
    tag: 'Pohon Relasi',
    tagBg: 'rgba(16, 185, 129, 0.2)',
    tagColor: '#34d399',
    icon: Layers,
    accent: '#10b981',
    description: 'Tata letak bertingkat terstruktur dari entitas pusat (root) menuju entitas bawahan.'
  },
  {
    id: 'circle',
    name: 'Sirkular (Radial)',
    shortName: 'Sirkular',
    tag: 'Melingkar',
    tagBg: 'rgba(245, 158, 11, 0.2)',
    tagColor: '#fbbf24',
    icon: CircleDot,
    accent: '#f59e0b',
    description: 'Menata seluruh entitas dalam satu lingkaran merata untuk komparasi proporsi keterhubungan.'
  },
  {
    id: 'grid',
    name: 'Grid Matriks',
    shortName: 'Grid',
    tag: 'Matriks Rapi',
    tagBg: 'rgba(139, 92, 246, 0.2)',
    tagColor: '#a78bfa',
    icon: LayoutGrid,
    accent: '#8b5cf6',
    description: 'Menyusun node secara teratur dalam baris dan kolom untuk inspeksi data sistematis.'
  },
  {
    id: 'random',
    name: 'Acak (Spread)',
    shortName: 'Acak',
    tag: 'Sebaran',
    tagBg: 'rgba(236, 72, 153, 0.2)',
    tagColor: '#f472b6',
    icon: Shuffle,
    accent: '#ec4899',
    description: 'Penyebaran acak instan untuk eksplorasi cepat tanpa beban komputasi fisika.'
  }
];

export default function NetworkExplorer() {
  const [graphData, setGraphData] = useState({ elements: { nodes: [], edges: [] }, stats: { total_nodes: 0, total_edges: 0 } });
  const [metrics, setMetrics] = useState({ node_count: 0, edge_count: 0, density: 0, top_hubs: [] });
  const [insights, setInsights] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [layoutName, setLayoutName] = useState('cose');
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('graph'); // 'graph', 'path', 'insights'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const layoutDropdownRef = useRef(null);

  useEffect(() => {
    fetchGraph();
    fetchMetrics();
    fetchInsights();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(event.target)) {
        setIsLayoutDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const activeLayout = NETWORK_LAYOUTS.find(l => l.id === layoutName) || NETWORK_LAYOUTS[0];
  const ActiveLayoutIcon = activeLayout.icon;

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
              color: '#ffffff',
              transition: 'all 0.15s ease'
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
              color: '#ffffff',
              transition: 'all 0.15s ease'
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
              color: '#ffffff',
              transition: 'all 0.15s ease'
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
              background: 'rgba(10, 14, 23, 0.75)',
              backdropFilter: 'blur(10px)',
              zIndex: 20
            }}>
              {/* Left: Node Search & Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Cari node entitas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '7px 28px 7px 32px', fontSize: '12px', borderRadius: '8px' }}
                  />
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399', display: 'inline-block' }} />
                  <span><strong>{graphData.stats.total_nodes}</strong> entitas</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                  <span><strong>{graphData.stats.total_edges}</strong> relasi</span>
                </div>
              </div>

              {/* Right: Modern Network Layout Selection System */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                  Tata Letak:
                </span>

                {/* Quick Switch Pills for Top 3 Layouts */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.35)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  gap: '3px'
                }}>
                  {NETWORK_LAYOUTS.slice(0, 3).map((l) => {
                    const isSelected = layoutName === l.id;
                    const IconComp = l.icon;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setLayoutName(l.id)}
                        title={l.description}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: isSelected ? '700' : '500',
                          border: isSelected ? `1px solid ${l.accent}88` : '1px solid transparent',
                          background: isSelected ? `${l.accent}25` : 'transparent',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <IconComp size={12} color={isSelected ? l.accent : 'currentColor'} />
                        {l.shortName}
                      </button>
                    );
                  })}
                </div>

                {/* Main Custom Layout Dropdown Selector */}
                <div ref={layoutDropdownRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: isLayoutDropdownOpen ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      border: isLayoutDropdownOpen ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      color: '#ffffff',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.18s ease',
                      boxShadow: isLayoutDropdownOpen ? '0 0 12px rgba(99, 102, 241, 0.3)' : 'none'
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      background: `${activeLayout.accent}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <ActiveLayoutIcon size={12} color={activeLayout.accent} />
                    </div>
                    <span style={{ fontWeight: '600' }}>{activeLayout.name}</span>
                    <span style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: activeLayout.tagBg,
                      color: activeLayout.tagColor,
                      fontWeight: '700'
                    }}>
                      {activeLayout.tag}
                    </span>
                    <ChevronDown
                      size={14}
                      color="var(--text-muted)"
                      style={{
                        transition: 'transform 0.2s ease',
                        transform: isLayoutDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                      }}
                    />
                  </button>

                  {/* Popover Dropdown Menu */}
                  {isLayoutDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: '370px',
                      background: 'rgba(11, 15, 25, 0.97)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      borderRadius: '12px',
                      boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255, 255, 255, 0.25)',
                      padding: '12px',
                      zIndex: 100,
                      animation: 'fadeIn 0.15s ease-out'
                    }}>
                      {/* Menu Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '8px',
                        marginBottom: '8px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <SlidersHorizontal size={13} color="var(--accent-primary)" />
                          <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            PILIHAN TATA LETAK JARINGAN
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#94a3b8',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: '600'
                        }}>
                          6 Algoritma
                        </span>
                      </div>

                      {/* Layout Options List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto', paddingRight: '2px' }}>
                        {NETWORK_LAYOUTS.map((l) => {
                          const isSelected = layoutName === l.id;
                          const ItemIcon = l.icon;

                          return (
                            <div
                              key={l.id}
                              onClick={() => {
                                setLayoutName(l.id);
                                setIsLayoutDropdownOpen(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '9px 10px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                background: isSelected ? `${l.accent}18` : 'rgba(255, 255, 255, 0.02)',
                                border: isSelected ? `1px solid ${l.accent}60` : '1px solid transparent',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }
                              }}
                            >
                              {/* Icon */}
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: `${l.accent}25`,
                                border: `1px solid ${l.accent}45`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: '2px'
                              }}>
                                <ItemIcon size={16} color={l.accent} />
                              </div>

                              {/* Text info */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: isSelected ? '700' : '600', color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                                    {l.name}
                                  </span>
                                  <span style={{
                                    fontSize: '9px',
                                    fontWeight: '700',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: l.tagBg,
                                    color: l.tagColor
                                  }}>
                                    {l.tag}
                                  </span>
                                </div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4', margin: 0 }}>
                                  {l.description}
                                </p>
                              </div>

                              {/* Active indicator */}
                              {isSelected && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  background: 'rgba(16, 185, 129, 0.2)',
                                  border: '1px solid rgba(16, 185, 129, 0.4)',
                                  color: '#34d399',
                                  borderRadius: '6px',
                                  padding: '2px 6px',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  flexShrink: 0,
                                  marginTop: '2px'
                                }}>
                                  <Check size={11} /> Aktif
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Tip */}
                      <div style={{
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '10.5px',
                        color: 'var(--text-muted)',
                        lineHeight: '1.4'
                      }}>
                        <Sparkles size={12} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                        <span>Gunakan <strong>Konsentris</strong> untuk mendeteksi tokoh/organisasi kunci, atau <strong>Force-Directed</strong> untuk melihat klaster kelompok.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ width: '1px', height: '20px', background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />

                {/* Reload Button */}
                <button
                  onClick={fetchGraph}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                  title="Reload Graph Data"
                >
                  <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                  <span>Muat Ulang</span>
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
