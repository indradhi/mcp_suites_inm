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
  Code
} from 'lucide-react';
import api from '../api/client';

export default function DataOrchestrator() {
  const [query, setQuery] = useState('Cari tanah atas nama indradhi nugraha mulyanto');
  const [strategy, setStrategy] = useState('hybrid');
  const [maxResults, setMaxResults] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [attachedImage, setAttachedImage] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [orchestrationData, setOrchestrationData] = useState(null);
  const [guidelinesData, setGuidelinesData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'vectors', 'graph', 'tools', 'biometrics'

  // Tool execution testing state
  const [testingTool, setTestingTool] = useState(null);
  const [toolTestLoading, setToolTestLoading] = useState(false);
  const [toolTestResult, setToolTestResult] = useState(null);

  // LLM Synthesis state
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesizedAnswer, setSynthesizedAnswer] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    // Run initial orchestration for demonstration
    handleRunOrchestration();
  }, []);

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

  const sampleQueries = [
    { label: 'Cari Tanah BPN (Tool)', q: 'Cari tanah atas nama indradhi nugraha mulyanto' },
    { label: 'Relasi Entitas Graph', q: 'Apa hubungan PT Pianaru dengan aset dan entitas terkait?' },
    { label: 'Regulasi Dokumen (Vector)', q: 'Jelaskan kebijakan regulasi pertanahan dan sertifikat' },
    { label: 'Status Pengetahuan Terkini', q: 'Bagaimana status sinkronisasi seluruh Knowledge Sources?' }
  ];

  const sourceTypesList = ['database', 'api', 'file', 'website'];

  const toggleType = (t) => {
    setSelectedTypes(prev => 
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 'calc(100vh - 100px)' }}>
      {/* Top Banner & Header */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 18px rgba(99, 102, 241, 0.4)'
          }}>
            <Workflow size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
              Data & Knowledge Orchestrator
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#a5b4fc',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(99, 102, 241, 0.4)'
              }}>
                MCP Engine
              </span>
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Unified routing, multi-source retrieval (ChromaDB + Neo4j + Live Tools + Biometrics), and AI guideline synthesis.
            </p>
          </div>
        </div>

        {/* Engine Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></span>
            ChromaDB Vectors
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c084fc' }}></span>
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
              <Search size={14} /> Search Query / Intent
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunOrchestration()}
                placeholder="Enter query or question to test orchestration routing..."
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  color: '#ffffff',
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
              <Sliders size={14} /> Search Strategy
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-color)',
                color: '#ffffff',
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
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-color)',
                color: '#ffffff',
                padding: '12px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={3}>3 results</option>
              <option value={5}>5 results</option>
              <option value={10}>10 results</option>
              <option value={15}>15 results</option>
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
                background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                border: 'none',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)',
                transition: 'all 0.2s'
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="#ffffff" />}
              Run Orchestration
            </button>
          </div>
        </div>

        {/* Source Filter Chips & Image Attachment */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {/* Source Types Multi-Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Filter Sources:</span>
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
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)'}`,
                    background: active ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                    color: active ? '#a5b4fc' : 'var(--text-muted)',
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
                <span style={{ fontSize: '11px', color: '#ffffff' }}>Face Image Attached</span>
                <button onClick={() => setAttachedImage(null)} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
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
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <ImageIcon size={14} /> Attach Face Image (Biometrics)
              </button>
            )}
          </div>
        </div>

        {/* Sample Query Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quick Examples:</span>
          {sampleQueries.map((sq, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(sq.q);
                handleRunOrchestration(sq.q);
              }}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '4px 10px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.color = '#ffffff';
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

      {/* Orchestration Results Layout */}
      {orchestrationData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Pipeline Summary Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Compass size={20} color="var(--accent-primary)" />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Strategy Applied</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff', textTransform: 'capitalize' }}>
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

          {/* Strategic Decision Matrix & Guidelines */}
          {guidelinesData?.query_recommendations && (
            <div className="glass-panel" style={{ padding: '18px 24px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.05) 100%)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>
                    AI Routing Decision & Intent Classification
                  </span>
                </div>
                <span style={{
                  background: 'rgba(99, 102, 241, 0.25)',
                  color: '#a5b4fc',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  Intent Strategy: {guidelinesData.query_recommendations.suggested_strategy.toUpperCase()}
                </span>
              </div>

              <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: '1.6', marginBottom: '12px' }}>
                <strong>Recommended Action:</strong> {guidelinesData.query_recommendations.recommended_action}
              </div>

              {/* Matched Tools Pills */}
              {guidelinesData.query_recommendations.recommended_tools?.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-Matched Tool:</span>
                  {guidelinesData.query_recommendations.recommended_tools.map((mt, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(6, 182, 212, 0.12)',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      color: 'var(--accent-cyan)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Zap size={13} />
                      <strong>{mt.tool_name}</strong>
                      {mt.suggested_arguments && Object.keys(mt.suggested_arguments).length > 0 && (
                        <span style={{ opacity: 0.8, fontFamily: 'monospace', fontSize: '11px' }}>
                          ({JSON.stringify(mt.suggested_arguments)})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section Navigation Tabs */}
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
                color: activeTab === 'overview' ? '#ffffff' : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Overview & Grounding Guidelines
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
                color: activeTab === 'vectors' ? '#ffffff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Layers size={14} /> Vector Chunks ({orchestrationData.retrieved_documents?.length || 0})
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
                color: activeTab === 'graph' ? '#ffffff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Share2 size={14} /> Graph Entities ({orchestrationData.graph_entities?.length || 0})
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
                color: activeTab === 'tools' ? '#ffffff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Zap size={14} /> Real-Time Tools ({orchestrationData.applicable_tools?.length || 0})
            </button>
            {orchestrationData.biometric_face_result && (
              <button
                onClick={() => setActiveTab('biometrics')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  background: activeTab === 'biometrics' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                  border: activeTab === 'biometrics' ? '1px solid #fbbf24' : '1px solid transparent',
                  color: activeTab === 'biometrics' ? '#ffffff' : 'var(--text-muted)',
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

          {/* TAB 1: OVERVIEW & SYNTHESIS */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Guidelines List */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="var(--accent-primary)" />
                  AI Synthesis Directives (Anti-Hallucination)
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
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cpu size={16} color="var(--accent-cyan)" />
                    Grounded AI Response Synthesis
                  </h3>
                  <button
                    onClick={handleSynthesizeWithLLM}
                    disabled={synthesizing}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: synthesizing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {synthesizing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="#ffffff" />}
                    Synthesize with LLM
                  </button>
                </div>

                <div style={{
                  flex: 1,
                  background: 'rgba(5, 7, 12, 0.6)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  padding: '14px',
                  fontSize: '13px',
                  color: synthesizedAnswer ? '#ffffff' : 'var(--text-muted)',
                  lineHeight: '1.6',
                  minHeight: '180px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {synthesizing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-primary)', padding: '20px 0' }}>
                      <Loader2 size={18} className="animate-spin" />
                      Synthesizing grounded answer using active LLM model...
                    </div>
                  ) : synthesizedAnswer ? (
                    synthesizedAnswer
                  ) : (
                    "Click 'Synthesize with LLM' to generate an answer grounded in the orchestrated vector documents, graph entities, and live tools."
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VECTOR DOCUMENTS */}
          {activeTab === 'vectors' && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '14px' }}>
                Retrieved Vector Chunks from ChromaDB ({orchestrationData.retrieved_documents?.length || 0})
              </h3>
              {orchestrationData.retrieved_documents?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No vector chunks matched this query.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {orchestrationData.retrieved_documents?.map((doc, dIdx) => (
                    <div key={dIdx} style={{ background: 'rgba(5, 7, 12, 0.6)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '700', color: '#93c5fd', fontSize: '14px' }}>
                          {doc.source_name} ({doc.source_type})
                        </span>
                        <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                          Score: {doc.score}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap', maxHeight: '160px', overflowY: 'auto' }}>
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
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '14px' }}>
                Connected Knowledge Graph Entities ({orchestrationData.graph_entities?.length || 0})
              </h3>
              {orchestrationData.graph_entities?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No entities matched in Neo4j graph for this query.</div>
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
                            <span key={cIdx} style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', padding: '2px 6px', borderRadius: '4px' }}>
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
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff' }}>
                Applicable Real-Time AI Tools ({orchestrationData.applicable_tools?.length || 0})
              </h3>
              {orchestrationData.applicable_tools?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No specialized real-time API or database tools matched.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {orchestrationData.applicable_tools?.map((tool, tIdx) => (
                    <div key={tIdx} style={{ background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '15px', fontFamily: 'JetBrains Mono, monospace' }}>
                            ⚡ {tool.tool_name}
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
                            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          {toolTestLoading && testingTool === tool.tool_name ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} fill="#ffffff" />
                          )}
                          Execute Live Tool
                        </button>
                      </div>

                      {tool.suggested_arguments && Object.keys(tool.suggested_arguments).length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Auto-Extracted Arguments:</span>
                          <code style={{ marginLeft: '8px', background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: '4px', color: '#a5f3fc', fontSize: '11px' }}>
                            {JSON.stringify(tool.suggested_arguments)}
                          </code>
                        </div>
                      )}

                      {/* Tool Output Preview */}
                      {toolTestResult && toolTestResult.tool_name === tool.tool_name && (
                        <div style={{ marginTop: '12px', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-emerald)', marginBottom: '6px' }}>
                            Live Execution Output:
                          </div>
                          <pre style={{ margin: 0, fontSize: '11px', color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace', maxHeight: '180px', overflowY: 'auto' }}>
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
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '14px' }}>
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
                    <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: '600' }}>Input Face Crop</span>
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
                        <span style={{ fontSize: '11px', color: '#34d399', fontWeight: '600' }}>Enrolled Face</span>
                      </div>
                    )}

                    <div style={{ marginLeft: '12px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>
                        {orchestrationData.biometric_face_result.person_name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Person ID: <strong style={{ color: '#ffffff' }}>{orchestrationData.biometric_face_result.person_id}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Department: <span style={{ color: '#e2e8f0' }}>{orchestrationData.biometric_face_result.department}</span>
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
    </div>
  );
}
