import React, { useState, useMemo } from 'react';
import { 
  X, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Edit3, 
  Check, 
  Download, 
  Upload, 
  Copy, 
  Clock, 
  FileJson, 
  AlertCircle 
} from 'lucide-react';

/**
 * Categorizes a date into time buckets
 */
const getTimeBucket = (isoString) => {
  if (!isoString) return 'Lainnya';
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hari Ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays <= 7) return '7 Hari Terakhir';
  return 'Lebih Lama';
};

/**
 * Converts internal session messages to strict OpenAI Chat Completions message standard
 */
export const toOpenAIMessages = (messages) => {
  return (messages || [])
    .filter((m) => m.id !== 'welcome-msg' && !m.isError && !m.id?.startsWith('error-'))
    .map((m) => {
      const msg = {
        role: m.role || 'user',
        content: m.content || ''
      };
      if (m.thinking) {
        msg.reasoning_content = m.thinking;
      }
      if (m.tools_executed && m.tools_executed.length > 0) {
        msg.tool_calls = m.tools_executed.map((t, idx) => ({
          id: `call_${idx}_${Date.now()}`,
          type: 'function',
          function: {
            name: t.tool_name,
            arguments: JSON.stringify(t.data || {})
          }
        }));
      }
      return msg;
    });
};

