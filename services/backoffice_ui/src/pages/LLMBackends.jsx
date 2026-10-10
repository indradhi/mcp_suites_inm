import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Plus,
  CheckCircle,
  RefreshCw,
  Trash2,
  Sliders,
  Check,
  AlertCircle,
  ExternalLink,
  Zap,
  Globe,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  Edit2,
  X,
  Server,
  Cloud,
  ShieldCheck,
  Download,
  Upload
} from 'lucide-react';
import api from '../api/client';

const FALLBACK_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'cloud',
    description: 'Frontier models: GPT-4o, GPT-4o-mini, o1, and o3 reasoning engines',
    default_api_base: 'https://api.openai.com/v1',
    default_models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo'],
    api_key_placeholder: 'sk-proj-...',
    docs_url: 'https://platform.openai.com/api-keys',
    color: '#10a37f'
  },
  {
    id: 'groq',
    name: 'Groq Cloud LPU',
    category: 'cloud',
    description: 'Ultra-fast LPU inference (500+ tok/s) for LLaMA 3.3 and DeepSeek R1 Distill',
    default_api_base: 'https://api.groq.com/openai/v1',
    default_models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'],
    api_key_placeholder: 'gsk_...',
    docs_url: 'https://console.groq.com/keys',
    color: '#f55036'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Cloud',
    category: 'cloud',
    description: 'Cost-effective high reasoning performance with DeepSeek V3 and R1',
    default_api_base: 'https://api.deepseek.com/v1',
    default_models: ['deepseek-chat', 'deepseek-reasoner'],
    api_key_placeholder: 'sk-...',
    docs_url: 'https://platform.deepseek.com/api_keys',
    color: '#4d6bfe'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'cloud',
    description: 'Universal gateway to Claude 3.5 Sonnet, GPT-4o, Gemini 2.0, and open models',
    default_api_base: 'https://openrouter.ai/api/v1',
    default_models: [
      'deepseek/deepseek-chat',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct',
      'openai/gpt-4o',
      'anthropic/claude-3.7-sonnet'
    ],
    api_key_placeholder: 'sk-or-v1-...',
    docs_url: 'https://openrouter.ai/keys',
    color: '#6366f1'
  },
  {
    id: 'gemini',
    name: 'Google Gemini (OpenAI Endpoint)',
    category: 'cloud',
    description: 'Gemini 2.0 Flash & Gemini 1.5 Pro via Google\'s official OpenAI-compatible endpoint',
    default_api_base: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    default_models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    api_key_placeholder: 'AIzaSy...',
    docs_url: 'https://aistudio.google.com/app/apikey',
    color: '#3b82f6'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    category: 'cloud',
    description: 'European state-of-the-art open models: Mistral Large, Codestral, and NeMo',
    default_api_base: 'https://api.mistral.ai/v1',
    default_models: ['mistral-large-latest', 'codestral-latest', 'mistral-small-latest', 'open-mistral-nemo'],
    api_key_placeholder: '...',
    docs_url: 'https://console.mistral.ai/api-keys/',
    color: '#f97316'
  },
  {
    id: 'together',
    name: 'Together AI',
    category: 'cloud',
    description: 'Cloud hosting for open-source AI: Llama 3.3 70B, DeepSeek R1, Qwen 2.5',
    default_api_base: 'https://api.together.xyz/v1',
    default_models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    api_key_placeholder: '...',
    docs_url: 'https://api.together.xyz/settings/api-keys',
    color: '#0ea5e9'
  },
  {
    id: 'cohere',
    name: 'Cohere',
    category: 'cloud',
    description: 'Enterprise search, RAG-optimized Command R+ and Command R models',
    default_api_base: 'https://api.cohere.com/compatibility/v1',
    default_models: ['command-r-plus-08-2024', 'command-r-08-2024'],
    api_key_placeholder: '...',
    docs_url: 'https://dashboard.cohere.com/api-keys',
    color: '#10b981'
  },
  {
    id: 'vllm',
    name: 'Local vLLM Cluster',
    category: 'local',
    description: 'On-premises high-throughput vLLM cluster hosting Qwen or LLaMA',
    default_api_base: 'http://172.16.21.122:18000/v1',
    default_models: ['Qwen/Qwen3.6-35B-A3B-FP8'],
    api_key_placeholder: 'Optional API Key',
    docs_url: '',
    color: '#8b5cf6'
  },
  {
    id: 'ollama',
    name: 'Local Ollama',
    category: 'local',
    description: 'Local workstation Ollama instance serving downloaded GGUF models',
    default_api_base: 'http://localhost:11434/v1',
    default_models: ['llama3:latest', 'qwen2.5:latest'],
    api_key_placeholder: 'EMPTY',
    docs_url: 'https://ollama.ai',
    color: '#0284c7'
  },
  {
    id: 'custom',
    name: 'Custom Compatible',
    category: 'custom',
    description: 'Any self-hosted or proxy OpenAI-compatible API endpoint',
    default_api_base: 'https://...',
    default_models: [],
    api_key_placeholder: 'Bearer API Key',
    docs_url: '',
    color: '#94a3b8'
  }
];

