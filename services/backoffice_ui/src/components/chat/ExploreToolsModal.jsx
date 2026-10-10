import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Zap, 
  Database, 
  Globe, 
  Server, 
  Code, 
  Check, 
  Copy, 
  ArrowRight, 
  Send,
  HelpCircle,
  Cpu,
  Layers
} from 'lucide-react';

/**
 * Generates a realistic example user query for a tool
 */
const generateToolExamplePrompt = (tool) => {
  const name = (tool.name || '').toLowerCase();
  const desc = (tool.description || '').toLowerCase();

  if (name.includes('dukcapil') || name.includes('penduduk') || desc.includes('dukcapil')) {
    return 'Cari data kependudukan Dukcapil untuk NIK 3203010101900001 atau nama Indradhi';
  }
  if (name.includes('bpn') || name.includes('tanah') || desc.includes('pertanahan')) {
    return 'Cek sertifikat tanah dan batas bidang persil di BPN untuk wilayah Cianjur';
  }
  if (name.includes('sikap') || name.includes('vendor') || desc.includes('pengadaan')) {
    return 'Cek status verifikasi vendor PT Triputra di sistem SIKAP LKPP';
  }
  if (name.includes('db_') || tool.source_type === 'database') {
    return `Jalankan query analisis ke database sumber: ${tool.name}`;
  }
  if (tool.source_type === 'mcp' || tool.source_type === 'mcp_server') {
    return `Gunakan tool MCP '${tool.name}' untuk mengambil informasi terkini`;
  }
  return `Jalankan eksekusi tool ${tool.name} dengan parameter yang sesuai`;
};

