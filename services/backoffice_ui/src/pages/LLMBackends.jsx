import React, { useEffect, useState } from 'react';
import { Cpu, Plus, CheckCircle, RefreshCw, Trash2, Sliders, Check, AlertCircle } from 'lucide-react';
import api from '../api/client';

export default function LLMBackends() {
  const [backends, setBackends] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Backend Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [backendType, setBackendType] = useState('vllm');
  const [apiBase, setApiBase] = useState('http://172.16.21.122:18000/v1');
  const [apiKey, setApiKey] = useState('sk-IrR7Bwxtin0haWagUnPrBgq5PurnUz86');
  const [description, setDescription] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [bRes, aRes] = await Promise.all([
        api.get('/llm/backends'),
        api.get('/llm/assignments')
      ]);
      setBackends(bRes.data);
      setAssignments(aRes.data);
    } catch (err) {
      console.error('Error fetching LLM data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/llm/backends/test-connection', {
        api_base: apiBase,
        api_key: apiKey
      });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.detail || err.message, models: [] });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateBackend = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/llm/backends', {
        name,
        backend_type: backendType,
        api_base: apiBase,
        api_key: apiKey,
        description,
        available_models: testResult?.models || ['Qwen/Qwen3.6-35B-A3B-FP8']
      });
      setShowAddModal(false);
      setName('');
      fetchData();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFetchModels = async (backendId) => {
    try {
      const res = await api.post(`/llm/backends/${backendId}/fetch-models`);
      alert(`Fetched ${res.data.models?.length || 0} models successfully`);
      fetchData();
    } catch (err) {
      alert('Failed fetching models: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteBackend = async (backendId) => {
    if (!window.confirm('Delete this LLM backend?')) return;
    try {
      await api.delete(`/llm/backends/${backendId}`);
      fetchData();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.detail || err.message));
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
      alert('Failed updating assignment: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', color: '#ffffff' }}>
            LLM Backends & Multi-Model Engine
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Manage remote vLLM, Ollama, and OpenAI backends, configure model routing for entity extraction & reasoning
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Add Backend
        </button>
      </div>

      {/* Predefined Default Notice */}
      <div className="glass-panel" style={{
        padding: '16px 20px',
        background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CheckCircle size={20} color="var(--accent-emerald)" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>Predefined LLM Backend Active</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Base: <code className="font-mono">http://172.16.21.122:18000/v1</code> · Model: <code className="font-mono">Qwen/Qwen3.6-35B-A3B-FP8</code>
            </div>
          </div>
        </div>
        <span className="badge badge-success">Online & Assigned</span>
      </div>

      {/* Backends Grid */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', marginBottom: '16px' }}>
          Registered LLM Backends
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {backends.map((b) => (
            <div key={b.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cpu size={18} color="var(--accent-primary)" />
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>{b.name}</span>
                  </div>
                  <span className="badge badge-info">{b.backend_type.toUpperCase()}</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Endpoint Base:
                </div>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                  color: 'var(--accent-cyan)',
                  marginBottom: '14px',
                  wordBreak: 'break-all'
                }} className="font-mono">
                  {b.api_base}
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  Available Models ({b.available_models?.length || 0}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
                  {b.available_models?.slice(0, 4).map((m, mIdx) => (
                    <span key={mIdx} style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)'
                    }}>
                      {m}
                    </span>
                  ))}
                  {(b.available_models?.length || 0) > 4 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      +{b.available_models.length - 4} more
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => handleFetchModels(b.id)}
                  title="Query /v1/models"
                >
                  <RefreshCw size={14} /> Sync Models
                </button>
                <button
                  className="btn-danger"
                  style={{ padding: '6px 10px' }}
                  onClick={() => handleDeleteBackend(b.id)}
                  title="Delete Backend"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task Model Routing Assignments */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Sliders size={20} color="var(--accent-primary)" />
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>Task Model Assignments</h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Assign different LLMs to specialize in entity extraction, profiling reasoning, or knowledge search QA.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px' }}>Task Type</th>
                <th style={{ padding: '12px' }}>Assigned Backend</th>
                <th style={{ padding: '12px' }}>Model ID</th>
                <th style={{ padding: '12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'entity_extraction', label: 'Entity & Relationship Extraction' },
                { key: 'relationship_detection', label: 'Network Profiling & Reasoner' },
                { key: 'summarization', label: 'Document & Knowledge Summarizer' },
                { key: 'general_qa', label: 'OpenWebUI Context Prompting' }
              ].map((taskObj) => {
                const cur = assignments.find(a => a.task === taskObj.key);
                return (
                  <tr key={taskObj.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '14px' }}>
                    <td style={{ padding: '14px 12px', fontWeight: '600', color: '#ffffff' }}>
                      {taskObj.label}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <select
                        className="input-field"
                        style={{ padding: '6px 12px', width: 'auto' }}
                        value={cur?.backend_id || backends[0]?.id || ''}
                        onChange={(e) => {
                          const bId = parseInt(e.target.value);
                          const bObj = backends.find(b => b.id === bId);
                          const model = bObj?.available_models?.[0] || 'Qwen/Qwen3.6-35B-A3B-FP8';
                          handleUpdateAssignment(taskObj.key, bId, model);
                        }}
                      >
                        {backends.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.backend_type})</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '6px 12px', width: '260px' }}
                        defaultValue={cur?.model_name || 'Qwen/Qwen3.6-35B-A3B-FP8'}
                        onBlur={(e) => {
                          const bId = cur?.backend_id || backends[0]?.id;
                          if (bId) handleUpdateAssignment(taskObj.key, bId, e.target.value);
                        }}
                      />
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <span className="badge badge-success">Active</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Backend Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', marginBottom: '20px' }}>
              Add LLM Backend (vLLM / Ollama / OpenAI)
            </h2>
            <form onSubmit={handleCreateBackend} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Backend Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Local vLLM Cluster"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Type
                  </label>
                  <select
                    className="input-field"
                    value={backendType}
                    onChange={(e) => setBackendType(e.target.value)}
                  >
                    <option value="vllm">vLLM</option>
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom Compatible</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    API Key (Optional)
                  </label>
                  <input
                    type="password"
                    className="input-field font-mono"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  API Base URL
                </label>
                <input
                  type="url"
                  className="input-field font-mono"
                  placeholder="http://172.16.21.122:18000/v1"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  required
                />
              </div>

              {testResult && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  color: testResult.success ? '#34d399' : '#f87171'
                }}>
                  {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {testResult.message}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={handleTestConnection} disabled={testing}>
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Register Backend'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
