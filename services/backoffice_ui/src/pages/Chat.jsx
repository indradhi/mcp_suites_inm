import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Trash2, 
  Layers, 
  FileText, 
  Share2, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft, 
  ChevronUp, 
  SlidersHorizontal, 
  Database, 
  Clock, 
  Loader2, 
  AlertCircle,
  HelpCircle,
  Cpu,
  Zap,
  Code,
  Image as ImageIcon,
  X,
  ScanFace,
  UserCheck,
  UserX,
  MapPin,
  Compass,
  Network,
  Lightbulb,
  ShieldCheck,
  ExternalLink,
  Maximize2,
  Download,
  Check,
  Copy,
  Search,
  Filter,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Paperclip,
  Workflow,
  History,
  BrainCircuit,
  FileJson,
  RotateCcw
} from 'lucide-react';
import api from '../api/client';
import { formatTimeWIB } from '../utils/dateUtils';
import CytoscapeGraph from '../components/graph/CytoscapeGraph';
import { ValidityBadge } from '../components/common/ValidityTierSelector';
import GeoJsonMapViewer, { extractPolygonsFromData } from '../components/common/GeoJsonMapViewer';
import GeoJsonMapModal from '../components/modals/GeoJsonMapModal';
import ReasoningCard from '../components/chat/ReasoningCard';
import RecommendationChips, { generateContextualRecommendations } from '../components/chat/RecommendationChips';
import ExploreToolsModal from '../components/chat/ExploreToolsModal';
import ChatHistoryDrawer from '../components/chat/ChatHistoryDrawer';

/**
 * Normalizes any image source string into a valid browser image src.
 * Supports:
 * - data:image/...;base64,... (with any embedded whitespace/newlines stripped)
 * - Standard HTTP/HTTPS or relative path URLs
 * - Raw Base64 strings without data:image prefix (auto-detects JPEG, PNG, GIF, WEBP, BMP magic bytes)
 */
