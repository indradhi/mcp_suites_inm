import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Scale, 
  Search, 
  Building2, 
  Sliders, 
  Save, 
  RotateCcw, 
  Check, 
  Copy, 
  AlertCircle, 
  CheckCircle, 
  MessageSquare, 
  Eye, 
  Cpu, 
  FileText,
  Info,
  Trash2,
  Download,
  Upload
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const PRESET_ICONS = {
  bin_investigator: ShieldCheck,
  legal_compliance: Scale,
  forensic_auditor: Search,
  general_enterprise: Building2,
  custom: Sliders
};

const PRESET_COLORS = {
  bin_investigator: {
    bg: 'rgba(51, 65, 85, 0.15)',
    border: 'rgba(51, 65, 85, 0.35)',
    accent: '#475569',
    badge: 'BIN Official'
  },
  legal_compliance: {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    accent: '#3b82f6',
    badge: 'Legal & Audit'
  },
  forensic_auditor: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    accent: '#10b981',
    badge: 'Forensic & Finance'
  },
  general_enterprise: {
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.35)',
    accent: '#a855f7',
    badge: 'Corporate'
  },
  custom: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    accent: '#f59e0b',
    badge: 'Custom Persona'
  }
};

export default function MCPPersonality() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const fileInputRef = useRef(null);

  // Active personality form state
  const [personality, setPersonality] = useState({
    preset: 'bin_investigator',
    name: 'Analis Intelijen & Penyelidikan BIN',
    nickname: 'Asisten Intelijen',
    role: 'Analis Intelijen & Penyelidikan Strategis',
    tone_of_voice: 'Formal, lugas, analitis, presisi, objektif, berintegritas tinggi',
    core_mission: 'Melakukan penelaahan bukti dan fakta, penelusuran aset (asset tracing), profiling entitas terduga...',
    custom_instructions: ''
  });

  const [presets, setPresets] = useState([]);
  const [previewPrompt, setPreviewPrompt] = useState('');

  // Fetch personality from API
  const fetchPersonality = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get('/settings/personality');
      if (res.data) {
        if (res.data.personality) {
          const p = res.data.personality;
          setPersonality({
            preset: p.preset_id || p.preset || 'bin_investigator',
            name: p.name || 'Analis Intelijen & Penyelidikan BIN',
            nickname: p.nickname || '',
            role: p.role_title || p.role || 'Enterprise AI Knowledge & Investigation Orchestrator',
            tone_of_voice: p.tone_label || p.tone_of_voice || p.tone || 'Formal, Tegas & Berbasis Bukti Faktual',
            core_mission: p.core_mission || '',
            custom_instructions: p.custom_instructions || ''
          });
        }
        if (res.data.presets) {
          setPresets(res.data.presets);
        }
        if (res.data.system_instruction || res.data.preview) {
          setPreviewPrompt(res.data.system_instruction || res.data.preview);
        }
      }
    } catch (err) {
      console.error('Failed to load MCP personality:', err);
      setErrorMessage(err.response?.data?.detail || 'Gagal memuat konfigurasi kepribadian MCP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonality();
  }, []);

  // Update dynamic preview prompt when form state changes
  useEffect(() => {
    const lines = [
      `### IDENTITAS & PERAN SISTEM:`,
      `Nama: ${personality.name || 'AI Assistant'}`,
      personality.nickname ? `Nama Panggilan: ${personality.nickname}` : null,
      `Peran: ${personality.role || 'Assistant'}`,
      `Gaya Bahasa & Nada Bicara: ${personality.tone_of_voice || 'Formal dan objektif'}`,
      ``,
      `### MISI UTAMA:`,
      personality.core_mission || '',
      ``,
      `### PROTOKOL KERJA & ATURAN SISTEM:`,
      `1. STRICT GROUNDING: Seluruh jawaban wajib berlandaskan fakta yang ditemukan dalam konteks dokumen, graf relasi, atau data real-time tools.`,
      `2. ANTI-HALUSINASI: DILARANG mengarang fakta, entitas, kronologi, atau status hukum yang tidak ada dalam data. Bila data tidak ada, jawab secara tegas dan lugas: "Data tidak ditemukan dalam basis data pengetahuan".`,
      `3. ATRIBUSI SUMBER: Wajib mencantumkan rujukan sumber resmi (Nama Dokumen, NIK, ID Aset, atau Nama Tool) untuk setiap temuan investigasi.`,
      `4. PEMANGGILAN TOOLS: Jika menemukan entitas terduga, NIK, atau aset tanah/perusahaan, prioritaskan verifikasi silang menggunakan tools investigasi yang tersedia.`
    ].filter(l => l !== null);

    if (personality.custom_instructions && personality.custom_instructions.trim()) {
      lines.push(``, `### INSTRUKSI TAMBAHAN KHUSUS:`, personality.custom_instructions.trim());
    }

    setPreviewPrompt(lines.join('\n'));
  }, [personality]);

  // Handler when selecting a preset
  const handleSelectPreset = (presetItem) => {
    if (!presetItem) return;
    setPersonality({
      preset: presetItem.id || 'custom',
      name: (presetItem.name || '').replace(/\s*\(Default\)/i, ''),
      nickname: presetItem.nickname || '',
      role: presetItem.role_title || presetItem.role || '',
      tone_of_voice: presetItem.tone_label || presetItem.tone_of_voice || presetItem.tone || 'Formal',
      core_mission: presetItem.core_mission || '',
      custom_instructions: presetItem.custom_instructions || ''
    });
    setSaveSuccess(false);
  };

  // Save changes
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);
    try {
      const res = await api.put('/settings/personality', personality);
      if (res.data && res.data.personality) {
        setPersonality(res.data.personality);
        setPreviewPrompt(res.data.system_instruction || previewPrompt);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error('Failed to save personality:', err);
      setErrorMessage(err.response?.data?.detail || 'Gagal menyimpan kepribadian MCP.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustom = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);
    try {
      const res = await api.post('/settings/personality/custom', personality);
      if (res.data && res.data.data) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        fetchPersonality();
      }
    } catch (err) {
      console.error('Failed to save custom personality:', err);
      setErrorMessage(err.response?.data?.detail || 'Gagal menyimpan kepribadian kustom.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePreset = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const presetId = personality.preset || 'bin_investigator';
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);
    try {
      const res = await api.put(`/settings/personality/preset/${presetId}`, personality);
      if (res.data) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        await fetchPersonality();
      }
    } catch (err) {
      console.error('Failed to update preset template:', err);
      setErrorMessage(err.response?.data?.detail || 'Gagal memperbarui template kepribadian.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNickname = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!personality.nickname?.trim()) {
      setErrorMessage('Mohon masukkan nama panggilan terlebih dahulu.');
      return;
    }
    await handleUpdatePreset(e);
  };

  const handleDeleteCustom = async (e, presetId) => {
    e.stopPropagation();
    if (!window.confirm('Yakin ingin menghapus kepribadian kustom ini?')) {
      return;
    }
    setSaving(true);
    try {
      await api.delete(`/settings/personality/custom/${presetId}`);
      fetchPersonality();
    } catch (err) {
      console.error('Failed to delete custom personality:', err);
      setErrorMessage(err.response?.data?.detail || 'Gagal menghapus kepribadian kustom.');
    } finally {
      setSaving(false);
    }
  };

  // Reset to BIN default
  const handleReset = async () => {
    if (!window.confirm('Kembalikan konfigurasi kepribadian MCP ke setelan awal resmi (Analis Intelijen BIN)?')) {
      return;
    }
    setResetting(true);
    setErrorMessage(null);
    try {
      const res = await api.post('/settings/personality/reset');
      if (res.data && res.data.personality) {
        setPersonality(res.data.personality);
        setPreviewPrompt(res.data.system_instruction);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error('Failed to reset personality:', err);
      setErrorMessage(err.response?.data?.detail || 'Gagal mereset kepribadian.');
    } finally {
      setResetting(false);
    }
  };

  // Copy prompt to clipboard
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(previewPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Export personality to JSON
  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(personality, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `mcp_personality_${personality.preset || 'custom'}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Import personality from JSON
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed && typeof parsed === 'object') {
          setPersonality(parsed);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          setErrorMessage(null);
        } else {
          setErrorMessage('Format file JSON tidak valid.');
        }
      } catch (err) {
        setErrorMessage('Gagal membaca file JSON: ' + err.message);
      }
      // reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const activeColor = PRESET_COLORS[personality.preset] || PRESET_COLORS.bin_investigator;
  const ActiveIcon = PRESET_ICONS[personality.preset] || ShieldCheck;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Top Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.12)'
          }}>
            <Sparkles size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>
                MCP Personality & System Prompting
              </h1>
              <span style={{
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: '6px',
                background: activeColor.bg,
                color: activeColor.accent,
                border: `1px solid ${activeColor.border}`
              }}>
                {activeColor.badge}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Atur kepribadian default, nada bicara, serta batasan operasional untuk seluruh pemanggilan AI dan klien MCP eksternal.
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', fontSize: '13px' }}
          >
            <MessageSquare size={16} />
            Buka Chat Playground
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || loading}
            className="btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '9px 16px', 
              fontSize: '13px'
            }}
            title="Kembalikan ke Kepribadian Asli Analis BIN"
          >
            <RotateCcw size={16} />
            {resetting ? 'Mereset...' : 'Reset ke Default BIN'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '9px 16px', 
              fontSize: '13px'
            }}
            title="Export Kepribadian ke JSON"
          >
            <Download size={16} />
            Export
          </button>
          <input 
            type="file"
            accept=".json"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '9px 16px', 
              fontSize: '13px'
            }}
            title="Import Kepribadian dari JSON"
          >
            <Upload size={16} />
            Import
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '9px 20px', 
              fontSize: '13px'
            }}
          >
            {saving ? <RotateCcw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Menyimpan...' : 'Simpan Kepribadian'}
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {saveSuccess && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px',
          fontWeight: '500',
          marginBottom: '20px'
        }}>
          <CheckCircle size={18} />
          Kepribadian MCP berhasil disimpan! Seluruh prompting baru di AI Knowledge Chat dan klien MCP akan otomatis menggunakan kepribadian ini.
        </div>
      )}

      {errorMessage && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#f87171',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px',
          fontWeight: '500',
          marginBottom: '20px'
        }}>
          <AlertCircle size={18} />
          {errorMessage}
        </div>
      )}

      {/* Section 1: Preset Switcher Cards */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Pilih Template Kepribadian (Presets)
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Klik salah satu preset untuk mengisi form secara otomatis
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '14px'
        }}>
          {presets.map((presetItem) => {
            const isSelected = personality.preset === presetItem.id;
            const Icon = PRESET_ICONS[presetItem.id] || Sliders;
            const color = PRESET_COLORS[presetItem.id] || PRESET_COLORS.custom;

            return (
              <div
                key={presetItem.id}
                onClick={() => handleSelectPreset(presetItem)}
                style={{
                  padding: '18px',
                  borderRadius: '12px',
                  background: isSelected ? color.bg : 'var(--bg-glass-2)',
                  border: isSelected ? `2px solid ${color.accent}` : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: isSelected ? `0 6px 20px rgba(0, 0, 0, 0.3), 0 0 15px ${color.accent}33` : 'none'
                }}
              >
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: presetItem.id?.startsWith('custom_') ? '40px' : '12px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: color.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Check size={13} color="#ffffff" strokeWidth={3} />
                  </div>
                )}
                {presetItem.id?.startsWith('custom_') && (
                  <div 
                    onClick={(e) => handleDeleteCustom(e, presetItem.id)}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    title="Hapus Kustom"
                  >
                    <Trash2 size={12} color="#ef4444" />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: isSelected ? color.accent : 'var(--bg-glass-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isSelected ? 'var(--text-main)' : color.accent
                  }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 style={{ 
                      fontSize: '14px', 
                      fontWeight: '700', 
                      color: isSelected ? 'var(--text-main)' : 'var(--text-primary)', 
                      margin: 0,
                      paddingRight: isSelected ? '24px' : '0'
                    }}>
                      {presetItem.name}
                    </h3>
                    {presetItem.nickname && (
                      <div style={{
                        fontSize: '11px',
                        color: isSelected ? 'var(--text-main)' : color.accent,
                        opacity: isSelected ? 0.95 : 1,
                        fontWeight: '600',
                        marginTop: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span style={{ opacity: 0.75 }}>Panggilan:</span>
                        <span style={{ fontStyle: 'italic', fontWeight: '600' }}>"{presetItem.nickname}"</span>
                      </div>
                    )}
                  </div>
                </div>

                <p style={{
                  fontSize: '12px',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  lineHeight: '1.45',
                  margin: 0,
                  flex: 1
                }}>
                  {presetItem.description}
                </p>

                <div style={{
                  fontSize: '11px',
                  color: isSelected ? color.accent : 'var(--text-muted)',
                  fontWeight: '600',
                  paddingTop: '6px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>Tone:</span>
                  <span style={{ fontWeight: '400', fontStyle: 'italic', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {(presetItem.tone_label || presetItem.tone_of_voice || presetItem.tone || 'Formal').split(',')[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Two-column Layout: Form Editor & Live Prompt Preview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.15fr 0.85fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* Left Column: Form Editor */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <ActiveIcon size={20} color={activeColor.accent} />
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              Konfigurasi Parameter Kepribadian
            </h2>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Nama Kepribadian */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Nama Kepribadian / Asisten
              </label>
              <input
                type="text"
                className="input-field"
                value={personality.name}
                onChange={(e) => setPersonality({ ...personality, name: e.target.value })}
                placeholder="Contoh: Analis Intelijen & Penyelidikan BIN"
                required
                style={{ width: '100%', fontSize: '14px', padding: '10px 14px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Nama formal yang disandang oleh sistem saat menjawab pertanyaan investigasi.
              </span>
            </div>

            {/* Nama Panggilan */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', margin: 0 }}>
                  Nama Panggilan (Short Greeting Name)
                </label>
                <span style={{ fontSize: '11px', color: activeColor.accent, fontWeight: '500' }}>
                  Target Template: <strong>{presets.find(p => p.id === personality.preset)?.name || personality.preset}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-field"
                  value={personality.nickname || ''}
                  onChange={(e) => setPersonality({ ...personality, nickname: e.target.value })}
                  placeholder="Contoh: Asisten BIN"
                  required
                  style={{ flex: 1, fontSize: '14px', padding: '10px 14px' }}
                />
                <button
                  type="button"
                  onClick={handleSaveNickname}
                  disabled={saving || loading || !personality.nickname}
                  className="btn-secondary"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    padding: '10px 16px', 
                    fontSize: '13px',
                    whiteSpace: 'nowrap'
                  }}
                  title={`Simpan nama panggilan "${personality.nickname || ''}" ke template yang dipilih (${presets.find(p => p.id === personality.preset)?.name || personality.preset})`}
                >
                  {saving ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
                  Simpan Nama Panggilan
                </button>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Nama sapaan singkat asisten yang disimpan langsung ke dalam template yang sedang dipilih (baik template bawaan maupun kustom).
              </span>
            </div>

            {/* Peran & Spesialisasi (Role) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Peran & Keahlian Khusus (Role Definition)
              </label>
              <input
                type="text"
                className="input-field"
                value={personality.role}
                onChange={(e) => setPersonality({ ...personality, role: e.target.value })}
                placeholder="Contoh: Analis Intelijen & Penyelidikan Strategis"
                required
                style={{ width: '100%', fontSize: '14px', padding: '10px 14px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Menentukan domain keahlian dan fokus analisa utama model LLM.
              </span>
            </div>

            {/* Gaya Bahasa & Nada Bicara (Tone of Voice) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Gaya Bahasa & Nada Bicara (Tone of Voice)
              </label>
              <input
                type="text"
                className="input-field"
                value={personality.tone_of_voice}
                onChange={(e) => setPersonality({ ...personality, tone_of_voice: e.target.value })}
                placeholder="Contoh: Formal, lugas, analitis, presisi, objektif, berintegritas tinggi"
                required
                style={{ width: '100%', fontSize: '14px', padding: '10px 14px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Mengontrol diksi, kesantunan, dan gaya penyusunan kalimat pada setiap jawaban.
              </span>
            </div>

            {/* Misi Utama (Core Mission) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Misi Utama & Cakupan Analisis (Core Mission)
              </label>
              <textarea
                className="input-field"
                rows={4}
                value={personality.core_mission}
                onChange={(e) => setPersonality({ ...personality, core_mission: e.target.value })}
                placeholder="Deskripsikan misi operasional asisten..."
                required
                style={{ width: '100%', fontSize: '13px', padding: '10px 14px', lineHeight: '1.5', resize: 'vertical' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Pedoman filosofis dan sasaran tugas yang wajib dicapai oleh asisten dalam merangkum data.
              </span>
            </div>

            {/* Instruksi Khusus & Batasan Tambahan (Custom Instructions) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Instruksi Khusus & Batasan Investigasi (Custom Instructions)
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Opsional</span>
              </div>
              <textarea
                className="input-field"
                rows={6}
                value={personality.custom_instructions}
                onChange={(e) => setPersonality({ ...personality, custom_instructions: e.target.value })}
                placeholder="Tuliskan aturan tambahan, instruksi pemanggilan tools spesifik, format output tabel yang diinginkan..."
                style={{ width: '100%', fontSize: '13px', padding: '10px 14px', lineHeight: '1.5', resize: 'vertical', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Instruksi rinci ini disisipkan langsung ke dalam System Prompt di setiap sesi percakapan LLM.
              </span>
            </div>

            {/* Submit Bar */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-end', 
              gap: '12px', 
              marginTop: '10px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)',
              flexWrap: 'wrap'
            }}>
              <button
                type="button"
                onClick={handleSaveCustom}
                disabled={saving || loading}
                className="btn-secondary"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '10px 20px', 
                  fontSize: '14px'
                }}
              >
                {saving ? <RotateCcw size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan Baru (Kustom)
              </button>

              {/* Tombol Simpan/Perbarui Template Defined & Kustom */}
              <button
                type="button"
                onClick={handleUpdatePreset}
                disabled={saving || loading}
                className="btn-secondary"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '10px 20px', 
                  fontSize: '14px',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-main)'
                }}
                title={personality.preset?.startsWith('custom_') 
                  ? "Perbarui template kustom yang dipilih" 
                  : `Simpan nama panggilan & parameter ke template defined: "${presets.find(p => p.id === personality.preset)?.name || personality.preset}"`}
              >
                {saving ? <RotateCcw size={16} className="animate-spin" /> : <Save size={16} />}
                {personality.preset?.startsWith('custom_') 
                  ? 'Perbarui (Kustom)' 
                  : 'Simpan ke Template (Defined)'}
              </button>

              <button
                type="submit"
                disabled={saving || loading}
                className="btn-primary"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '10px 24px', 
                  fontSize: '14px',
                  background: 'linear-gradient(135deg, #2b394e 0%, #172233 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                  color: '#ffffff'
                }}
              >
                {saving ? <RotateCcw size={16} className="animate-spin" /> : <Check size={16} />}
                {saving ? 'Menyimpan...' : 'Terapkan (Default)'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Generated System Prompt Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '22px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} color="var(--accent-primary)" />
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  Live System Prompt Preview
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCopyPrompt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: copiedPrompt ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-glass-light)',
                  border: `1px solid ${copiedPrompt ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
                  color: copiedPrompt ? '#34d399' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {copiedPrompt ? <Check size={13} /> : <Copy size={13} />}
                {copiedPrompt ? 'Tersalin!' : 'Salin Prompt'}
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: '1.45' }}>
              Berikut adalah teks System Instruction lengkap yang diinjeksikan ke LLM (vLLM, Ollama, OpenRouter, Google AI, OpenAI) dan diekspos melalui protokol MCP (<code style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>prompts/get</code>):
            </p>

            <div style={{
              background: 'var(--bg-glass-3)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '16px',
              maxHeight: '440px',
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '12px',
              lineHeight: '1.6',
              color: 'var(--text-main)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {previewPrompt}
            </div>
          </div>

          {/* Integration Info Card */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Info size={16} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                Bagaimana Kepribadian Ini Bekerja?
              </h3>
            </div>
            <ul style={{ 
              margin: 0, 
              paddingLeft: '18px', 
              fontSize: '12px', 
              color: 'var(--text-secondary)', 
              lineHeight: '1.6',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <li>
                <strong style={{ color: 'var(--text-main)' }}>AI Knowledge Chat:</strong> Diinjeksikan sebagai dasar kepribadian (System Role) pada backend LLM di setiap sesi obrolan.
              </li>
              <li>
                <strong style={{ color: 'var(--text-main)' }}>Klien MCP Eksternal:</strong> Klien seperti OpenWebUI atau Claude Desktop dapat memanggil method <code style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>prompts/get</code> dengan nama <code style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>default_personality</code>.
              </li>
              <li>
                <strong style={{ color: 'var(--text-main)' }}>Knowledge Orchestration Guidelines:</strong> Tool <code style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>get_knowledge_orchestration_guidelines</code> secara otomatis mengadopsi core mission dan kepribadian aktif ini.
              </li>
              <li>
                <strong style={{ color: 'var(--text-main)' }}>Anti-Halusinasi Terjaga:</strong> Seluruh fitur pencarian vektor, graf relasi, dan penelusuran data real-time tetap berjalan dengan kepribadian ini sebagai panduan etika & nada bicara.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