export default function LLMBackends() {
  const [backends, setBackends] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [providers, setProviders] = useState(FALLBACK_PROVIDERS);
  const [loading, setLoading] = useState(true);

  // Modal State (Add or Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingBackendId, setEditingBackendId] = useState(null);
  const [selectedProviderId, setSelectedProviderId] = useState('groq');

  // Form Fields
  const [name, setName] = useState('');
  const [backendType, setBackendType] = useState('groq');
  const [apiBase, setApiBase] = useState('https://api.groq.com/openai/v1');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);
  const [newModelInput, setNewModelInput] = useState('');

  // Test & Sync State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState(null);

  useEffect(() => {
    fetchData();
    fetchProviders();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [bRes, aRes] = await Promise.all([
        api.get('/llm/backends'),
        api.get('/llm/assignments')
      ]);
      setBackends(bRes.data || []);
      setAssignments(aRes.data || []);
    } catch (err) {
      console.error('Error fetching LLM data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await api.get('/llm/cloud-providers');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setProviders(res.data);
      }
    } catch (err) {
      console.warn('Using fallback providers list:', err);
    }
  };

  const handleOpenAddModal = (presetId = 'groq') => {
    setEditingBackendId(null);
    setTestResult(null);
    setShowApiKey(false);
    const p = providers.find(item => item.id === presetId) || providers[0];
    applyProviderPreset(p);
    setShowModal(true);
  };

  const handleOpenEditModal = (b) => {
    setEditingBackendId(b.id);
    setTestResult(null);
    setName(b.name);
    setBackendType(b.backend_type);
    setSelectedProviderId(b.backend_type);
    setApiBase(b.api_base);
    setApiKey(''); // Keep empty unless changed
    setShowApiKey(false);
    setDescription(b.description || '');
    setSelectedModels(b.available_models || []);
    setShowModal(true);
  };

  const applyProviderPreset = (p) => {
    if (!p) return;
    setSelectedProviderId(p.id);
    setBackendType(p.id);
    setName(p.name);
    setApiBase(p.default_api_base);
    setApiKey('');
    setDescription(p.description || '');
    setSelectedModels(p.default_models || []);
    setTestResult(null);
  };

  const handleToggleModel = (mName) => {
    setSelectedModels(prev => {
      if (prev.includes(mName)) {
        return prev.filter(m => m !== mName);
      } else {
        return [...prev, mName];
      }
    });
  };

  const handleAddCustomModel = (e) => {
    if (e) e.preventDefault();
    const clean = newModelInput.trim();
    if (clean && !selectedModels.includes(clean)) {
      setSelectedModels(prev => [...prev, clean]);
      setNewModelInput('');
    }
  };

  const handleRemoveModel = (mName) => {
    setSelectedModels(prev => prev.filter(m => m !== mName));
  };

  const handleTestConnection = async () => {
    if (!apiBase.trim()) {
      alert('Masukkan API Base URL terlebih dahulu');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/llm/backends/test-connection', {
        api_base: apiBase.trim(),
        api_key: apiKey.trim() || undefined
      });
      setTestResult(res.data);
      if (res.data.success && Array.isArray(res.data.models) && res.data.models.length > 0) {
        if (res.data.models.length > 25) {
          // Large cloud registry (e.g. OpenRouter with 400+ models) - do not flood selectedModels
          setSelectedModels(prev => {
            if (prev.length === 0) {
              return res.data.models.slice(0, 5);
            }
            return prev;
          });
        } else {
          // Moderate list (e.g. local vLLM or Ollama) - merge discovered models
          setSelectedModels(prev => {
            const combined = [...prev];
            res.data.models.forEach(m => {
              if (!combined.includes(m)) combined.push(m);
            });
            return combined;
          });
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.detail || err.message,
        models: []
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveBackend = async (e) => {
    e.preventDefault();
    if (!name.trim() || !apiBase.trim()) {
      alert('Nama dan API Base URL wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        backend_type: backendType,
        api_base: apiBase.trim(),
        description: description.trim(),
        available_models: selectedModels.length > 0 ? selectedModels : ['default-model']
      };

      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      if (editingBackendId) {
        await api.put(`/llm/backends/${editingBackendId}`, payload);
      } else {
        await api.post('/llm/backends', payload);
      }

      setShowModal(false);
      fetchData();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFetchModels = async (backendId) => {
    setSyncingId(backendId);
    try {
      const res = await api.post(`/llm/backends/${backendId}/fetch-models`);
      const count = res.data?.models?.length || 0;
      alert(`Berhasil sinkronisasi! Ditemukan ${count} model dari endpoint backend.`);
      fetchData();
    } catch (err) {
      alert('Gagal mengambil model: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteBackend = async (backendId, bName) => {
    if (backends.length <= 1) {
      alert('Tidak dapat menghapus backend terakhir. Sistem membutuhkan setidaknya 1 backend LLM aktif.');
      return;
    }
    if (!window.confirm(`Hapus backend LLM '${bName}'? Model assignments yang menggunakannya akan dialihkan.`)) return;
    try {
      await api.delete(`/llm/backends/${backendId}`);
      fetchData();
    } catch (err) {
      alert('Gagal menghapus: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleUpdateAssignment = async (task, backendId, modelName) => {
    try {
      await api.post('/llm/assignments', {
        task,
        backend_id: backendId,
        model_name: modelName
      });
      fetchData();
    } catch (err) {
      alert('Gagal memperbarui task assignment: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/llm/export');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", "llm_connections_export.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err) {
      alert('Gagal mengekspor data: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleImport = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result);
          const res = await api.post('/llm/import', json);
          alert(res.data.message || 'Import berhasil');
          fetchData();
        } catch (err) {
          alert('Gagal mengimpor data: ' + (err?.response?.data?.detail || err.message));
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  };

  const getProviderMeta = (type) => {
    return providers.find(p => p.id === type) || {
      id: type,
      name: type.toUpperCase(),
      color: '#6366f1',
      category: 'custom'
    };
  };

  const currentActiveProvider = providers.find(p => p.id === selectedProviderId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f8fafc',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              <Cloud size={20} />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', color: 'var(--text-main)', margin: 0 }}>
              LLM Backends & Cloud Multi-Model Engine
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px', maxWidth: '720px' }}>
            Hubungkan model LLM Cloud eksternal (OpenAI, Groq, DeepSeek, OpenRouter, Google Gemini, Mistral) dan klaster lokal on-premise (vLLM, Ollama). Atur perutean model untuk ekstraksi graf pengetahuan, penalaran, dan sesi chat.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '600' }}
            onClick={handleImport}
          >
            <Upload size={16} /> Import
          </button>
          <button
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '600' }}
            onClick={handleExport}
          >
            <Download size={16} /> Export
          </button>
          <button
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '600' }}
            onClick={() => handleOpenAddModal('groq')}
          >
            <Plus size={16} /> Hubungkan Model / Cloud Backend
          </button>
        </div>
      </div>

      {/* Cloud Presets Fast Bar */}
      <div className="glass-panel" style={{
        padding: '16px 20px',
        background: 'var(--bg-glass-2)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
            <Sparkles size={16} color="var(--accent-cyan)" />
            <span>Penyedia Model Eksternal Cloud & Lokal yang Didukung:</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Klik penyedia untuk registrasi instan 1-klik</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => handleOpenAddModal(p.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'var(--bg-glass-light)',
                border: `1px solid ${p.color}40`,
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${p.color}25`;
                e.currentTarget.style.borderColor = p.color;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-glass-light)';
                e.currentTarget.style.borderColor = `${p.color}40`;
                e.currentTarget.style.transform = 'none';
              }}
              title={p.description}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color }} />
              {p.name}
              {p.category === 'cloud' && (
                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-glass-3)', color: 'var(--text-secondary)', fontWeight: '600' }}>
                  Cloud
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Backends Grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={18} color="var(--accent-primary)" />
            Backend Terdaftar ({backends.length})
          </h2>
          <button
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Segarkan
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {backends.map((b) => {
            const meta = getProviderMeta(b.backend_type);
            const isAssigned = assignments.some(a => a.backend_id === b.id);
            return (
              <div
                key={b.id}
                className="glass-panel"
                style={{
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  border: isAssigned ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--border-color)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {isAssigned && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                    color: '#f8fafc',
                    fontSize: '10px',
                    fontWeight: '700',
                    padding: '3px 10px',
                    borderBottomLeftRadius: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Digunakan di Tasks
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: `${meta.color}20`,
                        border: `1px solid ${meta.color}50`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: meta.color
                      }}>
                        {meta.category === 'cloud' ? <Cloud size={17} /> : <Server size={17} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>{b.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          ID: #{b.id} · Dibuat: {new Date(b.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '700',
                      backgroundColor: `${meta.color}25`,
                      color: meta.color,
                      border: `1px solid ${meta.color}40`
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: meta.color }} />
                      {meta.name}
                    </span>
                    <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>
                      {b.is_active ? 'Online' : 'Disabled'}
                    </span>
                    {b.api_key && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Key size={11} /> Key Terpasang
                      </span>
                    )}
                  </div>

                  {b.description && (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.4' }}>
                      {b.description}
                    </p>
                  )}

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
                    Endpoint URL:
                  </div>
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'var(--bg-glass-3)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px',
                    color: 'var(--text-main)',
                    marginBottom: '14px',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace'
                  }}>
                    {b.api_base}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Model Tersedia ({b.available_models?.length || 0}):
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '100px', overflowY: 'auto' }}>
                    {(b.available_models || []).slice(0, 6).map((m, mIdx) => (
                      <span
                        key={mIdx}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'var(--bg-glass-2)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '11px',
                          color: 'var(--text-main)',
                          fontFamily: 'monospace'
                        }}
                      >
                        {m}
                      </span>
                    ))}
                    {(b.available_models?.length || 0) > 6 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '3px 6px' }}>
                        +{b.available_models.length - 6} lainnya
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => handleFetchModels(b.id)}
                    disabled={syncingId === b.id}
                    title="Query live /v1/models endpoint"
                  >
                    <RefreshCw size={13} className={syncingId === b.id ? 'spin' : ''} />
                    {syncingId === b.id ? 'Syncing...' : 'Sync Models'}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => handleOpenEditModal(b)}
                    title="Edit Backend Configuration"
                  >
                    <Edit2 size={13} /> Edit
                  </button>
                  <button
                    className="btn-danger"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    onClick={() => handleDeleteBackend(b.id, b.name)}
                    title="Hapus Backend"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Model Routing Assignments */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Sliders size={20} color="var(--accent-primary)" />
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Perutean Model Berdasarkan Tugas (Task Model Assignments)
          </h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Tentukan model yang berspesialisasi untuk setiap tugas: ekstraksi relasi graf (kecepatan tinggi), deteksi profiling jaringan (penalaran mendalam), dan perangkuman pengetahuan.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px' }}>Tipe Tugas (Task)</th>
                <th style={{ padding: '12px' }}>Backend Terpilih</th>
                <th style={{ padding: '12px' }}>Model ID</th>
                <th style={{ padding: '12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'entity_extraction', label: 'Ekstraksi Entitas & Relasi Graf (Ingestion)' },
                { key: 'relationship_detection', label: 'Network Profiling & Reasoner (Neo4j)' },
                { key: 'summarization', label: 'Rangkuman Dokumen & Konten Pengetahuan' },
                { key: 'general_qa', label: 'AI Knowledge Chat Default (OpenWebUI)' }
              ].map((taskObj) => {
                const cur = assignments.find(a => a.task === taskObj.key);
                const assignedBackend = backends.find(b => b.id === cur?.backend_id) || backends[0];
                const availableForTask = assignedBackend?.available_models || [];

                return (
                  <tr key={taskObj.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '14px' }}>
                    <td style={{ padding: '14px 12px', fontWeight: '600', color: 'var(--text-main)' }}>
                      {taskObj.label}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <select
                        className="input-field"
                        style={{ padding: '7px 12px', width: 'auto', minWidth: '220px' }}
                        value={cur?.backend_id || backends[0]?.id || ''}
                        onChange={(e) => {
                          const bId = parseInt(e.target.value);
                          const bObj = backends.find(b => b.id === bId);
                          const model = bObj?.available_models?.[0] || 'Qwen/Qwen3.6-35B-A3B-FP8';
                          handleUpdateAssignment(taskObj.key, bId, model);
                        }}
                      >
                        {backends.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.backend_type.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      {availableForTask.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select
                            className="input-field font-mono"
                            style={{ padding: '7px 12px', minWidth: '280px' }}
                            value={cur?.model_name || availableForTask[0]}
                            onChange={(e) => {
                              const bId = cur?.backend_id || backends[0]?.id;
                              if (bId) handleUpdateAssignment(taskObj.key, bId, e.target.value);
                            }}
                          >
                            {availableForTask.map((m, mIdx) => (
                              <option key={mIdx} value={m}>{m}</option>
                            ))}
                            <option value="__custom__">+ Ketik Model Lain...</option>
                          </select>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="input-field font-mono"
                          style={{ padding: '7px 12px', width: '280px' }}
                          defaultValue={cur?.model_name || 'Qwen/Qwen3.6-35B-A3B-FP8'}
                          onBlur={(e) => {
                            const bId = cur?.backend_id || backends[0]?.id;
                            if (bId) handleUpdateAssignment(taskObj.key, bId, e.target.value);
                          }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <span className="badge badge-success">Aktif</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Backend Modal - Protected from outside close / swipe */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => e.stopPropagation()} // Prevent closing on backdrop click
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()} // Prevent propagation
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              borderRadius: '16px',
              background: 'var(--bg-glass-1)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  {editingBackendId ? 'Edit Konfigurasi LLM Backend' : 'Hubungkan Model LLM (Cloud / Lokal)'}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {editingBackendId
                    ? 'Perbarui kunci API, endpoint URL, atau daftar model terdaftar.'
                    : 'Pilih salah satu template cloud terkurasi atau masukkan konfigurasi kustom.'}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '6px', borderRadius: '50%' }}
                onClick={() => setShowModal(false)}
                title="Tutup Modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cloud Provider Preset Chips (Only when adding new backend) */}
            {!editingBackendId && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Pilih Preset Cloud Provider:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                  {providers.map(p => {
                    const isSelected = selectedProviderId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyProviderPreset(p)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: isSelected ? `${p.color}30` : 'var(--bg-glass-light)',
                          border: isSelected ? `1.5px solid ${p.color}` : '1px solid var(--border-subtle)',
                          color: isSelected ? 'var(--text-main)' : 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Provider Doc Banner */}
            {currentActiveProvider && currentActiveProvider.docs_url && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: `${currentActiveProvider.color}15`,
                border: `1px solid ${currentActiveProvider.color}35`,
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <Key size={14} color={currentActiveProvider.color} />
                  <span>Belum memiliki API Key untuk <strong>{currentActiveProvider.name}</strong>?</span>
                </div>
                <a
                  href={currentActiveProvider.docs_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: currentActiveProvider.color,
                    fontWeight: '700',
                    textDecoration: 'none'
                  }}
                >
                  Dapatkan Key <ExternalLink size={12} />
                </a>
              </div>
            )}

            <form onSubmit={handleSaveBackend} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Nama Backend
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Groq Cloud Ultra-Fast"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Tipe Provider
                  </label>
                  <select
                    className="input-field"
                    value={backendType}
                    onChange={(e) => {
                      setBackendType(e.target.value);
                      const matched = providers.find(p => p.id === e.target.value);
                      if (matched) applyProviderPreset(matched);
                    }}
                  >
                    {providers.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.category.toUpperCase()})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    API Key {backendType === 'vllm' || backendType === 'ollama' ? '(Opsional)' : '(Wajib untuk Cloud)'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="input-field font-mono"
                      placeholder={editingBackendId ? 'Ketik API Key baru (atau biarkan kosong jika tidak diubah)' : (currentActiveProvider?.api_key_placeholder || 'sk-...')}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{ paddingRight: '36px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                      title={showApiKey ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Endpoint Base URL
                </label>
                <input
                  type="text"
                  className="input-field font-mono"
                  placeholder="https://api.groq.com/openai/v1"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  required
                />
              </div>

              {/* Models Selector & Editor */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Daftar Model yang Diaktifkan ({selectedModels.length})
                </label>

                <div style={{
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'var(--bg-glass-3)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  minHeight: '42px',
                  marginBottom: '10px'
                }}>
                  {selectedModels.map((m, mIdx) => (
                    <span
                      key={mIdx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '5px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        fontSize: '11px',
                        color: 'var(--text-main)',
                        fontFamily: 'monospace'
                      }}
                    >
                      {m}
                      <button
                        type="button"
                        onClick={() => handleRemoveModel(m)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {selectedModels.length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Belum ada model yang dipilih. Jalankan "Uji Koneksi" atau ketik nama model di bawah.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="Tambah model manual (misal: llama-3.3-70b-versatile)"
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomModel();
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleAddCustomModel}
                    style={{ padding: '8px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
                  >
                    + Tambah
                  </button>
                </div>
              </div>

              {/* Test Result Box */}
              {testResult && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  color: testResult.success ? '#34d399' : '#f87171'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: testResult.models?.length > 0 ? '8px' : 0 }}>
                    {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    <span style={{ fontWeight: '600' }}>{testResult.message}</span>
                  </div>

                  {testResult.success && testResult.models?.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        Model yang ditemukan dari API (klik untuk mengaktifkan/menonaktifkan):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                        {testResult.models.map((m, mIdx) => {
                          const isPicked = selectedModels.includes(m);
                          return (
                            <button
                              key={mIdx}
                              type="button"
                              onClick={() => handleToggleModel(m)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                border: isPicked ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                background: isPicked ? 'rgba(99, 102, 241, 0.3)' : 'var(--bg-glass-3)',
                                color: isPicked ? 'var(--text-main)' : 'var(--text-muted)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontFamily: 'monospace'
                              }}
                            >
                              {isPicked ? '✓ ' : '+ '}{m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '12px' }}
                >
                  <Zap size={14} />
                  {testing ? 'Menguji Koneksi...' : 'Uji Koneksi & Ambil Model'}
                </button>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '9px 16px', fontSize: '12px' }}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ padding: '9px 20px', fontSize: '12px', fontWeight: '700' }}
                  >
                    {submitting ? 'Menyimpan...' : (editingBackendId ? 'Simpan Perubahan' : 'Daftarkan Backend')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
