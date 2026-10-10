import React, { useState, useEffect, useRef } from 'react';
import { 
  Workflow, 
  Search, 
  Sparkles, 
  Layers, 
  Share2, 
  Zap, 
  FileText, 
  Database, 
  ScanFace, 
  UserCheck, 
  UserX, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Clock, 
  Cpu, 
  Loader2, 
  RefreshCw, 
  Sliders, 
  Image as ImageIcon, 
  X, 
  Play, 
  ChevronRight, 
  ChevronDown,
  Compass,
  Code,
  Plus,
  Trash2,
  Edit2,
  ShieldCheck,
  Check,
  ExternalLink,
  BookOpen,
  Filter,
  History,
  CheckCircle
} from 'lucide-react';
import api from '../api/client';
import FlowEditorModal from '../components/modals/FlowEditorModal';
import { ValidityBadge } from '../components/common/ValidityTierSelector';

const renderMarkdown = (text) => {
  if (!text) return null;
  
  // Allow optional whitespace/newlines between ] and (
  const imageRegex = /!\[([^\]]*)\]\s*\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    // Clean the src by removing all whitespaces and newlines that LLM might have added
    parts.push({ type: 'image', alt: match[1], src: match[2].replace(/\s+/g, '') });
    lastIndex = imageRegex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return parts.map((part, index) => {
    if (part.type === 'image') {
      return (
        <img 
          key={`img-${index}`} 
          src={part.src} 
          alt={part.alt} 
          style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', margin: '12px 0', display: 'block', objectFit: 'contain' }} 
        />
      );
    }
    
    const textContent = part.content;
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const subParts = [];
    let subLast = 0;
    let subMatch;
    
    while ((subMatch = boldRegex.exec(textContent)) !== null) {
      if (subMatch.index > subLast) {
        subParts.push(textContent.substring(subLast, subMatch.index));
      }
      subParts.push(<strong key={`bold-${index}-${subMatch.index}`} style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{subMatch[1]}</strong>);
      subLast = boldRegex.lastIndex;
    }
    
    if (subLast < textContent.length) {
      subParts.push(textContent.substring(subLast));
    }
    
    return <span key={`text-${index}`}>{subParts}</span>;
  });
};

