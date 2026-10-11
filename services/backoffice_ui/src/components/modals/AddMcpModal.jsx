import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cpu, 
  Globe, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  Zap, 
  Play, 
  Clock, 
  Copy, 
  Sparkles, 
  RefreshCw, 
  ShieldCheck, 
  Layers, 
  Terminal, 
  Check, 
  Sliders,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import api from '../../api/client';
import ValidityTierSelector from '../common/ValidityTierSelector';

export default function AddMcpModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [transport, setTransport] = useState('jsonrpc'); // 'jsonrpc', 'sse', 'rest'
  const [authMode, setAuthMode] = useState('none'); // 'none', 'bearer', 'api_key', 'custom_headers'
  const [token, setToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headerName, setHeaderName] = useState('X-API-Key');
  const [customHeaders, setCustomHeaders] = useState('{}');
  const [verifySsl, setVerifySsl] = useState(false);

  // Cache & Resources
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(60);
  const [syncResources, setSyncResources] = useState(false);

  // Validity Hierarchy States
  const [validityTier, setValidityTier] = useState('authoritative');
  const [validityScore, setValidityScore] = useState(95);
  const [validityNotes, setValidityNotes] = useState('Data bersumber dari server MCP real-time terpercaya');

  // Discovered Tools
  const [discoveredTools, setDiscoveredTools] = useState([]);
  const [expandedToolIndex, setExpandedToolIndex] = useState(null);

  // Testing States
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Individual Tool Test Execution
  const [selectedToolForTest, setSelectedToolForTest] = useState('');
  const [toolTestArgs, setToolTestArgs] = useState('{}');
  const [executingTool, setExecutingTool] = useState(false);
  const [toolExecResult, setToolExecResult] = useState(null);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      const conf = initialData.config || {};
      setEndpoint(conf.endpoint || conf.url || '');
      setTransport(conf.transport || conf.protocol || 'jsonrpc');
      
      const auth = conf.auth || {};
      const mode = auth.mode || conf.auth_mode || (auth.token ? 'bearer' : (auth.api_key ? 'api_key' : 'none'));
      setAuthMode(mode);
      setToken(auth.token || conf.token || conf.bearer_token || '');
      setApiKey(auth.api_key || conf.api_key || '');
      setHeaderName(auth.header_name || conf.header_name || 'X-API-Key');
      
      if (auth.custom_headers || conf.custom_headers) {
        const ch = auth.custom_headers || conf.custom_headers;
        setCustomHeaders(typeof ch === 'object' ? JSON.stringify(ch, null, 2) : String(ch));
      } else {
        setCustomHeaders('{}');
      }

      setVerifySsl(Boolean(conf.verify_ssl || conf.ssl_verify));
      setSyncResources(Boolean(conf.sync_resources));

      // Cache
      if (initialData.cache_ttl_minutes !== null && initialData.cache_ttl_minutes !== undefined) {
        setCacheEnabled(true);
        setCacheTtlMinutes(initialData.cache_ttl_minutes);
      } else {
        setCacheEnabled(false);
        setCacheTtlMinutes(60);
      }

      // Validity
      setValidityTier(conf.validity_tier || initialData.validity_tier || 'authoritative');
      setValidityScore(conf.validity_score !== undefined ? conf.validity_score : (initialData.validity_score !== undefined ? initialData.validity_score : 95));
      setValidityNotes(conf.validity_notes || initialData.validity_notes || '');

      // Existing saved tools
      if (Array.isArray(conf.tools) && conf.tools.length > 0) {
        setDiscoveredTools(conf.tools.map(t => ({
          ...t,
          enabled: t.enabled !== undefined ? t.enabled : true
        })));
        if (conf.tools[0]?.name) {
          setSelectedToolForTest(conf.tools[0].name);
        }
      } else {
        setDiscoveredTools([]);
      }

      setTestResult(null);
      setToolExecResult(null);
    } else if (isOpen) {
      // Reset form for fresh create
      setName('');
      setEndpoint('http://mcp_server:8001/rpc');
      setTransport('jsonrpc');
      setAuthMode('none');
      setToken('');
      setApiKey('');
      setHeaderName('X-API-Key');
      setCustomHeaders('{}');
      setVerifySsl(false);
      setCacheEnabled(false);
      setCacheTtlMinutes(60);
      setSyncResources(false);
      setValidityTier('authoritative');
      setValidityScore(95);
      setValidityNotes('Data bersumber dari server MCP real-time terpercaya');
      setDiscoveredTools([]);
      setTestResult(null);
      setToolExecResult(null);
      setSelectedToolForTest('');
      setToolTestArgs('{}');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const buildCurrentConfig = (extra = {}) => {
    let parsedCustomHeaders = {};
    if (authMode === 'custom_headers') {
      try {
        parsedCustomHeaders = JSON.parse(customHeaders);
      } catch (e) {
        parsedCustomHeaders = {};
      }
    }

    const authConfig = {
      mode: authMode,
      token: authMode === 'bearer' ? token.trim() : undefined,
      api_key: authMode === 'api_key' ? apiKey.trim() : undefined,
      header_name: authMode === 'api_key' ? headerName.trim() : undefined,
      custom_headers: authMode === 'custom_headers' ? parsedCustomHeaders : undefined
    };

    return {
      endpoint: endpoint.trim(),
      transport,
      protocol: transport,
      verify_ssl: verifySsl,
      auth: authConfig,
      auth_mode: authMode,
      token: authMode === 'bearer' ? token.trim() : undefined,
      api_key: authMode === 'api_key' ? apiKey.trim() : undefined,
      header_name: authMode === 'api_key' ? headerName.trim() : undefined,
      custom_headers: authMode === 'custom_headers' ? parsedCustomHeaders : undefined,
      sync_resources: syncResources,
      is_tool: true,
      validity_tier: validityTier,
      validity_score: validityScore,
      validity_notes: validityNotes,
      tools: discoveredTools,
      ...extra
    };
  };

  const handleTestConnection = async () => {
    if (!endpoint.trim()) {
      alert('Mohon masukkan Endpoint URL Server MCP terlebih dahulu.');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const cfg = buildCurrentConfig();
      const res = await api.post('/knowledge/test-connection', {
        source_type: 'mcp',
        config: cfg
      });

      setTestResult(res.data);

      if (res.data.success && Array.isArray(res.data.tools)) {
        // Retain previous enabled preferences if matching tool names exist
        const prevEnabledMap = {};
        discoveredTools.forEach(t => {
          prevEnabledMap[t.name] = t.enabled;
        });

        const newTools = res.data.tools.map(t => ({
          ...t,
          enabled: prevEnabledMap[t.name] !== undefined ? prevEnabledMap[t.name] : true
        }));
        setDiscoveredTools(newTools);

        if (newTools.length > 0 && !selectedToolForTest) {
          setSelectedToolForTest(newTools[0].name);
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Gagal menghubungi server MCP: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setTesting(false);
    }
  };

  const handleExecuteSingleToolTest = async () => {
    if (!selectedToolForTest) {
      alert('Pilih alat (tool) yang akan diuji terlebih dahulu.');
      return;
    }

    let parsedArgs = {};
    try {
      if (toolTestArgs.trim()) {
        parsedArgs = JSON.parse(toolTestArgs);
      }
    } catch (e) {
      alert('Format JSON arguments tidak valid: ' + e.message);
      return;
    }

    try {
      setExecutingTool(true);
      setToolExecResult(null);

      const cfg = buildCurrentConfig({
        test_tool_name: selectedToolForTest,
        test_arguments: parsedArgs
      });

      const res = await api.post('/knowledge/test-connection', {
        source_type: 'mcp',
        config: cfg
      });

      if (res.data.tool_execution_result) {
        setToolExecResult(res.data.tool_execution_result);
      } else {
        setToolExecResult(res.data);
      }
    } catch (err) {
      setToolExecResult({
        success: false,
        error: 'Eksekusi alat gagal: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setExecutingTool(false);
    }
  };

  const toggleToolEnabled = (toolName) => {
    setDiscoveredTools(prev => prev.map(t => 
      t.name === toolName ? { ...t, enabled: !t.enabled } : t
    ));
  };

  const toggleAllTools = (enabled) => {
    setDiscoveredTools(prev => prev.map(t => ({ ...t, enabled })));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Mohon masukkan Nama Sumber Server MCP.');
      return;
    }
    if (!endpoint.trim()) {
      alert('Mohon masukkan Endpoint URL Server MCP.');
      return;
    }

    try {
      setSubmitting(true);
      const enabledCount = discoveredTools.filter(t => t.enabled).length;
      const desc = `[Server MCP] ${name} (${endpoint}) - ${enabledCount} alat aktif terdaftar`;

      const payload = {
        name: name.trim(),
        source_type: 'mcp',
        description: desc,
        cache_ttl_minutes: cacheEnabled ? cacheTtlMinutes : null,
        config: buildCurrentConfig()
      };

      if (initialData) {
        await api.put(`/knowledge/sources/${initialData.id}?re_sync=false`, payload);
      } else {
        await api.post('/knowledge/sources', payload);
      }

      onSuccess();
      onClose();
    } catch (err) {
      alert('Gagal menyimpan sumber MCP: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div className="glass-panel modal-content" style={{
        width: '100%',
        maxWidth: '860px',
        maxHeight: '92vh',
        overflowY: 'auto',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-dark-1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-glass-2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(124, 58, 237, 0.15)',
              border: '1px solid rgba(124, 58, 237, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed'
            }}>
              <Cpu size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                {initialData ? 'Edit Koneksi Server MCP' : 'Koneksikan Server MCP Eksternal'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Hubungkan ke kloningan server MCP ini atau server MCP penyedia lain (Anthropic, Postgres, dsb.)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section 1: Connection Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Nama Koneksi / Server MCP <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Contoh: Server MCP Kloningan Cabang B atau MCP GitHub"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Endpoint URL Server MCP <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="http://mcp_server:8001/rpc atau https://target-mcp.org/sse"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                required
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                💡 Untuk kloningan MCP dalam jaringan docker yang sama gunakan <code>http://mcp_server:8001/rpc</code>. Untuk server cloud gunakan URL publik HTTPS.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Protokol Transport MCP
              </label>
              <select
                className="input-field"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="jsonrpc">JSON-RPC 2.0 (Standar MCP / Direct HTTP POST)</option>
                <option value="sse">Server-Sent Events (SSE)</option>
                <option value="rest">REST Proxy Direct (/tools & /call_tool)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Metode Otentikasi
              </label>
              <select
                className="input-field"
                value={authMode}
                onChange={(e) => setAuthMode(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="none">Tanpa Otentikasi (Open / Local)</option>
                <option value="bearer">Bearer Token (Authorization: Bearer ...)</option>
                <option value="api_key">API Key (Custom Header)</option>
                <option value="custom_headers">Custom Headers (JSON Object)</option>
              </select>
            </div>
          </div>

          {/* Conditional Auth Inputs */}
          {authMode === 'bearer' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Bearer Token
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="eyJh..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>
          )}

          {authMode === 'api_key' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Header Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="X-API-Key"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  API Key Value
                </label>
                <input
                  type="password"
                  className="input-field"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Secret key..."
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {authMode === 'custom_headers' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Custom Headers (JSON)
              </label>
              <textarea
                className="input-field"
                rows={3}
                value={customHeaders}
                onChange={(e) => setCustomHeaders(e.target.value)}
                placeholder='{"X-Custom-Auth": "Secret"}'
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>
          )}

          {/* SSL & Options Row */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            padding: '12px 16px',
            background: 'var(--bg-glass-2)',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-sub)' }}>
              <input
                type="checkbox"
                checked={verifySsl}
                onChange={(e) => setVerifySsl(e.target.checked)}
              />
              Verifikasi Sertifikat SSL
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-sub)' }}>
              <input
                type="checkbox"
                checked={syncResources}
                onChange={(e) => setSyncResources(e.target.checked)}
              />
              Index Resources & Prompts ke ChromaDB Vector Store
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-sub)' }}>
              <input
                type="checkbox"
                checked={cacheEnabled}
                onChange={(e) => setCacheEnabled(e.target.checked)}
              />
              Aktifkan Cache Balikan Tool (TTL)
            </label>

            {cacheEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>TTL:</span>
                <input
                  type="number"
                  className="input-field"
                  style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }}
                  value={cacheTtlMinutes}
                  min={1}
                  max={10080}
                  onChange={(e) => setCacheTtlMinutes(parseInt(e.target.value) || 60)}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>menit</span>
              </div>
            )}
          </div>

          {/* Test & Tool Discovery Button */}
          <div style={{
            padding: '16px',
            background: 'var(--bg-glass-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} color="var(--accent-primary)" />
                  Uji Koneksi & Deteksi Tools Otomatis
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Kirim handshake MCP JSON-RPC ke endpoint untuk mengekstrak daftar alat dan parameter.
                </p>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleTestConnection}
                disabled={testing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {testing ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                <span>{testing ? 'Menghubungkan...' : 'Uji Koneksi Sekarang'}</span>
              </button>
            </div>

            {/* Test Result Message */}
            {testResult && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: testResult.success ? 'rgba(5, 150, 105, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${testResult.success ? 'rgba(5, 150, 105, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                fontSize: '13px',
                color: testResult.success ? '#059669' : '#dc2626',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {testResult.success ? <CheckCircle size={16} color="#059669" /> : <AlertCircle size={16} color="#dc2626" />}
                <span style={{ color: testResult.success ? '#059669' : '#dc2626' }}>{testResult.message}</span>
                {testResult.latency_ms !== undefined && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.8 }}>
                    {testResult.latency_ms} ms
                  </span>
                )}
              </div>
            )}

            {/* Discovered Tools List */}
            {discoveredTools.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
                    Daftar Alat Ditemukan ({discoveredTools.filter(t => t.enabled).length}/{discoveredTools.length} Aktif):
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => toggleAllTools(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: '600' }}
                    >
                      Pilih Semua
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>|</span>
                    <button
                      type="button"
                      onClick={() => toggleAllTools(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                    >
                      Batal Semua
                    </button>
                  </div>
                </div>

                <div style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  background: 'var(--bg-glass-1)'
                }}>
                  {discoveredTools.map((tool, idx) => {
                    const isExpanded = expandedToolIndex === idx;
                    const paramList = tool.parameters || [];

                    return (
                      <div
                        key={tool.name || idx}
                        style={{
                          borderBottom: idx !== discoveredTools.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                          padding: '10px 14px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={tool.enabled !== false}
                              onChange={() => toggleToolEnabled(tool.name)}
                              id={`tool-chk-${idx}`}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <label
                                htmlFor={`tool-chk-${idx}`}
                                style={{
                                  fontSize: '13px',
                                  fontWeight: '600',
                                  color: tool.enabled !== false ? 'var(--text-main)' : 'var(--text-muted)',
                                  cursor: 'pointer',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {tool.name}
                              </label>
                              <span style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginLeft: '8px',
                                display: 'inline-block',
                                maxWidth: '380px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                verticalAlign: 'middle'
                              }}>
                                {tool.description}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--bg-glass-2)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)'
                            }}>
                              {paramList.length} parameter
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedToolIndex(isExpanded ? null : idx)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px'
                              }}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Tool Schema Details */}
                        {isExpanded && (
                          <div style={{
                            marginTop: '10px',
                            padding: '10px 12px',
                            background: 'var(--bg-glass-2)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            fontSize: '12px'
                          }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>
                              Deskripsi: {tool.description || 'Tidak ada deskripsi'}
                            </div>
                            {paramList.length > 0 ? (
                              <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600' }}>Parameter:</span>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                  {paramList.map((p, pIdx) => (
                                    <li key={pIdx} style={{ color: 'var(--text-main)', fontSize: '11px', marginBottom: '2px' }}>
                                      <code style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{p.name}</code> ({p.type || 'string'})
                                      {p.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*wajib</span>}
                                      {p.description && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>- {p.description}</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Alat ini tidak memerlukan parameter.</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Interactive Tool Execution Test (Optional) */}
          {discoveredTools.length > 0 && (
            <div style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-glass-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal size={14} color="var(--accent-cyan)" />
                  Tes Eksekusi Alat Terpilih (Dry Run)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '10px', alignItems: 'flex-start' }}>
                <select
                  className="input-field"
                  value={selectedToolForTest}
                  onChange={(e) => setSelectedToolForTest(e.target.value)}
                  style={{ fontSize: '12px' }}
                >
                  {discoveredTools.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>

                <input
                  type="text"
                  className="input-field"
                  placeholder='JSON Arguments, misal: {"nik": "317..."}'
                  value={toolTestArgs}
                  onChange={(e) => setToolTestArgs(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExecuteSingleToolTest}
                  disabled={executingTool || !selectedToolForTest}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {executingTool ? <RefreshCw size={12} className="spin" /> : <Play size={12} />}
                  <span>Jalankan</span>
                </button>
              </div>

              {toolExecResult && (
                <div style={{
                  background: 'var(--bg-glass-1)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  border: '1px solid var(--border-subtle)',
                  maxHeight: '160px',
                  overflowY: 'auto'
                }}>
                  <pre style={{ margin: 0, fontSize: '11px', color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(toolExecResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Ground Truth / Validity Hierarchy Selector */}
          <ValidityTierSelector
            valueTier={validityTier}
            valueScore={validityScore}
            valueNotes={validityNotes}
            onChangeTier={setValidityTier}
            onChangeScore={setValidityScore}
            onChangeNotes={setValidityNotes}
          />

          {/* Modal Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)'
          }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || testing}
              style={{
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Check size={16} />
              <span>{submitting ? 'Menyimpan...' : (initialData ? 'Perbarui Server MCP' : 'Simpan Sumber MCP')}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
