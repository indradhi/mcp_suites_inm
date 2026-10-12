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
  Clock,
  Copy,
  BookOpen,
  Sparkles
} from 'lucide-react';
import api from '../../api/client';
import { inferFieldDescription, inferFieldDataType } from '../../utils/fieldDefinitionHelper';
import ValidityTierSelector from '../common/ValidityTierSelector';

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

  // Cache States
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(60);

  // Field Definitions (Kamus Data Balikan)
  const [fieldDefinitions, setFieldDefinitions] = useState([]);

  // Validity Hierarchy States
  const [validityTier, setValidityTier] = useState('authoritative');
  const [validityScore, setValidityScore] = useState(95);
  const [validityNotes, setValidityNotes] = useState('');

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
      setFieldDefinitions(conf.field_definitions || []);

      // Cache settings — read from top-level cache_ttl_minutes
      const ttl = initialData.cache_ttl_minutes;
      setCacheEnabled(!!ttl && ttl > 0);
      setCacheTtlMinutes(ttl && ttl > 0 ? ttl : 60);

      setValidityTier(conf.validity_tier || (isToolMode ? 'authoritative' : 'secondary'));
      setValidityScore(conf.validity_score !== undefined ? conf.validity_score : (isToolMode ? 95 : 65));
      setValidityNotes(conf.validity_notes || '');

      // Pre-fill test arguments from parameters defaults
      const initialTestArgs = {};
      (conf.parameters || []).forEach(p => {
        if (p.name) initialTestArgs[p.name] = p.default || '';
      });
      setTestArgs(initialTestArgs);
      setTestResult(null);
      setTesting(false);
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
      setFieldDefinitions([]);
      setCacheEnabled(false);
      setCacheTtlMinutes(60);
      setValidityTier('authoritative');
      setValidityScore(95);
      setValidityNotes('');
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

  // Field Definitions Handlers
  const handleAddFieldDefinition = () => {
    setFieldDefinitions(prev => [
      ...prev,
      { name: '', type: 'string', description: '', sample: '' }
    ]);
  };

  const handleUpdateFieldDefinition = (index, field, value) => {
    setFieldDefinitions(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveFieldDefinition = (index) => {
    setFieldDefinitions(prev => prev.filter((_, i) => i !== index));
  };

  const handleAutoDetectFieldDefinitions = () => {
    const rawData = testResult?.result?.data || testResult?.data;
    if (!rawData) {
      alert('Belum ada data hasil test untuk dideteksi. Silakan jalankan Test Endpoint / Test Tool Call terlebih dahulu.');
      return;
    }

    let parsedRaw = rawData;
    if (typeof parsedRaw === 'string') {
      try {
        parsedRaw = JSON.parse(parsedRaw);
      } catch (e) {
        // keep as is
      }
    }

    let sampleItem = null;
    if (Array.isArray(parsedRaw) && parsedRaw.length > 0) {
      sampleItem = parsedRaw[0];
    } else if (typeof parsedRaw === 'object' && parsedRaw !== null) {
      if (Array.isArray(parsedRaw.data) && parsedRaw.data.length > 0) {
        sampleItem = parsedRaw.data[0];
      } else if (Array.isArray(parsedRaw.results) && parsedRaw.results.length > 0) {
        sampleItem = parsedRaw.results[0];
      } else if (Array.isArray(parsedRaw.records) && parsedRaw.records.length > 0) {
        sampleItem = parsedRaw.records[0];
      } else {
        sampleItem = parsedRaw;
      }
    }

    if (!sampleItem || typeof sampleItem !== 'object') {
      alert('Format data hasil test tidak dapat dideteksi secara otomatis.');
      return;
    }

    const existingMap = new Map();
    fieldDefinitions.forEach(fd => {
      if (fd.name) existingMap.set(fd.name.toLowerCase().trim(), fd);
    });

    const extractFields = (obj, prefix = '') => {
      let fields = [];
      if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
          fields = fields.concat(extractFields(obj[0], prefix));
        }
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          const val = obj[key];
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          
          fields.push({
            key: newPrefix,
            val: val
          });
          
          if (typeof val === 'object' && val !== null) {
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
               fields = fields.concat(extractFields(val[0], newPrefix));
            } else if (!Array.isArray(val)) {
               fields = fields.concat(extractFields(val, newPrefix));
            }
          }
        });
      }
      return fields;
    };

    const detected = [];
    const extracted = extractFields(sampleItem);

    extracted.forEach(item => {
      const { key, val } = item;
      const inferredType = inferFieldDataType(key, val);

      const existing = existingMap.get(key.toLowerCase().trim());
      const autoDescription = (existing?.description && existing.description.trim() !== '')
        ? existing.description
        : inferFieldDescription(key, inferredType, val);

      detected.push({
        name: key,
        type: existing?.type || inferredType,
        description: autoDescription,
        sample: (val !== null && val !== undefined) ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : (existing?.sample || '')
      });
    });

    setFieldDefinitions(detected);
  };

  const handleAutoFillEmptyDescriptions = () => {
    setFieldDefinitions(prev => prev.map(fd => ({
      ...fd,
      description: (fd.description && fd.description.trim() !== '')
        ? fd.description
        : inferFieldDescription(fd.name, fd.type, fd.sample)
    })));
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
      const validFieldDefs = fieldDefinitions.filter(f => f.name && f.name.trim() !== '');

      const payload = {
        name,
        source_type: 'api',
        description: isTool && toolDescription
          ? `[AI Tool] ${toolDescription}`
          : `API Endpoint: ${endpoint}`,
        cache_ttl_minutes: isTool && cacheEnabled ? cacheTtlMinutes : null,
        config: {
          endpoint,
          method,
          verify_ssl: verifySsl,
          auth: authConfig,
          is_tool: isTool,
          tool_name: isTool ? (toolName.trim() || `api_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`) : undefined,
          tool_description: isTool ? (toolDescription.trim() || `Dynamic API Tool for ${name}`) : undefined,
          parameters: validParameters,
          field_definitions: validFieldDefs,
          validity_tier: validityTier,
          validity_score: validityScore,
          validity_notes: validityNotes
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
      const validFieldDefs = fieldDefinitions.filter(f => f.name && f.name.trim() !== '');
      const copyName = name.includes('(Copy') ? name : `${name} (Copy)`;
      const copyToolName = isTool && toolName ? (toolName.includes('_copy') ? toolName : `${toolName}_copy`) : undefined;

      const payload = {
        name: copyName,
        source_type: 'api',
        cache_ttl_minutes: isTool && cacheEnabled ? cacheTtlMinutes : null,
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
          parameters: validParameters,
          field_definitions: validFieldDefs,
          validity_tier: validityTier,
          validity_score: validityScore,
          validity_notes: validityNotes
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
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
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
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.background = 'var(--border-subtle)'; }}
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
                    background: authMode === m.id ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-glass-light)',
                    border: authMode === m.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                    color: authMode === m.id ? 'var(--text-main)' : 'var(--text-secondary)',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--bg-glass-2)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
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
            background: isTool ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-glass-2)',
            border: isTool ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid var(--border-subtle)',
            transition: 'all 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: isTool ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-glass-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={18} color={isTool ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
                      Mode Query On-Demand (Auto Simpan ke Bank Data Vektor)
                    </span>
                    {isTool && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{
                          background: 'rgba(6, 182, 212, 0.15)',
                          color: 'var(--accent-cyan)',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(6, 182, 212, 0.35)'
                        }}>
                          MCP & CHAT CALLABLE
                        </span>
                        <span style={{
                          background: 'rgba(5, 150, 105, 0.15)',
                          color: '#059669',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(5, 150, 105, 0.35)'
                        }}>
                          AUTO BANK DATA
                        </span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: '1.4' }}>
                    Model AI di MCP clients dan Backoffice Chat akan memanggil API ini secara real-time berdasarkan parameter. Setiap data hasil query otomatis disimpan ke ChromaDB Vector Store sebagai Bank Data terakumulasi.
                  </p>
                </div>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer', flexShrink: 0 }}>
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
                    backgroundColor: 'var(--text-main)',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }} />
                </span>
              </label>
            </div>

            {isTool && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                fontSize: '12px',
                color: 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Zap size={14} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                <span><strong>Auto Bank Data Aktif:</strong> Setiap respons API hasil query otomatis di-ingest dan diakumulasikan ke ChromaDB Vector Store sebagai Bank Data terverifikasi.</span>
              </div>
            )}
            {!isTool && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                💡 <strong>Mode Standar: Batch Ingestion</strong> — Respons endpoint akan diambil berkala dan diindeks ke ChromaDB. Aktifkan saklar di atas untuk Mode On-Demand berparameter dengan penyimpanan otomatis ke Bank Data.
              </div>
            )}

            {/* AI Tool Specific Fields */}
            {isTool && (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
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
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                    <div style={{ padding: '14px', textAlign: 'center', background: 'var(--bg-glass-2)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
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
                            background: 'var(--bg-glass-1)',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)'
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

                {/* Cache Settings */}
                <div style={{
                  marginTop: '4px',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: cacheEnabled ? 'rgba(217, 119, 6, 0.08)' : 'var(--bg-glass-2)',
                  border: cacheEnabled ? '1px solid rgba(217, 119, 6, 0.35)' : '1px solid var(--border-subtle)',
                  transition: 'all 0.2s'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Clock size={16} color={cacheEnabled ? '#d97706' : 'var(--text-muted)'} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: cacheEnabled ? '#d97706' : 'var(--text-main)' }}>
                          Cache Hasil Tool Call
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Parameter yang sama akan mengembalikan data tersimpan tanpa memanggil API ulang
                        </div>
                      </div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={cacheEnabled}
                        onChange={(e) => setCacheEnabled(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: cacheEnabled ? '#d97706' : 'var(--border-subtle)',
                        borderRadius: '34px',
                        transition: '0.3s'
                      }}>
                        <span style={{
                          position: 'absolute',
                          height: '18px',
                          width: '18px',
                          left: cacheEnabled ? '23px' : '3px',
                          bottom: '3px',
                          backgroundColor: 'var(--text-main)',
                          borderRadius: '50%',
                          transition: '0.3s'
                        }} />
                      </span>
                    </label>
                  </div>

                  {cacheEnabled && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#b45309', whiteSpace: 'nowrap' }}>
                        Masa Berlaku Cache
                      </label>
                      <input
                        type="number"
                        className="input-field"
                        min="1"
                        max="10080"
                        value={cacheTtlMinutes}
                        onChange={(e) => setCacheTtlMinutes(Math.max(1, parseInt(e.target.value) || 60))}
                        style={{ width: '90px', textAlign: 'center', fontSize: '13px' }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>menit</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        ({cacheTtlMinutes >= 60 ? `${(cacheTtlMinutes / 60).toFixed(1)} jam` : `${cacheTtlMinutes} mnt`})
                      </span>
                    </div>
                  )}
                </div>

                {/* Live Test Parameter Values */}
                {parameters.filter(p => p.name).length > 0 && (
                  <div style={{ padding: '14px', background: 'var(--bg-glass-2)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Play size={13} color="var(--accent-cyan)" /> Test Parameter Values for Live Validation
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      {parameters.filter(p => p.name).map((p, idx) => (
                        <div key={idx}>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            {p.name} {p.required && <span style={{ color: '#ef4444' }}>*</span>}
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

          {/* Test API Tool / Endpoint Call Button */}
          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleTest}
              disabled={testing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {testing ? 'Executing...' : (isTool ? '⚡ Test API Tool Call' : '⚡ Test Endpoint & Sample Data')}
            </button>
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
              background: testResult.success ? 'rgba(5, 150, 105, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testResult.success ? 'rgba(5, 150, 105, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
              color: testResult.success ? '#059669' : '#dc2626'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                {testResult.success ? <CheckCircle size={16} color="#059669" /> : <AlertCircle size={16} color="#dc2626" />}
                <span style={{ color: testResult.success ? '#059669' : '#dc2626' }}>{testResult.message}</span>
              </div>
              {Boolean(testResult.result?.data || testResult.data) && (
                <div style={{
                  marginTop: '8px',
                  background: 'var(--bg-glass-2)',
                  border: '1px solid var(--border-subtle)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  color: 'var(--text-main)',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {JSON.stringify(testResult.result?.data || testResult.data, null, 2)}
                </div>
              )}
            </div>
          )}

          {/* Field Definitions (Kamus Data / Output Schema) */}
          <div style={{
            padding: '16px',
            borderRadius: '10px',
            background: 'var(--bg-glass-2)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} color="var(--accent-primary)" />
                  <span>Definisi Field Balikan (Kamus Data / Schema Output)</span>
                  <span style={{
                    fontSize: '10px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--accent-primary)',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {fieldDefinitions.length} Field
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '560px' }}>
                  Bantu AI memahami secara tepat arti, singkatan, tipe, dan kode angka setiap kolom yang dikembalikan oleh API ini agar interpretasi jawaban akurat dan bebas halusinasi.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {Boolean(
                  (testResult?.result?.data && (Array.isArray(testResult.result.data) ? testResult.result.data.length > 0 : true)) ||
                  testResult?.data
                ) && (
                    <button
                      type="button"
                      onClick={handleAutoDetectFieldDefinitions}
                      style={{
                        background: 'rgba(5, 150, 105, 0.12)',
                        border: '1px solid rgba(5, 150, 105, 0.35)',
                        color: '#059669',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Ekstrak nama field dan tipe data otomatis dari respons hasil test di atas"
                    >
                      <Sparkles size={13} color="#059669" />
                      <span>Deteksi Otomatis dari Test</span>
                    </button>
                  )}

                {fieldDefinitions.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoFillEmptyDescriptions}
                    style={{
                      background: 'rgba(217, 119, 6, 0.12)',
                      border: '1px solid rgba(217, 119, 6, 0.35)',
                      color: '#d97706',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Isi otomatis definisi bantuan awal untuk field yang deskripsinya masih kosong"
                  >
                    <Sparkles size={13} color="#d97706" />
                    <span>Auto-Fill Definisi Kosong</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddFieldDefinition}
                  style={{
                    background: 'var(--bg-glass-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Plus size={13} />
                  <span>Tambah Field</span>
                </button>
              </div>
            </div>

            {fieldDefinitions.length === 0 ? (
              <div style={{
                padding: '14px',
                textAlign: 'center',
                background: 'var(--bg-glass-2)',
                borderRadius: '8px',
                border: '1px dashed var(--border-subtle)',
                fontSize: '11.5px',
                color: 'var(--text-muted)',
                lineHeight: '1.5'
              }}>
                Belum ada definisi field. Klik <strong>"Tambah Field"</strong> manual atau jalankan test lalu klik <strong>"⚡ Deteksi Otomatis dari Test"</strong> untuk mendeteksi field sekaligus mengisi definisi otomatis untuk AI.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-glass-2))',
                  border: '1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Sparkles size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                  <span style={{ lineHeight: '1.4' }}>
                    Definisi terisi otomatis sebagai bantuan deteksi awal untuk AI. Anda dapat menyunting atau memperjelas arti field sesuai kebutuhan.
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 100px 2.2fr 1.2fr 36px',
                  gap: '8px',
                  padding: '0 8px',
                  fontSize: '10.5px',
                  fontWeight: '700',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <div>Nama Kolom / Key</div>
                  <div>Tipe Data</div>
                  <div>Definisi / Arti untuk AI</div>
                  <div>Contoh / Nilai Kode</div>
                  <div style={{ textAlign: 'center' }}>Hapus</div>
                </div>

                {fieldDefinitions.map((fd, fIdx) => (
                  <div
                    key={fIdx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 100px 2.2fr 1.2fr 36px',
                      gap: '8px',
                      alignItems: 'center',
                      background: 'var(--bg-glass-1)',
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div>
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '6px 8px', fontSize: '11.5px' }}
                        placeholder="e.g. nik"
                        value={fd.name || ''}
                        onChange={(e) => handleUpdateFieldDefinition(fIdx, 'name', e.target.value)}
                      />
                    </div>

                    <div>
                      <select
                        className="input-field"
                        style={{ padding: '6px 6px', fontSize: '11px' }}
                        value={fd.type || 'string'}
                        onChange={(e) => handleUpdateFieldDefinition(fIdx, 'type', e.target.value)}
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                        <option value="object">object</option>
                        <option value="array">array</option>
                      </select>
                    </div>

                    <div>
                      <input
                        type="text"
                        className="input-field"
                        style={{ padding: '6px 8px', fontSize: '11.5px' }}
                        placeholder="e.g. Nomor Induk Kependudukan 16 digit resmi"
                        value={fd.description || ''}
                        onChange={(e) => handleUpdateFieldDefinition(fIdx, 'description', e.target.value)}
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '6px 8px', fontSize: '11px' }}
                        placeholder="e.g. 317507... / 1=PNS"
                        value={fd.sample || ''}
                        onChange={(e) => handleUpdateFieldDefinition(fIdx, 'sample', e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveFieldDefinition(fIdx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                        title="Hapus field ini"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>



          {/* Validity Tier Hierarchy Selector */}
          <ValidityTierSelector
            valueTier={validityTier}
            valueScore={validityScore}
            valueNotes={validityNotes}
            onChangeTier={setValidityTier}
            onChangeScore={setValidityScore}
            onChangeNotes={setValidityNotes}
          />

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
            {initialData ? (
              <button
                type="button"
                className="btn-secondary"
                id="btn-save-as-duplicate-api"
                onClick={handleSaveAsCopy}
                disabled={submitting || testing}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7c3aed', borderColor: 'rgba(124, 58, 237, 0.35)', background: 'rgba(124, 58, 237, 0.08)' }}
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
