import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  SlidersHorizontal,
  Filter,
  Eye,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import api from '../api/client';
import CytoscapeGraph from '../components/graph/CytoscapeGraph';
import EntityProfilePanel from '../components/graph/EntityProfilePanel';
import PathFinderPanel from '../components/graph/PathFinderPanel';

const ENTITY_TYPES = [
  { id: 'ALL', label: 'Semua Tipe', color: '#94a3b8' },
  { id: 'PERSON', label: 'Orang / Individu', color: '#6366f1' },
  { id: 'ORGANIZATION', label: 'Organisasi / Korporasi', color: '#06b6d4' },
  { id: 'DATABASE_RECORD', label: 'Data Record', color: '#10b981' },
  { id: 'API_ENDPOINT', label: 'API Endpoint', color: '#f59e0b' },
  { id: 'DOCUMENT', label: 'Dokumen', color: '#ec4899' },
  { id: 'OTHER', label: 'Lainnya', color: '#8b5cf6' }
];

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
  const [searchParams] = useSearchParams();
  const urlParamQuery = searchParams.get('q') || searchParams.get('search') || '';

  const [graphData, setGraphData] = useState({ elements: { nodes: [], edges: [] }, stats: { total_nodes: 0, total_edges: 0 } });
  const [metrics, setMetrics] = useState({ node_count: 0, edge_count: 0, density: 0, top_hubs: [] });
  const [insights, setInsights] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [layoutName, setLayoutName] = useState('cose');
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('graph'); // 'graph', 'path', 'insights'
  const [searchQuery, setSearchQuery] = useState(urlParamQuery);
  const [selectedType, setSelectedType] = useState('ALL');
  const [filterMode, setFilterMode] = useState('highlight'); // 'highlight' or 'isolate'
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRemapping, setIsRemapping] = useState(false);

  const layoutDropdownRef = useRef(null);
  const typeDropdownRef = useRef(null);
  const searchContainerRef = useRef(null);

  useEffect(() => {
    fetchGraph();
    fetchMetrics();
    fetchInsights();
  }, []);

  // Sync searchQuery when URL params change
  useEffect(() => {
    const q = searchParams.get('q') || searchParams.get('search');
    if (q !== null && q !== undefined) {
      setSearchQuery(q);
    }
  }, [searchParams]);

  // Close popovers on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(event.target)) {
        setIsLayoutDropdownOpen(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
        setIsTypeDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSearchDropdown(false);
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

  const handleRemapGraph = async () => {
    if (!window.confirm("Apakah Anda yakin ingin melakukan re-mapping? Proses ini akan menghapus data graf yang ada dan mencetaknya ulang dari vector database.")) {
      return;
    }
    
    try {
      setIsRemapping(true);
      const res = await api.post('/graph/remap?clear_existing=true');
      alert(`Re-mapping berhasil!\n${res.data.entities_created} Entitas dan ${res.data.relationships_created} Relasi baru terbentuk dari ${res.data.chunks_processed} dokumen.`);
      
      // Refresh the graph data after remapping
      fetchGraph();
      fetchMetrics();
      fetchInsights();
    } catch (err) {
      console.error('Error remapping graph:', err);
      alert('Gagal melakukan re-mapping. Silakan periksa log server.');
    } finally {
      setIsRemapping(false);
    }
  };

  const handleClearGraph = async () => {
    if (!window.confirm("Yakin ingin menghapus seluruh node dan relasi dalam graf (Clear Graph)?")) return;
    try {
      setLoading(true);
      await api.delete('/graph/clear');
      alert('Graph berhasil dikosongkan.');
      fetchGraph();
      fetchMetrics();
      fetchInsights();
    } catch (err) {
      console.error('Error clearing graph:', err);
      alert('Gagal membersihkan graph.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueMapping = async () => {
    if (!window.confirm("Yakin ingin melanjutkan mapping (tanpa menghapus graph yang ada)?")) return;
    try {
      setIsRemapping(true);
      const res = await api.post('/graph/remap?clear_existing=false');
      alert(`Mapping lanjutan berhasil!\n${res.data.entities_created} Entitas dan ${res.data.relationships_created} Relasi baru terbentuk.`);
      fetchGraph();
      fetchMetrics();
      fetchInsights();
    } catch (err) {
      console.error('Error continuing mapping:', err);
      alert('Gagal melanjutkan mapping.');
    } finally {
      setIsRemapping(false);
    }
  };

  const handleTestMapping = async () => {
    try {
      setIsRemapping(true);
      const res = await api.post('/graph/test-mapping');
      alert('Test Mapping dieksekusi: ' + res.data.message);
      fetchGraph();
      fetchMetrics();
    } catch (err) {
      console.error('Error test mapping:', err);
      alert('Gagal melakukan test mapping.');
    } finally {
      setIsRemapping(false);
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

  const allNodes = graphData?.elements?.nodes || [];
  const allEdges = graphData?.elements?.edges || [];

  // Auto-focus matching entity from URL query
  useEffect(() => {
    if (searchQuery && allNodes.length > 0 && !selectedEntity) {
      const qClean = searchQuery.toLowerCase().trim();
      const matchedNode = allNodes.find(n => {
        const lbl = (n.data?.label || '').toLowerCase();
        const id = (n.data?.id || '').toLowerCase();
        return lbl === qClean || id === qClean || (lbl.length >= 4 && qClean.includes(lbl)) || (qClean.length >= 4 && lbl.includes(qClean));
      });
      if (matchedNode) {
        setSelectedEntity(matchedNode.data?.id || matchedNode.id);
      }
    }
  }, [searchQuery, allNodes, selectedEntity]);

  const filteredNodes = allNodes.filter(n => {
    const q = (searchQuery || '').toLowerCase().trim();
    const label = (n.data?.label || '').toLowerCase();
    const id = (n.data?.id || '').toLowerCase();
    const desc = (n.data?.description || '').toLowerCase();
    const nType = (n.data?.type || 'OTHER').toUpperCase();

    const matchesQuery = !q || label.includes(q) || id.includes(q) || desc.includes(q);
    const matchesType = selectedType === 'ALL' || nType === selectedType;
    return matchesQuery && matchesType;
  });

  const countByType = allNodes.reduce((acc, n) => {
    const t = (n.data?.type || 'OTHER').toUpperCase();
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const isFilterActive = (searchQuery && searchQuery.trim() !== '') || (selectedType && selectedType !== 'ALL');
  const activeTypeObj = ENTITY_TYPES.find(t => t.id === selectedType) || ENTITY_TYPES[0];

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

        {/* Actions & Tab Switcher */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Graph Action Buttons Group */}
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <button
              onClick={handleClearGraph}
              disabled={loading || isRemapping}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                cursor: (loading || isRemapping) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#fca5a5',
                transition: 'all 0.15s ease',
                opacity: (loading || isRemapping) ? 0.6 : 1
              }}
              title="Hapus semua graph"
            >
              <X size={13} />
              Clear Graph
            </button>
            <button
              onClick={handleRemapGraph}
              disabled={isRemapping}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                cursor: isRemapping ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#fcd34d',
                transition: 'all 0.15s ease',
                opacity: isRemapping ? 0.6 : 1
              }}
              title="Re-map ulang (menghapus yang lama)"
            >
              <RefreshCw size={13} className={isRemapping ? 'spin-animation' : ''} />
              Remap Graph
            </button>
            <button
              onClick={handleContinueMapping}
              disabled={isRemapping}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                cursor: isRemapping ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#6ee7b7',
                transition: 'all 0.15s ease',
                opacity: isRemapping ? 0.6 : 1
              }}
              title="Lanjutkan mapping tanpa menghapus yang ada"
            >
              <Layers size={13} />
              Continue Mapping
            </button>
            <button
              onClick={handleTestMapping}
              disabled={isRemapping}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                cursor: isRemapping ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(56, 189, 248, 0.1)',
                color: '#7dd3fc',
                transition: 'all 0.15s ease',
                opacity: isRemapping ? 0.6 : 1
              }}
              title="Test pembuatan graph"
            >
              <Sparkles size={13} />
              Test Mapping
            </button>
          </div>

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
              {/* Left: Node Search, Autocomplete & Multi-Dimension Filter Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                
                {/* Search Input with Live Autocomplete Popover */}
                <div ref={searchContainerRef} style={{ position: 'relative', width: '220px' }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Cari entitas, ID, label..."
                    value={searchQuery}
                    onFocus={() => { if (searchQuery.trim()) setShowSearchDropdown(true); }}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    style={{ padding: '6px 28px 6px 30px', fontSize: '12px', borderRadius: '8px', width: '100%' }}
                  />
                  <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                      }}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                      title="Hapus kata kunci pencarian"
                    >
                      <X size={13} />
                    </button>
                  )}

                  {/* Autocomplete Suggestions Popover */}
                  {showSearchDropdown && searchQuery.trim() && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '280px',
                      background: 'rgba(13, 18, 30, 0.98)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      borderRadius: '10px',
                      boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
                      padding: '6px',
                      zIndex: 110,
                      maxHeight: '260px',
                      overflowY: 'auto'
                    }}>
                      <div style={{ padding: '4px 8px 6px', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        Saran Hasil ({filteredNodes.length})
                      </div>
                      {filteredNodes.length === 0 ? (
                        <div style={{ padding: '12px 8px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          Tidak ada entitas yang cocok
                        </div>
                      ) : (
                        filteredNodes.slice(0, 8).map((node) => {
                          const nType = (node.data?.type || 'OTHER').toUpperCase();
                          const typeMeta = ENTITY_TYPES.find(t => t.id === nType) || { color: '#8b5cf6', label: nType };
                          return (
                            <div
                              key={node.data.id}
                              onClick={() => {
                                setSelectedEntity(node.data.id);
                                setSearchQuery(node.data.label);
                                setShowSearchDropdown(false);
                              }}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeMeta.color, flexShrink: 0 }} />
                                <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: '600', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                  {node.data.label}
                                </span>
                              </div>
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: `${typeMeta.color}25`, color: typeMeta.color, fontWeight: '700', flexShrink: 0 }}>
                                {typeMeta.label.split('/')[0].trim()}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Entity Type Filter Dropdown */}
                <div ref={typeDropdownRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: selectedType !== 'ALL' ? `${activeTypeObj.color}22` : 'rgba(255, 255, 255, 0.05)',
                      border: selectedType !== 'ALL' ? `1px solid ${activeTypeObj.color}80` : '1px solid var(--border-color)',
                      color: selectedType !== 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Filter size={12} color={selectedType !== 'ALL' ? activeTypeObj.color : 'currentColor'} />
                    <span>Tipe: <strong>{activeTypeObj.label.split('/')[0].trim()}</strong></span>
                    {selectedType !== 'ALL' && (
                      <span style={{ fontSize: '10px', background: activeTypeObj.color, color: '#000', borderRadius: '10px', padding: '0 5px', fontWeight: '800' }}>
                        {filteredNodes.length}
                      </span>
                    )}
                    <ChevronDown size={12} style={{ transform: isTypeDropdownOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }} />
                  </button>

                  {/* Type Filter Popover Menu */}
                  {isTypeDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '240px',
                      background: 'rgba(13, 18, 30, 0.98)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      borderRadius: '10px',
                      boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
                      padding: '8px',
                      zIndex: 110
                    }}>
                      <div style={{ padding: '2px 6px 6px', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '4px' }}>
                        Filter Menurut Tipe Entitas
                      </div>
                      {ENTITY_TYPES.map(t => {
                        const isSelected = selectedType === t.id;
                        const count = t.id === 'ALL' ? allNodes.length : (countByType[t.id] || 0);
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              setSelectedType(t.id);
                              setIsTypeDropdownOpen(false);
                            }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isSelected ? `${t.color}25` : 'transparent',
                              border: isSelected ? `1px solid ${t.color}60` : '1px solid transparent',
                              transition: 'all 0.12s ease'
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.color }} />
                              <span style={{ fontSize: '11px', color: isSelected ? '#ffffff' : 'var(--text-secondary)', fontWeight: isSelected ? '700' : '500' }}>
                                {t.label}
                              </span>
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Filter Mode Toggle (Highlight vs Isolate) */}
                <button
                  onClick={() => setFilterMode(filterMode === 'highlight' ? 'isolate' : 'highlight')}
                  title={filterMode === 'highlight' ? 'Mode Sorot: Redupkan node yang tidak cocok (klik untuk sembunyikan sepenuhnya)' : 'Mode Isolasi: Sembunyikan node non-target (klik untuk redupkan saja)'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: filterMode === 'isolate' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: filterMode === 'isolate' ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid var(--border-color)',
                    color: filterMode === 'isolate' ? '#f472b6' : 'var(--text-secondary)',
                    padding: '5px 9px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {filterMode === 'isolate' ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{filterMode === 'isolate' ? 'Isolasi' : 'Sorot'}</span>
                </button>

                {/* Reset Filter Button */}
                {isFilterActive && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedType('ALL');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Kembalikan semua filter ke awal"
                  >
                    <RotateCcw size={11} />
                    <span>Reset</span>
                  </button>
                )}

                {/* Match Result Stats Pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isFilterActive ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: isFilterActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '11px',
                  color: isFilterActive ? '#38bdf8' : 'var(--text-secondary)'
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isFilterActive ? '#38bdf8' : '#34d399',
                    boxShadow: isFilterActive ? '0 0 6px #38bdf8' : '0 0 6px #34d399',
                    display: 'inline-block'
                  }} />
                  {isFilterActive ? (
                    <span><strong>{filteredNodes.length}</strong> / {allNodes.length} cocok</span>
                  ) : (
                    <>
                      <span><strong>{graphData.stats.total_nodes}</strong> entitas</span>
                      <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                      <span><strong>{graphData.stats.total_edges}</strong> relasi</span>
                    </>
                  )}
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
                searchQuery={searchQuery}
                selectedType={selectedType}
                filterMode={filterMode}
                onSelectType={(type) => setSelectedType(type)}
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
