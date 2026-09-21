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
  Sparkles,
  Wand2,
  Search,
  CheckSquare,
  Square,
  Filter,
  Check
} from 'lucide-react';
import api from '../../api/client';
import { 
  inferFieldDescription, 
  inferFieldDataType, 
  inferParameterDescription, 
  generateWhereClause, 
  toReadableTitle 
} from '../../utils/fieldDefinitionHelper';
import ValidityTierSelector from '../common/ValidityTierSelector';

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

  // Column Picker & Auto-generate Parameter States
  const [showParamPickerModal, setShowParamPickerModal] = useState(false);
  const [detectedDbColumns, setDetectedDbColumns] = useState([]);
  const [selectedParamColumns, setSelectedParamColumns] = useState([]);
  const [paramSearchQuery, setParamSearchQuery] = useState('');
  const [inspectingForParams, setInspectingForParams] = useState(false);
  const [replaceExistingParams, setReplaceExistingParams] = useState(true);
  const [autoGenWhereOnApply, setAutoGenWhereOnApply] = useState(true);

  // Field Definitions (Kamus Data Kolom)
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [inspectingFieldDefs, setInspectingFieldDefs] = useState(false);

  // Auto-Generate WHERE query states
  const [whereMatchMode, setWhereMatchMode] = useState('smart'); // 'smart' | 'exact'
  const [whereOptionalFilter, setWhereOptionalFilter] = useState(false);
  const [whereFeedback, setWhereFeedback] = useState('');

  // Cache States
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(60);

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

      // Cache settings — read from top-level cache_ttl_minutes
      const ttl = initialData.cache_ttl_minutes;
      setCacheEnabled(!!ttl && ttl > 0);
      setCacheTtlMinutes(ttl && ttl > 0 ? ttl : 60);

      setValidityTier(conf.validity_tier || (isToolMode ? 'authoritative' : 'secondary'));
      setValidityScore(conf.validity_score !== undefined ? conf.validity_score : (isToolMode ? 95 : 65));
      setValidityNotes(conf.validity_notes || '');

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
      setCacheEnabled(false);
      setCacheTtlMinutes(60);
      setValidityTier('authoritative');
      setValidityScore(95);
      setValidityNotes('');
      setTestArgs({});
      setTestResult(null);
      setShowParamPickerModal(false);
      setDetectedDbColumns([]);
      setSelectedParamColumns([]);
      setParamSearchQuery('');
      setInspectingForParams(false);
      setInspectingFieldDefs(false);
      setWhereFeedback('');
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

  const handleAutoDetectFieldDefinitions = async () => {
    let rawData = testResult?.result?.data || testResult?.result?.records || testResult?.data || testResult?.records;
    let columns = testResult?.result?.columns || testResult?.columns || [];
    let sampleItem = null;

    if (!rawData && (!columns || columns.length === 0)) {
      setInspectingFieldDefs(true);
      try {
        const configPayload = {
          db_type: dbType,
          host,
          port,
          database,
          username,
          password,
          collection,
          query,
          limit: 1
        };
        const res = await api.post('/knowledge/inspect-database-columns', {
          source_type: 'database',
          config: configPayload
        });

        if (res.data?.success && Array.isArray(res.data.columns) && res.data.columns.length > 0) {
          columns = res.data.columns;
          sampleItem = res.data.sample || {};
        } else {
          alert(`Gagal menginspeksi kolom database: ${res.data?.message || 'Pastikan konfigurasi host, database, dan query valid.'}`);
          return;
        }
      } catch (err) {
        alert(`Gagal menghubungi server untuk inspeksi kolom: ${err.response?.data?.detail || err.message}`);
        return;
      } finally {
        setInspectingFieldDefs(false);
      }
    } else {
      let parsedRaw = rawData;
      if (typeof parsedRaw === 'string') {
        try {
          parsedRaw = JSON.parse(parsedRaw);
        } catch (e) {
          // keep as is
        }
      }

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
    const keys = (sampleItem && typeof sampleItem === 'object' && Object.keys(sampleItem).length > 0)
      ? Object.keys(sampleItem)
      : columns;

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

  // Helper to preselect sensible default columns for parameters
  const preselectDefaultColumns = (cols) => {
    if (cols.length <= 6) {
      setSelectedParamColumns(cols.map(c => c.name));
      return;
    }
    const popularKeys = new Set([
      'nik', 'nama', 'nama_lengkap', 'nama_lgkp', 'name', 'full_name',
      'no_kk', 'nomor_kk', 'nopol', 'no_polisi', 'plat_nomor',
      'npwp', 'no_rekening', 'norek', 'no_hp', 'phone', 'telepon', 'email',
      'status', 'kd_status', 'id'
    ]);
    const matched = cols.filter(c => {
      const k = c.name.toLowerCase();
      return popularKeys.has(k) || k.includes('nama') || k === 'nik' || k === 'no_kk';
    }).map(c => c.name);

    if (matched.length > 0) {
      setSelectedParamColumns(matched);
    } else {
      setSelectedParamColumns(cols.slice(0, 4).map(c => c.name));
    }
  };

  // Auto-Generate Parameter: Inspect Database Columns & Open Picker
  const handleInspectAndOpenParamPicker = async () => {
    const rawData = testResult?.result?.data || testResult?.result?.records || testResult?.data || testResult?.records;
    const existingCols = testResult?.result?.columns || testResult?.columns || [];
    let sampleItem = null;
    if (Array.isArray(rawData) && rawData.length > 0) sampleItem = rawData[0];
    else if (testResult?.result?.sample) sampleItem = testResult.result.sample;

    if (existingCols.length > 0 || (sampleItem && typeof sampleItem === 'object' && Object.keys(sampleItem).length > 0)) {
      const cols = existingCols.length > 0 ? existingCols : Object.keys(sampleItem);
      const enriched = cols.map(c => {
        const sampleVal = sampleItem ? sampleItem[c] : null;
        const type = inferFieldDataType(c, sampleVal);
        const desc = inferParameterDescription(c, type, sampleVal);
        return { name: c, type, sample: sampleVal, description: desc };
      });
      setDetectedDbColumns(enriched);
      preselectDefaultColumns(enriched);
      setParamSearchQuery('');
      setShowParamPickerModal(true);
      return;
    }

    setInspectingForParams(true);
    try {
      const configPayload = {
        db_type: dbType,
        host,
        port,
        database,
        username,
        password,
        collection,
        query,
        limit: 1
      };
      const res = await api.post('/knowledge/inspect-database-columns', {
        source_type: 'database',
        config: configPayload
      });

      if (res.data?.success && Array.isArray(res.data.columns) && res.data.columns.length > 0) {
        const sampleObj = res.data.sample || {};
        const enriched = res.data.columns.map(c => {
          const sampleVal = sampleObj[c] !== undefined ? sampleObj[c] : null;
          const type = inferFieldDataType(c, sampleVal);
          const desc = inferParameterDescription(c, type, sampleVal);
          return { name: c, type, sample: sampleVal, description: desc, tableName: res.data.table_name };
        });
        setDetectedDbColumns(enriched);
        preselectDefaultColumns(enriched);
        setParamSearchQuery('');
        setShowParamPickerModal(true);
      } else {
        alert(`Tidak dapat menginspeksi kolom database: ${res.data?.message || 'Pastikan host, database, dan query/tabel valid.'}`);
      }
    } catch (err) {
      alert(`Gagal memeriksa kolom database: ${err.response?.data?.detail || err.message}`);
    } finally {
      setInspectingForParams(false);
    }
  };

  const handleToggleSelectColumn = (colName) => {
    setSelectedParamColumns(prev => {
      if (prev.includes(colName)) {
        return prev.filter(c => c !== colName);
      } else {
        return [...prev, colName];
      }
    });
  };

  const handleSelectAllColumns = () => {
    setSelectedParamColumns(detectedDbColumns.map(c => c.name));
  };

  const handleDeselectAllColumns = () => {
    setSelectedParamColumns([]);
  };

  const handleSelectPopularColumns = () => {
    preselectDefaultColumns(detectedDbColumns);
  };

  const handleApplySelectedParameters = () => {
    const selectedItems = detectedDbColumns.filter(c => selectedParamColumns.includes(c.name));
    if (selectedItems.length === 0) {
      alert('Pilih minimal satu kolom untuk dijadikan parameter.');
      return;
    }

    const newParams = selectedItems.map(c => ({
      name: c.name,
      type: c.type || 'string',
      description: c.description || inferParameterDescription(c.name, c.type, c.sample),
      required: false,
      default: ''
    }));

    let updatedParams = [];
    if (replaceExistingParams || parameters.length === 0 || (parameters.length === 1 && parameters[0].name === 'query_param')) {
      updatedParams = newParams;
    } else {
      const existingNames = new Set(parameters.map(p => p.name.toLowerCase()));
      const filteredNew = newParams.filter(p => !existingNames.has(p.name.toLowerCase()));
      updatedParams = [...parameters, ...filteredNew];
    }

    setParameters(updatedParams);

    const newTestArgs = { ...testArgs };
    updatedParams.forEach(p => {
      if (newTestArgs[p.name] === undefined) {
        newTestArgs[p.name] = '';
      }
    });
    setTestArgs(newTestArgs);

    if (autoGenWhereOnApply) {
      const generated = generateWhereClause(dbType, query, updatedParams, {
        matchMode: whereMatchMode,
        optionalFilter: whereOptionalFilter,
        tableName: detectedDbColumns[0]?.tableName
      });
      setQuery(generated);
      setWhereFeedback('Query WHERE & parameter berhasil di-generate!');
      setTimeout(() => setWhereFeedback(''), 4000);
    }

    setShowParamPickerModal(false);
  };

  // Auto-Generate WHERE query from parameters to database query box
  const handleGenerateWhereQuery = () => {
    const validParams = parameters.filter(p => p.name && p.name.trim() !== '');
    if (validParams.length === 0) {
      alert('Belum ada parameter yang didefinisikan. Silakan buat parameter atau gunakan tombol "Auto-Generate dari Field DB" terlebih dahulu.');
      return;
    }

    const generated = generateWhereClause(dbType, query, validParams, {
      matchMode: whereMatchMode,
      optionalFilter: whereOptionalFilter
    });
    setQuery(generated);
    setWhereFeedback('Query WHERE berhasil di-generate dari parameter!');
    setTimeout(() => setWhereFeedback(''), 4000);
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
        cache_ttl_minutes: isTool && cacheEnabled ? cacheTtlMinutes : null,
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
        cache_ttl_minutes: isTool && cacheEnabled ? cacheTtlMinutes : null,
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
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  💡 <strong>Mode Standar: Batch Ingestion</strong> — Mengekstrak seluruh isi tabel sekaligus ke Vector Store. Aktifkan saklar di atas untuk Mode On-Demand berparameter.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleToolMode(true);
                    handleInspectAndOpenParamPicker();
                  }}
                  style={{
                    background: 'rgba(234, 179, 8, 0.12)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    color: '#fde047',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Sparkles size={11} /> Buat Parameter dari Field DB
                </button>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Code size={14} color="var(--accent-primary)" /> Query Parameters Schema ({parameters.length})
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        id="btn-auto-generate-params"
                        onClick={handleInspectAndOpenParamPicker}
                        disabled={inspectingForParams}
                        style={{
                          background: 'rgba(234, 179, 8, 0.15)',
                          border: '1px solid rgba(234, 179, 8, 0.4)',
                          color: '#fde047',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          cursor: inspectingForParams ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        title="Pilih kolom database untuk dijadikan parameter query secara otomatis"
                      >
                        <Sparkles size={12} className={inspectingForParams ? 'animate-spin' : ''} />
                        <span>{inspectingForParams ? 'Mendeteksi Kolom...' : 'Auto-Generate dari Field DB'}</span>
                      </button>
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

                {/* Cache Settings */}
                <div style={{
                  marginTop: '4px',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: cacheEnabled ? 'rgba(234, 179, 8, 0.08)' : 'rgba(0,0,0,0.2)',
                  border: cacheEnabled ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(255,255,255,0.07)',
                  transition: 'all 0.2s'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Clock size={16} color={cacheEnabled ? '#fbbf24' : 'var(--text-muted)'} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: cacheEnabled ? '#fde68a' : '#ffffff' }}>
                          Cache Hasil Query Tool
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Parameter yang sama akan mengembalikan data tersimpan tanpa query ulang ke database
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
                        backgroundColor: cacheEnabled ? '#d97706' : 'rgba(255,255,255,0.2)',
                        borderRadius: '34px',
                        transition: '0.3s'
                      }}>
                        <span style={{
                          position: 'absolute',
                          height: '18px',
                          width: '18px',
                          left: cacheEnabled ? '23px' : '3px',
                          bottom: '3px',
                          backgroundColor: '#ffffff',
                          borderRadius: '50%',
                          transition: '0.3s'
                        }} />
                      </span>
                    </label>
                  </div>

                  {cacheEnabled && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#fde68a', whiteSpace: 'nowrap' }}>
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
                      <span style={{ fontSize: '11px', color: 'rgba(253, 230, 138, 0.7)', marginLeft: '4px' }}>
                        ({cacheTtlMinutes >= 60 ? `${(cacheTtlMinutes/60).toFixed(1)} jam` : `${cacheTtlMinutes} mnt`})
                      </span>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* Query Editor Box */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                {dbType === 'mongodb' ? 'Mongo Filter / Query (JSON)' : 'Database Query (SQL)'}
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  id="btn-auto-generate-where"
                  onClick={handleGenerateWhereQuery}
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Buat WHERE clause otomatis ke kotak query berdasarkan parameter yang telah didefinisikan"
                >
                  <Wand2 size={12} />
                  <span>Auto-Generate WHERE dari Parameter</span>
                </button>

                {(isTool || parameters.length > 0) && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {dbType === 'mongodb' ? 'Use :param_name' : 'Use :param_name'}
                  </span>
                )}
              </div>
            </div>

            {/* Quick WHERE Generation Options */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={whereOptionalFilter}
                    onChange={(e) => setWhereOptionalFilter(e.target.checked)}
                  />
                  <span>Filter Opsional (:param IS NULL OR col = :param)</span>
                </label>

                {dbType !== 'mongodb' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={whereMatchMode === 'exact'}
                      onChange={(e) => setWhereMatchMode(e.target.checked ? 'exact' : 'smart')}
                    />
                    <span>Exact Match (= semua)</span>
                  </label>
                )}
              </div>

              {whereFeedback && (
                <span style={{ color: '#34d399', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={12} /> {whereFeedback}
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
                <span>Nilai parameter otomatis di-bind dan di-escape secara aman sesuai tipenya (string, integer, boolean).</span>
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
                <button
                  type="button"
                  id="btn-auto-generate-field-definitions"
                  onClick={handleAutoDetectFieldDefinitions}
                  disabled={inspectingFieldDefs}
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
                    cursor: inspectingFieldDefs ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Ekstrak nama kolom, tipe data, dan definisi deskripsi otomatis dari database"
                >
                  <Sparkles size={13} className={inspectingFieldDefs ? 'animate-spin' : ''} />
                  <span>{inspectingFieldDefs ? 'Mendeteksi Kolom...' : 'Auto-Generate Field Definitions'}</span>
                </button>

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

      {/* Column Picker Modal for Auto-Generate Parameters */}
      {showParamPickerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1200,
          padding: '20px'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(0, 0, 0, 0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#fde047" />
                <div>
                  <h3 style={{ fontSize: '14.5px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                    Pilih Kolom Database untuk Parameter
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {detectedDbColumns.length} kolom terdeteksi dari skema/tabel database
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowParamPickerModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Toolbar: Search & Presets */}
            <div style={{ padding: '12px 20px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Cari nama kolom (misal: nik, nama, nopol)..."
                    value={paramSearchQuery}
                    onChange={(e) => setParamSearchQuery(e.target.value)}
                    style={{ paddingLeft: '32px', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleSelectPopularColumns}
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#a5b4fc',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Pilih kolom identitas populer (NIK, Nama, No KK, Nopol, HP, dsb)"
                  >
                    Populer
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllColumns}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllColumns}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-muted)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Kosongkan
                  </button>
                </div>
              </div>
            </div>

            {/* Columns List */}
            <div style={{ padding: '12px 20px', overflowY: 'auto', maxHeight: '350px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {detectedDbColumns
                .filter(c => !paramSearchQuery || c.name.toLowerCase().includes(paramSearchQuery.toLowerCase()))
                .map((c, idx) => {
                  const isSelected = selectedParamColumns.includes(c.name);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleToggleSelectColumn(c.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(0, 0, 0, 0.2)',
                        border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12.5px', fontWeight: '700', color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                            {c.name}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)',
                            textTransform: 'lowercase'
                          }}>
                            {c.type || 'string'}
                          </span>
                          {c.sample !== null && c.sample !== undefined && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                              contoh: {typeof c.sample === 'object' ? JSON.stringify(c.sample) : String(c.sample)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0,0,0,0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={replaceExistingParams}
                    onChange={(e) => setReplaceExistingParams(e.target.checked)}
                  />
                  <span>Timpa parameter lama</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#34d399', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoGenWhereOnApply}
                    onChange={(e) => setAutoGenWhereOnApply(e.target.checked)}
                  />
                  <span>Otomatis generate WHERE query</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowParamPickerModal(false)}
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApplySelectedParameters}
                  style={{ fontSize: '12px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={14} /> Terapkan ({selectedParamColumns.length}) Parameter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
