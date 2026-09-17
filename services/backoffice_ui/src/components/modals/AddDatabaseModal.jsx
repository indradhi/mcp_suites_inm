import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
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
  Layers,
  Copy,
  BookOpen,
  Sparkles
} from 'lucide-react';
import api from '../../api/client';
import { inferFieldDescription, inferFieldDataType } from '../../utils/fieldDefinitionHelper';

export default function AddDatabaseModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dbType, setDbType] = useState('mysql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [database, setDatabase] = useState('');
  const [collection, setCollection] = useState('');
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('SELECT * FROM users LIMIT 100');
  const [limit, setLimit] = useState('5000');
  
  // AI Tool Mode States
  const [isTool, setIsTool] = useState(false);
  const [toolName, setToolName] = useState('');
  const [toolDescription, setToolDescription] = useState('');
  const [parameters, setParameters] = useState([]);
  const [testArgs, setTestArgs] = useState({});

  // Field Definitions (Kamus Data Kolom)
  const [fieldDefinitions, setFieldDefinitions] = useState([]);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      const conf = initialData.config || {};
      setDbType(conf.db_type || 'mysql');
      setHost(conf.host || '');
      setPort(String(conf.port || ''));
      setDatabase(conf.database || '');
      setCollection(conf.collection || '');
      setUsername(conf.username || '');
      setPassword(conf.password || '');
      setQuery(conf.query || '');
      setLimit(conf.limit !== undefined ? String(conf.limit) : '5000');

      const isToolMode = Boolean(conf.is_tool || (conf.parameters && conf.parameters.length > 0));
      setIsTool(isToolMode);
      setToolName(conf.tool_name || '');
      setToolDescription(conf.tool_description || '');
      setParameters(conf.parameters || []);
      setFieldDefinitions(conf.field_definitions || []);

      const initialTestArgs = {};
      (conf.parameters || []).forEach(p => {
        if (p.name) initialTestArgs[p.name] = p.default || '';
      });
      setTestArgs(initialTestArgs);
    } else if (isOpen && !initialData) {
      setName('');
      setDescription('');
      setDbType('mysql');
      setHost('localhost');
      setPort('3306');
      setDatabase('');
      setCollection('');
      setUsername('root');
      setPassword('');
      setQuery('SELECT * FROM users LIMIT 100');
      setLimit('5000');
      setIsTool(false);
      setToolName('');
      setToolDescription('');
      setParameters([]);
      setFieldDefinitions([]);
      setTestArgs({});
      setTestResult(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleDbTypeChange = (type) => {
    setDbType(type);
    if (type === 'mysql') {
      setPort('3306');
      if (query === '{}') setQuery('SELECT * FROM users LIMIT 100');
    } else if (type === 'postgres') {
      setPort('5432');
      if (query === '{}') setQuery('SELECT * FROM users LIMIT 100');
    } else if (type === 'mssql') {
      setPort('1433');
      if (query === '{}') setQuery('SELECT TOP 100 * FROM users');
    } else if (type === 'mongodb') {
      setPort('27017');
      if (!query || query.startsWith('SELECT')) setQuery('{}');
    } else if (type === 'oracle') {
      setPort('1521');
      if (query === '{}') setQuery('SELECT * FROM users WHERE ROWNUM <= 100');
    }
  };

  const handleNameChange = (val) => {
    setName(val);
    if (!toolName && isTool) {
      const generated = 'db_' + val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      setToolName(generated);
    }
  };

  const handleToggleToolMode = (checked) => {
    setIsTool(checked);
    if (checked && !toolName && name) {
      const generated = 'db_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      setToolName(generated);
    }
    if (checked && parameters.length === 0) {
      setParameters([
        { name: 'query_param', type: 'string', description: 'Filter or search keyword', required: true, default: '' }
      ]);
      setTestArgs({ query_param: '' });

      if (query.includes('SELECT * FROM users LIMIT 100') || query === '{}') {
        if (dbType === 'mongodb') {
          setQuery('{\n  "name": { "$regex": ":query_param", "$options": "i" }\n}');
        } else {
          setQuery('SELECT * FROM users WHERE username LIKE CONCAT(\'%\', :query_param, \'%\') LIMIT 50');
        }
      }
    }
  };

  const handleAddParameter = () => {
    setParameters(prev => [
      ...prev,
      { name: '', type: 'string', description: '', required: false, default: '' }
    ]);
  };

  const handleUpdateParameter = (index, field, value) => {
    setParameters(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    if (field === 'default') {
      const pName = parameters[index]?.name;
      if (pName && (testArgs[pName] === undefined || testArgs[pName] === '')) {
        setTestArgs(prev => ({ ...prev, [pName]: value }));
      }
    }
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
    const rawData = testResult?.result?.data || testResult?.result?.records || testResult?.data || testResult?.records;
    const columns = testResult?.result?.columns || testResult?.columns || [];

    if (!rawData && (!columns || columns.length === 0)) {
      alert('Belum ada data hasil query/test untuk dideteksi. Silakan jalankan Test Query / Test Connection terlebih dahulu.');
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
      } else if (Array.isArray(parsedRaw.records) && parsedRaw.records.length > 0) {
        sampleItem = parsedRaw.records[0];
      } else {
        sampleItem = parsedRaw;
      }
    }

    if ((!sampleItem || typeof sampleItem !== 'object') && (!columns || columns.length === 0)) {
      alert('Format data hasil test tidak dapat dideteksi secara otomatis.');
      return;
    }

    const existingMap = new Map();
    fieldDefinitions.forEach(fd => {
      if (fd.name) existingMap.set(fd.name.toLowerCase().trim(), fd);
    });

    const detected = [];
    const keys = (sampleItem && typeof sampleItem === 'object') ? Object.keys(sampleItem) : columns;

    keys.forEach(key => {
      const val = sampleItem ? sampleItem[key] : null;
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
      const validParams = (isTool || parameters.length > 0)
        ? parameters.filter(p => p.name && p.name.trim() !== '')
        : [];

      const resolvedTestArgs = {};
      validParams.forEach(p => {
        const val = testArgs[p.name];
        if (val !== undefined && String(val).trim() !== '') {
          resolvedTestArgs[p.name] = val;
        } else if (p.default !== undefined && String(p.default).trim() !== '') {
          resolvedTestArgs[p.name] = p.default;
        } else {
          resolvedTestArgs[p.name] = '';
        }
      });

      const configPayload = {
        db_type: dbType,
        host,
        port,
        database,
        username,
        password,
        collection,
        query,
        limit: parseInt(limit, 10) >= 0 ? parseInt(limit, 10) : 5000,
        is_tool: isTool || validParams.length > 0,
        tool_name: toolName.trim() || undefined,
        tool_description: toolDescription.trim() || undefined,
        parameters: validParams,
        test_arguments: resolvedTestArgs
      };

      const res = await api.post('/knowledge/test-connection', {
        source_type: 'database',
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
      const validParameters = isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [];
      const validFieldDefs = fieldDefinitions.filter(f => f.name && f.name.trim() !== '');

      const payload = {
        name,
        source_type: 'database',
        description: isTool && toolDescription
          ? `[AI Tool] ${toolDescription}`
          : (description || `Connected to ${dbType.toUpperCase()} database (${database})`),
        config: {
          db_type: dbType,
          host,
          port,
          database,
          username,
          password,
          collection,
          query,
          limit: parseInt(limit, 10) >= 0 ? parseInt(limit, 10) : 5000,
          is_tool: isTool,
          tool_name: isTool ? (toolName.trim() || `db_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`) : undefined,
          tool_description: isTool ? (toolDescription.trim() || `Dynamic Database Tool for ${name}`) : undefined,
          parameters: validParameters,
          field_definitions: validFieldDefs
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
      alert('Error saving source: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAsCopy = async () => {
    setSubmitting(true);
    try {
      const validParameters = isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [];
      const validFieldDefs = fieldDefinitions.filter(f => f.name && f.name.trim() !== '');
      const copyName = name.includes('(Copy') ? name : `${name} (Copy)`;
      const copyToolName = isTool && toolName ? (toolName.includes('_copy') ? toolName : `${toolName}_copy`) : undefined;
      const payload = {
        name: copyName,
        source_type: 'database',
        description: isTool && toolDescription
          ? `[AI Tool] ${toolDescription}`
          : (description || `Connected to ${dbType.toUpperCase()} database (${database})`),
        config: {
          db_type: dbType,
          host,
          port,
          database,
          username,
          password,
          collection,
          query,
          limit: parseInt(limit, 10) >= 0 ? parseInt(limit, 10) : 5000,
          is_tool: isTool,
          tool_name: copyToolName,
          tool_description: isTool ? (toolDescription.trim() || `Dynamic Database Tool for ${copyName}`) : undefined,
          parameters: validParameters,
          field_definitions: validFieldDefs
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
          maxWidth: '840px', 
          maxHeight: '90vh', 
          overflowY: 'auto' 
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {initialData ? <Edit2 size={22} color="var(--accent-primary)" /> : <Database size={22} color="var(--accent-primary)" />}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                {initialData ? 'Edit Database Source' : 'Add Database Knowledge Source'}
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Connect SQL or MongoDB instances for knowledge indexing or dynamic AI tool execution
              </span>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Database Engine Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Database Engine
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {['mysql', 'postgres', 'mssql', 'mongodb', 'oracle'].map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => handleDbTypeChange(type)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    background: dbType === type ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: dbType === type ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    color: dbType === type ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Source Display Name
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. BPN Tanah Search DB"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Description (Optional)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder={`Connected to ${dbType.toUpperCase()} database (${database || 'main'})`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Connection Host, Port, Database, Credentials */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Host
              </label>
              <input
                type="text"
                className="input-field"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Port
              </label>
              <input
                type="text"
                className="input-field font-mono"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Database Name {dbType === 'oracle' && '(or Service Name)'}
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. db_bpn or app_production"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Username
              </label>
              <input
                type="text"
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {dbType === 'mongodb' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Collection Name
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. users, products, or tbl_search_result"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                required
              />
            </div>
          )}

          {/* AI Tool Mode Toggle Box */}
          <div style={{
            padding: '18px 20px',
            borderRadius: '10px',
            background: isTool ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: isTool ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--border-color)',
            transition: 'all 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: isTool ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={18} color={isTool ? '#ffffff' : 'var(--text-muted)'} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>
                      Mode Query On-Demand (Auto Simpan ke Bank Data Vektor)
                    </span>
                    {isTool && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          color: 'var(--accent-primary)',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(99, 102, 241, 0.4)'
                        }}>
                          MCP & CHAT CALLABLE
                        </span>
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34d399',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(16, 185, 129, 0.4)'
                        }}>
                          AUTO BANK DATA
                        </span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: '1.4' }}>
                    Model AI di MCP clients dan Backoffice Chat akan melakukan query langsung ke database secara real-time berdasarkan parameter. Setiap data hasil query akan <strong>otomatis disimpan ke ChromaDB Vector Store</strong> sebagai Bank Data terakumulasi.
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
                  backgroundColor: isTool ? '#6366f1' : 'rgba(255, 255, 255, 0.2)',
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

            {isTool && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                fontSize: '12px',
                color: '#c7d2fe',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Zap size={14} color="#818cf8" style={{ flexShrink: 0 }} />
                <span><strong>Auto Bank Data Aktif:</strong> Setiap record hasil query otomatis di-ingest dan diakumulasikan ke ChromaDB Vector Store sebagai Bank Data terverifikasi.</span>
              </div>
            )}
            {!isTool && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                💡 <strong>Mode Standar: Batch Ingestion</strong> — Mengekstrak seluruh isi tabel sekaligus ke Vector Store. Aktifkan saklar di atas untuk Mode On-Demand berparameter dengan penyimpanan otomatis ke Bank Data.
              </div>
            )}

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
                      placeholder="e.g. query_land_records"
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
                      placeholder="Describe what data this query returns and when the AI should execute it"
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
                      <Code size={14} color="var(--accent-primary)" /> Query Parameters Schema ({parameters.length})
                    </label>
                    <button
                      type="button"
                      onClick={handleAddParameter}
                      style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        color: 'var(--accent-primary)',
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
                      No parameters defined yet. Click "Add Parameter" to configure query placeholders.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {parameters.map((param, pIdx) => (
                        <div
                          key={pIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.4fr 100px 2.2fr 75px 1.2fr 32px',
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
                              id={`req-db-${pIdx}`}
                              checked={Boolean(param.required)}
                              onChange={(e) => handleUpdateParameter(pIdx, 'required', e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                            <label htmlFor={`req-db-${pIdx}`} style={{ fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
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

                {/* Live Test Parameter Inputs */}
                {parameters.filter(p => p.name).length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Play size={13} color="var(--accent-primary)" /> Test Parameter Values for Live Validation
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

          {/* Query Editor Box */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                {dbType === 'mongodb' ? 'Mongo Filter / Query (JSON)' : 'Database Query (SQL)'}
              </label>
              {(isTool || parameters.length > 0) && (
                <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {dbType === 'mongodb' ? 'Use :param_name, $param_name, or {param_name}' : 'Use :param_name or {param_name}'}
                </span>
              )}
            </div>
            <textarea
              className="input-field font-mono"
              rows={4}
              placeholder={
                dbType === 'mongodb' 
                  ? (isTool ? '{\n  "nama": { "$regex": ":nama", "$options": "i" }\n}' : '{"status": "active"}')
                  : (isTool ? 'SELECT * FROM tbl_search_result WHERE nama LIKE CONCAT(\'%\', :nama, \'%\') LIMIT 50' : 'SELECT * FROM users LIMIT 100')
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
            {(isTool || parameters.length > 0) && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={12} />
                <span>Values are safely bound and escaped automatically based on their declared type (string, integer, boolean).</span>
              </div>
            )}
          </div>

          {/* Ingestion Limit (when not configured as dynamic AI tool) */}
          {!isTool && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Max Records to Ingest
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Enter 0 for unlimited / all records in table
                </span>
              </div>
              <input
                type="number"
                className="input-field"
                placeholder="5000 (0 for all)"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                min="0"
              />
            </div>
          )}

          {/* Field Definitions (Kamus Data Kolom Database / Schema Output) */}
          <div style={{
            padding: '16px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} color="var(--accent-primary)" />
                  <span>Definisi Kolom / Field Balikan Database (Kamus Data)</span>
                  <span style={{
                    fontSize: '10px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {fieldDefinitions.length} Kolom
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '560px' }}>
                  Bantu AI memahami arti dari setiap kolom, singkatan kode, status numerik, atau nama field teknis pada query database ini.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {Boolean(
                  (testResult?.result?.data && (Array.isArray(testResult.result.data) ? testResult.result.data.length > 0 : true)) ||
                  (testResult?.result?.columns && testResult.result.columns.length > 0) ||
                  testResult?.data
                ) && (
                  <button
                    type="button"
                    onClick={handleAutoDetectFieldDefinitions}
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#34d399',
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
                    title="Ekstrak nama kolom dan tipe data otomatis dari hasil query test di bawah"
                  >
                    <Sparkles size={13} />
                    <span>Deteksi Otomatis dari Test</span>
                  </button>
                )}

                {fieldDefinitions.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoFillEmptyDescriptions}
                    style={{
                      background: 'rgba(234, 179, 8, 0.12)',
                      border: '1px solid rgba(234, 179, 8, 0.35)',
                      color: '#fde047',
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
                    title="Isi otomatis definisi bantuan awal untuk kolom yang deskripsinya masih kosong"
                  >
                    <Sparkles size={13} />
                    <span>Auto-Fill Definisi Kosong</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddFieldDefinition}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#a5b4fc',
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
                  <span>Tambah Kolom</span>
                </button>
              </div>
            </div>

            {fieldDefinitions.length === 0 ? (
              <div style={{
                padding: '14px',
                textAlign: 'center',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                fontSize: '11.5px',
                color: 'var(--text-muted)',
                lineHeight: '1.5'
              }}>
                Belum ada definisi kolom. Klik <strong>"Tambah Kolom"</strong> manual atau jalankan test lalu klik <strong>"⚡ Deteksi Otomatis dari Test"</strong> untuk mendeteksi kolom sekaligus mengisi definisi otomatis untuk AI.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  fontSize: '11px',
                  color: '#c7d2fe',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Sparkles size={13} color="#818cf8" style={{ flexShrink: 0 }} />
                  <span>Definisi terisi otomatis sebagai bantuan deteksi awal untuk AI. Anda dapat menyunting atau memperjelas arti kolom sesuai kebutuhan.</span>
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
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <div>
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '6px 8px', fontSize: '11.5px' }}
                        placeholder="e.g. status_cd"
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
                        placeholder="e.g. 1=Pegawai Tetap, 2=Kontrak"
                        value={fd.description || ''}
                        onChange={(e) => handleUpdateFieldDefinition(fIdx, 'description', e.target.value)}
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '6px 8px', fontSize: '11px' }}
                        placeholder="e.g. 1 / AKTIF"
                        value={fd.sample || ''}
                        onChange={(e) => handleUpdateFieldDefinition(fIdx, 'sample', e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveFieldDefinition(fIdx)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                        title="Hapus kolom ini"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Connection / Query Output */}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: '600' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{testResult.message}</span>
                </div>
                {testResult.result?.latency_ms !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#94a3b8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {testResult.result.latency_ms}ms
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={12} /> {testResult.result.row_count || 0} rows
                    </span>
                  </div>
                )}
              </div>

              {testResult.result?.query && (
                <div style={{
                  marginTop: '4px',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  color: '#93c5fd',
                  border: '1px solid rgba(147, 197, 253, 0.2)'
                }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>Interpolated Query:</span>
                  {testResult.result.query}
                </div>
              )}

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
                id="btn-save-as-duplicate-db"
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
                {testing ? 'Executing...' : (isTool || parameters.length > 0 ? '⚡ Test Query with Parameters' : '⚡ Test Connection & Sample Data')}
              </button>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={submitting}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {submitting ? 'Saving...' : (initialData ? (isTool ? 'Update AI Database Tool' : 'Update & Sync') : (isTool ? 'Save & Register Tool' : 'Save & Ingest'))}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
