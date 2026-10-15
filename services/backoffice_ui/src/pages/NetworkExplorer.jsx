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
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import api from '../api/client';
import CytoscapeGraph from '../components/graph/CytoscapeGraph';
import EntityProfilePanel from '../components/graph/EntityProfilePanel';
import PathFinderPanel from '../components/graph/PathFinderPanel';

const ENTITY_TYPES = [
  { id: 'ALL', label: 'Semua Tipe', color: '#94a3b8' },
  { id: 'ORANG', label: 'Orang / Individu', color: '#6366f1' },
  { id: 'PERUSAHAAN', label: 'Organisasi / Korporasi', color: '#06b6d4' },
  { id: 'DOKUMEN', label: 'Dokumen', color: '#ec4899' },
  { id: 'ASET', label: 'Aset / Tanah / Ranmor', color: '#f59e0b' },
  { id: 'LOKASI', label: 'Lokasi / Wilayah', color: '#10b981' },
  { id: 'REKENING', label: 'Rekening Bank', color: '#eab308' },
  { id: 'NAMA', label: 'Nama Lengkap', color: '#3b82f6' },
  { id: 'DATABASE_RECORD', label: 'Data Record', color: '#14b8a6' },
  { id: 'API_ENDPOINT', label: 'API Endpoint', color: '#f97316' },
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
  const [remapStatus, setRemapStatus] = useState(null);

  // Test Mapping Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testMappingType, setTestMappingType] = useState('Pemetaan Orang');
  const [testMappingResult, setTestMappingResult] = useState(null);
  const [isTestMappingLoading, setIsTestMappingLoading] = useState(false);

  const layoutDropdownRef = useRef(null);
  const typeDropdownRef = useRef(null);
  const searchContainerRef = useRef(null);

  useEffect(() => {
    fetchGraph();
    fetchMetrics();
    fetchInsights();
  }, []);

  // Poll for remap status in the background
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get('/graph/remap/status');
        setRemapStatus(res.data);
        
        setIsRemapping(prev => {
          if (res.data.is_running && !prev) {
            return true;
          } else if (!res.data.is_running && prev) {
            // Finished running! Refresh graph data automatically
            fetchGraph();
            fetchMetrics();
            fetchInsights();
            if (res.data.last_result?.status === 'error' || res.data.status?.toLowerCase().includes('error')) {
              alert(`Pemberitahuan Remapping:\n${res.data.last_result?.message || res.data.status}`);
            }
            return false;
          }
          return prev;
        });
      } catch (err) {
        console.error('Error fetching remap status:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
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
      await api.post('/graph/remap?clear_existing=true');
      alert(`Proses re-mapping dimulai di background. Indikator di pojok kanan atas akan menunjukkan statusnya.`);
    } catch (err) {
      console.error('Error remapping graph:', err);
      alert('Gagal melakukan re-mapping. Silakan periksa log server.');
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
      await api.post('/graph/remap?clear_existing=false');
      alert(`Mapping lanjutan dimulai di background. Indikator di atas akan menunjukkan statusnya.`);
    } catch (err) {
      console.error('Error continuing mapping:', err);
      alert('Gagal melanjutkan mapping.');
      setIsRemapping(false);
    }
  };

  const handleTestMapping = () => {
    setTestMappingResult(null);
    setShowTestModal(true);
  };

  const executeTestMapping = async () => {
    try {
      setIsTestMappingLoading(true);
      const res = await api.post('/graph/test-mapping', { mapping_type: testMappingType });
      setTestMappingResult(res.data);
    } catch (err) {
      console.error('Error test mapping:', err);
      alert('Gagal melakukan test mapping.');
    } finally {
      setIsTestMappingLoading(false);
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
          <h1 style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
            Data Network & Relation Profiler
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
            Multi-hop relational network graph, centrality profiling, and algorithmic reasoning insights
          </p>
        </div>

        {/* Actions & Tab Switcher */}
        <div className="flex items-center gap-3">
          {/* Graph Action Buttons Group */}
          <div className="flex items-center gap-2 bg-base-200/90 border border-base-300 p-1.5 rounded-xl shadow-sm">
            {isRemapping && remapStatus && (
              <div className="text-xs font-bold text-warning px-2 flex items-center gap-1.5 animate-pulse">
                 <RefreshCw size={13} className="spin-animation" />
                 {remapStatus.status} 
                 {remapStatus.progress?.total > 0 && ` (${remapStatus.progress.current}/${remapStatus.progress.total})`}
              </div>
            )}
            {!isRemapping && remapStatus?.status?.toLowerCase().includes('error') && (
              <div className="text-xs font-bold text-error px-2 flex items-center gap-1.5" title={remapStatus.last_error || remapStatus.status}>
                 <AlertCircle size={13} /> Gagal: {remapStatus.status.replace(/^Error:\s*/i, '')}
              </div>
            )}
            {!isRemapping && remapStatus?.status?.toLowerCase().includes('aborted') && (
              <div className="text-xs font-bold text-warning px-2 flex items-center gap-1.5" title={remapStatus.last_result?.message || remapStatus.status}>
                 <AlertCircle size={13} /> {remapStatus.status}
              </div>
            )}
            {!isRemapping && !remapStatus?.status?.toLowerCase().includes('error') && !remapStatus?.status?.toLowerCase().includes('aborted') && (
              <div className="text-xs font-bold text-success px-2 flex items-center gap-1.5">
                 <Check size={13} /> {remapStatus?.status === 'Completed' ? `Grafik Siap (${remapStatus.progress?.entities || allNodes.length} entitas, ${remapStatus.progress?.relationships || allEdges.length} relasi)` : 'Grafik Siap'}
              </div>
            )}
            <button
              onClick={handleClearGraph}
              disabled={loading || isRemapping}
              className="btn btn-xs btn-error btn-outline"
              title="Hapus semua graph"
            >
              <X size={13} />
              Clear Graph
            </button>
            <button
              onClick={handleRemapGraph}
              disabled={isRemapping}
              className="btn btn-xs btn-warning btn-outline"
              title="Re-map ulang (menghapus yang lama)"
            >
              <RefreshCw size={13} className={isRemapping ? 'spin-animation' : ''} />
              Remap Graph
            </button>
            <button
              onClick={handleContinueMapping}
              disabled={isRemapping}
              className="btn btn-xs btn-success btn-outline"
              title="Lanjutkan mapping tanpa menghapus yang ada"
            >
              <Layers size={13} />
              Continue Mapping
            </button>
            <button
              onClick={handleTestMapping}
              disabled={isRemapping}
              className="btn btn-xs btn-info btn-outline"
              title="Test pembuatan graph"
            >
              <Sparkles size={13} />
              Test Mapping
            </button>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center gap-1 bg-base-200/90 border border-base-300 p-1 rounded-xl shadow-sm">
            <button
              onClick={() => setActiveTab('graph')}
              className={`btn btn-sm border-none ${activeTab === 'graph' ? 'btn-primary shadow-sm' : 'btn-ghost text-base-content/70 hover:text-base-content'}`}
            >
              <Network size={15} /> Graph View
            </button>
            <button
              onClick={() => setActiveTab('path')}
              className={`btn btn-sm border-none ${activeTab === 'path' ? 'btn-primary shadow-sm' : 'btn-ghost text-base-content/70 hover:text-base-content'}`}
            >
              <Route size={15} /> Path Finder
            </button>
            <button
              onClick={() => setActiveTab('insights')}
              className={`btn btn-sm border-none ${activeTab === 'insights' ? 'btn-primary shadow-sm' : 'btn-ghost text-base-content/70 hover:text-base-content'}`}
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
            <div className="px-4 py-3 border-b border-base-300 flex justify-between items-center bg-base-200/80 backdrop-blur-md z-20">
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
                    <div className="absolute top-[calc(100%+6px)] left-0 w-72 bg-base-100 border border-base-300 rounded-xl shadow-2xl p-2 z-50 max-h-64 overflow-y-auto">
                      <div className="px-2 py-1 text-[10px] font-bold text-base-content/60 uppercase border-b border-base-200 mb-1">
                        Saran Hasil ({filteredNodes.length})
                      </div>
                      {filteredNodes.length === 0 ? (
                        <div className="p-3 text-xs text-base-content/50 text-center">
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
                              className="px-2 py-1.5 rounded-lg cursor-pointer flex items-center justify-between gap-2 hover:bg-base-200 transition-colors"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeMeta.color, flexShrink: 0 }} />
                                <span className="text-xs font-semibold text-base-content truncate">
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
                    className="flex items-center gap-1.5 bg-base-200 border border-base-300 text-base-content px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm hover:border-base-content/20 transition-all"
                  >
                    <Filter size={12} color={selectedType !== 'ALL' ? activeTypeObj.color : 'currentColor'} />
                    <span>Tipe: <strong>{activeTypeObj.label.split('/')[0].trim()}</strong></span>
                    {selectedType !== 'ALL' && (
                      <span style={{ fontSize: '10px', background: activeTypeObj.color, color: '#fff', borderRadius: '10px', padding: '0 5px', fontWeight: '800' }}>
                        {filteredNodes.length}
                      </span>
                    )}
                    <ChevronDown size={12} className={`transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
                  </button>

                  {/* Type Filter Popover Menu */}
                  {isTypeDropdownOpen && (
                    <div className="absolute top-[calc(100%+6px)] left-0 w-60 bg-base-100 border border-base-300 rounded-xl shadow-2xl p-2 z-50">
                      <div className="px-2 py-1 text-[10px] font-bold text-base-content/60 uppercase border-b border-base-200 mb-1">
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
                            className={`px-2 py-1.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                              isSelected ? 'bg-base-300 font-bold' : 'hover:bg-base-200 font-medium'
                            }`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.color }} />
                              <span className="text-base-content">
                                {t.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-base-content/60 bg-base-200 px-1.5 py-0.5 rounded">
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
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border shadow-sm transition-all ${
                    filterMode === 'isolate' 
                      ? 'bg-secondary/15 border-secondary text-secondary' 
                      : 'bg-base-200 border-base-300 text-base-content/70 hover:text-base-content hover:border-base-content/20'
                  }`}
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
                    className="btn btn-xs btn-error btn-outline"
                    title="Kembalikan semua filter ke awal"
                  >
                    <RotateCcw size={11} />
                    <span>Reset</span>
                  </button>
                )}

                {/* Match Result Stats Pill */}
                <div className="flex items-center gap-1.5 bg-base-200 border border-base-300 px-2.5 py-1 rounded-lg text-xs font-medium text-base-content shadow-sm">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${isFilterActive ? 'bg-info shadow-[0_0_6px_var(--color-info)]' : 'bg-success shadow-[0_0_6px_var(--color-success)]'}`} />
                  {isFilterActive ? (
                    <span><strong>{filteredNodes.length}</strong> / {allNodes.length} cocok</span>
                  ) : (
                    <>
                      <span><strong>{graphData.stats.total_nodes}</strong> entitas</span>
                      <span className="opacity-40">·</span>
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
                <div className="flex items-center bg-base-200 border border-base-300 p-1 rounded-lg gap-1">
                  {NETWORK_LAYOUTS.slice(0, 3).map((l) => {
                    const isSelected = layoutName === l.id;
                    const IconComp = l.icon;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setLayoutName(l.id)}
                        title={l.description}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-content shadow-sm'
                            : 'text-base-content/70 hover:bg-base-300/60 hover:text-base-content'
                        }`}
                      >
                        <IconComp size={12} color={isSelected ? 'currentColor' : l.accent} />
                        {l.shortName}
                      </button>
                    );
                  })}
                </div>

                {/* Main Custom Layout Dropdown Selector */}
                <div ref={layoutDropdownRef} className="relative">
                  <button
                    onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
                    className="flex items-center gap-2 bg-base-200 border border-base-300 hover:border-base-content/20 text-base-content px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer shadow-sm transition-all"
                  >
                    <div 
                      className="w-5 h-5 rounded flex items-center justify-center"
                      style={{ background: `${activeLayout.accent}25` }}
                    >
                      <ActiveLayoutIcon size={12} color={activeLayout.accent} />
                    </div>
                    <span className="font-semibold">{activeLayout.name}</span>
                    <span 
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{
                        background: activeLayout.tagBg,
                        color: activeLayout.tagColor
                      }}
                    >
                      {activeLayout.tag}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-base-content/60 transition-transform duration-200 ${isLayoutDropdownOpen ? 'rotate-180' : 'rotate-0'}`}
                    />
                  </button>

                  {/* Popover Dropdown Menu */}
                  {isLayoutDropdownOpen && (
                    <div className="absolute top-[calc(100%+8px)] right-0 w-[370px] bg-base-100 border border-base-300 rounded-2xl shadow-2xl p-3 z-50 animate-fadeIn">
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
                          background: 'var(--bg-glass-light)',
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
                                background: isSelected ? `${l.accent}18` : 'var(--bg-glass-light)',
                                border: isSelected ? `1px solid ${l.accent}60` : '1px solid transparent',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = 'var(--bg-glass-light)';
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = 'var(--bg-glass-light)';
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
                                  <span style={{ fontSize: '13px', fontWeight: isSelected ? '700' : '600', color: isSelected ? 'var(--text-main)' : '#e2e8f0' }}>
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
                <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />

                {/* Reload Button */}
                <button
                  onClick={fetchGraph}
                  style={{
                    background: 'var(--bg-glass-light)',
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
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'; }}
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
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>Network Profiling Insights</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Continuous algorithmic synthesis of hub authority, communities, and cross-silo data relationships.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {insights.map((ins, i) => (
              <div key={i} style={{
                padding: '20px',
                borderRadius: '12px',
                background: 'var(--bg-glass-light)',
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
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '8px' }}>
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

      {/* Test Mapping Modal */}
      {showTestModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--bg-glass-3)', backdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg-dark-1)', border: '1px solid var(--border-subtle)', borderRadius: '12px',
            width: '800px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="var(--accent-primary)" /> Test Pemetaan Otomatis (LLM)
              </h3>
              <button onClick={() => setShowTestModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!testMappingResult ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>Pilih Jenis Mapping:</label>
                    <select 
                      value={testMappingType}
                      onChange={(e) => setTestMappingType(e.target.value)}
                      style={{
                        padding: '10px 12px', background: 'var(--bg-glass-2)', border: '1px solid var(--border-subtle)', borderRadius: '8px',
                        color: 'var(--text-main)', fontSize: '14px', outline: 'none'
                      }}
                    >
                      <option value="Pemetaan Orang" style={{ background: 'var(--bg-dark-1)', color: 'var(--text-main)' }}>Pemetaan Orang</option>
                      <option value="Perusahaan" style={{ background: 'var(--bg-dark-1)', color: 'var(--text-main)' }}>Perusahaan</option>
                      <option value="Komunikasi" style={{ background: 'var(--bg-dark-1)', color: 'var(--text-main)' }}>Komunikasi</option>
                      <option value="Data Bank" style={{ background: 'var(--bg-dark-1)', color: 'var(--text-main)' }}>Data Bank</option>
                    </select>
                  </div>
                  
                  <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.5' }}>
                      Mode ini akan mengambil salah satu sampel potongan teks (chunk) dari Vector DB yang relevan dengan tipe di atas, kemudian mengekstrak Entitas (Nodes) dan Relasinya (Edges) menggunakan AI tanpa menyimpannya ke database Neo4j.
                    </p>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                   {/* Source Data */}
                   <div>
                     <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Sumber Data Teks (Chunk):</h4>
                     <div style={{ background: 'var(--bg-glass-3)', padding: '12px', borderRadius: '8px', fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-subtle)' }}>
                       {testMappingResult.source_data}
                     </div>
                   </div>
                   
                   {/* Extracted Nodes */}
                   <div>
                     <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--accent-emerald)' }}>Entitas (Nodes) yang Ditemukan ({testMappingResult.entities.length}):</h4>
                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                       {testMappingResult.entities.length === 0 ? <span style={{fontSize:'12px', color:'var(--text-muted)'}}>Tidak ada entitas ditemukan.</span> : testMappingResult.entities.map((ent, idx) => (
                         <div key={idx} style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                           <strong style={{ color: 'var(--text-main)' }}>{ent.name || ent.id}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({ent.type})</span>
                         </div>
                       ))}
                     </div>
                   </div>
                   
                   {/* Extracted Edges */}
                   <div>
                     <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--accent-amber, #d97706)' }}>Relasi (Edges) yang Ditemukan ({testMappingResult.relationships.length}):</h4>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                       {testMappingResult.relationships.length === 0 ? <span style={{fontSize:'12px', color:'var(--text-muted)'}}>Tidak ada relasi ditemukan.</span> : testMappingResult.relationships.map((rel, idx) => (
                         <div key={idx} style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <span style={{ color: 'var(--text-main)' }}>{rel.source}</span>
                           <span style={{ color: '#d97706', fontSize: '10px', background: 'rgba(251, 191, 36, 0.2)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{rel.relation || rel.type}</span>
                           <span style={{ color: 'var(--text-main)' }}>{rel.target}</span>
                         </div>
                       ))}
                     </div>
                   </div>

                   {/* Graph Visualization */}
                   <div>
                     <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-main)' }}>Visualisasi Graph:</h4>
                     <div style={{ background: 'var(--bg-glass-3)', border: '1px solid var(--border-subtle)', borderRadius: '8px', height: '300px', overflow: 'hidden', position: 'relative' }}>
                       <CytoscapeGraph 
                         elements={[
                           ...(testMappingResult.entities.map(ent => ({
                             data: {
                               id: ent.name || ent.id,
                               label: ent.name || ent.id,
                               type: (ent.type || 'OTHER').toUpperCase()
                             }
                           }))),
                           ...(testMappingResult.relationships.map((rel, idx) => ({
                             data: {
                               id: `test_rel_${idx}`,
                               source: rel.source,
                               target: rel.target,
                               label: rel.relation || rel.type || ''
                             }
                           })))
                         ]}
                         layoutName="cose"
                       />
                     </div>
                   </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              {testMappingResult ? (
                <button
                  onClick={() => setTestMappingResult(null)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}
                >
                  Uji Ulang
                </button>
              ) : (
                <button
                  onClick={() => setShowTestModal(false)}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                >
                  Batal
                </button>
              )}
              
              {!testMappingResult && (
                <button
                  onClick={executeTestMapping}
                  disabled={isTestMappingLoading}
                  className="btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', opacity: isTestMappingLoading ? 0.7 : 1 }}
                >
                  {isTestMappingLoading ? 'Memproses LLM...' : 'Eksekusi Mapping'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
