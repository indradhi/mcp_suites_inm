import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  Edit2, 
  Zap, 
  Plus, 
  Trash2, 
  Code, 
  Play, 
  HelpCircle,
  Copy
} from 'lucide-react';
import api from '../../api/client';

export default function AddApiModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [method, setMethod] = useState('GET');
  const [authMode, setAuthMode] = useState('static'); // static, oauth2, none
  const [bearerToken, setBearerToken] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [verifySsl, setVerifySsl] = useState(false);
  
  // AI Tool Mode States
  const [isTool, setIsTool] = useState(false);
  const [toolName, setToolName] = useState('');
  const [toolDescription, setToolDescription] = useState('');
  const [parameters, setParameters] = useState([]);
  const [testArgs, setTestArgs] = useState({});
  
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      const conf = initialData.config || {};
      setEndpoint(conf.endpoint || '');
      setMethod(conf.method || 'GET');
      const auth = conf.auth || {};
      setAuthMode(auth.mode || 'none');
      setBearerToken(auth.token || '');
      setTokenUrl(auth.token_url || '');
      setClientId(auth.payload?.client_id || '');
      setClientSecret(auth.payload?.client_secret || '');
      setVerifySsl(conf.verify_ssl !== undefined ? Boolean(conf.verify_ssl) : false);
      
      const isToolMode = Boolean(conf.is_tool || (conf.parameters && conf.parameters.length > 0));
      setIsTool(isToolMode);
      setToolName(conf.tool_name || '');
      setToolDescription(conf.tool_description || '');
      setParameters(conf.parameters || []);

      // Pre-fill test arguments from parameters defaults
      const initialTestArgs = {};
      (conf.parameters || []).forEach(p => {
        if (p.name) initialTestArgs[p.name] = p.default || '';
      });
      setTestArgs(initialTestArgs);
    } else if (isOpen && !initialData) {
      setName('');
      setEndpoint('');
      setMethod('GET');
      setAuthMode('static');
      setBearerToken('');
      setTokenUrl('');
      setClientId('');
      setClientSecret('');
      setVerifySsl(false);
      setIsTool(false);
      setToolName('');
      setToolDescription('');
      setParameters([]);
      setTestArgs({});
      setTestResult(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleNameChange = (val) => {
    setName(val);
    if (!toolName && isTool) {
      const generated = 'api_' + val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      setToolName(generated);
    }
  };

  const handleToggleToolMode = (checked) => {
    setIsTool(checked);
    if (checked && !toolName && name) {
      const generated = 'api_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      setToolName(generated);
    }
    if (checked && parameters.length === 0) {
      // Add one default query param as a helpful starter
      setParameters([
        { name: 'query', in: 'query', type: 'string', description: 'Search or filter parameter', required: true, default: '' }
      ]);
      setTestArgs({ query: '' });
    }
  };

  const handleAddParameter = () => {
    setParameters(prev => [
      ...prev,
      { name: '', in: 'query', type: 'string', description: '', required: false, default: '' }
    ]);
  };

  const handleUpdateParameter = (index, field, value) => {
    setParameters(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveParameter = (index) => {
    setParameters(prev => prev.filter((_, i) => i !== index));
  };

  const handleTestArgChange = (paramName, val) => {
    setTestArgs(prev => ({ ...prev, [paramName]: val }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const authConfig = authMode === 'static'
        ? { mode: 'static', token: bearerToken }
        : authMode === 'oauth2'
        ? { mode: 'oauth2', token_url: tokenUrl, payload: { client_id: clientId, client_secret: clientSecret } }
        : {};

      const configPayload = {
        endpoint,
        method,
        verify_ssl: verifySsl,
        auth: authConfig,
        is_tool: isTool,
        tool_name: toolName.trim() || undefined,
        tool_description: toolDescription.trim() || undefined,
        parameters: isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [],
        test_arguments: isTool ? testArgs : {}
      };

      const res = await api.post('/knowledge/test-connection', {
        source_type: 'api',
        config: configPayload
      });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.detail || err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const authConfig = authMode === 'static'
        ? { mode: 'static', token: bearerToken }
        : authMode === 'oauth2'
        ? { mode: 'oauth2', token_url: tokenUrl, payload: { client_id: clientId, client_secret: clientSecret } }
        : {};

      const validParameters = isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [];

      const payload = {
        name,
        source_type: 'api',
        description: isTool && toolDescription 
          ? `[AI Tool] ${toolDescription}` 
          : `API Endpoint: ${endpoint}`,
        config: {
          endpoint,
          method,
          verify_ssl: verifySsl,
          auth: authConfig,
          is_tool: isTool,
          tool_name: isTool ? (toolName.trim() || `api_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`) : undefined,
          tool_description: isTool ? (toolDescription.trim() || `Dynamic API Tool for ${name}`) : undefined,
          parameters: validParameters
        }
      };

      if (initialData) {
        await api.put(`/knowledge/sources/${initialData.id}?re_sync=true`, payload);
      } else {
        await api.post('/knowledge/sources', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAsCopy = async () => {
    setSubmitting(true);
    try {
      const authConfig = authMode === 'static'
        ? { mode: 'static', token: bearerToken }
        : authMode === 'oauth2'
        ? { mode: 'oauth2', token_url: tokenUrl, payload: { client_id: clientId, client_secret: clientSecret } }
        : {};

      const validParameters = isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [];
      const copyName = name.includes('(Copy') ? name : `${name} (Copy)`;
      const copyToolName = isTool && toolName ? (toolName.includes('_copy') ? toolName : `${toolName}_copy`) : undefined;

      const payload = {
        name: copyName,
        source_type: 'api',
        description: isTool && toolDescription 
          ? `[AI Tool] ${toolDescription}` 
          : `API Endpoint: ${endpoint}`,
        config: {
          endpoint,
          method,
          verify_ssl: verifySsl,
          auth: authConfig,
          is_tool: isTool,
          tool_name: copyToolName,
          tool_description: isTool ? (toolDescription.trim() || `Dynamic API Tool for ${copyName}`) : undefined,
          parameters: validParameters
        }
      };

      await api.post('/knowledge/sources', payload);
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error saving copy: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          padding: '32px', 
          maxWidth: '820px', 
          maxHeight: '90vh', 
          overflowY: 'auto' 
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {initialData ? <Edit2 size={22} color="var(--accent-cyan)" /> : <Globe size={22} color="var(--accent-cyan)" />}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                {initialData ? 'Edit API Knowledge Source' : 'Register API Knowledge Source'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Expose REST APIs as dynamic AI tools or bulk vector knowledge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Tutup Modal"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Basic Info */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Source Name
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Customer CRM API / Weather Service"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Method
              </label>
              <select
                className="input-field"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Endpoint URL <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(supports <code style={{ color: 'var(--accent-cyan)' }}>&#123;param&#125;</code> for path variables)</span>
              </label>
              <input
                type="text"
                className="input-field font-mono"
                placeholder="https://api.example.com/v1/customers/{id}"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                required
              />
            </div>
          </div>

          {/* SSL Verification Option */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-4px' }}>
            <input
              type="checkbox"
              id="verify_ssl"
              checked={verifySsl}
              onChange={(e) => setVerifySsl(e.target.checked)}
              style={{ accentColor: 'var(--accent-cyan)', cursor: 'pointer', width: '15px', height: '15px' }}
            />
            <label htmlFor="verify_ssl" style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              Verifikasi Sertifikat SSL <span style={{ color: 'var(--text-muted)' }}>(Biarkan tidak tercentang untuk endpoint internal KPK / sertifikat self-signed)</span>
            </label>
          </div>

          {/* Authentication Mode */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Authentication Mode
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[
                { id: 'static', label: 'Static Bearer Token' },
                { id: 'oauth2', label: 'OAuth2 / Dynamic Bearer' },
                { id: 'none', label: 'No Auth / Public' }
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setAuthMode(m.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: authMode === m.id ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: authMode === m.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                    color: authMode === m.id ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.2s'
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {authMode === 'static' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Bearer Token
              </label>
              <input
                type="password"
                className="input-field font-mono"
                placeholder="eyJhbGciOi..."
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
              />
            </div>
          )}

          {authMode === 'oauth2' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Token Endpoint URL
                </label>
                <input
                  type="url"
                  className="input-field font-mono"
                  placeholder="https://auth.example.com/oauth/token"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Client ID
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Client Secret
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* AI Tool Mode Toggle Box */}
          <div style={{
            padding: '18px 20px',
            borderRadius: '10px',
            background: isTool ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: isTool ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid var(--border-color)',
            transition: 'all 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: isTool ? 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={18} color={isTool ? '#ffffff' : 'var(--text-muted)'} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>
                      Expose as AI Tool with Parameters
                    </span>
                    {isTool && (
                      <span style={{
                        background: 'rgba(6, 182, 212, 0.2)',
                        color: 'var(--accent-cyan)',
                        fontSize: '10px',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        border: '1px solid rgba(6, 182, 212, 0.4)'
                      }}>
                        MCP & CHAT CALLABLE
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Allow AI models in MCP clients and Backoffice Chat to invoke this API on demand using dynamic parameters
                  </p>
                </div>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isTool}
                  onChange={(e) => handleToggleToolMode(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: isTool ? '#06b6d4' : 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '34px',
                  transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '20px',
                    width: '20px',
                    left: isTool ? '24px' : '3px',
                    bottom: '3px',
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }} />
                </span>
              </label>
            </div>

            {/* AI Tool Specific Fields */}
            {isTool && (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Tool Identifier (Name)
                    </label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      placeholder="e.g. query_customers"
                      value={toolName}
                      onChange={(e) => setToolName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      required={isTool}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Alphanumeric + underscores only</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      AI Function Description / Prompt Instruction
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Describe what data this tool retrieves and when the AI should call it"
                      value={toolDescription}
                      onChange={(e) => setToolDescription(e.target.value)}
                      required={isTool}
                    />
                  </div>
                </div>

                {/* Parameters Builder */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Code size={14} color="var(--accent-cyan)" /> Parameters Schema ({parameters.length})
                    </label>
                    <button
                      type="button"
                      onClick={handleAddParameter}
                      style={{
                        background: 'rgba(6, 182, 212, 0.15)',
                        border: '1px solid rgba(6, 182, 212, 0.4)',
                        color: 'var(--accent-cyan)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={12} /> Add Parameter
                    </button>
                  </div>

                  {parameters.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      No parameters defined yet. Click "Add Parameter" to configure query, path, or body parameters.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {parameters.map((param, pIdx) => (
                        <div
                          key={pIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 90px 85px 2fr 75px 1fr 32px',
                            gap: '8px',
                            alignItems: 'center',
                            background: 'rgba(0,0,0,0.3)',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.05)'
                          }}
                        >
                          <div>
                            <input
                              type="text"
                              className="input-field font-mono"
                              style={{ padding: '6px 8px', fontSize: '12px' }}
                              placeholder="param_name"
                              value={param.name || ''}
                              onChange={(e) => handleUpdateParameter(pIdx, 'name', e.target.value)}
                              required={isTool}
                            />
                          </div>

                          <div>
                            <select
                              className="input-field"
                              style={{ padding: '6px 4px', fontSize: '11px' }}
                              value={param.in || 'query'}
                              onChange={(e) => handleUpdateParameter(pIdx, 'in', e.target.value)}
                            >
                              <option value="query">query</option>
                              <option value="path">path</option>
                              <option value="body">body</option>
                              <option value="header">header</option>
                            </select>
                          </div>

                          <div>
                            <select
                              className="input-field"
                              style={{ padding: '6px 4px', fontSize: '11px' }}
                              value={param.type || 'string'}
                              onChange={(e) => handleUpdateParameter(pIdx, 'type', e.target.value)}
                            >
                              <option value="string">string</option>
                              <option value="integer">integer</option>
                              <option value="number">number</option>
                              <option value="boolean">boolean</option>
                            </select>
                          </div>

                          <div>
                            <input
                              type="text"
                              className="input-field"
                              style={{ padding: '6px 8px', fontSize: '12px' }}
                              placeholder="Description for LLM"
                              value={param.description || ''}
                              onChange={(e) => handleUpdateParameter(pIdx, 'description', e.target.value)}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <input
                              type="checkbox"
                              id={`req-${pIdx}`}
                              checked={Boolean(param.required)}
                              onChange={(e) => handleUpdateParameter(pIdx, 'required', e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                            <label htmlFor={`req-${pIdx}`} style={{ fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                              Req
                            </label>
                          </div>

                          <div>
                            <input
                              type="text"
                              className="input-field"
                              style={{ padding: '6px 8px', fontSize: '12px' }}
                              placeholder="default"
                              value={param.default || ''}
                              onChange={(e) => handleUpdateParameter(pIdx, 'default', e.target.value)}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveParameter(pIdx)}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                            title="Remove parameter"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Test Parameter Values */}
                {parameters.filter(p => p.name).length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Play size={13} color="var(--accent-cyan)" /> Test Parameter Values for Live Validation
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      {parameters.filter(p => p.name).map((p, idx) => (
                        <div key={idx}>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            {p.name} {p.required && <span style={{ color: '#f87171' }}>*</span>}
                          </label>
                          <input
                            type="text"
                            className="input-field font-mono"
                            style={{ padding: '6px 8px', fontSize: '12px' }}
                            placeholder={p.default || `Value for ${p.name}`}
                            value={testArgs[p.name] !== undefined ? testArgs[p.name] : (p.default || '')}
                            onChange={(e) => handleTestArgChange(p.name, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Test Connection / Tool Output */}
          {testResult && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
              border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
              color: testResult.success ? '#34d399' : '#f87171'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {testResult.message}
              </div>
              {testResult.result?.data && (
                <div style={{
                  marginTop: '6px',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  color: '#e2e8f0',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {JSON.stringify(testResult.result.data, null, 2)}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
            {initialData ? (
              <button
                type="button"
                className="btn-secondary"
                id="btn-save-as-duplicate-api"
                onClick={handleSaveAsCopy}
                disabled={submitting || testing}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.4)', background: 'rgba(167, 139, 250, 0.06)' }}
                title="Simpan konfigurasi saat ini sebagai koneksi baru (duplikat)"
              >
                <Copy size={14} /> Simpan Sebagai Baru (Duplikat)
              </button>
            ) : <div />}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={onClose}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={handleTest} 
                disabled={testing}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {testing ? 'Executing...' : (isTool ? '⚡ Test API Tool Call' : 'Test Endpoint')}
              </button>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={submitting}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {submitting ? 'Saving...' : (initialData ? (isTool ? 'Update AI Tool' : 'Update & Sync') : (isTool ? 'Save & Register Tool' : 'Save & Ingest'))}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
