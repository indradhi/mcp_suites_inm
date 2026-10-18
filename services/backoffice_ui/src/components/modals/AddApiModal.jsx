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
  Sparkles,
  ChevronDown,
  ChevronRight,
  Terminal,
  Clipboard
} from 'lucide-react';
import api from '../../api/client';
import { inferFieldDescription, inferFieldDataType } from '../../utils/fieldDefinitionHelper';
import { parseCurl, parseRawJsonBody } from '../../utils/curlParser';
import ValidityTierSelector from '../common/ValidityTierSelector';

export default function AddApiModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [method, setMethod] = useState('GET');
  const [headers, setHeaders] = useState({});
  const [isHeadersCollapsed, setIsHeadersCollapsed] = useState(true);
  const [authMode, setAuthMode] = useState('static'); // static, endpoint_token, none
  const [bearerToken, setBearerToken] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tokenMethod, setTokenMethod] = useState('POST');
  const [tokenPayloadType, setTokenPayloadType] = useState('oauth2'); // oauth2, password, custom_json, form
  const [tokenUsername, setTokenUsername] = useState('');
  const [tokenPassword, setTokenPassword] = useState('');
  const [tokenCustomJson, setTokenCustomJson] = useState('{\n  "grant_type": "client_credentials"\n}');
  const [tokenPath, setTokenPath] = useState('');
  const [tokenHeaderName, setTokenHeaderName] = useState('Authorization');
  const [tokenPrefix, setTokenPrefix] = useState('Bearer ');
  const [testingToken, setTestingToken] = useState(false);
  const [tokenTestResult, setTokenTestResult] = useState(null);
  const [verifySsl, setVerifySsl] = useState(false);

  // cURL Import States
  const [isCurlImportOpen, setIsCurlImportOpen] = useState(false);
  const [curlInput, setCurlInput] = useState('');
  const [curlError, setCurlError] = useState('');
  const [curlSuccessMsg, setCurlSuccessMsg] = useState('');
  const [autoExtractParams, setAutoExtractParams] = useState(true);
  const [autoEnableToolMode, setAutoEnableToolMode] = useState(true);

  // Raw JSON Body Import States
  const [isJsonImportOpen, setIsJsonImportOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [jsonSuccessMsg, setJsonSuccessMsg] = useState('');

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
  const [isFieldsCollapsed, setIsFieldsCollapsed] = useState(true);

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
      setHeaders(conf.headers || {});
      setIsHeadersCollapsed(true);
      const auth = conf.auth || {};
      const rawMode = auth.mode || 'none';
      const isDynamic = rawMode === 'oauth2' || rawMode === 'endpoint_token' || rawMode === 'token_endpoint';
      setAuthMode(isDynamic ? 'endpoint_token' : rawMode);
      setBearerToken(auth.token || '');
      setTokenUrl(auth.token_url || '');
      setTokenMethod(auth.token_method || 'POST');
      const inferredPayloadType = auth.payload_type || (auth.payload?.username ? 'password' : (auth.payload?.client_id ? 'oauth2' : (auth.custom_payload_json ? 'custom_json' : 'oauth2')));
      setTokenPayloadType(inferredPayloadType);
      setClientId(auth.payload?.client_id || '');
      setClientSecret(auth.payload?.client_secret || '');
      setTokenUsername(auth.payload?.username || '');
      setTokenPassword(auth.payload?.password || '');
      setTokenCustomJson(auth.custom_payload_json || (auth.payload ? (typeof auth.payload === 'string' ? auth.payload : JSON.stringify(auth.payload, null, 2)) : '{\n  "grant_type": "client_credentials"\n}'));
      setTokenPath(auth.token_path || '');
      setTokenHeaderName(auth.header_name || 'Authorization');
      setTokenPrefix(auth.token_prefix !== undefined ? auth.token_prefix : 'Bearer ');
      setTokenTestResult(null);
      setTestingToken(false);
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
      setIsFieldsCollapsed(true);
      setIsCurlImportOpen(Boolean(initialData.openCurlImport));
      setCurlInput('');
      setCurlError('');
      setCurlSuccessMsg('');
      setIsJsonImportOpen(false);
      setJsonInput('');
      setJsonError('');
      setJsonSuccessMsg('');
    } else if (isOpen && !initialData) {
      setName('');
      setEndpoint('');
      setMethod('GET');
      setHeaders({});
      setIsHeadersCollapsed(true);
      setAuthMode('static');
      setBearerToken('');
      setTokenUrl('');
      setTokenMethod('POST');
      setTokenPayloadType('oauth2');
      setClientId('');
      setClientSecret('');
      setTokenUsername('');
      setTokenPassword('');
      setTokenCustomJson('{\n  "grant_type": "client_credentials"\n}');
      setTokenPath('');
      setTokenHeaderName('Authorization');
      setTokenPrefix('Bearer ');
      setTokenTestResult(null);
      setTestingToken(false);
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
      setIsFieldsCollapsed(true);
      setIsCurlImportOpen(false);
      setCurlInput('');
      setCurlError('');
      setCurlSuccessMsg('');
      setIsJsonImportOpen(false);
      setJsonInput('');
      setJsonError('');
      setJsonSuccessMsg('');
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
        { name: 'query', in: 'query', type: 'string', description: 'Search or filter parameter', required: true, default: '', include_empty: false }
      ]);
      setTestArgs({ query: '' });
    }
  };

  const handleAddParameter = () => {
    setParameters(prev => [
      ...prev,
      { name: '', in: 'query', type: 'string', description: '', required: false, default: '', include_empty: false }
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

  // cURL Import Handlers
  const handleApplyCurl = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCurlError('');
    setCurlSuccessMsg('');

    if (!curlInput || !curlInput.trim()) {
      setCurlError('Silakan tempel (paste) perintah cURL terlebih dahulu.');
      return;
    }

    const parsed = parseCurl(curlInput);
    if (!parsed.success) {
      setCurlError(parsed.error || 'Gagal mem-parsing perintah cURL.');
      return;
    }

    // 1. Endpoint & Method
    setEndpoint(parsed.endpoint);
    setMethod(parsed.method);

    // 2. Headers
    if (parsed.headers && Object.keys(parsed.headers).length > 0) {
      setHeaders(parsed.headers);
    }

    // 3. Auth Mode & Token
    if (parsed.authMode === 'static' && parsed.bearerToken) {
      setAuthMode('static');
      setBearerToken(parsed.bearerToken);
    } else if (parsed.authMode === 'none' && !bearerToken) {
      setAuthMode('none');
    }

    // 4. SSL Verification
    setVerifySsl(parsed.verifySsl);

    // 5. Source Name & Tool Identifier
    if (!name || name.trim() === '') {
      setName(parsed.suggestedName);
    }
    if (!toolName || toolName.trim() === '') {
      setToolName(parsed.suggestedToolName);
    }

    // 6. Parameters & Tool Mode
    if (autoExtractParams && parsed.parameters && parsed.parameters.length > 0) {
      setParameters(parsed.parameters);
      if (autoEnableToolMode) {
        setIsTool(true);
      }
      if (parsed.testArgs) {
        setTestArgs(parsed.testArgs);
      }
    }

    setCurlSuccessMsg(`Berhasil mengimpor: ${parsed.summary}`);
    setIsCurlImportOpen(false);
  };

  const handleUpdateHeader = (oldKey, newKey, value) => {
    setHeaders(prev => {
      const next = { ...prev };
      if (oldKey !== newKey && oldKey in next) {
        delete next[oldKey];
      }
      if (newKey) {
        next[newKey] = value;
      }
      return next;
    });
  };

  const handleRemoveHeader = (keyToRemove) => {
    setHeaders(prev => {
      const next = { ...prev };
      delete next[keyToRemove];
      return next;
    });
  };

  const handleAddHeader = () => {
    setIsHeadersCollapsed(false);
    setHeaders(prev => ({ ...prev, '': '' }));
  };

  // Raw JSON Body Import Handlers
  const handleApplyRawJson = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setJsonError('');
    setJsonSuccessMsg('');

    if (!jsonInput || !jsonInput.trim()) {
      setJsonError('Silakan tempel (paste) teks JSON terlebih dahulu.');
      return;
    }

    const parsed = parseRawJsonBody(jsonInput);
    if (!parsed.success) {
      setJsonError(parsed.error || 'Format JSON tidak valid.');
      return;
    }

    setParameters(parsed.parameters);
    if (parsed.testArgs) {
      setTestArgs(parsed.testArgs);
    }
    setIsTool(true);
    if (method === 'GET') {
      setMethod('POST');
    }
    setHeaders(prev => ({
      ...prev,
      'Content-Type': prev['Content-Type'] || prev['content-type'] || 'application/json'
    }));
    setJsonSuccessMsg(`Berhasil mengekstrak ${parsed.count} parameter body dari JSON.`);
    setIsJsonImportOpen(false);
  };

  const handleLoadSampleJson = () => {
    const sample = `{\n  "NIK": "",\n  "NO_KK": "",\n  "NAMA": "IWAN FALS",\n  "START_TGL_LHR": "",\n  "FINISH_TGL_LHR": "",\n  "START_ROW": 1,\n  "FINISH_ROW": 500\n}`;
    setJsonInput(sample);
    setJsonError('');
  };

  const handlePasteJsonFromClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setJsonInput(text);
          setJsonError('');
        } else {
          setJsonError('Clipboard kosong.');
        }
      } else {
        setJsonError('Akses clipboard otomatis tidak didukung browser ini. Silakan paste manual (Ctrl+V).');
      }
    } catch {
      setJsonError('Izin clipboard ditolak. Silakan tempel secara manual dengan Ctrl+V.');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setCurlInput(text);
          setCurlError('');
        } else {
          setCurlError('Clipboard kosong.');
        }
      } else {
        setCurlError('Akses clipboard otomatis tidak didukung browser ini. Silakan paste manual (Ctrl+V).');
      }
    } catch {
      setCurlError('Izin clipboard ditolak. Silakan tempel secara manual dengan tombol Ctrl+V / Command+V.');
    }
  };

  const handleLoadSampleCurl = () => {
    const sample = `curl --location 'http://172.18.20.5:4013/api/ebdesk/v.1.0.0/ktp' \\
  --header 'Content-Type: application/json' \\
  --data '{ "NIK": "",
  "NO_KK":"",
  "NAMA": "IWAN FALS",
  "START_TGL_LHR": "",
  "FINISH_TGL_LHR": "",
  "START_ROW": 1,
  "FINISH_ROW": 500
}'`;
    setCurlInput(sample);
    setCurlError('');
  };

  // Field Definitions Handlers
  const handleAddFieldDefinition = () => {
    setIsFieldsCollapsed(false);
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

    setIsFieldsCollapsed(false);
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

  const buildAuthConfig = () => {
    if (authMode === 'static') {
      return { mode: 'static', token: bearerToken };
    }
    if (authMode === 'endpoint_token' || authMode === 'oauth2') {
      let payload = {};
      if (tokenPayloadType === 'oauth2') {
        payload = { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' };
      } else if (tokenPayloadType === 'password') {
        payload = { username: tokenUsername, password: tokenPassword };
      } else if (tokenPayloadType === 'custom_json') {
        try {
          payload = tokenCustomJson ? JSON.parse(tokenCustomJson) : {};
        } catch {
          payload = {};
        }
      } else if (tokenPayloadType === 'form') {
        payload = tokenCustomJson;
      }

      return {
        mode: 'endpoint_token',
        token_url: tokenUrl,
        token_method: tokenMethod,
        payload_type: tokenPayloadType,
        payload: payload,
        custom_payload_json: tokenCustomJson,
        token_path: tokenPath.trim() || undefined,
        header_name: tokenHeaderName.trim() || 'Authorization',
        token_prefix: tokenPrefix !== undefined ? tokenPrefix : 'Bearer ',
        headers: tokenPayloadType === 'form' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json' },
        verify_ssl: verifySsl
      };
    }
    return { mode: 'none' };
  };

  const handleTestFetchToken = async () => {
    if (!tokenUrl || !tokenUrl.trim()) {
      setTokenTestResult({ success: false, message: 'Token Endpoint URL wajib diisi terlebih dahulu.' });
      return;
    }
    setTestingToken(true);
    setTokenTestResult(null);
    try {
      const authConfig = buildAuthConfig();
      const res = await api.post('/knowledge/test-connection', {
        source_type: 'api',
        config: {
          test_type: 'token',
          auth: authConfig,
          verify_ssl: verifySsl
        }
      });
      setTokenTestResult(res.data);
    } catch (err) {
      setTokenTestResult({
        success: false,
        message: err.response?.data?.detail || err.message || 'Gagal mengambil token dari endpoint.'
      });
    } finally {
      setTestingToken(false);
    }
  };

  const getLiveBodyJson = () => {
    const bodyParams = parameters.filter(p => p.name && (p.in === 'body' || ['POST', 'PUT', 'PATCH'].includes(method)));
    if (bodyParams.length === 0) return null;
    const obj = {};
    bodyParams.forEach(p => {
      let val = testArgs[p.name] !== undefined ? testArgs[p.name] : p.default;
      if (p.type === 'integer') {
        val = val !== '' && val !== undefined && !isNaN(Number(val)) ? parseInt(val, 10) : (p.include_empty ? '' : 0);
      } else if (p.type === 'number') {
        val = val !== '' && val !== undefined && !isNaN(Number(val)) ? parseFloat(val) : (p.include_empty ? '' : 0.0);
      } else if (p.type === 'boolean') {
        val = val === 'true' || val === true;
      } else {
        val = val !== undefined ? String(val) : '';
      }
      obj[p.name] = val;
    });
    return JSON.stringify(obj, null, 2);
  };

  const liveBodyJson = getLiveBodyJson();

  const handleCopyGeneratedCurl = () => {
    let curl = `curl --location '${endpoint || 'http://localhost/api'}' \\\n`;
    const effHeaders = { ...(headers || {}) };
    if (['POST', 'PUT', 'PATCH'].includes(method) && !effHeaders['Content-Type'] && !effHeaders['content-type']) {
      effHeaders['Content-Type'] = 'application/json';
    }
    if (authMode === 'static' && bearerToken) {
      effHeaders['Authorization'] = `Bearer ${bearerToken}`;
    }
    Object.entries(effHeaders).forEach(([k, v]) => {
      if (k && k.trim()) {
        curl += `  --header '${k}: ${v}' \\\n`;
      }
    });
    if (['POST', 'PUT', 'PATCH'].includes(method) && liveBodyJson) {
      curl += `  --data '${liveBodyJson}'`;
    } else {
      curl += `  -X ${method}`;
    }
    try {
      navigator.clipboard.writeText(curl);
      alert('Perintah cURL berhasil disalin ke clipboard!');
    } catch {
      alert('Gagal menyalin otomatis. Silakan salin dari preview.');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const authConfig = buildAuthConfig();

      const effectiveTestArgs = { ...testArgs };
      if (isTool) {
        parameters.forEach(p => {
          if (p.name && (p.include_empty || p.allow_empty)) {
            if (effectiveTestArgs[p.name] === undefined) {
              effectiveTestArgs[p.name] = p.default !== undefined ? p.default : '';
            }
          }
        });
      }

      const activeHeaders = Object.keys(headers).length > 0
        ? headers
        : (['POST', 'PUT', 'PATCH'].includes(method) ? { 'Content-Type': 'application/json' } : undefined);

      const configPayload = {
        endpoint,
        method,
        headers: activeHeaders,
        verify_ssl: verifySsl,
        follow_redirects: true,
        auth: authConfig,
        is_tool: isTool,
        tool_name: toolName.trim() || undefined,
        tool_description: toolDescription.trim() || undefined,
        parameters: isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [],
        test_arguments: isTool ? effectiveTestArgs : {}
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
      const authConfig = buildAuthConfig();

      const validParameters = isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [];
      const validFieldDefs = fieldDefinitions.filter(f => f.name && f.name.trim() !== '');
      const activeHeaders = Object.keys(headers).length > 0
        ? headers
        : (['POST', 'PUT', 'PATCH'].includes(method) ? { 'Content-Type': 'application/json' } : undefined);

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
          headers: activeHeaders,
          verify_ssl: verifySsl,
          follow_redirects: true,
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
      const authConfig = buildAuthConfig();

      const validParameters = isTool ? parameters.filter(p => p.name && p.name.trim() !== '') : [];
      const validFieldDefs = fieldDefinitions.filter(f => f.name && f.name.trim() !== '');
      const copyName = name.includes('(Copy') ? name : `${name} (Copy)`;
      const copyToolName = isTool && toolName ? (toolName.includes('_copy') ? toolName : `${toolName}_copy`) : undefined;
      const activeHeaders = Object.keys(headers).length > 0
        ? headers
        : (['POST', 'PUT', 'PATCH'].includes(method) ? { 'Content-Type': 'application/json' } : undefined);

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
          headers: activeHeaders,
          verify_ssl: verifySsl,
          follow_redirects: true,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              id="btn-toggle-curl-import"
              onClick={() => {
                setIsCurlImportOpen(prev => !prev);
                setCurlError('');
              }}
              title="Import endpoint, header, dan parameter dari perintah cURL"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                background: isCurlImportOpen ? 'rgba(6, 182, 212, 0.22)' : 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                color: 'var(--accent-cyan)',
                transition: 'all 0.2s'
              }}
            >
              <Terminal size={14} />
              <span>{isCurlImportOpen ? 'Tutup cURL Import' : 'Paste from cURL'}</span>
            </button>
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
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Success Notification Banner for cURL import */}
          {curlSuccessMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: 'var(--accent-emerald)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} color="var(--accent-emerald)" />
                <span>{curlSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setCurlSuccessMsg('')}
                style={{ background: 'none', border: 'none', color: 'var(--accent-emerald)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          )}

          {/* cURL Import Panel */}
          {isCurlImportOpen && (
            <div style={{
              background: 'var(--bg-glass-2)',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: '10px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={16} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
                    Paste from cURL / Import cURL
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '700',
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: 'var(--accent-cyan)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(6, 182, 212, 0.3)'
                  }}>
                    POSTMAN / DEVTOOLS / SWAGGER
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    style={{
                      background: 'var(--bg-glass-1)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      borderRadius: '5px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Tempel teks cURL dari clipboard browser"
                  >
                    <Clipboard size={12} /> Tempel Clipboard
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSampleCurl}
                    style={{
                      background: 'var(--bg-glass-1)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      borderRadius: '5px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Muat contoh perintah cURL berparameter"
                  >
                    <Sparkles size={12} color="var(--accent-cyan)" /> Contoh cURL
                  </button>
                  {curlInput && (
                    <button
                      type="button"
                      onClick={() => { setCurlInput(''); setCurlError(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      Bersihkan
                    </button>
                  )}
                </div>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                Tempel perintah cURL lengkap. Sistem akan otomatis mendeteksi URL Endpoint, HTTP Method, Bearer Token autentikasi, serta mengekstrak parameter query dan body JSON ke dalam skema tool.
              </p>

              <div>
                <textarea
                  className="input-field font-mono"
                  style={{
                    width: '100%',
                    minHeight: '105px',
                    fontSize: '11.5px',
                    lineHeight: '1.5',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-glass-1)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    resize: 'vertical'
                  }}
                  placeholder={`curl -X POST "https://api.example.com/v1/search?query=target" \\\n  -H "Authorization: Bearer eyJhbGci..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"status": "aktif", "tahun": 2024}'`}
                  value={curlInput}
                  onChange={(e) => {
                    setCurlInput(e.target.value);
                    if (curlError) setCurlError('');
                  }}
                />
              </div>

              {curlError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--accent-rose)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  <AlertCircle size={14} />
                  <span>{curlError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoExtractParams}
                      onChange={(e) => setAutoExtractParams(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Ekstrak parameter query & body menjadi Tool Parameters
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoEnableToolMode}
                      onChange={(e) => setAutoEnableToolMode(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Aktifkan Mode AI Tool jika ada parameter
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCurlImportOpen(false);
                      setCurlError('');
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    id="btn-apply-curl"
                    onClick={handleApplyCurl}
                    style={{
                      background: 'var(--accent-cyan)',
                      color: '#000',
                      fontWeight: '700',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(6, 182, 212, 0.3)'
                    }}
                  >
                    <Zap size={13} />
                    <span>Terapkan & Parse cURL</span>
                  </button>
                </div>
              </div>
            </div>
          )}

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
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Endpoint URL <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(supports <code style={{ color: 'var(--accent-cyan)' }}>&#123;param&#125;</code> atau <button type="button" onClick={() => setIsCurlImportOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: '11px', display: 'inline' }}>Paste cURL</button>)</span>
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
              Verifikasi Sertifikat SSL <span style={{ color: 'var(--text-muted)' }}>(Biarkan tidak tercentang untuk endpoint internal organisasi / sertifikat self-signed)</span>
            </label>
          </div>

          {/* Custom Request Headers */}
          <div style={{
            background: 'var(--bg-glass-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '10px 14px'
          }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setIsHeadersCollapsed(!isHeadersCollapsed)}
            >
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isHeadersCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span>Request Headers {Object.keys(headers).length > 0 ? `(${Object.keys(headers).length})` : ''}</span>
                {['POST', 'PUT', 'PATCH'].includes(method) && !headers['Content-Type'] && !headers['content-type'] && (
                  <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                    auto Content-Type: application/json
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleAddHeader(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={12} /> Tambah Header
              </button>
            </div>

            {!isHeadersCollapsed && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.keys(headers).length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Belum ada header kustom. Header <code>Content-Type: application/json</code> akan otomatis dikirim untuk request POST/PUT/PATCH dengan parameter body.
                  </div>
                ) : (
                  Object.entries(headers).map(([k, v], hIdx) => (
                    <div key={hIdx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 28px', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '4px 8px', fontSize: '11.5px' }}
                        placeholder="Header-Name"
                        value={k}
                        onChange={(e) => handleUpdateHeader(k, e.target.value, v)}
                      />
                      <input
                        type="text"
                        className="input-field font-mono"
                        style={{ padding: '4px 8px', fontSize: '11.5px' }}
                        placeholder="Value"
                        value={v}
                        onChange={(e) => handleUpdateHeader(k, k, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveHeader(k)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Authentication Mode */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Authentication Mode
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { id: 'static', label: 'Static Bearer / API Key' },
                { id: 'endpoint_token', label: '🔑 Ambil Token dari Endpoint (OAuth2 / Dynamic)' },
                { id: 'none', label: 'No Auth / Public' }
              ].map((m) => {
                const isSelected = authMode === m.id || (m.id === 'endpoint_token' && authMode === 'oauth2');
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => {
                      setAuthMode(m.id);
                      setTokenTestResult(null);
                    }}
                    style={{
                      flex: 1,
                      minWidth: '160px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-glass-light)',
                      border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                      color: isSelected ? 'var(--text-main)' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {authMode === 'static' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Bearer Token / API Key
              </label>
              <input
                type="password"
                className="input-field font-mono"
                placeholder="eyJhbGciOi... atau secret_api_key_xyz"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
              />
            </div>
          )}

          {(authMode === 'endpoint_token' || authMode === 'oauth2') && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              padding: '16px 18px',
              background: 'var(--bg-glass-2)',
              borderRadius: '10px',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Key size={16} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
                    Ambil Token dari Endpoint (Pre-Request Token)
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '700',
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: 'var(--accent-cyan)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid rgba(6, 182, 212, 0.3)'
                  }}>
                    DYNAMIC AUTH
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Token diperoleh otomatis sebelum memanggil endpoint utama
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Token Endpoint URL <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <input
                  type="url"
                  className="input-field font-mono"
                  placeholder="https://auth.example.com/oauth/token atau https://api.internal.gov.id/api/login"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Metode HTTP
                  </label>
                  <select
                    className="input-field"
                    value={tokenMethod}
                    onChange={(e) => setTokenMethod(e.target.value)}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Format / Kredensial Payload
                  </label>
                  <select
                    className="input-field"
                    value={tokenPayloadType}
                    onChange={(e) => setTokenPayloadType(e.target.value)}
                  >
                    <option value="oauth2">OAuth2 Client Credentials (client_id & client_secret)</option>
                    <option value="password">Username & Password Login (JSON)</option>
                    <option value="custom_json">Custom JSON Body (Kustom)</option>
                    <option value="form">Form URL-Encoded (x-www-form-urlencoded)</option>
                  </select>
                </div>
              </div>

              {tokenPayloadType === 'oauth2' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Client ID
                    </label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      placeholder="e.g. app-client-id-123"
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
                      className="input-field font-mono"
                      placeholder="••••••••••••"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {tokenPayloadType === 'password' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Username / Email
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="admin / user@domain.com"
                      value={tokenUsername}
                      onChange={(e) => setTokenUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Password
                    </label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="••••••••••••"
                      value={tokenPassword}
                      onChange={(e) => setTokenPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {tokenPayloadType === 'custom_json' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      JSON Request Body Payload
                    </label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Format JSON valid
                    </span>
                  </div>
                  <textarea
                    className="input-field font-mono"
                    rows={4}
                    style={{ fontSize: '12px', lineHeight: '1.4', resize: 'vertical' }}
                    placeholder={`{\n  "app_key": "my_app_key",\n  "app_secret": "my_secret"\n}`}
                    value={tokenCustomJson}
                    onChange={(e) => setTokenCustomJson(e.target.value)}
                  />
                </div>
              )}

              {tokenPayloadType === 'form' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      Form Body (x-www-form-urlencoded)
                    </label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Format: key=val&key2=val2
                    </span>
                  </div>
                  <textarea
                    className="input-field font-mono"
                    rows={3}
                    style={{ fontSize: '12px', lineHeight: '1.4', resize: 'vertical' }}
                    placeholder="grant_type=client_credentials&client_id=xxx&client_secret=yyy"
                    value={tokenCustomJson}
                    onChange={(e) => setTokenCustomJson(e.target.value)}
                  />
                </div>
              )}

              {/* Advanced Token Header & Path Placement */}
              <div style={{
                background: 'var(--bg-glass-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px'
              }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Konfigurasi Header & Ekstraksi Token
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Nama Header Utama
                    </label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      style={{ fontSize: '12px', padding: '6px 8px' }}
                      value={tokenHeaderName}
                      onChange={(e) => setTokenHeaderName(e.target.value)}
                      placeholder="Authorization"
                      title="Header yang akan disematkan pada panggilan API utama (default: Authorization)"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Prefix Token
                    </label>
                    <select
                      className="input-field"
                      style={{ fontSize: '12px', padding: '6px 4px' }}
                      value={tokenPrefix}
                      onChange={(e) => setTokenPrefix(e.target.value)}
                    >
                      <option value="Bearer ">Bearer </option>
                      <option value="">None (Raw Token)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Path Field Token di Response
                    </label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      style={{ fontSize: '12px', padding: '6px 8px' }}
                      value={tokenPath}
                      onChange={(e) => setTokenPath(e.target.value)}
                      placeholder="Auto (access_token, token)"
                      title="Dot-notation path field token pada JSON response, misal data.token atau result.jwt. Biarkan kosong untuk deteksi otomatis."
                    />
                  </div>
                </div>
              </div>

              {/* Test Token Fetch Button & Results */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    id="btn-test-fetch-token"
                    onClick={handleTestFetchToken}
                    disabled={testingToken || !tokenUrl}
                    style={{
                      background: 'rgba(6, 182, 212, 0.15)',
                      border: '1px solid rgba(6, 182, 212, 0.4)',
                      color: 'var(--accent-cyan)',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: testingToken || !tokenUrl ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: !tokenUrl ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    <Key size={14} />
                    <span>{testingToken ? 'Mengambil Token dari Endpoint...' : 'Uji Ambil Token dari Endpoint'}</span>
                  </button>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Verifikasi kredensial sebelum menyimpan
                  </span>
                </div>

                {tokenTestResult && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: tokenTestResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${tokenTestResult.success ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                    color: tokenTestResult.success ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    lineHeight: '1.4'
                  }}>
                    {tokenTestResult.success ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600' }}>{tokenTestResult.message}</div>
                      {tokenTestResult.token_preview && (
                        <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.9 }}>
                          Preview Token: <code className="font-mono" style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 5px', borderRadius: '4px' }}>{tokenTestResult.token_preview}</code>
                          {' '}({tokenTestResult.token_length} karakter)
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setIsJsonImportOpen(prev => !prev)}
                        style={{
                          background: isJsonImportOpen ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          color: '#60a5fa',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer'
                        }}
                        title="Ekstrak parameter otomatis dari JSON body (--data)"
                      >
                        <Terminal size={12} /> {isJsonImportOpen ? 'Tutup Raw JSON' : 'Tempel Raw JSON'}
                      </button>
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
                  </div>

                  {/* Raw JSON Import Drawer / Box */}
                  {isJsonImportOpen && (
                    <div style={{
                      marginBottom: '14px',
                      padding: '12px 14px',
                      background: 'rgba(15, 23, 42, 0.7)',
                      borderRadius: '8px',
                      border: '1px solid rgba(59, 130, 246, 0.35)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Terminal size={14} /> Import Parameter dari Raw JSON Body (--data)
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={handleLoadSampleJson}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Contoh KTP JSON
                          </button>
                          <button
                            type="button"
                            onClick={handlePasteJsonFromClipboard}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Tempel Clipboard
                          </button>
                        </div>
                      </div>

                      <textarea
                        className="input-field font-mono"
                        style={{
                          width: '100%',
                          height: '110px',
                          fontSize: '12px',
                          lineHeight: '1.4',
                          resize: 'vertical',
                          padding: '8px'
                        }}
                        placeholder='{\n  "NIK": "",\n  "NAMA": "IWAN FALS",\n  "START_ROW": 1,\n  "FINISH_ROW": 500\n}'
                        value={jsonInput}
                        onChange={(e) => {
                          setJsonInput(e.target.value);
                          setJsonError('');
                        }}
                      />

                      {jsonError && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={12} /> {jsonError}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsJsonImportOpen(false);
                            setJsonError('');
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyRawJson}
                          style={{
                            background: '#2563eb',
                            border: 'none',
                            color: '#ffffff',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          <Zap size={12} /> Terapkan ke Skema Parameter
                        </button>
                      </div>
                    </div>
                  )}

                  {jsonSuccessMsg && (
                    <div style={{
                      marginBottom: '10px',
                      padding: '8px 12px',
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#4ade80',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle size={13} /> {jsonSuccessMsg}
                      </div>
                      <button
                        type="button"
                        onClick={() => setJsonSuccessMsg('')}
                        style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {parameters.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', background: 'var(--bg-glass-2)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      No parameters defined yet. Click "Add Parameter" to configure query, path, or body parameters.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 85px 80px 1.8fr 58px 75px 1fr 28px',
                        gap: '8px',
                        padding: '0 10px',
                        fontSize: '10px',
                        fontWeight: '700',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}>
                        <div>Nama Parameter</div>
                        <div>Lokasi (In)</div>
                        <div>Tipe</div>
                        <div>Deskripsi LLM</div>
                        <div style={{ textAlign: 'center' }} title="Parameter wajib diisi">Wajib</div>
                        <div style={{ textAlign: 'center' }} title="Sertakan parameter ke request API meskipun nilainya kosong">Kirim Kosong</div>
                        <div>Default</div>
                        <div></div>
                      </div>

                      {parameters.map((param, pIdx) => (
                        <div
                          key={pIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 85px 80px 1.8fr 58px 75px 1fr 28px',
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
                            <label htmlFor={`req-${pIdx}`} style={{ fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Tandai sebagai parameter wajib">
                              Req
                            </label>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <input
                              type="checkbox"
                              id={`empty-${pIdx}`}
                              checked={Boolean(param.include_empty)}
                              onChange={(e) => handleUpdateParameter(pIdx, 'include_empty', e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                            <label htmlFor={`empty-${pIdx}`} style={{ fontSize: '11px', color: param.include_empty ? 'var(--accent-cyan)' : 'var(--text-secondary)', fontWeight: param.include_empty ? '600' : 'normal', cursor: 'pointer' }} title="Kirim parameter ke endpoint API meskipun bernilai string kosong">
                              Kosong
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
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px', display: 'flex', justifyContent: 'center' }}
                            title="Remove parameter"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Live JSON Body Preview & cURL Generator */}
                  {['POST', 'PUT', 'PATCH'].includes(method) && liveBodyJson && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: 'rgba(15, 23, 42, 0.65)',
                      borderRadius: '8px',
                      border: '1px solid rgba(6, 182, 212, 0.3)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)' }}>
                          <Code size={13} /> Live JSON Body Preview (--data raw json)
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                navigator.clipboard.writeText(liveBodyJson);
                                alert('JSON body berhasil disalin!');
                              } catch {
                                alert('Gagal menyalin.');
                              }
                            }}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Salin JSON
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyGeneratedCurl}
                            style={{
                              background: 'rgba(6, 182, 212, 0.15)',
                              border: '1px solid rgba(6, 182, 212, 0.4)',
                              color: 'var(--accent-cyan)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Salin cURL Lengkap
                          </button>
                        </div>
                      </div>
                      <pre style={{
                        margin: 0,
                        padding: '8px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#a5f3fc',
                        fontFamily: 'monospace',
                        maxHeight: '140px',
                        overflowY: 'auto'
                      }}>
                        {liveBodyJson}
                      </pre>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        Tipe data (angka, teks, boolean) dan string kosong (&quot;&quot;) otomatis dipertahankan sesuai konfigurasi skema.
                      </div>
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
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Play size={13} color="var(--accent-cyan)" /> Test Parameter Values for Live Validation
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Parameter bertanda <em>(allow empty)</em> akan tetap disertakan jika dikosongkan
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      {parameters.filter(p => p.name).map((p, idx) => (
                        <div key={idx}>
                          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            <span>
                              {p.name} {p.required && <span style={{ color: '#ef4444' }}>*</span>}
                            </span>
                            {p.include_empty && (
                              <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)', padding: '1px 5px', borderRadius: '4px' }} title="Parameter ini tetap dikirim ke API meskipun nilainya kosong">
                                allow empty
                              </span>
                            )}
                          </label>
                          <input
                            type="text"
                            className="input-field font-mono"
                            style={{ padding: '6px 8px', fontSize: '12px' }}
                            placeholder={p.default || (p.include_empty ? 'Kirim nilai kosong ("")' : `Value for ${p.name}`)}
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
            gap: isFieldsCollapsed ? '0' : '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div
                onClick={() => setIsFieldsCollapsed(!isFieldsCollapsed)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                title={isFieldsCollapsed ? 'Klik untuk membuka Kamus Data' : 'Klik untuk menutup Kamus Data'}
              >
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
                  {isFieldsCollapsed ? (
                    <ChevronRight size={16} color="var(--text-muted)" />
                  ) : (
                    <ChevronDown size={16} color="var(--text-muted)" />
                  )}
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
                      onClick={() => {
                        setIsFieldsCollapsed(false);
                        handleAutoDetectFieldDefinitions();
                      }}
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

                {!isFieldsCollapsed && fieldDefinitions.length > 0 && (
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

                <button
                  type="button"
                  onClick={() => setIsFieldsCollapsed(!isFieldsCollapsed)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                  title={isFieldsCollapsed ? 'Buka kamus data' : 'Tutup kamus data'}
                >
                  {isFieldsCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <span>{isFieldsCollapsed ? 'Buka' : 'Tutup'}</span>
                </button>
              </div>
            </div>

            {!isFieldsCollapsed && (
              <>
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
              </>
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