export default function ChatHistoryDrawer({
  isOpen = false,
  onClose = () => {},
  sessions = [],
  activeSessionId = null,
  onSelectSession = () => {},
  onNewChat = () => {},
  onDeleteSession = () => {},
  onRenameSession = () => {},
  onImportOpenAI = () => {},
  currentModel = 'Qwen/Qwen3.6-35B-A3B-FP8'
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportPayload, setExportPayload] = useState('');
  const [copiedExport, setCopiedExport] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState(null);

  // Group sessions by time bucket
  const groupedSessions = useMemo(() => {
    const groups = {
      'Hari Ini': [],
      'Kemarin': [],
      '7 Hari Terakhir': [],
      'Lebih Lama': []
    };

    sessions.forEach((s) => {
      const bucket = getTimeBucket(s.updated_at || s.created_at);
      if (groups[bucket]) {
        groups[bucket].push(s);
      } else {
        groups['Lebih Lama'].push(s);
      }
    });

    return groups;
  }, [sessions]);

  if (!isOpen) return null;

  const startRename = (session, e) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title || 'Percakapan');
  };

  const saveRename = (sessionId) => {
    if (editTitle.trim()) {
      onRenameSession(sessionId, editTitle.trim());
    }
    setEditingId(null);
  };

  // Open Export Modal for the active or selected session
  const handleOpenExport = (session, e) => {
    if (e) e.stopPropagation();
    const targetSession = session || sessions.find((s) => s.id === activeSessionId) || sessions[0];
    if (!targetSession) return;

    const payload = {
      model: targetSession.model || currentModel,
      messages: toOpenAIMessages(targetSession.messages)
    };

    setExportPayload(JSON.stringify(payload, null, 2));
    setShowExportModal(true);
  };

  const handleCopyExport = () => {
    if (!exportPayload) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(exportPayload);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = exportPayload;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    } catch (err) {
      console.error('Failed to copy export:', err);
    }
  };

  const handleDownloadExport = () => {
    if (!exportPayload) return;
    const blob = new Blob([exportPayload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openai-chat-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleProcessImport = () => {
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError('Mohon masukkan format JSON OpenAI yang valid.');
      return;
    }

    try {
      const parsed = JSON.parse(importJsonText);
      let messagesArray = [];

      if (Array.isArray(parsed)) {
        messagesArray = parsed;
      } else if (parsed.messages && Array.isArray(parsed.messages)) {
        messagesArray = parsed.messages;
      } else {
        throw new Error("Payload harus berisi properti array 'messages' atau berupa array langsung.");
      }

      // Convert OpenAI messages to internal UI format
      const internalMessages = messagesArray.map((m, idx) => ({
        id: `imported-${idx}-${Date.now()}`,
        role: m.role === 'developer' || m.role === 'system' ? 'system' : m.role || 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        thinking: m.reasoning_content || null,
        sources: [],
        entities: [],
        tools_executed: m.tool_calls
          ? m.tool_calls.map((tc) => ({
              tool_name: tc.function?.name || 'function',
              data: (() => {
                try {
                  return JSON.parse(tc.function?.arguments || '{}');
                } catch {
                  return {};
                }
              })()
            }))
          : [],
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      }));

      const modelName = parsed.model || currentModel;
      onImportOpenAI({
        title: internalMessages.find((m) => m.role === 'user')?.content?.slice(0, 40) || 'Imported OpenAI Chat',
        model: modelName,
        messages: internalMessages
      });

      setShowImportModal(false);
      setImportJsonText('');
      onClose();
    } catch (err) {
      setImportError(`Format JSON tidak valid: ${err.message}`);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-glass-3)',
          backdropFilter: 'blur(4px)',
          zIndex: 9980,
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '340px',
          maxWidth: '90vw',
          background: 'var(--bg-glass-1)',
          borderRight: '1px solid var(--border-subtle)',
          boxShadow: '10px 0 30px rgba(0, 0, 0, 0.4)',
          zIndex: 9990,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInLeft 0.25s ease-out'
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              Riwayat Obrolan
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Buttons: New Chat & Export/Import */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '9px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: 'var(--text-main)',
              border: 'none',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={16} />
            <span>Obrolan Baru (New Chat)</span>
          </button>

          {/* Secondary buttons: Export & Import OpenAI */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleOpenExport()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: 'var(--bg-glass-light)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              title="Ekspor sesi saat ini dalam standar OpenAI Chat Completions JSON"
            >
              <Download size={12} />
              <span>Ekspor OpenAI</span>
            </button>

            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: 'var(--bg-glass-light)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              title="Impor riwayat obrolan dari standar OpenAI JSON"
            >
              <Upload size={12} />
              <span>Impor OpenAI</span>
            </button>
          </div>
        </div>

        {/* Sessions List grouped by date */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Belum ada riwayat percakapan yang tersimpan.
            </div>
          ) : (
            Object.entries(groupedSessions).map(([bucketName, list]) => {
              if (list.length === 0) return null;
              return (
                <div key={bucketName} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '0 6px'
                    }}
                  >
                    {bucketName}
                  </div>

                  {list.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isEditing = editingId === session.id;
                    const messageCount = (session.messages || []).filter((m) => m.id !== 'welcome-msg' && !m.isError && !m.id?.startsWith('error-')).length;

                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          onSelectSession(session.id);
                          onClose();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'var(--bg-glass-light)',
                          border: `1px solid ${isActive ? 'rgba(99, 102, 241, 0.45)' : 'transparent'}`,
                          color: isActive ? 'var(--text-main)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'var(--bg-glass-2)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'var(--bg-glass-light)';
                        }}
                      >
                        {isEditing ? (
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename(session.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              autoFocus
                              style={{
                                flex: 1,
                                background: 'var(--bg-glass-3)',
                                border: '1px solid var(--accent-primary)',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                color: 'var(--text-main)',
                                fontSize: '12px',
                                outline: 'none'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => saveRename(session.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#34d399',
                                cursor: 'pointer',
                                padding: '2px'
                              }}
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '12px',
                                  fontWeight: isActive ? '600' : '400',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                                title={session.title}
                              >
                                {session.title || 'Percakapan Tanpa Judul'}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                                <span>{messageCount} pesan</span>
                                {session.model && <span>• {session.model.split('/').pop()}</span>}
                              </div>
                            </div>

                            {/* Action icons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                              <button
                                type="button"
                                onClick={(e) => startRename(session, e)}
                                title="Ganti Nama"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '3px'
                                }}
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(session.id);
                                }}
                                title="Hapus Percakapan"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '3px'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer with OpenAI Standard badge */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-glass-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileJson size={13} color="var(--accent-primary)" />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Format Standar OpenAI v1
            </span>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {sessions.length} sesi tersimpan
          </span>
        </div>
      </div>

      {/* Export OpenAI Modal */}
      {showExportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '80vh',
              background: 'var(--bg-glass-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              gap: '14px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileJson size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  OpenAI Chat Completions Payload JSON
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Payload di bawah ini kompatibel 100% dengan endpoint `POST /v1/chat/completions` (OpenAI, OpenRouter, vLLM, Ollama).
            </p>

            <textarea
              readOnly
              value={exportPayload}
              rows={14}
              style={{
                width: '100%',
                background: 'var(--bg-glass-3)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                color: 'var(--accent-cyan)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={handleCopyExport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: copiedExport ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-glass-light)',
                  border: `1px solid ${copiedExport ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}`,
                  color: copiedExport ? '#059669' : 'var(--text-main)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {copiedExport ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                <span>{copiedExport ? 'Tersalin ke Clipboard' : 'Salin JSON'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'var(--accent-primary)',
                  border: 'none',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Download size={13} />
                <span>Unduh File .json</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import OpenAI Modal */}
      {showImportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '680px',
              background: 'var(--bg-glass-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              gap: '14px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  Impor Obrolan OpenAI JSON
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Tempelkan payload OpenAI Chat Completion format JSON (dengan properti 'model' dan 'messages') atau array pesan langsung.
            </p>

            {importError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '12px'
                }}
              >
                <AlertCircle size={14} />
                <span>{importError}</span>
              </div>
            )}

            <textarea
              placeholder='{\n  "model": "gpt-4o",\n  "messages": [\n    {"role": "user", "content": "Hello"},\n    {"role": "assistant", "content": "Hi there!"}\n  ]\n}'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              rows={12}
              style={{
                width: '100%',
                background: 'var(--bg-glass-3)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                color: 'var(--text-main)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleProcessImport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  background: 'var(--accent-primary)',
                  border: 'none',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Upload size={13} />
                <span>Muat ke Sesi Baru</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