export default function ExploreToolsModal({
  isOpen = false,
  onClose = () => {},
  tools = [],
  onUsePrompt = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [copiedTool, setCopiedTool] = useState(null);
  const [expandedSchema, setExpandedSchema] = useState({});

  if (!isOpen) return null;

  // Filter tools by search query and category
  const filteredTools = useMemo(() => {
    return (tools || []).filter((tool) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (tool.name && tool.name.toLowerCase().includes(q)) ||
        (tool.description && tool.description.toLowerCase().includes(q)) ||
        (tool.source_type && tool.source_type.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'database') {
        return tool.source_type === 'database' || (tool.name && tool.name.startsWith('db_'));
      }
      if (selectedCategory === 'api') {
        return tool.source_type === 'api' || tool.source_type === 'rest';
      }
      if (selectedCategory === 'mcp') {
        return tool.source_type === 'mcp' || tool.source_type === 'mcp_server' || (tool.name && tool.name.includes('mcp_'));
      }
      return true;
    });
  }, [tools, searchQuery, selectedCategory]);

  const toggleSchema = (toolName) => {
    setExpandedSchema((prev) => ({ ...prev, [toolName]: !prev[toolName] }));
  };

  const handleCopySchema = (tool, e) => {
    e.stopPropagation();
    try {
      const openAiFunctionSpec = {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: (tool.parameters || []).reduce((acc, p) => {
              acc[p.name] = {
                type: p.type || 'string',
                description: p.description || ''
              };
              return acc;
            }, {}),
            required: (tool.parameters || []).filter((p) => p.required).map((p) => p.name)
          }
        }
      };

      const text = JSON.stringify(openAiFunctionSpec, null, 2);
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedTool(tool.name);
      setTimeout(() => setCopiedTool(null), 2000);
    } catch (err) {
      console.error('Failed to copy tool schema:', err);
    }
  };

  const handleUseToolInChat = (tool) => {
    const prompt = generateToolExamplePrompt(tool);
    onUsePrompt(prompt);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '85vh',
          background: 'var(--bg-glass-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }}
            >
              <Zap size={20} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                Explore AI Tools & Function Calling
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Katalog perangkat aktif yang dapat dieksekusi secara otomatis oleh LLM via Tool Calling
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-glass-light)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '6px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-main)';
              e.currentTarget.style.background = 'var(--border-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'var(--bg-glass-light)';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            background: 'var(--bg-glass-2)'
          }}
        >
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              flex: '1 1 240px',
              minWidth: '220px'
            }}
          >
            <Search
              size={15}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Cari tool berdasarkan nama atau deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                background: 'var(--bg-glass-3)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {[
              { id: 'all', label: 'Semua', count: tools.length },
              { id: 'database', label: 'Database', icon: Database },
              { id: 'api', label: 'REST API', icon: Globe },
              { id: 'mcp', label: 'MCP Remote', icon: Server }
            ].map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: active ? '600' : '400',
                    background: active ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-glass-light)',
                    border: `1px solid ${active ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-subtle)'}`,
                    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cat.icon && <cat.icon size={13} />}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tools Grid / List */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1
          }}
        >
          {filteredTools.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}
            >
              Tidak ditemukan tools yang cocok dengan kriteria pencarian "{searchQuery}".
            </div>
          ) : (
            filteredTools.map((tool, idx) => {
              const isDb = tool.source_type === 'database' || (tool.name && tool.name.startsWith('db_'));
              const isMcp = tool.source_type === 'mcp' || tool.source_type === 'mcp_server';
              const themeColor = isDb ? 'var(--accent-primary)' : isMcp ? '#6366f1' : 'var(--accent-cyan)';
              const isSchemaOpen = Boolean(expandedSchema[tool.name]);

              return (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-glass-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'border-color 0.2s ease, transform 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  {/* Tool Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '13px',
                          fontWeight: '700',
                          color: themeColor,
                          letterSpacing: '0.02em'
                        }}
                      >
                        ⚡ {tool.name}
                      </span>

                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: isDb
                            ? 'rgba(99, 102, 241, 0.15)'
                            : isMcp
                            ? 'rgba(236, 72, 153, 0.15)'
                            : 'rgba(6, 182, 212, 0.15)',
                          border: `1px solid ${
                            isDb
                              ? 'rgba(99, 102, 241, 0.3)'
                              : isMcp
                              ? 'rgba(236, 72, 153, 0.3)'
                              : 'rgba(6, 182, 212, 0.3)'
                          }`,
                          color: themeColor,
                          fontWeight: '600'
                        }}
                      >
                        {isDb ? 'Database SQL' : isMcp ? 'MCP Server' : 'REST API'}
                      </span>

                      {tool.parameters && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          • {tool.parameters.length} parameter{tool.parameters.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={(e) => handleCopySchema(tool, e)}
                        title="Salin definisi fungsi JSON Schema untuk OpenAI Chat Completions"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: copiedTool === tool.name ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-glass-light)',
                          border: `1px solid ${copiedTool === tool.name ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}`,
                          color: copiedTool === tool.name ? '#34d399' : 'var(--text-muted)',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedTool === tool.name ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                        <span>{copiedTool === tool.name ? 'Tersalin' : 'Copy Schema'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUseToolInChat(tool)}
                        title="Tanyakan pertanyaan contoh untuk mengeksekusi tool ini"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%)',
                          border: '1px solid rgba(99, 102, 241, 0.4)',
                          color: 'var(--text-main)',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <span>Gunakan di Chat</span>
                        <Send size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {tool.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {tool.description}
                    </div>
                  )}

                  {/* Parameter chips */}
                  {tool.parameters && tool.parameters.length > 0 && (
                    <div>
                      <div
                        onClick={() => toggleSchema(tool.name)}
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginBottom: '6px'
                        }}
                      >
                        <span>{isSchemaOpen ? 'Sembunyikan parameter' : 'Lihat parameter detail'}</span>
                        <span style={{ fontSize: '10px' }}>({isSchemaOpen ? '▲' : '▼'})</span>
                      </div>

                      {isSchemaOpen ? (
                        <div
                          style={{
                            background: 'var(--bg-glass-3)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          {tool.parameters.map((p, pIdx) => (
                            <div
                              key={pIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '8px',
                                fontSize: '11px'
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'JetBrains Mono, monospace',
                                  color: 'var(--accent-cyan)',
                                  fontWeight: '600'
                                }}
                              >
                                {p.name}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                ({p.type || 'string'}){p.required ? ' *wajib' : ' opsional'}
                              </span>
                              {p.description && (
                                <span style={{ color: 'var(--text-muted)', flex: 1 }}>
                                  — {p.description}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {tool.parameters.map((p, pIdx) => (
                            <span
                              key={pIdx}
                              style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'var(--bg-glass-light)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                                fontFamily: 'JetBrains Mono, monospace'
                              }}
                            >
                              {p.name}
                              {p.required ? '*' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-glass-2)',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}
        >
          <span>
            💡 Kompatibel dengan spesifikasi <strong>OpenAI Function Calling & Tool Calling</strong> standard (`tools` & `tool_choice`).
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'var(--bg-glass-light)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