export default function DataOrchestrator() {
  const [query, setQuery] = useState('Cari tanah atas nama indradhi nugraha mulyanto');
  const [strategy, setStrategy] = useState('hybrid');
  const [maxResults, setMaxResults] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [attachedImage, setAttachedImage] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [orchestrationData, setOrchestrationData] = useState(null);
  const [guidelinesData, setGuidelinesData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'flows', 'vectors', 'graph', 'tools', 'biometrics'

  // Tool execution testing state
  const [testingTool, setTestingTool] = useState(null);
  const [toolTestLoading, setToolTestLoading] = useState(false);
  const [toolTestResult, setToolTestResult] = useState(null);

  // LLM Synthesis state
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesizedAnswer, setSynthesizedAnswer] = useState(null);

  // Prompt Flow Memory state
  const [flows, setFlows] = useState([]);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState(null);
  const [prefillPrompt, setPrefillPrompt] = useState('');
  const [flowSearchQuery, setFlowSearchQuery] = useState('');
  const [flowCategoryFilter, setFlowCategoryFilter] = useState('all');
  const [flowTestingId, setFlowTestingId] = useState(null);
  const [flowTestResult, setFlowTestResult] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    // Run initial orchestration for demonstration
    handleRunOrchestration();
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    setFlowsLoading(true);
    try {
      const res = await api.get('/orchestrator/flows');
      setFlows(res.data?.flows || []);
    } catch (err) {
      console.error('Error fetching orchestration flows:', err);
    } finally {
      setFlowsLoading(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedImage(event.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRunOrchestration = async (customQuery) => {
    const q = typeof customQuery === 'string' ? customQuery : query;
    if (!q.trim() && !attachedImage) return;

    setLoading(true);
    setToolTestResult(null);
    setSynthesizedAnswer(null);

    try {
      // 1. Fetch Orchestrated Search from Multi-Source Engine
      const searchRes = await api.post('/knowledge/orchestrate-search', {
        query: q.trim() || 'Analyze attached image biometric face data',
        search_strategy: strategy,
        max_results: maxResults,
        source_types: selectedTypes.length > 0 ? selectedTypes : null,
        image_base64: attachedImage || null
      });
      setOrchestrationData(searchRes.data);

      // 2. Fetch Strategic Guidelines & Decision Matrix
      const guideRes = await api.get('/knowledge/orchestration-guidelines', {
        params: { query: q.trim(), include_catalog: true }
      });
      setGuidelinesData(guideRes.data);
    } catch (err) {
      console.error('Error running orchestration:', err);
      alert('Orchestration failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTool = async (tool) => {
    setTestingTool(tool.tool_name);
    setToolTestLoading(true);
    try {
      const res = await api.post(`/knowledge/api-tools/${tool.source_id}/execute`, {
        arguments: tool.suggested_arguments || {}
      });
      setToolTestResult({
        tool_name: tool.tool_name,
        data: res.data
      });
    } catch (err) {
      setToolTestResult({
        tool_name: tool.tool_name,
        error: err.response?.data?.detail || err.message
      });
    } finally {
      setToolTestLoading(false);
    }
  };

  const handleSynthesizeWithLLM = async () => {
    if (!query.trim() && !attachedImage) return;
    setSynthesizing(true);
    try {
      const res = await api.post('/chat', {
        message: query.trim() || 'Analyze and summarize findings',
        include_graph: ['hybrid', 'graph_only', 'comprehensive'].includes(strategy),
        top_k: maxResults,
        image_base64: attachedImage || null
      });
      setSynthesizedAnswer(res.data.answer);
    } catch (err) {
      setSynthesizedAnswer(`⚠️ Error generating answer: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSynthesizing(false);
    }
  };

  // Flow management operations
  const handleToggleFlowActive = async (flow) => {
    try {
      const res = await api.put(`/orchestrator/flows/${flow.id}`, {
        is_active: !flow.is_active
      });
      if (res.data?.success) {
        setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, is_active: !flow.is_active } : f));
      }
    } catch (err) {
      alert('Gagal mengubah status alur: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteFlow = async (flowId) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus alur perolehan informasi ini?')) return;
    try {
      await api.delete(`/orchestrator/flows/${flowId}`);
      setFlows(prev => prev.filter(f => f.id !== flowId));
      if (flowTestResult?.flow_id === flowId) {
        setFlowTestResult(null);
      }
    } catch (err) {
      alert('Gagal menghapus alur: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleResetDefaultFlows = async () => {
    if (!window.confirm('Reset semua alur perolehan ke template default bawaan sistem KPK?')) return;
    setFlowsLoading(true);
    try {
      const res = await api.post('/orchestrator/flows/seed');
      setFlows(res.data?.flows || []);
      alert(`Berhasil mereset template alur (${res.data?.flows?.length || 0} alur aktif).`);
    } catch (err) {
      alert('Gagal mereset template: ' + (err.response?.data?.detail || err.message));
    } finally {
      setFlowsLoading(false);
    }
  };

  const handleTestFlow = async (flow, customInput = null) => {
    setFlowTestingId(flow.id);
    setFlowTestResult(null);
    try {
      const testInput = customInput || query || flow.name;
      const res = await api.post(`/orchestrator/flows/${flow.id}/execute`, {
        query: testInput
      });
      setFlowTestResult({
        flow_id: flow.id,
        flow_name: flow.name,
        input_query: testInput,
        ...res.data
      });
      // Increment count locally
      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, execution_count: (f.execution_count || 0) + 1 } : f));
    } catch (err) {
      setFlowTestResult({
        flow_id: flow.id,
        flow_name: flow.name,
        error: err.response?.data?.detail || err.message
      });
    } finally {
      setFlowTestingId(null);
    }
  };

  const handleOpenCreateFlow = (promptToPrefill = '') => {
    setEditingFlow(null);
    setPrefillPrompt(promptToPrefill);
    setIsFlowModalOpen(true);
  };

  const handleOpenEditFlow = (flow) => {
    if (!flow) return;
    const actualFlow = flow.flow 
      ? { ...flow.flow, id: flow.flow?.id || flow.flow_id || flow.id } 
      : { ...flow, id: flow.id || flow.flow_id };
    setEditingFlow(actualFlow);
    setPrefillPrompt('');
    setIsFlowModalOpen(true);
  };

  const sampleQueries = [
    { label: 'Cari Tanah BPN (Tool)', q: 'Cari tanah atas nama indradhi nugraha mulyanto' },
    { label: 'Relasi Entitas Graph', q: 'Apa hubungan PT Pianaru dengan aset dan entitas terkait?' },
    { label: 'Regulasi Dokumen (Vector)', q: 'Jelaskan kebijakan regulasi pertanahan dan sertifikat' },
    { label: 'Profiling NIK Terpadu', q: 'Lakukan profiling lengkap NIK 3171012345670001' }
  ];

  const sourceTypesList = ['database', 'api', 'file', 'website'];

  const toggleType = (t) => {
    setSelectedTypes(prev => 
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  // Filtered flows for the Flow Memory tab
  const filteredFlows = flows.filter(f => {
    const matchesCat = flowCategoryFilter === 'all' || f.intent_category === flowCategoryFilter;
    const matchesQuery = !flowSearchQuery.trim() || 
      (f.name && f.name.toLowerCase().includes(flowSearchQuery.toLowerCase())) ||
      (f.prompt_pattern && f.prompt_pattern.toLowerCase().includes(flowSearchQuery.toLowerCase())) ||
      (f.trigger_keywords && f.trigger_keywords.some(k => k.toLowerCase().includes(flowSearchQuery.toLowerCase())));
    return matchesCat && matchesQuery;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 100px)' }}>
      {/* Top Banner & Header */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.12)'
          }}>
            <Workflow size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
              Data & Knowledge Orchestrator
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                background: 'var(--bg-glass-3)',
                color: 'var(--text-main)',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)'
              }}>
                MCP Engine
              </span>
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Unified routing, multi-source retrieval (ChromaDB + Neo4j + Live Tools), 4-tier data validity hierarchy, dan Prompt Flow Memory.
            </p>
          </div>
        </div>

        {/* Engine Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'var(--bg-glass-2)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontWeight: '600' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
            🧠 {flows.length} Alur Memori
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'var(--bg-glass-2)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontWeight: '600' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></span>
            ChromaDB Vectors
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'var(--bg-glass-2)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontWeight: '600' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
            Neo4j Graph
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-cyan)' }}></span>
            Dynamic Tools
          </span>
        </div>
      </div>

      {/* Control Console: Query & Parameters */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Main Input */}
          <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={14} /> Search Query / Prompt Uji Coba
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunOrchestration()}
                placeholder="Masukkan prompt atau pertanyaan untuk menguji routing dan alur..."
                style={{
                  width: '100%',
                  background: 'var(--bg-glass-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  color: 'var(--text-main)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Search Strategy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={14} /> Strategi Pencarian
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              style={{
                background: 'var(--bg-glass-3)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '12px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="hybrid">⚡ Hybrid (Vectors + Graph + Tools)</option>
              <option value="comprehensive">🌐 Comprehensive (All Sources)</option>
              <option value="semantic_only">📄 Semantic Vectors Only (ChromaDB)</option>
              <option value="graph_only">🕸️ Knowledge Graph Only (Neo4j)</option>
            </select>
          </div>

          {/* Top-K Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Top Chunks
            </label>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              style={{
                background: 'var(--bg-glass-3)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '12px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={3}>3 hasil</option>
              <option value={5}>5 hasil</option>
              <option value={10}>10 hasil</option>
              <option value={15}>15 hasil</option>
            </select>
          </div>

          {/* Run Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', opacity: 0 }}>Action</span>
            <button
              onClick={() => handleRunOrchestration()}
              disabled={loading || (!query.trim() && !attachedImage)}
              style={{
                padding: '12px 24px',
                borderRadius: '10px',
                background: loading ? 'var(--bg-glass-light)' : 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(15, 23, 42, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="#ffffff" />}
              Uji Orchestration
            </button>
          </div>
        </div>

        {/* Source Filter Chips & Image Attachment */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {/* Source Types Multi-Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Filter Sumber:</span>
            {sourceTypesList.map(st => {
              const active = selectedTypes.includes(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => toggleType(st)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: '600',
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    background: active ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-glass-light)',
                    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {st}
                </button>
              );
            })}
            {selectedTypes.length > 0 && (
              <button
                onClick={() => setSelectedTypes([])}
                style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '11px', cursor: 'pointer', padding: '0 4px' }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Optional Image Attachment for Biometrics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            {attachedImage ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99, 102, 241, 0.15)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                <img src={attachedImage} alt="Thumb" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-main)' }}>Foto Wajah Terlampir</span>
                <button onClick={() => setAttachedImage(null)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  background: 'var(--bg-glass-light)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <ImageIcon size={14} /> Lampirkan Foto Wajah
              </button>
            )}
          </div>
        </div>

        {/* Sample Query Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Contoh Prompt:</span>
          {sampleQueries.map((sq, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(sq.q);
                handleRunOrchestration(sq.q);
              }}
              style={{
                background: 'var(--bg-glass-light)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '4px 10px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.color = 'var(--text-main)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {sq.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Orchestration & Flow Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            background: activeTab === 'overview' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            border: activeTab === 'overview' ? '1px solid var(--accent-primary)' : '1px solid transparent',
            color: activeTab === 'overview' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Compass size={14} /> Overview & Decision Matrix
        </button>

        <button
          onClick={() => setActiveTab('flows')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            background: activeTab === 'flows' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            border: activeTab === 'flows' ? '1px solid var(--accent-primary)' : '1px solid transparent',
            color: activeTab === 'flows' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Workflow size={14} color="#818cf8" />
          Alur Perolehan (Memory) ({flows.length})
        </button>

        <button
          onClick={() => setActiveTab('vectors')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            background: activeTab === 'vectors' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
            border: activeTab === 'vectors' ? '1px solid var(--accent-emerald)' : '1px solid transparent',
            color: activeTab === 'vectors' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Layers size={14} /> Vector Chunks ({orchestrationData?.retrieved_documents?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            background: activeTab === 'graph' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            border: activeTab === 'graph' ? '1px solid #c084fc' : '1px solid transparent',
            color: activeTab === 'graph' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Share2 size={14} /> Graph Entities ({orchestrationData?.graph_entities?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('tools')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            background: activeTab === 'tools' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
            border: activeTab === 'tools' ? '1px solid var(--accent-cyan)' : '1px solid transparent',
            color: activeTab === 'tools' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Zap size={14} /> Real-Time Tools ({orchestrationData?.applicable_tools?.length || 0})
        </button>

        {orchestrationData?.biometric_face_result && (
          <button
            onClick={() => setActiveTab('biometrics')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              background: activeTab === 'biometrics' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              border: activeTab === 'biometrics' ? '1px solid #fbbf24' : '1px solid transparent',
              color: activeTab === 'biometrics' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <ScanFace size={14} /> Biometric Match
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB: FLOW MEMORY STUDIO (Alur Perolehan Informasi Terpandu) */}
      {/* ========================================================================= */}
      {activeTab === 'flows' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header & Actions */}
          <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Workflow size={20} color="#818cf8" />
                Alur Perolehan Informasi Terpandu (Prompt Flow Memory)
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Atur alur eksekusi bertahap (Tool Call, Graph, Vector, Sintesis) untuk pola prompt tertentu. Pola ini akan diingat oleh AI dan diaktifkan secara otomatis saat prompt serupa diajukan.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleResetDefaultFlows}
                disabled={flowsLoading}
                style={{
                  background: 'var(--bg-glass-light)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'var(--text-secondary)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={14} className={flowsLoading ? 'animate-spin' : ''} />
                Reset Template Default
              </button>

              <button
                onClick={() => handleOpenCreateFlow()}
                style={{
                  background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)'
                }}
              >
                <Plus size={16} />
                Buat Alur Baru
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={flowSearchQuery}
                onChange={(e) => setFlowSearchQuery(e.target.value)}
                placeholder="Cari alur berdasarkan nama, regex pattern, atau kata kunci..."
                style={{
                  width: '100%',
                  background: 'var(--bg-glass-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '8px 12px 8px 34px',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} color="var(--text-muted)" />
              <select
                value={flowCategoryFilter}
                onChange={(e) => setFlowCategoryFilter(e.target.value)}
                style={{
                  background: 'var(--bg-glass-3)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">Semua Kategori</option>
                <option value="profiling">Profiling</option>
                <option value="investigasi_aset">Investigasi Aset</option>
                <option value="korporasi">Korporasi</option>
                <option value="regulasi">Regulasi</option>
                <option value="umum">Umum</option>
              </select>
            </div>
          </div>

          {/* Flow Test Result Panel (if active) */}
          {flowTestResult && (
            <div className="glass-panel" style={{
              padding: '18px 20px',
              background: 'var(--bg-glass-1)',
              border: flowTestResult.error ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {flowTestResult.error ? (
                    <AlertCircle size={18} color="#ef4444" />
                  ) : (
                    <CheckCircle size={18} color="var(--accent-emerald)" />
                  )}
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
                    Hasil Uji Eksekusi Alur: {flowTestResult.flow_name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    (Query: "{flowTestResult.input_query}")
                  </span>
                </div>
                <button
                  onClick={() => setFlowTestResult(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              {flowTestResult.error ? (
                <div style={{ color: '#f87171', fontSize: '13px' }}>
                  {typeof flowTestResult.error === 'string' ? flowTestResult.error : JSON.stringify(flowTestResult.error)}
                </div>
              ) : (() => {
                const stepsList = flowTestResult.result?.steps || flowTestResult.steps || flowTestResult.execution_log || [];
                const totalSteps = flowTestResult.result?.total_steps || flowTestResult.total_steps || stepsList.length;
                const totalElapsed = flowTestResult.result?.total_elapsed_ms || flowTestResult.total_elapsed_ms || 0;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span>Status: <strong style={{ color: 'var(--accent-emerald)' }}>Sukses</strong></span>
                      <span>Total Langkah: <strong>{totalSteps}</strong></span>
                      <span>Durasi: <strong>{totalElapsed} ms</strong></span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                      {stepsList.map((log, lIdx) => (
                        <div key={lIdx} style={{
                          background: 'var(--bg-glass-3)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: log.status === 'success' ? 'var(--text-main)' : '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: '1px solid var(--border-subtle)'
                        }}>
                          <span style={{ color: 'var(--text-main)', fontWeight: '700' }}>{log.step || lIdx + 1}.</span>
                          <strong style={{ color: 'var(--accent-cyan)', textTransform: 'capitalize' }}>{log.action?.replace('_', ' ')}</strong>
                          <span style={{ color: 'var(--text-main)' }}>➔ {log.target}</span>
                          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: log.status === 'success' ? 'var(--accent-emerald)' : '#ef4444' }}>
                            <span>✓ {log.status}</span>
                            {log.elapsed_ms !== undefined && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({log.elapsed_ms}ms)</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Flows Grid */}
          {flowsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: 'var(--accent-primary)' }}>
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : filteredFlows.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Tidak ada alur perolehan yang cocok dengan pencarian atau filter kategori.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {filteredFlows.map(fl => {
                const isTestingThis = flowTestingId === fl.id;
                return (
                  <div
                    key={fl.id}
                    className="glass-panel"
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      border: fl.is_active ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                      opacity: fl.is_active ? 1 : 0.65,
                      transition: 'all 0.2s'
                    }}
                  >
                    {/* Flow Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>
                            {fl.name}
                          </h3>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            background: 'var(--bg-glass-3)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--accent-primary)',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            textTransform: 'capitalize'
                          }}>
                            {fl.intent_category || 'Umum'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Prioritas: <strong style={{ color: 'var(--accent-primary)' }}>{fl.validity_priority_rule || 'authoritative_first'}</strong>
                        </div>
                      </div>

                      {/* Active Toggle */}
                      <button
                        onClick={() => handleToggleFlowActive(fl)}
                        title={fl.is_active ? 'Nonaktifkan alur' : 'Aktifkan alur'}
                        style={{
                          background: fl.is_active ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-glass-light)',
                          border: `1px solid ${fl.is_active ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
                          color: fl.is_active ? 'var(--accent-emerald)' : 'var(--text-muted)',
                          padding: '4px 10px',
                          borderRadius: '14px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        {fl.is_active ? '● Aktif' : '○ Nonaktif'}
                      </button>
                    </div>

                    {/* Regex Pattern & Triggers */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--text-secondary)', width: '60px', fontWeight: '600' }}>Pattern:</span>
                        <code style={{ background: 'var(--bg-glass-2)', border: '1px solid var(--border-subtle)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-main)', fontWeight: '600', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
                          {fl.prompt_pattern || '-'}
                        </code>
                      </div>
                      {fl.trigger_keywords && fl.trigger_keywords.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-secondary)', width: '60px', fontWeight: '600' }}>Triggers:</span>
                          {fl.trigger_keywords.map((kw, kIdx) => (
                            <span key={kIdx} style={{ background: 'var(--bg-glass-2)', border: '1px solid var(--border-subtle)', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-main)', fontWeight: '500' }}>
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sequential Steps Preview */}
                    <div style={{
                      background: 'var(--bg-glass-3)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Alur Bertahap ({fl.steps?.length || 0} Langkah):
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {fl.steps?.map((st, sIdx) => {
                          const actionIcon = 
                            st.action === 'tool_call' ? '⚡' :
                            st.action === 'graph_traversal' ? '🕸️' :
                            st.action === 'vector_search' ? '📄' : '🧠';
                          return (
                            <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-main)' }}>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{sIdx + 1}.</span>
                              <span>{actionIcon}</span>
                              <strong style={{ color: 'var(--accent-primary)', textTransform: 'capitalize' }}>{st.action?.replace('_', ' ')}</strong>
                              <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>➔ {st.target}</span>
                              {st.required && (
                                <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.2)', color: '#dc2626', padding: '1px 4px', borderRadius: '4px', marginLeft: 'auto', fontWeight: '600' }}>
                                  WAJIB
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <History size={12} />
                        Dijalankan: {fl.execution_count || 0} kali
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleTestFlow(fl)}
                          disabled={isTestingThis}
                          title="Uji Eksekusi Alur"
                          style={{
                            background: 'var(--bg-glass-2)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-main)',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {isTestingThis ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                          Uji
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditFlow(fl)}
                          title="Sunting Alur"
                          style={{
                            background: 'var(--bg-glass-light)',
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            color: 'var(--text-main)',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Edit2 size={13} />
                          Sunting
                        </button>

                        <button
                          onClick={() => handleDeleteFlow(fl.id)}
                          title="Hapus Alur"
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ORCHESTRATION RESULTS (OVERVIEW, VECTORS, GRAPH, TOOLS, BIOMETRICS) */}
      {/* ========================================================================= */}
      {orchestrationData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Pipeline Summary Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Compass size={20} color="var(--accent-primary)" />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Strategi Aktif</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', textTransform: 'capitalize' }}>
                  {orchestrationData.strategy_applied}
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={20} color="var(--accent-emerald)" />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vector Documents</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent-emerald)' }}>
                  {orchestrationData.retrieved_documents?.length || 0} Chunks
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Share2 size={20} color="#c084fc" />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Graph Entities</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#c084fc' }}>
                  {orchestrationData.graph_entities?.length || 0} Entities
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={20} color="var(--accent-cyan)" />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Applicable Tools</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent-cyan)' }}>
                  {orchestrationData.applicable_tools?.length || 0} Tools Matched
                </div>
              </div>
            </div>

            {orchestrationData.biometric_face_result && (
              <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: orchestrationData.biometric_face_result.matched ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ScanFace size={20} color={orchestrationData.biometric_face_result.matched ? 'var(--accent-emerald)' : '#fbbf24'} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Biometric Match</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: orchestrationData.biometric_face_result.matched ? '#34d399' : '#fbbf24' }}>
                    {orchestrationData.biometric_face_result.matched ? `${orchestrationData.biometric_face_result.person_name} (${orchestrationData.biometric_face_result.confidence_percent}%)` : 'Unknown Face'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: OVERVIEW & SYNTHESIS */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Prompt Flow Memory Matched Banner */}
              {(() => {
                const matchedFlow = orchestrationData.matched_orchestration_flow || guidelinesData?.matched_orchestration_flow;
                if (matchedFlow) {
                  return (
                    <div className="glass-panel" style={{
                      padding: '18px 24px',
                      background: 'var(--bg-glass-1)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'var(--bg-glass-3)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Workflow size={18} color="var(--accent-primary)" />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>
                                {matchedFlow.name}
                              </span>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                background: 'var(--bg-glass-3)',
                                color: 'var(--text-main)',
                                border: '1px solid var(--border-subtle)',
                                padding: '2px 8px',
                                borderRadius: '10px'
                              }}>
                                {matchedFlow.intent_category || 'Flow Memory'}
                              </span>
                              <span style={{
                                fontSize: '11px',
                                background: 'rgba(5, 150, 105, 0.1)',
                                color: 'var(--accent-emerald)',
                                border: '1px solid rgba(5, 150, 105, 0.25)',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontWeight: '600'
                              }}>
                                ✓ Alur Terdaftar Aktif
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Aturan Prioritas Validitas: <strong style={{ color: 'var(--accent-cyan)' }}>{matchedFlow.validity_priority_rule || 'authoritative_first'}</strong>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenEditFlow(matchedFlow)}
                            style={{
                              background: 'var(--bg-glass-2)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-main)',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit2 size={13} /> Sunting Alur
                          </button>
                          <button
                            onClick={() => handleTestFlow(matchedFlow)}
                            disabled={flowTestingId === matchedFlow.id}
                            style={{
                              background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                              border: '1px solid rgba(255, 255, 255, 0.16)',
                              color: '#ffffff',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
                              cursor: 'pointer'
                            }}
                          >
                            {flowTestingId === matchedFlow.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="#ffffff" />}
                            Uji Alur Ini
                          </button>
                        </div>
                      </div>

                      {/* Steps preview */}
                      {matchedFlow.steps && matchedFlow.steps.length > 0 && (
                        <div style={{
                          background: 'var(--bg-glass-2)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Tahapan Perolehan Terpandu ({matchedFlow.steps.length} Langkah):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            {matchedFlow.steps.map((st, sIdx) => (
                              <React.Fragment key={sIdx}>
                                <div style={{
                                  background: 'var(--bg-glass-3)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '6px',
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}>
                                  <span style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#334155',
                                    color: '#ffffff',
                                    fontSize: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '700'
                                  }}>
                                    {st.order || sIdx + 1}
                                  </span>
                                  <strong style={{ color: 'var(--text-main)', textTransform: 'capitalize' }}>
                                    {st.action?.replace('_', ' ')}
                                  </strong>
                                  <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '11px' }}>
                                    {st.target}
                                  </span>
                                  {st.required && (
                                    <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.2)', color: '#dc2626', padding: '1px 4px', borderRadius: '4px', fontWeight: '600' }}>
                                      WAJIB
                                    </span>
                                  )}
                                </div>
                                {sIdx < matchedFlow.steps.length - 1 && (
                                  <ArrowRight size={12} color="var(--text-muted)" />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                } else if (query.trim()) {
                  return (
                    <div className="glass-panel" style={{
                      padding: '12px 18px',
                      background: 'var(--bg-glass-2)',
                      border: '1px dashed var(--border-subtle)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <Workflow size={16} color="var(--text-muted)" />
                        <span>Belum ada alur perolehan spesifik yang cocok untuk pola prompt ini.</span>
                      </div>
                      <button
                        onClick={() => handleOpenCreateFlow(query.trim())}
                        style={{
                          background: 'var(--bg-glass-2)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plus size={13} /> Simpan Alur untuk Prompt Ini
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Strategic Decision Matrix & Guidelines */}
              {guidelinesData?.query_recommendations && (
                <div className="glass-panel" style={{ padding: '18px 24px', background: 'var(--bg-glass-1)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={18} color="var(--accent-cyan)" />
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
                        AI Routing Decision & Intent Classification
                      </span>
                    </div>
                    <span style={{
                      background: 'var(--bg-glass-3)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      Strategi Intent: {guidelinesData.query_recommendations.suggested_strategy.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: '12px' }}>
                    <strong>Rekomendasi Tindakan:</strong> {guidelinesData.query_recommendations.recommended_action}
                  </div>

                  {/* Matched Tools Pills */}
                  {guidelinesData.query_recommendations.recommended_tools?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-Matched Tool:</span>
                      {guidelinesData.query_recommendations.recommended_tools.map((mt, idx) => (
                        <div key={idx} style={{
                          background: 'var(--bg-glass-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          color: 'var(--text-main)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Zap size={13} color="var(--accent-cyan)" />
                          <strong>{mt.tool_name}</strong>
                          {mt.suggested_arguments && Object.keys(mt.suggested_arguments).length > 0 && (
                            <span style={{ opacity: 0.8, fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>
                              ({JSON.stringify(mt.suggested_arguments)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Guidelines & Live LLM Synthesis Side by Side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {/* Guidelines List */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="var(--accent-primary)" />
                    AI Synthesis Directives (Anti-Hallucination & Validitas)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {orchestrationData.ai_synthesis_guidelines?.map((guide, gIdx) => (
                      <div key={gIdx} style={{ display: 'flex', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>•</span>
                        <span>{guide}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live LLM Synthesis Runner */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Cpu size={16} color="var(--accent-cyan)" />
                      Grounded AI Response Synthesis
                    </h3>
                    <button
                      onClick={handleSynthesizeWithLLM}
                      disabled={synthesizing}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.16)',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: synthesizing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                      }}
                    >
                      {synthesizing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="#ffffff" />}
                      Sintesis dengan LLM
                    </button>
                  </div>

                  <div style={{
                    flex: 1,
                    background: 'var(--bg-glass-3)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    padding: '14px',
                    fontSize: '13px',
                    color: synthesizedAnswer ? 'var(--text-main)' : 'var(--text-muted)',
                    lineHeight: '1.6',
                    minHeight: '180px',
                    maxHeight: '340px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {synthesizing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-primary)', padding: '20px 0' }}>
                        <Loader2 size={18} className="animate-spin" />
                        Mensintesis jawaban berbasis hierarki validitas dan alur memori...
                      </div>
                    ) : synthesizedAnswer ? (
                      renderMarkdown(synthesizedAnswer)
                    ) : (
                      "Klik 'Sintesis dengan LLM' untuk membuat jawaban yang berpijak pada data terverifikasi, graph entitas, dan tool resmi."
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VECTOR DOCUMENTS */}
          {activeTab === 'vectors' && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '14px' }}>
                Retrieved Vector Chunks from ChromaDB ({orchestrationData.retrieved_documents?.length || 0})
              </h3>
              {orchestrationData.retrieved_documents?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Tidak ada vector chunks yang cocok dengan query ini.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {orchestrationData.retrieved_documents?.map((doc, dIdx) => (
                    <div key={dIdx} style={{ background: 'var(--bg-glass-2)', borderRadius: '10px', border: '1px solid var(--border-subtle)', padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '14px' }}>
                            {doc.source_name} ({doc.source_type})
                          </span>
                          <ValidityBadge tier={doc.validity_tier} score={doc.validity_score} />
                        </div>
                        <span style={{ background: 'rgba(5, 150, 105, 0.1)', color: 'var(--accent-emerald)', border: '1px solid rgba(5, 150, 105, 0.25)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                          Hybrid Score: {doc.hybrid_score !== undefined ? doc.hybrid_score : doc.score}
                        </span>
                      </div>
                      {doc.validity_notes && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontStyle: 'italic' }}>
                          ℹ️ {doc.validity_notes}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto', lineHeight: '1.5', background: 'var(--bg-glass-3)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                        {doc.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GRAPH ENTITIES */}
          {activeTab === 'graph' && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '14px' }}>
                Connected Knowledge Graph Entities ({orchestrationData.graph_entities?.length || 0})
              </h3>
              {orchestrationData.graph_entities?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Tidak ada entitas yang terhubung di Neo4j untuk query ini.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                  {orchestrationData.graph_entities?.map((ent, eIdx) => (
                    <div key={eIdx} style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '10px', padding: '14px' }}>
                      <div style={{ fontWeight: '700', color: '#e9d5ff', fontSize: '14px', marginBottom: '4px' }}>
                        {ent.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#c084fc', marginBottom: '8px' }}>
                        Type: {ent.type}
                      </div>
                      {ent.connections && ent.connections.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                          {ent.connections.map((c, cIdx) => (
                            <span key={cIdx} style={{ fontSize: '10px', background: 'var(--bg-glass-light)', color: 'var(--text-main)', padding: '2px 6px', borderRadius: '4px' }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REAL-TIME TOOLS */}
          {activeTab === 'tools' && (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>
                Applicable Real-Time AI Tools ({orchestrationData.applicable_tools?.length || 0})
              </h3>
              {orchestrationData.applicable_tools?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Tidak ada tools real-time yang cocok dengan query ini.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {orchestrationData.applicable_tools?.map((tool, tIdx) => (
                    <div key={tIdx} style={{ background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '15px', fontFamily: 'JetBrains Mono, monospace' }}>
                              ⚡ {tool.tool_name}
                            </span>
                            <ValidityBadge tier={tool.validity_tier || 'authoritative'} score={tool.validity_score || 95} />
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {tool.title} ({tool.source_type})
                          </div>
                        </div>

                        <button
                          onClick={() => handleExecuteTool(tool)}
                          disabled={toolTestLoading && testingTool === tool.tool_name}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.16)',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                          }}
                        >
                          {toolTestLoading && testingTool === tool.tool_name ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} fill="#ffffff" />
                          )}
                          Eksekusi Live Tool
                        </button>
                      </div>

                      {tool.suggested_arguments && Object.keys(tool.suggested_arguments).length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Argumen Terdeteksi Otomatis:</span>
                          <code style={{ marginLeft: '8px', background: 'var(--bg-glass-2)', border: '1px solid var(--border-subtle)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-main)', fontSize: '11px', fontWeight: '600' }}>
                            {JSON.stringify(tool.suggested_arguments)}
                          </code>
                        </div>
                      )}

                      {/* Tool Output Preview */}
                      {toolTestResult && toolTestResult.tool_name === tool.tool_name && (
                        <div style={{ marginTop: '12px', background: 'var(--bg-glass-3)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-emerald)', marginBottom: '6px' }}>
                            Output Eksekusi Langsung:
                          </div>
                          <pre style={{ margin: 0, fontSize: '11px', color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', maxHeight: '180px', overflowY: 'auto' }}>
                            {JSON.stringify(toolTestResult.data || toolTestResult.error, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: BIOMETRIC MATCH */}
          {activeTab === 'biometrics' && orchestrationData.biometric_face_result && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '14px' }}>
                Biometric Facial Recognition Matching
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                {orchestrationData.biometric_face_result.input_face_thumbnail && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <img
                      src={orchestrationData.biometric_face_result.input_face_thumbnail}
                      alt="Input Face"
                      style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', border: '2px solid rgba(56, 189, 248, 0.6)' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '600' }}>Crop Wajah Input</span>
                  </div>
                )}

                {orchestrationData.biometric_face_result.matched && (
                  <>
                    <div style={{ fontSize: '18px', color: 'var(--accent-emerald)' }}>➔ MATCH</div>

                    {orchestrationData.biometric_face_result.matched_face_thumbnail && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <img
                          src={orchestrationData.biometric_face_result.matched_face_thumbnail}
                          alt="Enrolled Face"
                          style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', border: '2px solid rgba(52, 211, 153, 0.6)' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--accent-emerald)', fontWeight: '600' }}>Foto Terdaftar</span>
                      </div>
                    )}

                    <div style={{ marginLeft: '12px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>
                        {orchestrationData.biometric_face_result.person_name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        ID Person: <strong style={{ color: 'var(--text-main)' }}>{orchestrationData.biometric_face_result.person_id}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Departemen: <span style={{ color: 'var(--text-main)' }}>{orchestrationData.biometric_face_result.department}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--accent-emerald)', marginTop: '4px', fontWeight: '600' }}>
                        Confidence: {orchestrationData.biometric_face_result.confidence_percent}%
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Flow Editor Modal */}
      {isFlowModalOpen && (
        <FlowEditorModal
          isOpen={isFlowModalOpen}
          flow={editingFlow}
          initialFlow={editingFlow}
          defaultPrompt={prefillPrompt}
          onClose={() => {
            setIsFlowModalOpen(false);
            setEditingFlow(null);
            setPrefillPrompt('');
          }}
          onSuccess={() => {
            setIsFlowModalOpen(false);
            setEditingFlow(null);
            setPrefillPrompt('');
            fetchFlows();
          }}
          onSaved={() => {
            setIsFlowModalOpen(false);
            setEditingFlow(null);
            setPrefillPrompt('');
            fetchFlows();
          }}
        />
      )}
    </div>
  );
}
