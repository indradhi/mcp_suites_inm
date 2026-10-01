import React from 'react';
import { Sparkles, ArrowRight, Compass, ShieldAlert, MapPin, Database, Network } from 'lucide-react';

/**
 * Generates smart contextual recommendations based on message metadata.
 */
export const generateContextualRecommendations = (msg) => {
  if (!msg || msg.role !== 'assistant') return [];

  const recs = [];
  const text = (msg.content || '').toLowerCase();
  const tools = (msg.tools_executed || []).map(t => (t.tool_name || '').toLowerCase());
  const entities = (msg.entities || []).map(e => typeof e === 'string' ? e : e.name || e.text || '');

  // 1. Dukcapil / Person detected
  const hasDukcapil = tools.some(t => t.includes('dukcapil') || t.includes('nik') || t.includes('penduduk'));
  const hasPerson = entities.some(e => e.length > 2) || text.includes('nik') || text.includes('kartu keluarga');

  if (hasDukcapil || hasPerson) {
    const firstEntity = entities[0] || 'subjek';
    recs.push(`👨‍👩‍👧 Cek relasi Kartu Keluarga & silsilah untuk ${firstEntity}`);
    recs.push(`🏢 Cari kepemilikan aset tanah BPN atas nama ${firstEntity}`);
    recs.push(`🔗 Visualisasikan jejaring relasi ${firstEntity} di Knowledge Graph`);
  }

  // 2. BPN / Pertanahan / Map detected
  const hasBpn = tools.some(t => t.includes('bpn') || t.includes('tanah') || t.includes('persil')) || text.includes('sertifikat') || text.includes('nib');
  if (hasBpn) {
    recs.push('🗺️ Tampilkan seluruh bidang tanah terkait dalam peta interaktif GeoJSON');
    recs.push('⚖️ Periksa status sengketa atau blokir yuridis di BPN');
  }

  // 3. SIKAP / Tender / Vendor detected
  const hasSikap = tools.some(t => t.includes('sikap') || t.includes('vendor') || t.includes('tender')) || text.includes('pengadaan') || text.includes('lpse');
  if (hasSikap) {
    recs.push('📑 Analisis riwayat tender & izin usaha badan hukum terkait');
    recs.push('⚠️ Periksa apakah ada afiliasi tersembunyi dengan panitia pengadaan');
  }

  // 4. Fallback / Universal insightful follow-ups
  if (recs.length < 3) {
    recs.push('📊 Tampilkan visualisasi relasi entitas dalam Knowledge Graph');
    recs.push('📑 Ringkas temuan utama dalam format tabel audit');
    recs.push('🔍 Verifikasi konsistensi data silang antar sumber primer');
  }

  // Return top 3 unique suggestions
  return Array.from(new Set(recs)).slice(0, 3);
};

/**
 * Categorized starter prompts for empty-state or welcome message
 */
export const STARTER_CATEGORIES = [
  {
    id: 'kependudukan',
    label: 'Kependudukan & Profiling',
    icon: Database,
    color: '#38bdf8',
    prompts: [
      'Siapa saja anggota keluarga terdaftar dalam Kartu Keluarga di Cianjur?',
      'Cari data kependudukan subjek Indradhi dan telusuri alamat domisili',
      'Verifikasi kesesuaian NIK dan foto biometrik wajah kependudukan'
    ]
  },
  {
    id: 'pertanahan',
    label: 'Aset Pertanahan & Geospasial',
    icon: MapPin,
    color: '#34d399',
    prompts: [
      'Tampilkan data sertifikat tanah di BPN Cianjur beserta petanya',
      'Cari sertifikat tanah hak milik dan cek koordinat batas bidang',
      'Bandingkan luas tanah terdaftar di BPN dengan data PBB'
    ]
  },
  {
    id: 'intelijen',
    label: 'Knowledge Graph & Relasi',
    icon: Network,
    color: '#a78bfa',
    prompts: [
      'Tampilkan entitas dan relasi Knowledge Graph secara visual',
      'Analisis jejaring afiliasi perusahaan dan kepemilikan saham',
      'Temukan pola relasi mencurigakan antara pihak terafiliasi'
    ]
  },
  {
    id: 'audit',
    label: 'Audit & Verifikasi Terpadu',
    icon: ShieldAlert,
    color: '#fbbf24',
    prompts: [
      'Bandingkan status database kependudukan dan API pertanahan',
      'Ringkas dan analisis temuan utama dalam file terlampir',
      'Cek konsistensi data lintas database Dukcapil, BPN, dan SIKAP'
    ]
  }
];

/**
 * RecommendationChips Component
 */
export default function RecommendationChips({
  suggestions = [],
  onSelectPrompt = () => {},
  disabled = false,
  variant = 'contextual' // 'contextual' | 'starter'
}) {
  if (variant === 'starter') {
    return (
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={16} color="var(--accent-primary)" />
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
            Rekomendasi Eksplorasi Cepat
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            (Pilih untuk memulai query langsung)
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px'
          }}
        >
          {STARTER_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: cat.color }}>
                  <Icon size={15} />
                  <span style={{ fontSize: '12px', fontWeight: '700' }}>{cat.label}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {cat.prompts.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectPrompt(p)}
                      style={{
                        textAlign: 'left',
                        fontSize: '11px',
                        lineHeight: '1.4',
                        color: 'var(--text-secondary)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                      }}
                      onMouseEnter={(e) => {
                        if (!disabled) {
                          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.12)';
                          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.35)';
                          e.currentTarget.style.color = '#ffffff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!disabled) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                      }}
                    >
                      <span>{p}</span>
                      <ArrowRight size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Contextual variant rendered under assistant message
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div
      style={{
        marginTop: '12px',
        paddingTop: '10px',
        borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Sparkles size={12} color="var(--accent-primary)" />
        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>
          Rekomendasi Pertanyaan Lanjutan:
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {suggestions.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelectPrompt(prompt)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              color: '#c7d2fe',
              fontSize: '11px',
              fontWeight: '500',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.25)';
                e.currentTarget.style.color = '#c7d2fe';
                e.currentTarget.style.transform = 'none';
              }
            }}
          >
            <span>{prompt}</span>
            <ArrowRight size={10} color="#a5b4fc" />
          </button>
        ))}
      </div>
    </div>
  );
}