const normalizeImageSrc = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();

  // 1. Data URL
  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(str)) {
    const parts = str.split(';base64,');
    if (parts.length >= 2) {
      let b64 = parts.slice(1).join(';base64,').replace(/\s+/g, '');
      b64 = b64.replace(/(?:\.\.\.|\[truncated[^\]]*\]|\)+)$/g, '');
      while (b64.length % 4 !== 0) {
        b64 += '=';
      }
      return `${parts[0]};base64,${b64}`;
    }
    return str.replace(/\s+/g, '');
  }

  // 2. Standard HTTP / HTTPS / Relative path with image extension or endpoint
  if (/^(https?:\/\/|\/|\.\/)/i.test(str)) {
    return str;
  }

  // 3. Raw Base64 string without data:image prefix
  let clean = str.replace(/[\s"']/g, '');
  clean = clean.replace(/(?:\.\.\.|\[truncated[^\]]*\]|\)+)$/g, '');
  if (clean.length >= 40) {
    while (clean.length % 4 !== 0) {
      clean += '=';
    }
    if (clean.startsWith('/9j/')) return `data:image/jpeg;base64,${clean}`;
    if (clean.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${clean}`;
    if (clean.startsWith('R0lGOD')) return `data:image/gif;base64,${clean}`;
    if (clean.startsWith('UklGR')) return `data:image/webp;base64,${clean}`;
    if (clean.startsWith('Qk')) return `data:image/bmp;base64,${clean}`;
  }

  return null;
};

/**
 * Checks if a string contains or is an image source
 */
const isImageSource = (str) => {
  return Boolean(normalizeImageSrc(str));
};

/**
 * Recursively extracts any images found in an object or array (e.g. from tool output)
 */
const extractImagesFromData = (data, maxImages = 8) => {
  const images = [];
  if (!data) return images;

  const traverse = (val, keyPath = '') => {
    if (images.length >= maxImages) return;
    if (!val) return;

    if (typeof val === 'string') {
      const norm = normalizeImageSrc(val);
      if (norm && (norm.startsWith('data:image/') || /\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i.test(norm))) {
        images.push({ src: norm, label: keyPath || 'Image' });
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, idx) => traverse(item, `${keyPath}[${idx}]`));
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        traverse(v, keyPath ? `${keyPath}.${k}` : k);
      }
    }
  };

  traverse(data);
  return images;
};

const SESSIONS_STORAGE_KEY = 'mcp_chat_sessions_v1';
const DEFAULT_WELCOME_MESSAGE = {
  id: 'welcome-msg',
  role: 'assistant',
  content: '👋 **Welcome to the AI Knowledge Chat Playground!**\n\nYou can ask questions about your connected databases, uploaded documents, APIs, and websites. I will retrieve the most relevant knowledge chunks from **ChromaDB**, inspect relationships in **Neo4j**, and generate grounded answers using your configured LLM.',
  sources: [],
  entities: [],
  tools_executed: [],
  metrics: null
};

export default function Chat() {
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load chat sessions:', e);
    }
    const defaultSession = {
      id: `session-${Date.now()}`,
      title: 'Obrolan Baru',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: '',
      messages: [DEFAULT_WELCOME_MESSAGE]
    };
    return [defaultSession];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    try {
      const lastActive = localStorage.getItem('mcp_active_session_id');
      if (lastActive) return lastActive;
    } catch (e) {}
    return 'default';
  });

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      const lastActive = localStorage.getItem('mcp_active_session_id');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const found = parsed.find(s => s.id === lastActive) || parsed[0];
          if (found && found.messages && found.messages.length > 0) {
            return found.messages;
          }
        }
      }
    } catch (e) {}
    return [DEFAULT_WELCOME_MESSAGE];
  });

  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isExploreToolsModalOpen, setIsExploreToolsModalOpen] = useState(false);
  const [contextResetIndex, setContextResetIndex] = useState(0);
  const [reasoningEffort, setReasoningEffort] = useState(() => {
    return localStorage.getItem('chat_reasoning_effort') || 'auto';
  });

  const handleReasoningEffortChange = (val) => {
    setReasoningEffort(val);
    localStorage.setItem('chat_reasoning_effort', val);
  };
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sourcesList, setSourcesList] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const sourceDropdownRef = useRef(null);
  const [topK, setTopK] = useState(20);
  const [includeGraph, setIncludeGraph] = useState(true);
  const [strictMode, setStrictMode] = useState(true);
  const [temperature, setTemperature] = useState(0.0);
  const [expandedSources, setExpandedSources] = useState({});
  const [expandedEntities, setExpandedEntities] = useState({});
  const [expandedTools, setExpandedTools] = useState({});
  const [expandedThinking, setExpandedThinking] = useState({});
  const [expandedGraph, setExpandedGraph] = useState({});
  const [expandedMap, setExpandedMap] = useState({});
  const [expandedFace, setExpandedFace] = useState({});
  const [activeTools, setActiveTools] = useState([]);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isHeaderOptionsOpen, setIsHeaderOptionsOpen] = useState(() => {
    const saved = localStorage.getItem('chat_options_open');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleHeaderOptions = () => {
    setIsHeaderOptionsOpen(prev => {
      const next = !prev;
      localStorage.setItem('chat_options_open', String(next));
      return next;
    });
  };
  const [attachedImage, setAttachedImage] = useState(null);
  const [attachedDocument, setAttachedDocument] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadError, setDocUploadError] = useState(null);
  const [activeBackends, setActiveBackends] = useState([]);
  const [selectedBackendId, setSelectedBackendId] = useState(null);
  const [selectedModelName, setSelectedModelName] = useState('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [geoJsonModalData, setGeoJsonModalData] = useState(null); // { features, activeIndex }
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedResponseId, setCopiedResponseId] = useState(null);
  const [feedbackState, setFeedbackState] = useState({}); // msgId -> 'like' | 'dislike' | null
  const [dislikeNotes, setDislikeNotes] = useState({}); // msgId -> string
  const [pendingFeedback, setPendingFeedback] = useState({}); // msgId -> true (submitting)
  const [activePersonality, setActivePersonality] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDownGlobal = (e) => {
      if (e.key === 'Escape') {
        setLightboxImage(null);
        setGeoJsonModalData(null);
        setIsSourceDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target)) {
        setIsSourceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ensure activeSessionId matches an actual session
  useEffect(() => {
    if (!sessions.some(s => s.id === activeSessionId)) {
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      }
    }
  }, [sessions, activeSessionId]);

  // Synchronize messages with sessions in localStorage
  useEffect(() => {
    if (!activeSessionId) return;

    setSessions(prevSessions => {
      const idx = prevSessions.findIndex(s => s.id === activeSessionId);
      if (idx === -1) return prevSessions;

      const current = prevSessions[idx];
      let title = current.title;
      if (!title || title === 'Obrolan Baru' || title === 'New Chat') {
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (firstUserMsg && firstUserMsg.content) {
          title = firstUserMsg.content.slice(0, 36) + (firstUserMsg.content.length > 36 ? '...' : '');
        }
      }

      const updated = [...prevSessions];
      updated[idx] = {
        ...current,
        title,
        updated_at: new Date().toISOString(),
        model: selectedModelName || current.model,
        messages
      };

      try {
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
        localStorage.setItem('mcp_active_session_id', activeSessionId);
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }
      return updated;
    });
  }, [messages, activeSessionId, selectedModelName]);

  const handleSelectSession = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    setActiveSessionId(sessionId);
    setMessages(session.messages || [DEFAULT_WELCOME_MESSAGE]);
    setContextResetIndex(0);
    if (session.model) {
      setSelectedModelName(session.model);
    }
    localStorage.setItem('mcp_active_session_id', sessionId);
  };

  const handleNewChat = () => {
    const newSession = {
      id: `session-${Date.now()}`,
      title: 'Obrolan Baru',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: selectedModelName || '',
      messages: [DEFAULT_WELCOME_MESSAGE]
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setContextResetIndex(0);
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
      localStorage.setItem('mcp_active_session_id', newSession.id);
    } catch (e) {}
  };

  const handleNewTopic = () => {
    const dividerId = `topic-divider-${Date.now()}`;
    const dividerMsg = {
      id: dividerId,
      role: 'divider',
      content: '🎯 Topik Baru Dimulai — Context & Working Memory Disegarkan (Anti-Rot Aktif)',
      timestamp: formatTimeWIB(new Date())
    };
    setMessages(prev => [...prev, dividerMsg]);
    setContextResetIndex(messages.length + 1);
  };

  const handleDeleteSession = (sessionId) => {
    const remaining = sessions.filter(s => s.id !== sessionId);
    if (remaining.length === 0) {
      const fresh = {
        id: `session-${Date.now()}`,
        title: 'Obrolan Baru',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        model: selectedModelName || '',
        messages: [DEFAULT_WELCOME_MESSAGE]
      };
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      setMessages([DEFAULT_WELCOME_MESSAGE]);
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([fresh]));
      localStorage.setItem('mcp_active_session_id', fresh.id);
    } else {
      setSessions(remaining);
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(remaining));
      if (activeSessionId === sessionId) {
        const next = remaining[0];
        setActiveSessionId(next.id);
        setMessages(next.messages || [DEFAULT_WELCOME_MESSAGE]);
        localStorage.setItem('mcp_active_session_id', next.id);
      }
    }
  };

  const handleRenameSession = (sessionId, newTitle) => {
    const updated = sessions.map(s => s.id === sessionId ? { ...s, title: newTitle, updated_at: new Date().toISOString() } : s);
    setSessions(updated);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleImportOpenAI = (importedData) => {
    const newSession = {
      id: `session-${Date.now()}`,
      title: importedData.title || 'Imported OpenAI Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: importedData.model || selectedModelName || '',
      messages: importedData.messages || [DEFAULT_WELCOME_MESSAGE]
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    setMessages(newSession.messages);
    if (importedData.model) {
      setSelectedModelName(importedData.model);
    }
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
    localStorage.setItem('mcp_active_session_id', newSession.id);
  };

  const toggleSourceSelection = (sourceId) => {
    setSelectedSources(prev => {
      if (prev.includes(sourceId)) {
        return prev.filter(id => id !== sourceId);
      } else {
        return [...prev, sourceId];
      }
    });
  };

  const selectAllSources = () => {
    setSelectedSources(sourcesList.map(s => s.id));
  };

  const clearSelectedSources = () => {
    setSelectedSources([]);
  };

  const filteredSources = sourcesList.filter(s => {
    if (!sourceSearchQuery.trim()) return true;
    const q = sourceSearchQuery.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.source_type && s.source_type.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    fetchSources();
    fetchTools();
    fetchActiveModels();
    fetchActivePersonality();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchActiveModels = async () => {
    try {
      const res = await api.get('/llm/active-models');
      if (res.data && Array.isArray(res.data)) {
        setActiveBackends(res.data);
      }
    } catch (err) {
      console.warn('Could not fetch active models for chat:', err);
    }
  };

  const fetchSources = async () => {
    try {
      const res = await api.get('/chat/sources');
      setSourcesList(res.data || []);
    } catch (err) {
      console.warn('Could not fetch sources for chat filter:', err);
    }
  };

  const fetchTools = async () => {
    try {
      const res = await api.get('/chat/tools');
      setActiveTools(res.data?.tools || []);
    } catch (err) {
      console.warn('Could not fetch tools for chat:', err);
    }
  };

  const fetchActivePersonality = async () => {
    try {
      const res = await api.get('/settings/personality');
      if (res.data?.personality) {
        setActivePersonality(res.data.personality);
      }
    } catch (err) {
      console.warn('Could not fetch active personality for chat:', err);
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

  const handleDocSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 35MB file size limit
    if (file.size > 35 * 1024 * 1024) {
      setDocUploadError('Ukuran file melebihi batas maksimal 35MB');
      setTimeout(() => setDocUploadError(null), 6000);
      e.target.value = '';
      return;
    }

    setDocUploading(true);
    setDocUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/chat/upload-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success && res.data?.data) {
        setAttachedDocument(res.data.data);
      } else {
        setDocUploadError('Gagal memproses dan mengekstrak isi dokumen.');
      }
    } catch (err) {
      console.error('Error uploading chat document:', err);
      setDocUploadError(err.response?.data?.detail || 'Gagal mengunggah dokumen.');
      setTimeout(() => setDocUploadError(null), 6000);
    } finally {
      setDocUploading(false);
      e.target.value = '';
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            setAttachedImage(event.target.result);
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          return;
        }
      }
    }

    // Detect if pasted text contains an image data URL or raw base64 string
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText) {
      const norm = normalizeImageSrc(pastedText.trim());
      if (norm && norm.startsWith('data:image/')) {
        setAttachedImage(norm);
        e.preventDefault();
      }
    }
  };

  const toggleSources = (msgId) => {
    setExpandedSources(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleEntities = (msgId) => {
    setExpandedEntities(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleTools = (msgId) => {
    setExpandedTools(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleThinking = (msgId) => {
    setExpandedThinking(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleGraph = (msgId) => {
    setExpandedGraph(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleMap = (msgId) => {
    setExpandedMap(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleFace = (msgId) => {
    setExpandedFace(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const submitFeedback = async (msg, feedbackType, note = '') => {
    if (pendingFeedback[msg.id]) return; // Prevent double submit
    setPendingFeedback(prev => ({ ...prev, [msg.id]: true }));
    // Optimistic UI update
    setFeedbackState(prev => ({ ...prev, [msg.id]: feedbackType }));
    try {
      await api.post('/chat/feedback', {
        message_id: msg.id,
        question: messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(msg))?.content?.slice(0, 800) || '',
        answer: (msg.content || '').slice(0, 4000),
        feedback: feedbackType,
        notes: note || undefined,
        model_used: msg.model_used || undefined,
        source_ids: selectedSources.length > 0 ? selectedSources : undefined,
        tools_called: (msg.tools_executed || []).map(t => t.tool_name).filter(Boolean)
      });
    } catch (err) {
      console.warn('Failed to submit feedback:', err);
      // Revert on error
      setFeedbackState(prev => ({ ...prev, [msg.id]: null }));
    } finally {
      setPendingFeedback(prev => ({ ...prev, [msg.id]: false }));
    }
  };

  const handleCopyResponse = (msgId, text) => {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedResponseId(msgId);
      setTimeout(() => setCopiedResponseId(null), 2000);
    } catch (err) {
      console.error('Failed to copy response:', err);
    }
  };

  const handleSend = async (customPrompt) => {
    const textToSend = typeof customPrompt === 'string' ? customPrompt : input;
    const effectiveText = textToSend.trim() || 
      (attachedDocument ? `Analisis isi dokumen '${attachedDocument.file_name}' dan berikan poin-poin penting serta ringkasannya` : 
      (attachedImage ? 'Recognize this face / analyze image' : ''));
    if (!effectiveText && !attachedImage && !attachedDocument) return;
    if (loading || docUploading) return;

    const currentAttachedImage = attachedImage;
    const currentAttachedDoc = attachedDocument;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: effectiveText,
      image: currentAttachedImage,
      document: currentAttachedDoc,
      timestamp: formatTimeWIB(new Date())
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setAttachedImage(null);
    setAttachedDocument(null);
    setLoading(true);

    // Prepare conversational history (respect context reset index & exclude dividers/welcome)
    const historySlice = contextResetIndex > 0 ? newMessages.slice(contextResetIndex) : newMessages;
    const historyPayload = historySlice
      .filter(m => m.id !== 'welcome-msg' && m.role !== 'divider')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await api.post('/chat', {
        message: effectiveText,
        history: historyPayload.slice(0, -1), // prior history
        source_id: selectedSources.length === 1 ? parseInt(selectedSources[0]) : null,
        source_ids: selectedSources.length > 0 ? selectedSources.map(id => parseInt(id)) : null,
        backend_id: selectedBackendId || null,
        model_name: selectedModelName || null,
        include_graph: includeGraph,
        top_k: topK,
        image_base64: currentAttachedImage || null,
        doc_id: currentAttachedDoc?.doc_id || null,
        document_data: currentAttachedDoc || null,
        strict_mode: strictMode,
        temperature: temperature,
        reasoning_effort: reasoningEffort !== 'auto' ? reasoningEffort : undefined
      }, {
        timeout: 600000 // 10 minutes timeout for local AI compute & multi-turn tool calling
      });

      let cleanAnswer = res.data.answer || 'No response generated.';
      let thinkingProcess = res.data.thinking || null;

      // Extract client-side <think>...</think> in case any leaked through
      const thinkMatch = cleanAnswer.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch) {
        if (!thinkingProcess) {
          thinkingProcess = thinkMatch[1].trim();
        }
        cleanAnswer = cleanAnswer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }

      const aiMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: cleanAnswer,
        thinking: thinkingProcess,
        sources: res.data.sources || [],
        entities: res.data.entities || [],
        tools_executed: res.data.tools_executed || [],
        face_recognition: res.data.face_recognition || null,
        model_used: res.data.model_used,
        backend_name: res.data.backend_name,
        metrics: res.data.metrics || null,
        context_rot_guard: res.data.context_rot_guard || null,
        timestamp: formatTimeWIB(new Date())
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Auto-open GeoJSON modal if polygons are detected
      const extractedPolygons = (res.data.tools_executed || []).flatMap(t => extractPolygonsFromData(t.data));
      if (extractedPolygons && extractedPolygons.length > 0) {
        setGeoJsonModalData({ features: extractedPolygons, activeIndex: 0 });
      }
      
      // All additional info sections (sources, tools, graph, map, face) default to COLLAPSED
    } catch (err) {
      let errorDetail = err.response?.data?.detail || err.message;
      const isTimeout = err.response?.status === 504 || 
                        (err.message && err.message.includes('504')) || 
                        err.code === 'ECONNABORTED' || 
                        (err.message && err.message.toLowerCase().includes('timeout'));

      if (isTimeout) {
        const curBackend = activeBackends.find(b => String(b.id) === String(selectedBackendId));
        const isLocalBackend = curBackend ? (
          curBackend.name?.toLowerCase().includes('local') ||
          curBackend.name?.toLowerCase().includes('vllm') ||
          curBackend.name?.toLowerCase().includes('ollama') ||
          curBackend.api_base?.includes('172.16.') ||
          curBackend.api_base?.includes('192.168.') ||
          curBackend.api_base?.includes('10.') ||
          curBackend.api_base?.includes('localhost') ||
          curBackend.api_base?.includes('127.0.0.1')
        ) : (!selectedModelName?.includes('/') && !selectedModelName?.toLowerCase().includes('gpt') && !selectedModelName?.toLowerCase().includes('deepseek'));

        if (isLocalBackend) {
          errorDetail = `Waktu Tunggu Habis (Timeout): AI lokal memerlukan waktu komputasi lebih lama dari batas waktu yang ditentukan (10 menit).\n\nHal ini biasanya terjadi jika server AI lokal sedang memproses konteks dokumen/data yang sangat besar, menjalankan pemanggilan tools (*tool calling*), atau beban GPU/CPU pada server AI lokal sedang penuh.\n\n💡 **Saran Solusi:**\n- Periksa status utilisasi GPU/VRAM dan CPU pada server AI lokal.\n- Coba kurangi jumlah dokumen knowledge base yang dipilih atau ajukan pertanyaan yang lebih spesifik.\n- Batas waktu tunggu AI lokal dapat diperpanjang lebih lanjut melalui variabel 'LOCAL_LLM_TIMEOUT' di .env backend.`;
        } else {
          errorDetail = `Gateway Timeout (504): Permintaan ke model cloud AI memerlukan waktu lebih dari batas waktu tunggu. Hal ini biasanya terjadi jika server penyedia (seperti OpenRouter) sedang mengalami antrean padat atau model penalaran (*reasoning*) membutuhkan waktu komputasi yang terlalu lama.\n\n💡 **Saran Solusi:** Coba pilih model yang lebih cepat dan responsif seperti **'deepseek/deepseek-chat'** atau **'openai/gpt-4o-mini'** pada pilihan model di panel pengaturan atas.`;
        }
      }
      const errorMsg = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Kendala Komunikasi dengan AI Knowledge Service:**\n\n${errorDetail}`,
        sources: [],
        entities: [],
        metrics: null,
        timestamp: formatTimeWIB(new Date())
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    // Auto-adjust height
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const handleClear = () => {
    handleNewChat();
  };

  const samplePrompts = [
    'Ringkas dan analisis temuan utama dalam file terlampir',
    'Tampilkan data kependudukan Cianjur dalam bentuk tabel dan peta',
    'Tampilkan entitas dan relasi Knowledge Graph secara visual',
    'Bandingkan status database dan API dalam format tabel',
    'Siapa itu Indradhi di database kependudukan?',
    'Cari data sertifikat tanah di BPN',
    'Status sinkronisasi seluruh Knowledge Sources'
  ];

  // Indonesian city coordinates dictionary for automatic map visualization
  const CITY_COORDS = {
    cianjur: { name: 'Cianjur, Jawa Barat', lat: -6.8227, lng: 107.1396 },
    tangerang: { name: 'Tangerang, Banten', lat: -6.1783, lng: 106.6319 },
    jakarta: { name: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 },
    bandung: { name: 'Bandung, Jawa Barat', lat: -6.9175, lng: 107.6191 },
    bogor: { name: 'Bogor, Jawa Barat', lat: -6.5971, lng: 106.8060 },
    bekasi: { name: 'Bekasi, Jawa Barat', lat: -6.2383, lng: 106.9756 },
    depok: { name: 'Depok, Jawa Barat', lat: -6.4025, lng: 106.7942 },
    surabaya: { name: 'Surabaya, Jawa Timur', lat: -7.2575, lng: 112.7521 },
    semarang: { name: 'Semarang, Jawa Tengah', lat: -6.9667, lng: 110.4167 },
    yogyakarta: { name: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695 },
    jogja: { name: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695 },
    solo: { name: 'Surakarta (Solo), Jawa Tengah', lat: -7.5666, lng: 110.8166 },
    surakarta: { name: 'Surakarta, Jawa Tengah', lat: -7.5666, lng: 110.8166 },
    malang: { name: 'Malang, Jawa Timur', lat: -7.9797, lng: 112.6304 },
    medan: { name: 'Medan, Sumatera Utara', lat: 3.5952, lng: 98.6722 },
    palembang: { name: 'Palembang, Sumatera Selatan', lat: -2.9761, lng: 104.7754 },
    makassar: { name: 'Makassar, Sulawesi Selatan', lat: -5.1477, lng: 119.4327 },
    denpasar: { name: 'Denpasar, Bali', lat: -8.6705, lng: 115.2126 },
    bali: { name: 'Bali, Indonesia', lat: -8.4095, lng: 115.1889 },
    lampung: { name: 'Bandar Lampung', lat: -5.4297, lng: 105.2625 },
    padang: { name: 'Padang, Sumatera Barat', lat: -0.9471, lng: 100.4172 },
    pekanbaru: { name: 'Pekanbaru, Riau', lat: 0.5071, lng: 101.4478 },
    pontianak: { name: 'Pontianak, Kalimantan Barat', lat: -0.0263, lng: 109.3425 },
    banjarmasin: { name: 'Banjarmasin, Kalimantan Selatan', lat: -3.3194, lng: 114.5908 },
    samarinda: { name: 'Samarinda, Kalimantan Timur', lat: -0.5022, lng: 117.1536 },
    balikpapan: { name: 'Balikpapan, Kalimantan Timur', lat: -1.2379, lng: 116.8529 },
    manado: { name: 'Manado, Sulawesi Utara', lat: 1.4748, lng: 124.8428 },
    kupang: { name: 'Kupang, NTT', lat: -10.1772, lng: 123.6070 },
    jayapura: { name: 'Jayapura, Papua', lat: -2.5916, lng: 140.6690 },
    nusantara: { name: 'IKN Nusantara', lat: -0.9744, lng: 116.7094 },
    serang: { name: 'Serang, Banten', lat: -6.1104, lng: 106.1640 },
    cirebon: { name: 'Cirebon, Jawa Barat', lat: -6.7320, lng: 108.5523 },
    sukabumi: { name: 'Sukabumi, Jawa Barat', lat: -6.9277, lng: 106.9300 }
  };

  const detectLocation = (text) => {
    if (!text || typeof text !== 'string') return null;

    // 1. Explicit coordinates [lat, lng]
    const coordRegex = /\[\s*(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*\]/;
    const match = text.match(coordRegex);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { name: `Location Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
      }
    }

    // 2. lat: ..., lng: ...
    const kvRegex = /lat(?:itude)?[:\s=]+(-?\d{1,2}\.\d{3,})[\s,]+(?:long?|lng)(?:itude)?[:\s=]+(-?\d{1,3}\.\d{3,})/i;
    const kvMatch = text.match(kvRegex);
    if (kvMatch) {
      const lat = parseFloat(kvMatch[1]);
      const lng = parseFloat(kvMatch[2]);
      return { name: `Location Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
    }

    // 3. Known cities / regencies
    const lower = text.toLowerCase();
    for (const [key, loc] of Object.entries(CITY_COORDS)) {
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(lower)) {
        return loc;
      }
    }

    return null;
  };

  const buildGraphElements = (entities) => {
    if (!entities || !Array.isArray(entities) || entities.length === 0) return [];
    const nodesMap = new Map();
    const edges = [];

    entities.forEach((ent, idx) => {
      const id = (ent.name || `ent_${idx}`).trim();
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          data: {
            id,
            label: ent.name || `Entity ${idx + 1}`,
            type: (ent.type || 'ENTITY').toUpperCase(),
            description: ent.type || 'Knowledge Entity'
          }
        });
      }

      if (Array.isArray(ent.connections)) {
        ent.connections.forEach((conn, cIdx) => {
          let relLabel = 'CONNECTED_TO';
          let target = '';

          if (typeof conn === 'string') {
            if (conn.includes('->')) {
              const parts = conn.split('->');
              relLabel = parts[0].trim();
              target = parts[1].trim();
            } else {
              target = conn.trim();
            }
          } else if (conn && typeof conn === 'object') {
            relLabel = conn.relation || conn.type || 'CONNECTED_TO';
            target = conn.target || conn.name || '';
          }

          if (target && typeof target === 'string') {
            target = target.trim();
            if (!nodesMap.has(target)) {
              nodesMap.set(target, {
                data: {
                  id: target,
                  label: target,
                  type: 'RELATED',
                  description: 'Connected Entity'
                }
              });
            }
            edges.push({
              data: {
                id: `e_${id}_${target}_${cIdx}`,
                source: id,
                target: target,
                label: relLabel
              }
            });
          }
        });
      }
    });

    return [...Array.from(nodesMap.values()), ...edges];
  };

  const renderInlineStyles = (str) => {
    if (!str || typeof str !== 'string') return str;

    const regex = /(!?\[.*?\]\(.*?\)|<img\s+[^>]*>|data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+|(?:\/9j\/|iVBORw0KGgo|R0lGOD|UklGR|Qk)[A-Za-z0-9+/=]{50,}|(?:\*\*.*?\*\*)|(?:`.*?`)|(?:\*[^\*]+\*)|(?:_[^_]+_))/g;
    const parts = str.split(regex);

    return parts.map((part, i) => {
      if (!part) return null;

      // 1. Inline Markdown Image: ![alt](url)
      if (part.startsWith('![') && part.includes('](')) {
        const m = part.match(/^!\[(.*?)\]\(([\s\S]*?)\)$/);
        if (m) {
          const norm = normalizeImageSrc(m[2]);
          if (norm) {
            return (
              <span
                key={i}
                onClick={() => setLightboxImage({ src: norm, alt: m[1] || 'Image' })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: '4px 6px',
                  padding: '3px 6px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  verticalAlign: 'middle'
                }}
                title="Click to view full image"
              >
                <img
                  src={norm}
                  alt={m[1] || 'Image'}
                  style={{
                    maxWidth: '180px',
                    maxHeight: '120px',
                    borderRadius: '6px',
                    display: 'block',
                    objectFit: 'cover'
                  }}
                />
                <Maximize2 size={12} color="var(--text-muted)" />
              </span>
            );
          }
        }
      }

      // 2. Inline HTML Image: <img ... />
      if (part.startsWith('<img') && part.includes('src=')) {
        const srcMatch = part.match(/src=["']([^"']+)["']/i);
        const altMatch = part.match(/alt=["']([^"']*)["']/i);
        if (srcMatch) {
          const norm = normalizeImageSrc(srcMatch[1]);
          if (norm) {
            return (
              <span
                key={i}
                onClick={() => setLightboxImage({ src: norm, alt: altMatch ? altMatch[1] : 'Image' })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: '4px 6px',
                  padding: '3px 6px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  verticalAlign: 'middle'
                }}
                title="Click to view full image"
              >
                <img
                  src={norm}
                  alt={altMatch ? altMatch[1] : 'Image'}
                  style={{
                    maxWidth: '180px',
                    maxHeight: '120px',
                    borderRadius: '6px',
                    display: 'block',
                    objectFit: 'cover'
                  }}
                />
                <Maximize2 size={12} color="var(--text-muted)" />
              </span>
            );
          }
        }
      }

      // 3. Standalone Data URL or Raw Base64 string in text
      const normRaw = normalizeImageSrc(part);
      if (normRaw && (part.startsWith('data:image/') || part.startsWith('/9j/') || part.startsWith('iVBORw0KGgo') || part.startsWith('R0lGOD') || part.startsWith('UklGR') || part.startsWith('Qk'))) {
        return (
          <span
            key={i}
            onClick={() => setLightboxImage({ src: normRaw, alt: 'Embedded Image' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              margin: '6px 0',
              padding: '4px 8px',
              background: 'rgba(15, 23, 42, 0.8)',
              borderRadius: '8px',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              cursor: 'pointer',
              verticalAlign: 'middle'
            }}
            title="Click to view full image"
          >
            <img
              src={normRaw}
              alt="Base64 Image"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '6px',
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            />
            <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ImageIcon size={13} /> Base64 Image Preview <Maximize2 size={11} />
            </span>
          </span>
        );
      }

      // 4. Inline Link: [text](url)
      if (part.startsWith('[') && part.includes('](')) {
        const m = part.match(/^\[(.*?)\]\((.*?)\)$/);
        if (m) {
          if (/\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i.test(m[2])) {
            return (
              <span
                key={i}
                onClick={() => setLightboxImage({ src: m[2], alt: m[1] })}
                style={{
                  color: '#38bdf8',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Click to preview image"
              >
                <ImageIcon size={12} />
                <span>{m[1]}</span>
              </span>
            );
          }
          return (
            <a
              key={i}
              href={m[2]}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#38bdf8',
                textDecoration: 'underline',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px'
              }}
            >
              <span>{m[1]}</span>
              <ExternalLink size={10} style={{ display: 'inline' }} />
            </a>
          );
        }
      }


      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#ffffff', fontWeight: '600' }}>{part.slice(2, -2)}</strong>;
      }

      // Code: `code`
      if (part.startsWith('`') && part.endsWith('`')) {
        const codeContent = part.slice(1, -1);
        const codeImg = normalizeImageSrc(codeContent);
        if (codeImg && (codeContent.startsWith('data:image/') || codeContent.startsWith('/9j/') || codeContent.startsWith('iVBORw0KGgo'))) {
          return (
            <span
              key={i}
              onClick={() => setLightboxImage({ src: codeImg, alt: 'Code Block Image' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 8px',
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              title="Click to view image"
            >
              <img src={codeImg} alt="Thumbnail" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>Image Base64</span>
            </span>
          );
        }
        return (
          <code key={i} style={{
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            color: '#38bdf8'
          }}>
            {codeContent}
          </code>
        );
      }

      // Italic: *text* or _text_
      if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        return <em key={i} style={{ color: '#e2e8f0', fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
      }

      return part;
    });
  };

  const parseMarkdownBlocks = (text) => {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 1. Code blocks (```lang ... ```)
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim().toLowerCase();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        const rawCode = codeLines.join('\n');

        if (lang === 'graph' || lang === 'cytoscape') {
          try {
            const parsed = JSON.parse(rawCode);
            blocks.push({ type: 'inline-graph', data: parsed });
          } catch {
            blocks.push({ type: 'code', lang, code: rawCode });
          }
        } else if (lang === 'map' || lang === 'geojson') {
          try {
            const parsed = JSON.parse(rawCode);
            const isPoly = parsed && (
              parsed.type === 'Polygon' || 
              parsed.type === 'MultiPolygon' || 
              parsed.type === 'Feature' || 
              parsed.type === 'FeatureCollection' || 
              parsed.coordinates || 
              parsed.geometry || 
              parsed.Polygon
            );
            if (isPoly) {
              blocks.push({ type: 'geojson-map', data: parsed });
            } else {
              blocks.push({ type: 'inline-map', data: parsed });
            }
          } catch {
            const latMatch = rawCode.match(/lat(?:itude)?[:\s=]+(-?\d{1,2}\.\d+)/i);
            const lngMatch = rawCode.match(/(?:long?|lng)(?:itude)?[:\s=]+(-?\d{1,3}\.\d+)/i);
            const nameMatch = rawCode.match(/(?:name|location|title)[:\s=]+([^\n\r]+)/i);
            if (latMatch && lngMatch) {
              blocks.push({
                type: 'inline-map',
                data: {
                  lat: parseFloat(latMatch[1]),
                  lng: parseFloat(lngMatch[1]),
                  name: nameMatch ? nameMatch[1].trim() : 'Specified Location'
                }
              });
            } else {
              blocks.push({ type: 'code', lang, code: rawCode });
            }
          }
        } else if (lang === 'json') {
          try {
            const parsed = JSON.parse(rawCode);
            if (parsed && (parsed.type === 'Polygon' || parsed.type === 'MultiPolygon' || (parsed.type === 'Feature' && (parsed.geometry?.type === 'Polygon' || parsed.geometry?.type === 'MultiPolygon')) || parsed.Polygon)) {
              blocks.push({ type: 'geojson-map', data: parsed });
            } else {
              blocks.push({ type: 'code', lang, code: rawCode });
            }
          } catch {
            blocks.push({ type: 'code', lang, code: rawCode });
          }
        } else {
          blocks.push({ type: 'code', lang, code: rawCode });
        }
        continue;
      }

      // 2. Markdown Tables: Line contains | and the next line is a separator |---|---|
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(lines[i + 1])) {
        const parseCells = (rowStr) => {
          let trimmed = rowStr.trim();
          if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
          if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
          return trimmed.split('|').map(c => c.trim());
        };

        const headers = parseCells(line);
        const sepCells = parseCells(lines[i + 1]);
        const alignments = sepCells.map(cell => {
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          return 'left';
        });

        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
          rows.push(parseCells(lines[i]));
          i++;
        }

        blocks.push({ type: 'table', headers, alignments, rows });
        continue;
      }

      // 3. Multi-line or single-line Markdown Image block: ![alt](url)
      if (line.trim().startsWith('![') && !line.trim().endsWith(')')) {
        let accumulated = line;
        let nextI = i + 1;
        while (nextI < lines.length && !accumulated.includes(')')) {
          accumulated += lines[nextI];
          nextI++;
        }
        let candidate = accumulated.trim();
        if (!candidate.endsWith(')') && (candidate.includes('(data:image/') || candidate.includes('(/9j/'))) {
          candidate += ')';
        }
        const multiMatch = candidate.match(/^!\[(.*?)\]\(([\s\S]*?)\)$/);
        if (multiMatch) {
          const normSrc = normalizeImageSrc(multiMatch[2]);
          if (normSrc) {
            blocks.push({ type: 'image', alt: multiMatch[1] || 'Image', src: normSrc });
            i = nextI;
            continue;
          }
        }
      }

      // Single line Markdown image: ![alt](url) (with fallback for unclosed image tag)
      let singleLine = line.trim();
      if (singleLine.startsWith('![') && !singleLine.endsWith(')') && (singleLine.includes('(data:image/') || singleLine.includes('(/9j/'))) {
        singleLine += ')';
      }
      const imgMatch = singleLine.match(/^!\[(.*?)\]\(([\s\S]*?)\)$/);
      if (imgMatch) {
        const normSrc = normalizeImageSrc(imgMatch[2]);
        if (normSrc) {
          blocks.push({ type: 'image', alt: imgMatch[1] || 'Image', src: normSrc });
          i++;
          continue;
        }
      }

      // HTML Image tag: <img ... />
      if (line.trim().startsWith('<img') && line.trim().includes('src=')) {
        const srcM = line.match(/src=["']([^"']+)["']/i);
        const altM = line.match(/alt=["']([^"']*)["']/i);
        if (srcM) {
          const normSrc = normalizeImageSrc(srcM[1]);
          if (normSrc) {
            blocks.push({ type: 'image', alt: altM ? altM[1] : 'Image', src: normSrc });
            i++;
            continue;
          }
        }
      }

      // Standalone Data URL or Raw Base64 string line
      const lineTrimmed = line.trim();
      if (lineTrimmed.startsWith('data:image/') || lineTrimmed.startsWith('/9j/') || lineTrimmed.startsWith('iVBORw0KGgo') || lineTrimmed.startsWith('R0lGOD') || lineTrimmed.startsWith('UklGR') || lineTrimmed.startsWith('Qk')) {
        const normLine = normalizeImageSrc(lineTrimmed);
        if (normLine && normLine.startsWith('data:image/')) {
          blocks.push({ type: 'image', alt: 'Base64 Image', src: normLine });
          i++;
          continue;
        }
      }

      // Labeled Image line e.g. "Foto: data:image/..." or "Image: /9j/..." or `"foto": "/9j/..."`
      const labelMatch = lineTrimmed.match(/^(?:(?:\*\*)?(?:Foto|Image|Gambar|Photo|KTP|Face)(?:\*\*)?[:=\s]+)(data:image\/[^\s]+|(?:\/9j\/|iVBORw0KGgo|R0lGOD|UklGR|Qk)[A-Za-z0-9+/=]{40,}|https?:\/\/[^\s]+)$/i) ||
                         lineTrimmed.match(/^["']?(?:foto|image|avatar|photo|thumbnail|picture|image_base64|ktp|nik_foto)["']?:\s*["'](data:image\/[^\s"']+|(?:\/9j\/|iVBORw0KGgo|R0lGOD|UklGR|Qk)[A-Za-z0-9+/=]{40,}|https?:\/\/[^\s"']+)["']?,?$/i);
      if (labelMatch) {
        const normSrc = normalizeImageSrc(labelMatch[1]);
        if (normSrc) {
          const label = lineTrimmed.split(/[:=]/)[0].replace(/[*"']/g, '').trim();
          blocks.push({ type: 'image', alt: label || 'Image', src: normSrc });
          i++;
          continue;
        }
      }

      // 4. Headings
      if (line.startsWith('#### ')) {
        blocks.push({ type: 'heading', level: 4, text: line.replace('#### ', '') });
        i++;
        continue;
      }
      if (line.startsWith('### ')) {
        blocks.push({ type: 'heading', level: 3, text: line.replace('### ', '') });
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        blocks.push({ type: 'heading', level: 2, text: line.replace('## ', '') });
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        blocks.push({ type: 'heading', level: 1, text: line.replace('# ', '') });
        i++;
        continue;
      }

      // 5. Blockquote
      if (line.trim().startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
        continue;
      }

      // 6. Horizontal Rule
      if (/^(\*\*\*|---|___)$/.test(line.trim())) {
        blocks.push({ type: 'hr' });
        i++;
        continue;
      }

      // 7. Bullet lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const items = [];
        while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
          items.push(lines[i].trim().substring(2));
          i++;
        }
        blocks.push({ type: 'ul', items });
        continue;
      }

      // 8. Numbered lists
      if (/^\d+\.\s+/.test(line.trim())) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const numM = lines[i].trim().match(/^\d+\.\s+(.*)/);
          items.push(numM ? numM[1] : lines[i].trim());
          i++;
        }
        blocks.push({ type: 'ol', items });
        continue;
      }

      // 9. Empty line
      if (!line.trim()) {
        blocks.push({ type: 'spacer' });
        i++;
        continue;
      }

      // 10. Normal Paragraph
      blocks.push({ type: 'paragraph', text: line });
      i++;
    }

    return blocks;
  };

  const renderFormattedContent = (text) => {
    if (!text) return null;
    const blocks = parseMarkdownBlocks(text);

    return blocks.map((block, idx) => {
      switch (block.type) {
        case 'table':
          return (
            <div key={idx} style={{
              margin: '12px 0',
              overflowX: 'auto',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(10, 15, 29, 0.65)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                textAlign: 'left'
              }}>
                <thead>
                  <tr style={{
                    background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)',
                    borderBottom: '2px solid rgba(99, 102, 241, 0.4)'
                  }}>
                    {block.headers.map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '10px 14px',
                          fontWeight: '700',
                          color: '#ffffff',
                          textAlign: block.alignments[i] || 'left',
                          letterSpacing: '0.02em',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {renderInlineStyles(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)'}
                    >
                      {row.map((cell, cIdx) => {
                        const cellTrimmed = (cell || '').trim();
                        const normImg = normalizeImageSrc(cellTrimmed);
                        const isDirectImg = Boolean(
                          normImg && (
                            cellTrimmed.startsWith('data:image/') || 
                            cellTrimmed.startsWith('/9j/') || 
                            cellTrimmed.startsWith('iVBORw0KGgo') ||
                            cellTrimmed.startsWith('R0lGOD') ||
                            cellTrimmed.startsWith('UklGR') ||
                            cellTrimmed.startsWith('Qk') ||
                            /\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i.test(cellTrimmed)
                          )
                        );

                        return (
                          <td
                            key={cIdx}
                            style={{
                              padding: '9px 14px',
                              color: 'var(--text-primary)',
                              textAlign: block.alignments[cIdx] || 'left',
                              lineHeight: '1.5'
                            }}
                          >
                            {isDirectImg ? (
                              <div
                                onClick={() => setLightboxImage({ src: normImg, alt: `Table Image (${block.headers[cIdx] || `Col ${cIdx + 1}`})` })}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  cursor: 'pointer',
                                  background: 'rgba(0,0,0,0.4)',
                                  padding: '4px 8px',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(255, 255, 255, 0.15)'
                                }}
                                title="Click to view full image"
                              >
                                <img
                                  src={normImg}
                                  alt="Table Cell"
                                  style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '6px',
                                    objectFit: 'cover',
                                    display: 'block'
                                  }}
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Maximize2 size={12} /> View Photo
                                </span>
                              </div>
                            ) : (
                              renderInlineStyles(cell)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );

        case 'image': {
          const normSrc = normalizeImageSrc(block.src);
          if (!normSrc) return null;
          const isBase64 = normSrc.startsWith('data:image/');
          const formatTag = isBase64 
            ? (normSrc.split(';')[0].replace('data:image/', '').split('+')[0].toUpperCase())
            : (normSrc.split('.').pop().split('?')[0].toUpperCase() || 'URL');

          return (
            <div key={idx} style={{ margin: '14px 0' }}>
              <div style={{
                display: 'inline-flex',
                flexDirection: 'column',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(5, 7, 15, 0.85)',
                boxShadow: '0 6px 22px rgba(0, 0, 0, 0.4)',
                maxWidth: '100%'
              }}>
                {/* Image Viewport */}
                <div 
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    background: 'rgba(0, 0, 0, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                  onClick={() => setLightboxImage({ src: normSrc, alt: block.alt || 'Image' })}
                  title="Click to expand / view full image"
                >
                  <img
                    src={normSrc}
                    alt={block.alt || 'Image'}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '360px',
                      display: 'block',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div style={{ display: 'none', padding: '24px', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '12px' }}>
                    <AlertCircle size={16} />
                    <span>Unable to load image</span>
                  </div>
                </div>

                {/* Caption / Toolbar */}
                <div style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  background: 'rgba(15, 23, 42, 0.95)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <ImageIcon size={13} color="var(--accent-cyan)" />
                    <span style={{ fontWeight: '600', color: '#ffffff' }}>{block.alt || 'Image'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{
                      background: 'rgba(6, 182, 212, 0.15)',
                      color: 'var(--accent-cyan)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '9px',
                      fontWeight: '700',
                      letterSpacing: '0.04em'
                    }}>
                      {formatTag}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxImage({ src: normSrc, alt: block.alt || 'Image' });
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        color: '#94a3b8',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Maximize2 size={11} /> Zoom
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        case 'code':
          return (
            <div key={idx} style={{
              margin: '10px 0',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(5, 7, 15, 0.85)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '11px',
                color: '#94a3b8'
              }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', textTransform: 'lowercase' }}>
                  {block.lang || 'code'}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(block.code)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                >
                  Copy
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '12px',
                overflowX: 'auto',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                color: '#e2e8f0'
              }}>
                <code>{block.code}</code>
              </pre>
            </div>
          );

        case 'inline-graph':
          return (
            <div key={idx} style={{
              margin: '12px 0',
              height: '280px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              background: 'rgba(5, 7, 15, 0.85)',
              position: 'relative'
            }}>
              <CytoscapeGraph
                elements={Array.isArray(block.data) ? block.data : (block.data.elements || [])}
                layoutName="cose"
              />
            </div>
          );

        case 'geojson-map':
          return (
            <GeoJsonMapViewer
              key={idx}
              data={block.data}
              onExpand={(modalData) => setGeoJsonModalData(modalData)}
            />
          );

        case 'inline-map':
          if (block.data && (
            block.data.type === 'Polygon' || 
            block.data.type === 'MultiPolygon' || 
            block.data.coordinates || 
            block.data.geometry || 
            block.data.Polygon
          )) {
            return (
              <GeoJsonMapViewer
                key={idx}
                data={block.data}
                onExpand={(modalData) => setGeoJsonModalData(modalData)}
              />
            );
          }
          return (
            <div key={idx} style={{
              margin: '12px 0',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              background: 'rgba(5, 7, 15, 0.85)'
            }}>
              <div style={{
                padding: '8px 12px',
                background: 'rgba(6, 182, 212, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(6, 182, 212, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', fontWeight: '600' }}>
                  <MapPin size={14} color="var(--accent-cyan)" />
                  <span>{block.data.name || 'Map Location'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    [{block.data.lat?.toFixed(4)}, {block.data.lng?.toFixed(4)}]
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${block.data.lat},${block.data.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#38bdf8', textDecoration: 'none' }}
                >
                  <span>Google Maps</span>
                  <ExternalLink size={11} />
                </a>
              </div>
              <iframe
                title={`Map-${idx}`}
                width="100%"
                height="240"
                frameBorder="0"
                scrolling="no"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${block.data.lng - 0.05}%2C${block.data.lat - 0.04}%2C${block.data.lng + 0.05}%2C${block.data.lat + 0.04}&layer=mapnik&marker=${block.data.lat}%2C${block.data.lng}`}
                style={{ border: 0, display: 'block' }}
              />
            </div>
          );

        case 'heading':
          if (block.level === 1) {
            return (
              <h2 key={idx} style={{
                fontSize: '18px',
                fontWeight: '800',
                color: '#ffffff',
                margin: '16px 0 8px',
                letterSpacing: '-0.01em',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '4px'
              }}>
                {renderInlineStyles(block.text)}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3 key={idx} style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#ffffff',
                margin: '14px 0 6px',
                letterSpacing: '-0.01em'
              }}>
                {renderInlineStyles(block.text)}
              </h3>
            );
          }
          if (block.level === 3) {
            return (
              <h4 key={idx} style={{
                fontSize: '14px',
                fontWeight: '700',
                color: '#e2e8f0',
                margin: '12px 0 4px'
              }}>
                {renderInlineStyles(block.text)}
              </h4>
            );
          }
          return (
            <h5 key={idx} style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#cbd5e1',
              margin: '10px 0 4px'
            }}>
              {renderInlineStyles(block.text)}
            </h5>
          );

        case 'blockquote':
          return (
            <div key={idx} style={{
              margin: '8px 0',
              padding: '8px 14px',
              borderLeft: '3px solid var(--accent-primary)',
              background: 'rgba(99, 102, 241, 0.08)',
              borderRadius: '0 8px 8px 0',
              fontSize: '13px',
              fontStyle: 'italic',
              color: '#cbd5e1'
            }}>
              {renderInlineStyles(block.text)}
            </div>
          );

        case 'hr':
          return (
            <div key={idx} style={{
              height: '1px',
              background: 'rgba(255, 255, 255, 0.1)',
              margin: '14px 0'
            }} />
          );

        case 'ul':
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '6px 0 6px 4px' }}>
              {block.items.map((item, iIdx) => (
                <div key={iIdx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold', lineHeight: '1.5' }}>•</span>
                  <span style={{ lineHeight: '1.5' }}>{renderInlineStyles(item)}</span>
                </div>
              ))}
            </div>
          );

        case 'ol':
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '6px 0 6px 4px' }}>
              {block.items.map((item, iIdx) => (
                <div key={iIdx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{
                    color: 'var(--accent-cyan)',
                    fontWeight: '700',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    lineHeight: '1.6'
                  }}>
                    {iIdx + 1}.
                  </span>
                  <span style={{ lineHeight: '1.5' }}>{renderInlineStyles(item)}</span>
                </div>
              ))}
            </div>
          );

        case 'spacer':
          return <div key={idx} style={{ height: '8px' }} />;

        case 'paragraph':
        default:
          return (
            <p key={idx} style={{ margin: '4px 0', lineHeight: '1.6' }}>
              {renderInlineStyles(block.text)}
            </p>
          );
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: '16px' }}>
      {/* Top Header & Settings Bar (Collapsed vs Expanded) */}
      {!isHeaderOptionsOpen ? (
        <div 
          className="glass-panel" 
          style={{ 
            position: 'relative',
            zIndex: 40,
            padding: '8px 16px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            gap: '12px',
            minHeight: '44px',
            borderRadius: '12px',
            flexShrink: 0
          }}
        >
          {/* Left: Compact Logo & Title + Quick Status Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
            }}>
              <Bot size={16} color="#ffffff" />
            </div>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>
              AI Knowledge Chat
            </span>

            {/* Quick Status Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Sources pill */}
              <span 
                onClick={toggleHeaderOptions}
                title="Klik untuk mengubah sumber pengetahuan"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: selectedSources.length > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${selectedSources.length > 0 ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: selectedSources.length > 0 ? '#38bdf8' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Database size={11} />
                {selectedSources.length === 0 ? 'All Sources' : `${selectedSources.length} Sources`}
              </span>

              {/* Anti-Halu pill */}
              <span 
                onClick={() => {
                  const next = !strictMode;
                  setStrictMode(next);
                  setTemperature(next ? 0.0 : 0.3);
                }}
                title="Klik untuk toggle mode Anti-Halusinasi"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: strictMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  border: `1px solid ${strictMode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  color: strictMode ? '#34d399' : '#fbbf24',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <ShieldCheck size={11} />
                {strictMode ? 'Anti-Halu (0.0)' : `Suhu ${temperature}`}
              </span>

              {/* Active Model pill */}
              <span 
                onClick={toggleHeaderOptions}
                title="Klik untuk memilih model / provider AI"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: selectedModelName ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${selectedModelName ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: selectedModelName ? '#a5b4fc' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  maxWidth: '160px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                <Cpu size={11} />
                {selectedModelName ? selectedModelName : 'Model: Default'}
              </span>

              {/* Active Tools pill */}
              {activeTools.length > 0 && (
                <span 
                  onClick={() => setIsRightSidebarOpen(true)}
                  title="Lihat daftar dynamic tools di sidebar kanan"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(6, 182, 212, 0.12)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    color: 'var(--accent-cyan)',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Zap size={11} />
                  {activeTools.length} Tools
                </span>
              )}

              {/* Active Personality pill */}
              <a 
                href="/personality"
                title="Klik untuk melihat dan mengubah kepribadian sistem MCP"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '11px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                <Sparkles size={11} />
                {activePersonality?.name ? activePersonality.name.replace(/\s*\(Default\)/i, '') : 'Persona: KPK'}
              </a>
            </div>
          </div>

          {/* Right: Quick actions & Expand Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Chat History Button */}
            <button
              type="button"
              onClick={() => setIsHistoryDrawerOpen(true)}
              title="Buka Riwayat Percakapan (OpenAI Standard Sessions)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#c7d2fe',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.12)';
                e.currentTarget.style.color = '#c7d2fe';
              }}
            >
              <History size={13} />
              <span>History</span>
              {sessions.length > 0 && (
                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.3)', color: '#ffffff' }}>
                  {sessions.length}
                </span>
              )}
            </button>

            {/* Explore Tools Button */}
            <button
              type="button"
              onClick={() => setIsExploreToolsModalOpen(true)}
              title="Katalog Lengkap Tools & Parameter Schema"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                background: 'rgba(6, 182, 212, 0.12)',
                color: 'var(--accent-cyan)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.25)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.12)';
                e.currentTarget.style.color = 'var(--accent-cyan)';
              }}
            >
              <Zap size={13} />
              <span>Explore Tools</span>
            </button>

            {/* New Topic / Fresh Context Button */}
            <button
              type="button"
              onClick={handleNewTopic}
              title="Mulai Topik Baru (Segarkan Working Memory & Hindari Context Rot tanpa menghapus pesan di layar)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#34d399',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
                e.currentTarget.style.color = '#34d399';
              }}
            >
              <RotateCcw size={13} />
              <span>Topik Baru</span>
            </button>

            {/* Reset button */}
            <button
              onClick={handleClear}
              title="Reset Conversation"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#fda4af'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Trash2 size={12} />
              <span>Reset</span>
            </button>

            {/* Toggle Right Sidebar */}
            <button
              type="button"
              onClick={() => setIsRightSidebarOpen(prev => !prev)}
              title={isRightSidebarOpen ? "Sembunyikan Sidebar Tools & Saran" : "Buka Sidebar Tools & Saran"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: isRightSidebarOpen ? '600' : '400',
                border: `1px solid ${isRightSidebarOpen ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-color)'}`,
                background: isRightSidebarOpen ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.8)',
                color: isRightSidebarOpen ? '#a5b4fc' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={12} color={isRightSidebarOpen ? 'var(--accent-primary)' : 'var(--text-muted)'} />
              <span>Tools</span>
              {isRightSidebarOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>

            {/* Expand Full Options Button */}
            <button
              type="button"
              onClick={toggleHeaderOptions}
              title="Buka Opsi Chat & Filter Lengkap"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                e.currentTarget.style.color = '#a5b4fc';
              }}
            >
              <SlidersHorizontal size={13} />
              <span>Opsi Chat</span>
              <ChevronDown size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div 
          className="glass-panel" 
          style={{ 
            position: 'relative',
            zIndex: 50,
            padding: '16px 24px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            flexWrap: 'wrap', 
            gap: '16px',
            flexShrink: 0
          }}
        >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)'
          }}>
            <Bot size={24} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.01em' }}>
              AI Knowledge Chat
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Query ChromaDB vectors & Neo4j graph entities with LLM RAG
              </span>
              <a 
                href="/personality"
                title="Klik untuk melihat dan mengubah kepribadian sistem MCP"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '11px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={11} />
                {activePersonality?.name ? activePersonality.name.replace(/\s*\(Default\)/i, '') : 'Persona: KPK'}
              </a>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Multi-Select Knowledge Source Filter */}
          <div ref={sourceDropdownRef} style={{ position: 'relative', zIndex: 60 }}>
            <button
              type="button"
              onClick={() => setIsSourceDropdownOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: selectedSources.length > 0 ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.8)',
                border: `1px solid ${selectedSources.length > 0 ? '#38bdf8' : 'var(--border-color)'}`,
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: selectedSources.length > 0 ? '0 0 12px rgba(56, 189, 248, 0.2)' : 'none'
              }}
            >
              <Database size={15} color={selectedSources.length > 0 ? '#38bdf8' : 'var(--text-muted)'} />
              <span style={{ fontWeight: selectedSources.length > 0 ? '600' : '400', maxWidth: '175px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedSources.length === 0 && 'All Knowledge Sources'}
                {selectedSources.length === 1 && (sourcesList.find(s => s.id === selectedSources[0])?.name || '1 Source Selected')}
                {selectedSources.length > 1 && `${selectedSources.length} Sources Selected`}
              </span>
              {selectedSources.length > 0 ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSelectedSources();
                  }}
                  title="Clear source filter (query all)"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    fontSize: '10px',
                    marginLeft: '2px'
                  }}
                >
                  <X size={10} />
                </span>
              ) : (
                <span style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.08)', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                  {sourcesList.length}
                </span>
              )}
              <ChevronDown
                size={14}
                color="var(--text-muted)"
                style={{
                  transform: isSourceDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}
              />
            </button>

            {/* Dropdown Popover */}
            {isSourceDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  zIndex: 9999,
                  width: '330px',
                  background: '#0b1329',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)',
                  overflow: 'hidden'
                }}
              >
                {/* Search Bar & Quick Actions Header */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b', background: 'rgba(15, 23, 42, 0.6)' }}>
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
                    <input
                      type="text"
                      placeholder="Search knowledge sources..."
                      value={sourceSearchQuery}
                      onChange={(e) => setSourceSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 28px 6px 30px',
                        fontSize: '12px',
                        color: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {sourceSearchQuery && (
                      <X
                        size={12}
                        color="#94a3b8"
                        onClick={() => setSourceSearchQuery('')}
                        style={{ position: 'absolute', right: '10px', top: '9px', cursor: 'pointer' }}
                      />
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#94a3b8' }}>
                      {selectedSources.length === 0 ? 'All sources active' : `${selectedSources.length} of ${sourcesList.length} selected`}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={selectAllSources}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          padding: 0
                        }}
                      >
                        Select All
                      </button>
                      <span style={{ color: '#475569' }}>|</span>
                      <button
                        type="button"
                        onClick={clearSelectedSources}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          padding: 0
                        }}
                      >
                        Clear (All)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sources Scrollable List */}
                <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '6px' }}>
                  {/* Option: "All Knowledge Sources" */}
                  <div
                    onClick={clearSelectedSources}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: selectedSources.length === 0 ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: selectedSources.length === 0 ? '#38bdf8' : '#e2e8f0',
                      fontSize: '12px',
                      marginBottom: '4px',
                      border: `1px solid ${selectedSources.length === 0 ? 'rgba(56, 189, 248, 0.3)' : 'transparent'}`
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: selectedSources.length === 0 ? '1px solid #38bdf8' : '1px solid #475569',
                        background: selectedSources.length === 0 ? '#38bdf8' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {selectedSources.length === 0 && <Check size={11} color="#0f172a" strokeWidth={3} />}
                    </div>
                    <span style={{ fontWeight: selectedSources.length === 0 ? '600' : '400', flex: 1 }}>
                      All Knowledge Sources (Default)
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>Universal RAG</span>
                  </div>

                  {filteredSources.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                      No matching knowledge sources found
                    </div>
                  ) : (
                    filteredSources.map(s => {
                      const isSelected = selectedSources.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => toggleSourceSelection(s.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                            color: isSelected ? '#ffffff' : '#cbd5e1',
                            fontSize: '12px',
                            transition: 'background 0.15s',
                            border: `1px solid ${isSelected ? 'rgba(99, 102, 241, 0.35)' : 'transparent'}`,
                            marginBottom: '2px'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '4px',
                              border: isSelected ? '1px solid #6366f1' : '1px solid #475569',
                              background: isSelected ? '#6366f1' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {isSelected && <Check size={11} color="#ffffff" strokeWidth={3} />}
                          </div>

                          <span
                            style={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: isSelected ? '600' : '400'
                            }}
                            title={s.name}
                          >
                            {s.name}
                          </span>

                          {/* Source type badge */}
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              background:
                                s.source_type === 'mcp' || s.source_type === 'mcp_server'
                                  ? 'rgba(168, 85, 247, 0.15)'
                                  : s.source_type === 'database'
                                  ? 'rgba(56, 189, 248, 0.15)'
                                  : s.source_type === 'api'
                                  ? 'rgba(167, 139, 250, 0.15)'
                                  : s.source_type === 'document'
                                  ? 'rgba(52, 211, 153, 0.15)'
                                  : 'rgba(251, 191, 36, 0.15)',
                              color:
                                s.source_type === 'mcp' || s.source_type === 'mcp_server'
                                  ? '#c084fc'
                                  : s.source_type === 'database'
                                  ? '#38bdf8'
                                  : s.source_type === 'api'
                                  ? '#a78bfa'
                                  : s.source_type === 'document'
                                  ? '#34d399'
                                  : '#fbbf24'
                            }}
                          >
                            {s.source_type}
                          </span>

                          {/* Validity Badge */}
                          {s.validity_tier && (
                            <ValidityBadge tier={s.validity_tier} score={s.validity_score} />
                          )}

                          {/* Tool badge */}
                          {s.is_tool && (
                            <span
                              style={{
                                fontSize: '9px',
                                padding: '1px 4px',
                                borderRadius: '4px',
                                fontWeight: '700',
                                background: 'rgba(249, 115, 22, 0.2)',
                                color: '#f97316'
                              }}
                              title="Configured as Dynamic AI Tool"
                            >
                              ⚡
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Dropdown Footer */}
                <div
                  style={{
                    padding: '8px 12px',
                    borderTop: '1px solid #1e293b',
                    background: 'rgba(15, 23, 42, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {selectedSources.length === 0
                      ? 'Searching all sources'
                      : `${selectedSources.length} selected for query`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSourceDropdownOpen(false)}
                    style={{
                      background: '#6366f1',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: '600',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Model LLM Selector (Cloud & Local) — filterable custom dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
            <Cpu size={14} color="var(--accent-primary)" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Model LLM:</span>

            {/* Trigger button */}
            <button
              onClick={() => { setModelDropdownOpen(v => !v); setModelSearchQuery(''); }}
              title="Pilih model LLM untuk sesi chat ini (Cloud / Local)"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: selectedModelName ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.8)',
                border: `1px solid ${selectedModelName ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                color: '#ffffff',
                padding: '7px 10px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                maxWidth: '260px',
                minWidth: '180px',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedModelName ? selectedModelName : '⚙️ Default (Sesuai Assignment)'}
              </span>
              <span style={{ fontSize: '10px', opacity: 0.6 }}>{modelDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {/* Dropdown panel */}
            {modelDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 9999,
                  background: 'rgba(15, 23, 42, 0.98)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  minWidth: '300px',
                  maxWidth: '420px',
                  marginTop: '4px',
                  overflow: 'hidden'
                }}
              >
                {/* Search input */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="🔍 Cari model..."
                    value={modelSearchQuery}
                    onChange={e => setModelSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '6px 10px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Options list */}
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {/* Default option */}
                  {!modelSearchQuery && (
                    <div
                      onClick={() => { setSelectedBackendId(null); setSelectedModelName(''); setModelDropdownOpen(false); }}
                      style={{
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: !selectedModelName ? 'var(--accent-primary)' : '#e2e8f0',
                        background: !selectedModelName ? 'rgba(99,102,241,0.1)' : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.05)'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                      onMouseLeave={e => e.currentTarget.style.background = !selectedModelName ? 'rgba(99,102,241,0.1)' : 'transparent'}
                    >
                      ⚙️ Default (Sesuai Assignment)
                    </div>
                  )}

                  {/* Filtered backend groups */}
                  {activeBackends.map(b => {
                    const q = modelSearchQuery.toLowerCase();
                    const filteredModels = (b.models || []).filter(m =>
                      !q || m.toLowerCase().includes(q) || b.backend_name.toLowerCase().includes(q)
                    );
                    if (filteredModels.length === 0) return null;
                    return (
                      <div key={b.backend_id}>
                        <div style={{
                          padding: '5px 14px',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          background: 'rgba(255,255,255,0.03)',
                          borderTop: '1px solid rgba(255,255,255,0.06)'
                        }}>
                          {b.backend_name} ({b.backend_type.toUpperCase()})
                        </div>
                        {filteredModels.map(m => {
                          const val = `${b.backend_id}:${m}`;
                          const isSelected = selectedBackendId === b.backend_id && selectedModelName === m;
                          return (
                            <div
                              key={val}
                              onClick={() => {
                                setSelectedBackendId(b.backend_id);
                                setSelectedModelName(m);
                                setModelDropdownOpen(false);
                                setModelSearchQuery('');
                              }}
                              style={{
                                padding: '7px 14px 7px 22px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: isSelected ? 'var(--accent-primary)' : '#e2e8f0',
                                background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                                display: 'flex', alignItems: 'center', gap: '6px'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(99,102,241,0.12)' : 'transparent'}
                            >
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span>
                              {b.is_default && m === b.default_model && <span style={{ fontSize: '11px', color: '#fbbf24' }}>★</span>}
                              {isSelected && <span style={{ fontSize: '11px' }}>✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* No results */}
                  {modelSearchQuery && activeBackends.every(b =>
                    (b.models || []).filter(m =>
                      m.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                      b.backend_name.toLowerCase().includes(modelSearchQuery.toLowerCase())
                    ).length === 0
                  ) && (
                    <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                      Tidak ada model yang cocok
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Backdrop to close dropdown */}
            {modelDropdownOpen && (
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                onClick={() => setModelDropdownOpen(false)}
              />
            )}
          </div>

          {/* Top-K Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Top Chunks:</span>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-color)',
                color: '#ffffff',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={3}>3 chunks</option>
              <option value={5}>5 chunks</option>
              <option value={10}>10 chunks</option>
            </select>
          </div>

          {/* Include Graph Toggle */}
          <button
            onClick={() => setIncludeGraph(!includeGraph)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              border: `1px solid ${includeGraph ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              background: includeGraph ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.6)',
              color: includeGraph ? '#a5b4fc' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Share2 size={14} />
            Graph Context: {includeGraph ? 'ON' : 'OFF'}
          </button>

          {/* Anti-Hallucination / Strict Grounding Mode Toggle */}
          <button
            onClick={() => {
              const next = !strictMode;
              setStrictMode(next);
              setTemperature(next ? 0.0 : 0.3);
            }}
            title={strictMode 
              ? "Mode Anti-Halusinasi AKTIF (Suhu 0.0): AI dilarang keras mengarang data dan wajib mengikuti dokumen/basis data resmi." 
              : "Mode Fleksibel (Suhu 0.3): AI dapat menjawab lebih luwes namun berisiko halusinasi."}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: `1px solid ${strictMode ? 'rgba(16, 185, 129, 0.45)' : 'rgba(245, 158, 11, 0.4)'}`,
              background: strictMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.12)',
              color: strictMode ? '#34d399' : '#fbbf24',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: strictMode ? '0 0 12px rgba(16, 185, 129, 0.15)' : 'none'
            }}
          >
            <ShieldCheck size={15} color={strictMode ? '#10b981' : '#f59e0b'} />
            <span>{strictMode ? 'Anti-Halu: ON' : 'Anti-Halu: OFF'}</span>
          </button>

          {/* Factual Temperature Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Suhu:</span>
            <select
              value={temperature}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setTemperature(val);
                setStrictMode(val === 0.0);
              }}
              title="Suhu AI: Semakin rendah (0.0), semakin ketat dan tidak mengarang data. Suhu tinggi (0.5+) lebih kreatif/variatif."
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-color)',
                color: temperature === 0.0 ? '#34d399' : '#ffffff',
                padding: '8px 8px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '500',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={0.0}>0.0 (Presisi / Anti-Halu)</option>
              <option value={0.1}>0.1 (Sangat Ketat)</option>
              <option value={0.3}>0.3 (Seimbang)</option>
              <option value={0.7}>0.7 (Kreatif)</option>
            </select>
          </div>

          {/* Reasoning Effort Selector (OpenAI Standard o1/o3/DeepSeek) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <BrainCircuit size={13} color="#fbbf24" />
              Reasoning:
            </span>
            <select
              value={reasoningEffort}
              onChange={(e) => handleReasoningEffortChange(e.target.value)}
              title="OpenAI Reasoning Effort parameter ('low', 'medium', 'high', 'auto')"
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fcd34d',
                padding: '8px 8px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="auto">Auto (Default)</option>
              <option value="low">Low (Cepat / Hemat)</option>
              <option value="medium">Medium (Standar)</option>
              <option value="high">High (Mendalam / Riset)</option>
            </select>
          </div>

          {/* Explore Tools Catalog Button */}
          <button
            type="button"
            onClick={() => setIsExploreToolsModalOpen(true)}
            title="Buka katalog interaktif tools dan schema parameter"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              background: 'rgba(6, 182, 212, 0.12)',
              color: 'var(--accent-cyan)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Zap size={14} />
            <span>Explore Tools</span>
            {activeTools.length > 0 && (
              <span style={{
                background: 'rgba(6, 182, 212, 0.25)',
                color: '#ffffff',
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '10px'
              }}>
                {activeTools.length}
              </span>
            )}
          </button>

          {/* Chat History Button */}
          <button
            type="button"
            onClick={() => setIsHistoryDrawerOpen(true)}
            title="Buka Riwayat Percakapan (OpenAI Standard Sessions)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              background: 'rgba(99, 102, 241, 0.12)',
              color: '#c7d2fe',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <History size={14} />
            <span>History</span>
            {sessions.length > 0 && (
              <span style={{
                background: 'rgba(99, 102, 241, 0.3)',
                color: '#ffffff',
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '10px'
              }}>
                {sessions.length}
              </span>
            )}
          </button>

          {/* New Topic / Fresh Context Button */}
          <button
            type="button"
            onClick={handleNewTopic}
            title="Mulai Topik Baru (Segarkan Working Memory & Hindari Context Rot tanpa menghapus pesan di layar)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#34d399',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
              e.currentTarget.style.color = '#34d399';
            }}
          >
            <RotateCcw size={14} />
            <span>Topik Baru</span>
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClear}
            title="Reset Conversation"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              border: '1px solid var(--border-color)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fda4af'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <Trash2 size={14} />
            Reset
          </button>

          {/* Toggle Right Sidebar Button */}
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(prev => !prev)}
            title={isRightSidebarOpen ? "Sembunyikan Sidebar Tools & Saran" : "Buka Sidebar Tools & Saran"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: isRightSidebarOpen ? '600' : '400',
              border: `1px solid ${isRightSidebarOpen ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-color)'}`,
              background: isRightSidebarOpen ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.8)',
              color: isRightSidebarOpen ? '#a5b4fc' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Sparkles size={14} color={isRightSidebarOpen ? 'var(--accent-primary)' : 'var(--text-muted)'} />
            <span>Tools & Saran</span>
            {activeTools.length > 0 && (
              <span style={{
                background: 'rgba(6, 182, 212, 0.2)',
                color: 'var(--accent-cyan)',
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: '700'
              }}>
                {activeTools.length}
              </span>
            )}
            {isRightSidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Collapse Header Options Button */}
          <button
            type="button"
            onClick={toggleHeaderOptions}
            title="Sembunyikan Opsi Chat (Perbesar Layar Respon)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              border: '1px solid var(--border-color)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
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
            <ChevronUp size={15} />
            <span>Sembunyikan</span>
          </button>
        </div>

        {/* Active Filter Chips Strip */}
        {selectedSources.length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              paddingTop: '10px',
              marginTop: '4px',
              borderTop: '1px solid rgba(255, 255, 255, 0.07)'
            }}
          >
            <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
              <Filter size={12} color="#38bdf8" /> Querying {selectedSources.length} selected source{selectedSources.length > 1 ? 's' : ''}:
            </span>
            {selectedSources.map(id => {
              const src = sourcesList.find(s => s.id === id);
              if (!src) return null;
              return (
                <span
                  key={id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 9px',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#e0f2fe',
                    fontWeight: 500
                  }}
                >
                  <Database size={10} color="#38bdf8" />
                  <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {src.name}
                  </span>
                  <X
                    size={11}
                    color="#94a3b8"
                    style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                    onClick={() => toggleSourceSelection(id)}
                    title="Remove this source from selection"
                  />
                </span>
              );
            })}
            <button
              type="button"
              onClick={clearSelectedSources}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f87171',
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline',
                marginLeft: '4px'
              }}
            >
              Reset to All Sources
            </button>
          </div>
        )}
      </div>
      )}

      {/* Content Area with Main Chat & Collapsible Right Sidebar */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '16px',
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Left/Center Column: Chat History + Input Box */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          gap: '12px',
          height: '100%'
        }}>
          {/* Main Chat Conversation Container */}
          <div 
            className="glass-panel" 
            style={{ 
          position: 'relative',
          zIndex: 1,
          flex: 1, 
          overflowY: 'auto', 
          padding: '24px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px' 
        }}
      >
        {messages.map((msg) => {
          if (msg.role === 'divider') {
            return (
              <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '14px 0', width: '100%' }}>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(16, 185, 129, 0.4), rgba(16, 185, 129, 0.2))' }} />
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '5px 16px',
                  borderRadius: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.15)'
                }}>
                  <ShieldCheck size={14} color="#10b981" />
                  {msg.content}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(16, 185, 129, 0.4), rgba(16, 185, 129, 0.2))' }} />
              </div>
            );
          }

          const isUser = msg.role === 'user';
          const isAssistant = msg.role === 'assistant';

          return (
            <div 
              key={msg.id} 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                width: '100%'
              }}
            >
              <div style={{
                display: 'flex',
                gap: '12px',
                maxWidth: isUser ? '80%' : '88%',
                alignItems: 'flex-start'
              }}>
                {/* Avatar */}
                {!isUser && (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)'
                  }}>
                    <Bot size={18} color="#ffffff" />
                  </div>
                )}

                {/* Message Bubble */}
                <div style={{
                  background: isUser 
                    ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' 
                    : 'rgba(15, 23, 42, 0.75)',
                  border: isUser ? 'none' : '1px solid var(--border-color)',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '16px 20px',
                  color: isUser ? '#ffffff' : 'var(--text-primary)',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  {/* Attached User Image */}
                  {isUser && msg.image && (
                    <div style={{ marginBottom: '10px' }}>
                      <img
                        src={msg.image}
                        alt="User Attachment"
                        onClick={() => setLightboxImage({ src: msg.image, alt: 'User Attached Image' })}
                        style={{
                          maxWidth: '280px',
                          maxHeight: '220px',
                          borderRadius: '10px',
                          objectFit: 'cover',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                          display: 'block',
                          cursor: 'pointer'
                        }}
                        title="Click to view full image"
                      />
                    </div>
                  )}

                  {/* Attached User Document */}
                  {isUser && msg.document && (
                    <div style={{
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      maxWidth: '380px'
                    }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#a7f3d0',
                        flexShrink: 0
                      }}>
                        {msg.document.file_type === 'excel' || msg.document.file_type === 'csv' ? (
                          <FileSpreadsheet size={18} />
                        ) : (
                          <FileText size={18} />
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📎 {msg.document.file_name}
                        </span>
                        <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)' }}>
                          {msg.document.summary || `${msg.document.file_type?.toUpperCase()} Document`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Matched Orchestration Flow Banner (Assistant only) */}
                  {isAssistant && msg.matched_flow && (
                    <div style={{
                      marginBottom: '12px',
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Workflow size={15} color="#818cf8" />
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#ffffff' }}>
                          Alur Terpandu: {msg.matched_flow.name}
                        </span>
                        <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.25)', color: '#c7d2fe', padding: '1px 6px', borderRadius: '10px', fontWeight: '600' }}>
                          {msg.matched_flow.intent_category || 'Flow Memory'}
                        </span>
                      </div>
                      {msg.matched_flow.validity_priority_rule && (
                        <span style={{ fontSize: '11px', color: '#38bdf8' }}>
                          ⚖️ Prioritas: {msg.matched_flow.validity_priority_rule}
                        </span>
                      )}
                    </div>
                  )}

                  {/* OpenAI Standard Reasoning Card (Collapsible, stats, copy) */}
                  {isAssistant && msg.thinking && (
                    <ReasoningCard
                      thinking={msg.thinking}
                      isLoading={false}
                      duration={msg.metrics?.total_time ? Number(msg.metrics.total_time).toFixed(1) : null}
                      isExpanded={Boolean(expandedThinking[msg.id])}
                      onToggle={() => toggleThinking(msg.id)}
                    />
                  )}

                  {renderFormattedContent(msg.content)}

                  {/* Starter recommendations for new conversation (Welcome state) */}
                  {msg.id === 'welcome-msg' && messages.length === 1 && (
                    <RecommendationChips
                      variant="starter"
                      disabled={loading}
                      onSelectPrompt={(p) => handleSend(p)}
                    />
                  )}

                {/* Like / Dislike Feedback Row (assistant messages only, not welcome) */}
                {isAssistant && msg.id !== 'welcome-msg' && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Apakah jawaban ini membantu?
                      </span>

                      {/* Like button */}
                      <button
                        id={`feedback-like-${msg.id}`}
                        onClick={() => { if (feedbackState[msg.id] !== 'like') submitFeedback(msg, 'like'); }}
                        disabled={pendingFeedback[msg.id]}
                        title="Jawaban ini membantu"
                        style={{
                          background: feedbackState[msg.id] === 'like' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: feedbackState[msg.id] === 'like' ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          color: feedbackState[msg.id] === 'like' ? '#34d399' : 'var(--text-muted)',
                          cursor: feedbackState[msg.id] === 'like' ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                          fontWeight: feedbackState[msg.id] === 'like' ? '700' : '400'
                        }}
                        onMouseEnter={(e) => { if (feedbackState[msg.id] !== 'like') { e.currentTarget.style.color = '#34d399'; e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)'; } }}
                        onMouseLeave={(e) => { if (feedbackState[msg.id] !== 'like') { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; } }}
                      >
                        <ThumbsUp size={13} />
                        {feedbackState[msg.id] === 'like' ? 'Liked! ✓' : 'Like'}
                      </button>

                      {/* Dislike button */}
                      <button
                        id={`feedback-dislike-${msg.id}`}
                        onClick={() => { if (feedbackState[msg.id] !== 'dislike') setFeedbackState(prev => ({ ...prev, [msg.id]: 'dislike_pending' })); }}
                        disabled={pendingFeedback[msg.id]}
                        title="Jawaban perlu diperbaiki"
                        style={{
                          background: feedbackState[msg.id] === 'dislike' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          border: feedbackState[msg.id] === 'dislike' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          color: feedbackState[msg.id] === 'dislike' ? '#f87171' : 'var(--text-muted)',
                          cursor: feedbackState[msg.id] === 'dislike' ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                          fontWeight: feedbackState[msg.id] === 'dislike' ? '700' : '400'
                        }}
                        onMouseEnter={(e) => { if (feedbackState[msg.id] !== 'dislike') { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)'; } }}
                        onMouseLeave={(e) => { if (feedbackState[msg.id] !== 'dislike') { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; } }}
                      >
                        <ThumbsDown size={13} />
                        {feedbackState[msg.id] === 'dislike' ? 'Tercatat' : 'Dislike'}
                      </button>

                      {/* Salin Respon button in feedback bar */}
                      <button
                        type="button"
                        id={`copy-resp-bar-${msg.id}`}
                        onClick={() => handleCopyResponse(msg.id, msg.content)}
                        title="Salin isi respon AI ke clipboard"
                        style={{
                          background: copiedResponseId === msg.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: copiedResponseId === msg.id ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          color: copiedResponseId === msg.id ? '#34d399' : 'var(--text-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          fontWeight: copiedResponseId === msg.id ? '700' : '400'
                        }}
                        onMouseEnter={(e) => { if (copiedResponseId !== msg.id) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'; } }}
                        onMouseLeave={(e) => { if (copiedResponseId !== msg.id) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; } }}
                      >
                        {copiedResponseId === msg.id ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                        <span>{copiedResponseId === msg.id ? 'Tersalin! ✓' : 'Salin'}</span>
                      </button>

                      {feedbackState[msg.id] === 'like' && (
                        <span style={{ fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={12} /> Terima kasih! Response ini akan dipelajari AI.
                        </span>
                      )}
                    </div>

                    {/* Dislike note input */}
                    {feedbackState[msg.id] === 'dislike_pending' && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px 12px',
                        background: 'rgba(239, 68, 68, 0.06)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '10px'
                      }}>
                        <label style={{ fontSize: '11px', color: '#f87171', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <MessageSquare size={12} /> Apa yang kurang tepat? (opsional)
                        </label>
                        <textarea
                          placeholder="Contoh: jawaban salah, tidak lengkap, bahasa tidak sesuai..."
                          value={dislikeNotes[msg.id] || ''}
                          onChange={(e) => setDislikeNotes(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          rows={2}
                          style={{
                            width: '100%',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            color: '#e2e8f0',
                            fontSize: '12px',
                            fontFamily: 'inherit',
                            resize: 'none',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => submitFeedback(msg, 'dislike', dislikeNotes[msg.id] || '')}
                            disabled={pendingFeedback[msg.id]}
                            style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              borderRadius: '6px',
                              padding: '4px 12px',
                              fontSize: '12px',
                              color: '#f87171',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            {pendingFeedback[msg.id] ? 'Mengirim...' : 'Kirim Feedback'}
                          </button>
                          <button
                            onClick={() => setFeedbackState(prev => ({ ...prev, [msg.id]: null }))}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '6px',
                              padding: '4px 12px',
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                              cursor: 'pointer'
                            }}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Contextual Recommendation Chips */}
                    <RecommendationChips
                      variant="contextual"
                      suggestions={generateContextualRecommendations(msg)}
                      disabled={loading}
                      onSelectPrompt={(p) => handleSend(p)}
                    />
                  </div>
                )}

                  {/* Biometric Face Recognition Result Card (Assistant only) */}
                  {isAssistant && msg.face_recognition && (() => {
                    const isFaceOpen = Boolean(expandedFace[msg.id]);
                    return (
                      <div style={{
                        marginTop: '14px',
                        marginBottom: '6px',
                        background: msg.face_recognition.matched 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)'
                          : msg.face_recognition.face_detected 
                            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(239, 68, 68, 0.08) 100%)'
                            : 'rgba(239, 68, 68, 0.08)',
                        border: `1px solid ${
                          msg.face_recognition.matched 
                            ? 'rgba(16, 185, 129, 0.35)' 
                            : msg.face_recognition.face_detected 
                              ? 'rgba(245, 158, 11, 0.35)' 
                              : 'rgba(239, 68, 68, 0.3)'
                        }`,
                        borderRadius: '12px',
                        padding: '10px 14px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
                      }}>
                        {/* Collapsible Biometric Header */}
                        <div 
                          onClick={() => toggleFace(msg.id)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: msg.face_recognition.matched ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {msg.face_recognition.matched ? (
                                <UserCheck size={16} color="var(--accent-emerald)" />
                              ) : msg.face_recognition.face_detected ? (
                                <ScanFace size={16} color="#f59e0b" />
                              ) : (
                                <UserX size={16} color="#f87171" />
                              )}
                            </div>
                            <div>
                              <div style={{
                                fontWeight: '700',
                                fontSize: '13px',
                                color: msg.face_recognition.matched ? '#34d399' : msg.face_recognition.face_detected ? '#fbbf24' : '#f87171'
                              }}>
                                {msg.face_recognition.matched
                                  ? `Biometric Match: ${msg.face_recognition.person_name}`
                                  : msg.face_recognition.face_detected
                                    ? 'Biometric Scan: Unrecognized Face Detected'
                                    : 'Biometric Scan: No Face Detected'}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {msg.face_recognition.matched && (
                              <span style={{
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: 'var(--accent-emerald)',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '700',
                                border: '1px solid rgba(16, 185, 129, 0.4)'
                              }}>
                                {msg.face_recognition.confidence_percent}% Match
                              </span>
                            )}
                            <span style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '12px' }}>
                              {isFaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Body Details */}
                        {isFaceOpen && (
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}>
                            {/* Visual Thumbnails Comparison */}
                            {(msg.face_recognition.input_face_thumbnail || msg.face_recognition.matched_face_thumbnail) && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '14px',
                                marginBottom: '6px',
                                padding: '10px 14px',
                                background: 'rgba(5, 7, 12, 0.55)',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                flexWrap: 'wrap'
                              }}>
                                {msg.face_recognition.input_face_thumbnail && (
                                  <div 
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                    onClick={() => setLightboxImage({ src: msg.face_recognition.input_face_thumbnail, alt: 'Input Face Crop' })}
                                    title="Click to view input crop"
                                  >
                                    <img
                                      src={msg.face_recognition.input_face_thumbnail}
                                      alt="Input Face"
                                      style={{
                                        width: '60px',
                                        height: '60px',
                                        borderRadius: '8px',
                                        objectFit: 'cover',
                                        border: '2px solid rgba(56, 189, 248, 0.6)'
                                      }}
                                    />
                                    <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '600' }}>Input Crop</span>
                                  </div>
                                )}

                                {msg.face_recognition.matched && msg.face_recognition.matched_face_thumbnail && (
                                  <>
                                    <div style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      color: 'var(--accent-emerald)',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      padding: '0 4px'
                                    }}>
                                      <span>➔</span>
                                      <span style={{ fontSize: '9px' }}>MATCH</span>
                                    </div>

                                    <div 
                                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                      onClick={() => setLightboxImage({ src: msg.face_recognition.matched_face_thumbnail, alt: `Enrolled Face: ${msg.face_recognition.person_name}` })}
                                      title="Click to view enrolled face"
                                    >
                                      <img
                                        src={msg.face_recognition.matched_face_thumbnail}
                                        alt="Enrolled Face"
                                        style={{
                                          width: '60px',
                                          height: '60px',
                                          borderRadius: '8px',
                                          objectFit: 'cover',
                                          border: '2px solid rgba(52, 211, 153, 0.6)'
                                        }}
                                      />
                                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: '600' }}>Enrolled</span>
                                    </div>
                                  </>
                                )}

                                {/* Profile details */}
                                {msg.face_recognition.matched && (
                                  <div style={{ marginLeft: '10px', flex: 1, minWidth: '160px', fontSize: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', color: 'var(--text-secondary)' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Person ID:</span>
                                      <strong style={{ color: '#ffffff' }}>{msg.face_recognition.person_id || 'N/A'}</strong>

                                      <span style={{ color: 'var(--text-muted)' }}>Department:</span>
                                      <span style={{ color: '#e2e8f0' }}>{msg.face_recognition.department || 'N/A'}</span>

                                      <span style={{ color: 'var(--text-muted)' }}>Face ID:</span>
                                      <code style={{ fontSize: '10px', color: '#93c5fd' }}>{msg.face_recognition.face_id}</code>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Retrieved Sources Accordion (Assistant only) */}
                  {isAssistant && msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                      <button
                        onClick={() => toggleSources(msg.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        {expandedSources[msg.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Layers size={14} />
                        Retrieved Knowledge Chunks ({msg.sources.length})
                      </button>

                      {expandedSources[msg.id] && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {msg.sources.map((src, sIdx) => {
                            const matchPercent = src.score ? Math.round(src.score * 100) : null;
                            return (
                              <div
                                key={sIdx}
                                style={{
                                  background: 'rgba(5, 7, 12, 0.6)',
                                  border: '1px solid rgba(255, 255, 255, 0.05)',
                                  borderRadius: '8px',
                                  padding: '10px 14px',
                                  fontSize: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: '600', color: '#93c5fd' }}>
                                      {src.metadata?.source_name || 'Indexed Record'}
                                    </span>
                                    {(src.validity_tier || src.metadata?.validity_tier) && (
                                      <ValidityBadge
                                        tier={src.validity_tier || src.metadata?.validity_tier}
                                        score={src.validity_score || src.metadata?.validity_score}
                                      />
                                    )}
                                  </div>
                                  {matchPercent !== null && (
                                    <span style={{
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      color: 'var(--accent-emerald)',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}>
                                      Score: {src.score}
                                    </span>
                                  )}
                                </div>
                                {(src.validity_notes || src.metadata?.validity_notes) && (
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontStyle: 'italic' }}>
                                    ℹ️ {src.validity_notes || src.metadata?.validity_notes}
                                  </div>
                                )}
                                <div style={{ 
                                  color: 'var(--text-secondary)', 
                                  fontFamily: 'JetBrains Mono, monospace', 
                                  fontSize: '11px',
                                  maxHeight: '100px',
                                  overflowY: 'auto',
                                  whiteSpace: 'pre-wrap'
                                }}>
                                  {src.content}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Location / Spatial GeoJSON Polygon Map Card (Assistant only) */}
                  {isAssistant && (() => {
                    const messagePolygons = (msg.tools_executed || []).flatMap(t => extractPolygonsFromData(t.data));
                    const hasPolygons = messagePolygons.length > 0;
                    const loc = !hasPolygons ? detectLocation(msg.content) : null;
                    if (!hasPolygons && !loc) return null;

                    const isMapOpen = expandedMap[msg.id] !== undefined 
                      ? Boolean(expandedMap[msg.id]) 
                      : hasPolygons; // Polygons expanded by default

                    return (
                      <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMapOpen ? '8px' : '0' }}>
                          <button
                            onClick={() => toggleMap(msg.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent-cyan)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            {isMapOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <Compass size={15} color="var(--accent-cyan)" />
                            <span>
                              {hasPolygons 
                                ? `Peta Spasial Bidang Tanah (GeoJSON Polygon) • ${messagePolygons.length} Bidang`
                                : `Interactive Location Map: ${loc.name}`}
                            </span>
                          </button>

                          {hasPolygons ? (
                            <button
                              type="button"
                              onClick={() => setGeoJsonModalData({ features: messagePolygons, activeIndex: 0 })}
                              style={{
                                background: 'rgba(6, 182, 212, 0.15)',
                                border: '1px solid rgba(6, 182, 212, 0.35)',
                                color: '#38bdf8',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              <Maximize2 size={11} />
                              <span>Inspektur Bidang</span>
                            </button>
                          ) : (
                            <a
                              href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#94a3b8',
                                fontSize: '11px',
                                textDecoration: 'none'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = '#38bdf8'}
                              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                            >
                              <span>Google Maps</span>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>

                        {isMapOpen && (
                          hasPolygons ? (
                            <GeoJsonMapViewer
                              data={messagePolygons}
                              height="280px"
                              onExpand={(modalData) => setGeoJsonModalData(modalData)}
                            />
                          ) : (
                            <div style={{
                              borderRadius: '10px',
                              overflow: 'hidden',
                              border: '1px solid rgba(6, 182, 212, 0.3)',
                              background: 'rgba(5, 7, 15, 0.85)',
                              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                            }}>
                              <iframe
                                title={`Map-${loc.name}`}
                                width="100%"
                                height="260"
                                frameBorder="0"
                                scrolling="no"
                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng - 0.05}%2C${loc.lat - 0.04}%2C${loc.lng + 0.05}%2C${loc.lat + 0.04}&layer=mapnik&marker=${loc.lat}%2C${loc.lng}`}
                                style={{ border: 0, display: 'block' }}
                              />
                            </div>
                          )
                        )}
                      </div>
                    );
                  })()}

                  {/* Graph Entities & Interactive Cytoscape Canvas (Assistant only) */}
                  {isAssistant && msg.entities && msg.entities.length > 0 && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                          onClick={() => toggleEntities(msg.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#c084fc',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          {expandedEntities[msg.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <Share2 size={14} />
                          <span>Connected Graph Entities ({msg.entities.length})</span>
                        </button>

                        <button
                          onClick={() => toggleGraph(msg.id)}
                          style={{
                            background: expandedGraph[msg.id] ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.1)',
                            border: '1px solid rgba(168, 85, 247, 0.35)',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            color: '#e9d5ff',
                            fontSize: '11px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Network size={13} color="#c084fc" />
                          <span>{expandedGraph[msg.id] ? 'Hide Canvas' : 'View Network Graph'}</span>
                        </button>
                      </div>

                      {/* Interactive Cytoscape Canvas */}
                      {expandedGraph[msg.id] && (
                        <div style={{
                          marginTop: '10px',
                          height: '280px',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: '1px solid rgba(168, 85, 247, 0.35)',
                          background: 'rgba(5, 7, 15, 0.85)',
                          position: 'relative',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                        }}>
                          <CytoscapeGraph
                            elements={buildGraphElements(msg.entities)}
                            layoutName="cose"
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '10px',
                            fontSize: '10px',
                            color: '#94a3b8',
                            background: 'rgba(15, 23, 42, 0.75)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            pointerEvents: 'none'
                          }}>
                            Scroll to zoom • Drag to pan • Neo4j Topology
                          </div>
                        </div>
                      )}

                      {expandedEntities[msg.id] && (
                        <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {msg.entities.map((ent, eIdx) => (
                            <div
                              key={eIdx}
                              style={{
                                background: 'rgba(168, 85, 247, 0.12)',
                                border: '1px solid rgba(168, 85, 247, 0.25)',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                color: '#e9d5ff'
                              }}
                            >
                              <strong>{ent.name}</strong> <span style={{ opacity: 0.7 }}>({ent.type})</span>
                              {ent.connections && ent.connections.length > 0 && (
                                <div style={{ fontSize: '10px', color: '#c084fc', marginTop: '2px' }}>
                                  {ent.connections.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dynamic API Tools Accordion (Assistant only) */}
                  {isAssistant && msg.tools_executed && msg.tools_executed.length > 0 && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                      <button
                        onClick={() => toggleTools(msg.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-cyan)',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        {expandedTools[msg.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Zap size={14} color="var(--accent-cyan)" />
                        Real-time AI Tools Invoked ({msg.tools_executed.length})
                      </button>

                      {expandedTools[msg.id] && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {msg.tools_executed.map((tool, tIdx) => {
                            const isDb = tool.source_type === 'database' || tool.tool_name?.startsWith('db_');
                            const toolColor = isDb ? 'var(--accent-primary)' : 'var(--accent-cyan)';
                            const toolBg = isDb ? 'rgba(99, 102, 241, 0.06)' : 'rgba(6, 182, 212, 0.06)';
                            const toolBorder = isDb ? 'rgba(99, 102, 241, 0.25)' : 'rgba(6, 182, 212, 0.25)';

                            return (
                              <div
                                key={tIdx}
                                style={{
                                  background: toolBg,
                                  border: `1px solid ${toolBorder}`,
                                  borderRadius: '8px',
                                  padding: '10px 14px',
                                  fontSize: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: '700', color: toolColor, fontFamily: 'JetBrains Mono, monospace' }}>
                                      ⚡ {tool.tool_name}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                      ({tool.source_name || (isDb ? 'Database Source' : 'API Source')})
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {tool.success && (
                                      <span style={{
                                        background: 'rgba(16, 185, 129, 0.15)',
                                        color: '#34d399',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '10px',
                                        fontWeight: '700',
                                        border: '1px solid rgba(16, 185, 129, 0.3)'
                                      }}>
                                        ⭐ PRIORITAS UTAMA (LIVE DATA)
                                      </span>
                                    )}
                                    <span style={{
                                      background: tool.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                                      color: tool.success ? 'var(--accent-emerald)' : '#f87171',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '10px',
                                      fontWeight: '700'
                                    }}>
                                      {tool.success ? (tool.status_code ? `${tool.status_code} OK` : 'SUCCESS') : 'FAILED'}
                                    </span>
                                  </div>
                                </div>

                                {tool.url && (
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {isDb ? 'Target DB: ' : 'Endpoint: '}{tool.url}
                                  </div>
                                )}

                              {tool.arguments && Object.keys(tool.arguments).length > 0 && (
                                <div>
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Parameters:</span>
                                  <div style={{
                                    marginTop: '4px',
                                    background: 'rgba(0,0,0,0.35)',
                                    borderRadius: '4px',
                                    padding: '6px 8px',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '11px',
                                    color: '#e2e8f0',
                                    whiteSpace: 'pre-wrap'
                                  }}>
                                    {JSON.stringify(tool.arguments, null, 2)}
                                  </div>
                                </div>
                              )}

                              {/* Extracted photos/images from tool payload */}
                              {tool.data && (() => {
                                const extractedImgs = extractImagesFromData(tool.data, 6);
                                if (extractedImgs.length === 0) return null;

                                return (
                                  <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '6px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <ImageIcon size={12} /> Discovered Photos in Tool Output ({extractedImgs.length}):
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                      {extractedImgs.map((img, iIdx) => (
                                        <div
                                          key={iIdx}
                                          onClick={() => setLightboxImage({ src: img.src, alt: `Tool Result Photo: ${img.label}` })}
                                          style={{
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            position: 'relative'
                                          }}
                                          title={`Click to view: ${img.label}`}
                                        >
                                          <img
                                            src={img.src}
                                            alt={img.label}
                                            style={{
                                              width: '52px',
                                              height: '52px',
                                              objectFit: 'cover',
                                              display: 'block'
                                            }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Extracted GeoJSON Polygons from tool payload */}
                              {tool.data && (() => {
                                const extractedPolys = extractPolygonsFromData(tool.data, 6);
                                if (extractedPolys.length === 0) return null;

                                return (
                                  <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Compass size={12} /> Peta Bidang Tanah Spasial ({extractedPolys.length} Polygon GeoJSON):
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setGeoJsonModalData({ features: extractedPolys, activeIndex: 0 })}
                                        style={{
                                          background: 'rgba(6, 182, 212, 0.15)',
                                          border: '1px solid rgba(6, 182, 212, 0.35)',
                                          color: '#38bdf8',
                                          borderRadius: '4px',
                                          padding: '2px 8px',
                                          fontSize: '10px',
                                          fontWeight: '600',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <Maximize2 size={10} />
                                        <span>Perbesar Peta</span>
                                      </button>
                                    </div>
                                    <GeoJsonMapViewer
                                      data={extractedPolys}
                                      height="200px"
                                      onExpand={(modalData) => setGeoJsonModalData(modalData)}
                                    />
                                  </div>
                                );
                              })()}

                              {tool.error && (
                                <div style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                                  Error: {tool.error}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assistant Footer: Metrics & Copy Response Button */}
                  {isAssistant && (
                    <div style={{
                      marginTop: '14px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      {/* Left: Metadata & Latency */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                        fontSize: '11px',
                        color: 'var(--text-muted)'
                      }}>
                        {msg.metrics ? (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Cpu size={12} />
                              {msg.backend_name ? `${msg.backend_name} · ` : ''}{msg.model_used || 'Qwen3.6-35B'}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              {msg.metrics.latency_ms}ms
                            </span>
                            {msg.metrics.chunks_retrieved !== undefined && (
                              <span>Chunks: {msg.metrics.chunks_retrieved}</span>
                            )}
                            {msg.metrics.tools_executed > 0 && (
                              <span style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: '600' }}>
                                <Zap size={11} /> Tools: {msg.metrics.tools_executed}
                              </span>
                            )}
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              color: msg.metrics.strict_mode !== false ? '#34d399' : '#fbbf24',
                              background: msg.metrics.strict_mode !== false ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              border: `1px solid ${msg.metrics.strict_mode !== false ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                              fontWeight: '500'
                            }}>
                              <ShieldCheck size={11} />
                              {msg.metrics.strict_mode !== false ? 'Faktual (Anti-Halu)' : `Fleksibel (${msg.metrics.temperature || 0.3})`}
                            </span>
                            {msg.context_rot_guard && (
                              <span 
                                title={
                                  msg.context_rot_guard.task_shift_detected 
                                    ? `Anti-Context-Rot Guard: Pergantian topik terdeteksi otomatis (${msg.context_rot_guard.shift_reason}). Rencana langkah baru diaktifkan tanpa bias masa lalu.`
                                    : `Anti-Context-Rot Guard: Aktif otomatis. ${msg.context_rot_guard.poisoning_neutralized} halusinasi dinetralisir, ${msg.context_rot_guard.large_tables_compacted} tabel dipadatkan, ~${msg.context_rot_guard.estimated_tokens_saved} token dihemat.`
                                }
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  color: msg.context_rot_guard.task_shift_detected ? '#38bdf8' : '#a78bfa',
                                  background: msg.context_rot_guard.task_shift_detected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(167, 139, 250, 0.1)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  border: `1px solid ${msg.context_rot_guard.task_shift_detected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(167, 139, 250, 0.25)'}`,
                                  fontWeight: '500'
                                }}
                              >
                                <ShieldCheck size={11} />
                                {msg.context_rot_guard.task_shift_detected 
                                  ? 'Anti-Rot: Fresh Plan (Otomatis)' 
                                  : (msg.context_rot_guard.estimated_tokens_saved > 0 
                                      ? `Anti-Rot: Optimal (~${msg.context_rot_guard.estimated_tokens_saved} tok)` 
                                      : 'Anti-Rot: Aktif (0 Rot)')
                                }
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                            <Bot size={12} /> AI Knowledge Assistant
                          </span>
                        )}
                      </div>

                      {/* Right: Copy Response Button */}
                      <button
                        type="button"
                        id={`copy-resp-bubble-${msg.id}`}
                        onClick={() => handleCopyResponse(msg.id, msg.content)}
                        title="Salin isi respon AI ke clipboard"
                        style={{
                          background: copiedResponseId === msg.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                          border: `1px solid ${copiedResponseId === msg.id ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.12)'}`,
                          borderRadius: '7px',
                          padding: '4px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          color: copiedResponseId === msg.id ? '#34d399' : '#e2e8f0',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          fontWeight: copiedResponseId === msg.id ? '600' : '500',
                          boxShadow: copiedResponseId === msg.id ? '0 0 10px rgba(16, 185, 129, 0.25)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (copiedResponseId !== msg.id) {
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (copiedResponseId !== msg.id) {
                            e.currentTarget.style.color = '#e2e8f0';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                          }
                        }}
                      >
                        {copiedResponseId === msg.id ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                        <span>{copiedResponseId === msg.id ? 'Tersalin! ✓' : 'Salin Respon'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                {isUser && (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <User size={18} color="#ffffff" />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Bot size={18} color="#ffffff" />
            </div>
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px 16px 16px 4px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'var(--text-secondary)',
              fontSize: '13px'
            }}>
              <Loader2 size={16} className="animate-spin" color="var(--accent-primary)" />
              Retrieving knowledge vectors & generating AI response...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

        {/* Bottom Message Input Box */}
        <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          {/* Attached image preview chip */}
          {attachedImage && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: '10px',
              width: 'fit-content'
            }}>
              <img
                src={attachedImage}
                alt="Preview"
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '6px',
                  objectFit: 'cover',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#ffffff' }}>
                  Image attached for Face Recognition
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Will scan biometric features & identify against ChromaDB
                </span>
              </div>
              <button
                onClick={() => setAttachedImage(null)}
                title="Remove attached image"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#ffffff',
                  marginLeft: '8px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.5)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Attached Document preview chip */}
          {attachedDocument && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '10px',
              width: 'fit-content',
              maxWidth: '100%'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
                flexShrink: 0
              }}>
                {attachedDocument.file_type === 'excel' || attachedDocument.file_type === 'csv' ? (
                  <FileSpreadsheet size={20} />
                ) : (
                  <FileText size={20} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {attachedDocument.file_name}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '700',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(16, 185, 129, 0.25)',
                    color: '#6ee7b7',
                    textTransform: 'uppercase'
                  }}>
                    {attachedDocument.file_type}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {attachedDocument.summary || `${((attachedDocument.file_size || 0) / 1024).toFixed(1)} KB`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttachedDocument(null)}
                title="Hapus lampiran dokumen"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#ffffff',
                  marginLeft: '8px',
                  flexShrink: 0,
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.5)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Document Upload Error Banner */}
          {docUploadError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '12px'
            }}>
              <AlertCircle size={14} />
              <span>{docUploadError}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', width: '100%' }}>
            {/* Hidden File Input for Image Upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />

            {/* Hidden File Input for Document Upload */}
            <input
              type="file"
              ref={docInputRef}
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.tsv,.txt,.md,.json,.log"
              onChange={handleDocSelect}
              style={{ display: 'none' }}
            />

            {/* Document Attachment Button */}
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              disabled={docUploading}
              title="Lampirkan Dokumen (PDF, Word DOCX, Excel XLSX/XLS, CSV, Text/JSON) untuk dianalisis AI"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: attachedDocument ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${attachedDocument ? '#34d399' : 'var(--border-color)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: docUploading ? 'not-allowed' : 'pointer',
                color: attachedDocument ? '#34d399' : 'var(--text-muted)',
                transition: 'all 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!docUploading) {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.borderColor = '#34d399';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = attachedDocument ? '#34d399' : 'var(--text-muted)';
                e.currentTarget.style.borderColor = attachedDocument ? '#34d399' : 'var(--border-color)';
              }}
            >
              {docUploading ? <Loader2 size={19} className="animate-spin" color="#34d399" /> : <Paperclip size={19} />}
            </button>

            {/* Image Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image or photo for Face Recognition (or paste image from clipboard)"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: attachedImage ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${attachedImage ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: attachedImage ? 'var(--accent-primary)' : 'var(--text-muted)',
                transition: 'all 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = attachedImage ? 'var(--accent-primary)' : 'var(--text-muted)';
                e.currentTarget.style.borderColor = attachedImage ? 'var(--accent-primary)' : 'var(--border-color)';
              }}
            >
              <ImageIcon size={19} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                attachedDocument 
                  ? `Tanyakan sesuatu tentang dokumen '${attachedDocument.file_name}' (atau tekan Enter untuk analisis lengkap)...`
                  : attachedImage 
                  ? "Add instructions (e.g. 'Siapa orang ini?') or press Enter to scan face..." 
                  : "Ask a question about your knowledge base or attach document/image... (Enter to send, Shift+Enter for newline)"
              }
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'none',
                maxHeight: '180px',
                padding: '8px 4px',
                fontFamily: 'inherit'
              }}
            />

            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !attachedImage && !attachedDocument) || loading || docUploading}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: (input.trim() || attachedImage || attachedDocument) && !loading && !docUploading
                  ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (input.trim() || attachedImage || attachedDocument) && !loading && !docUploading ? 'pointer' : 'not-allowed',
                color: '#ffffff',
                transition: 'all 0.2s',
                flexShrink: 0,
                boxShadow: (input.trim() || attachedImage || attachedDocument) && !loading && !docUploading ? '0 4px 14px rgba(99, 102, 241, 0.4)' : 'none'
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Right Sidebar: Tools & Chat Suggestions */}
      {isRightSidebarOpen && (
        <div 
          className="glass-panel"
          style={{
            width: '320px',
            minWidth: '280px',
            maxWidth: '360px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
            gap: '16px',
            overflowY: 'auto',
            flexShrink: 0,
            zIndex: 10
          }}
        >
          {/* Sidebar Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Zap size={14} color="var(--accent-cyan)" />
              </div>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                  Tools & Suggestions
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Sidebar Pintar & AI Tools
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRightSidebarOpen(false)}
              title="Sembunyikan Sidebar"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* SECTION 1: ACTIVE AI TOOLS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Zap size={13} color="var(--accent-cyan)" /> Active AI Tools
              </span>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '10px',
                background: activeTools.length > 0 ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTools.length > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: '600'
              }}>
                {activeTools.length} tool{activeTools.length !== 1 ? 's' : ''}
              </span>
            </div>

            {activeTools.length === 0 ? (
              <div style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: '1.4'
              }}>
                Belum ada dynamic AI tool aktif. Anda dapat mengonfigurasi tool di menu Knowledge Sources.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeTools.map((t, idx) => {
                  const isMcp = t.source_type === 'mcp' || t.source_type === 'mcp_server' || t.name.startsWith('mcp_');
                  const isDb = !isMcp && (t.source_type === 'database' || t.name.startsWith('db_'));
                  const toolColor = isMcp ? '#c084fc' : (isDb ? 'var(--accent-primary)' : 'var(--accent-cyan)');
                  const toolBg = isMcp ? 'rgba(168, 85, 247, 0.08)' : (isDb ? 'rgba(99, 102, 241, 0.08)' : 'rgba(6, 182, 212, 0.06)');
                  const toolBorder = isMcp ? 'rgba(168, 85, 247, 0.25)' : (isDb ? 'rgba(99, 102, 241, 0.25)' : 'rgba(6, 182, 212, 0.25)');

                  return (
                    <div
                      key={idx}
                      style={{
                        background: toolBg,
                        border: `1px solid ${toolBorder}`,
                        borderRadius: '10px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: toolColor,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          ⚡ {t.name}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: isMcp ? 'rgba(168, 85, 247, 0.2)' : (isDb ? 'rgba(99, 102, 241, 0.2)' : 'rgba(6, 182, 212, 0.2)'),
                          color: toolColor,
                          fontWeight: '600',
                          flexShrink: 0
                        }}>
                          {isMcp ? 'MCP' : (isDb ? 'Database' : 'API')}
                        </span>
                      </div>
                      {t.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          {t.description}
                        </div>
                      )}
                      {t.parameters && t.parameters.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                          {t.parameters.map((p, pIdx) => (
                            <span
                              key={pIdx}
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                color: 'var(--text-muted)'
                              }}
                            >
                              {p.name}{p.required ? '*' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: CHAT SUGGESTIONS / CONTOH PERTANYAAN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Sparkles size={13} color="var(--accent-primary)" /> Chat Suggestions
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Klik untuk tanya
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {samplePrompts.map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    lineHeight: '1.4',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    transition: 'all 0.2s',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.background = 'rgba(15, 23, 42, 0.6)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  <Sparkles size={13} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ flex: 1 }}>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Open Handle when Sidebar is Collapsed */}
      {!isRightSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsRightSidebarOpen(true)}
          title="Buka Tools & Saran"
          style={{
            position: 'absolute',
            right: '0',
            top: '16px',
            zIndex: 20,
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRight: 'none',
            borderRadius: '8px 0 0 8px',
            padding: '10px 6px',
            color: '#a5b4fc',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)';
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.9)';
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
          }}
        >
          <ChevronLeft size={16} />
          <Sparkles size={14} color="var(--accent-primary)" />
          {activeTools.length > 0 && (
            <span style={{
              background: 'rgba(6, 182, 212, 0.3)',
              color: 'var(--accent-cyan)',
              fontSize: '10px',
              padding: '2px 4px',
              borderRadius: '6px',
              fontWeight: '700'
            }}>
              {activeTools.length}
            </span>
          )}
        </button>
      )}
    </div>

      {/* Fullscreen Interactive Lightbox Modal */}
      {lightboxImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(5, 7, 15, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px'
          }}
          onClick={() => setLightboxImage(null)}
        >
          {/* Lightbox Controls Toolbar */}
          <div 
            style={{
              position: 'absolute',
              top: '20px',
              right: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '6px 10px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Copy Link / Base64 */}
            <button
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                navigator.clipboard.writeText(lightboxImage.src);
                setCopiedImage(true);
                setTimeout(() => setCopiedImage(false), 2000);
              }}
              title="Copy image source or base64"
            >
              {copiedImage ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
              <span>{copiedImage ? 'Copied!' : 'Copy Image Source'}</span>
            </button>

            {/* Download button */}
            <a
              href={lightboxImage.src}
              download={lightboxImage.alt ? `${lightboxImage.alt.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png` : 'chat_image.png'}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
              title="Download Image"
            >
              <Download size={14} />
              <span>Download</span>
            </a>

            {/* Close button */}
            <button
              onClick={() => setLightboxImage(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#ffffff',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Lightbox Image Viewport */}
          <div 
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt || 'Full Preview'}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            />
            {lightboxImage.alt && (
              <div style={{
                marginTop: '12px',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '4px 14px',
                borderRadius: '20px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                {lightboxImage.alt}
              </div>
            )}
          </div>
        </div>
      )}

      {/* GeoJSON Polygon Map Inspection Modal */}
      <GeoJsonMapModal
        isOpen={Boolean(geoJsonModalData)}
        onClose={() => setGeoJsonModalData(null)}
        modalData={geoJsonModalData}
      />

      {/* OpenAI Standard Chat History Drawer */}
      <ChatHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onImportOpenAI={handleImportOpenAI}
        currentModel={selectedModelName || 'Qwen/Qwen3.6-35B-A3B-FP8'}
      />

      {/* Explore Tools Catalog Modal */}
      <ExploreToolsModal
        isOpen={isExploreToolsModalOpen}
        onClose={() => setIsExploreToolsModalOpen(false)}
        tools={activeTools}
        onUsePrompt={(prompt) => {
          setInput(prompt);
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        }}
      />
    </div>
  );
}
