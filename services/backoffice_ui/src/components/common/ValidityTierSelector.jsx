import React from 'react';
import { ShieldCheck, ShieldAlert, Shield, Info } from 'lucide-react';

export const VALIDITY_TIERS = {
  authoritative: {
    id: 'authoritative',
    tierNumber: 1,
    name: 'Tingkat 1 - Otoritatif Primer',
    shortName: 'Otoritatif',
    badgeLabel: 'Tingkat 1: Otoritatif',
    groundTruth: true,
    scoreRange: '90 - 100',
    defaultScore: 95,
    minScore: 90,
    maxScore: 100,
    color: '#059669',
    lightColor: '#059669',
    bg: 'rgba(5, 150, 105, 0.12)',
    border: 'rgba(5, 150, 105, 0.35)',
    icon: ShieldCheck,
    description: 'Sumber data resmi negara (Dukcapil, BPN ATR, Korlantas, AHU, Bank resmi). Berstatus Ground Truth mutlak yang dimenangkan jika ada perbedaan data.',
    examples: 'Dukcapil NIK, Sertifikat BPN, AHU Kemenkumham, BI Fast / OJK'
  },
  verified: {
    id: 'verified',
    tierNumber: 2,
    name: 'Tingkat 2 - Terverifikasi Internal',
    shortName: 'Terverifikasi',
    badgeLabel: 'Tingkat 2: Terverifikasi',
    groundTruth: false,
    scoreRange: '75 - 89',
    defaultScore: 85,
    minScore: 75,
    maxScore: 89,
    color: '#2563eb',
    lightColor: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.35)',
    icon: Shield,
    description: 'Basis data operasional terverifikasi, laporan telaah intelijen resmi, atau laporan forensik internal BIN.',
    examples: 'Laporan Intelijen Tervalidasi, BAP/Laporan Hasil Penyelidikan, Telaah Forensik'
  },
  secondary: {
    id: 'secondary',
    tierNumber: 3,
    name: 'Tingkat 3 - Sekunder / Dokumen Publik',
    shortName: 'Sekunder',
    badgeLabel: 'Tingkat 3: Sekunder',
    groundTruth: false,
    scoreRange: '55 - 74',
    defaultScore: 65,
    minScore: 55,
    maxScore: 74,
    color: '#d97706',
    lightColor: '#d97706',
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.35)',
    icon: Info,
    description: 'Portal berita resmi, situs web kementerian/instansi, publikasi riset, atau kliping media massa terverifikasi.',
    examples: 'Kompaspedia, Siaran Pers Kementerian, Dokumen Studi Regulasi'
  },
  unverified: {
    id: 'unverified',
    tierNumber: 4,
    name: 'Tingkat 4 - Pendukung / Mentah',
    shortName: 'Pendukung',
    badgeLabel: 'Tingkat 4: Pendukung',
    groundTruth: false,
    scoreRange: '30 - 54',
    defaultScore: 45,
    minScore: 30,
    maxScore: 54,
    color: '#64748b',
    lightColor: '#64748b',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.35)',
    icon: ShieldAlert,
    description: 'Catatan observasi lapangan, tangkapan layar media sosial, atau laporan pengaduan masyarakat belum terkonfirmasi.',
    examples: 'Postingan Twitter/X, Catatan Informan Anonim, Aduan SMS/WA'
  }
};

export function getValidityMeta(tierId, score) {
  const meta = VALIDITY_TIERS[tierId] || VALIDITY_TIERS.secondary;
  const resolvedScore = score !== undefined && score !== null ? Number(score) : meta.defaultScore;
  return { ...meta, score: resolvedScore };
}

export function ValidityBadge({ tier, score, showScore = true, size = 'normal' }) {
  const meta = getValidityMeta(tier, score);
  const Icon = meta.icon;
  const isSmall = size === 'small';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: isSmall ? '4px' : '6px',
      padding: isSmall ? '2px 7px' : '3px 10px',
      borderRadius: '6px',
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      color: meta.color,
      fontSize: isSmall ? '11px' : '12px',
      fontWeight: '600',
      lineHeight: 1.2
    }}>
      <Icon size={isSmall ? 12 : 14} color={meta.color} />
      <span>{meta.shortName}</span>
      {showScore && (
        <span style={{
          background: 'var(--bg-glass-3)',
          border: '1px solid var(--border-subtle)',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: isSmall ? '10px' : '11px',
          color: meta.color,
          fontWeight: '700'
        }}>
          {score !== undefined && score !== null ? score : meta.defaultScore}
        </span>
      )}
    </span>
  );
}

export default function ValidityTierSelector({
  valueTier = 'secondary',
  valueScore,
  valueNotes = '',
  onChangeTier,
  onChangeScore,
  onChangeNotes
}) {
  const currentTier = VALIDITY_TIERS[valueTier] || VALIDITY_TIERS.secondary;
  const currentScore = valueScore !== undefined && valueScore !== null ? Number(valueScore) : currentTier.defaultScore;

  const handleSelectTier = (tierId) => {
    const tierConfig = VALIDITY_TIERS[tierId];
    if (onChangeTier) onChangeTier(tierId);
    if (onChangeScore) onChangeScore(tierConfig.defaultScore);
  };

  return (
    <div style={{
      background: 'var(--bg-glass-2)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '10px',
      padding: '18px',
      marginBottom: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-primary)" />
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>
            Tingkat Validitas & Hierarki Kebenaran Data (Ground Truth)
          </span>
        </div>
        <ValidityBadge tier={valueTier} score={currentScore} size="normal" />
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
        Mekanisme penentuan bobot validitas sumber data. Bila terdapat perbedaan informasi antar katalog, 
        AI Knowledge Orchestrator secara otomatis memenangkan data dari tingkat validitas tertinggi.
      </p>

      {/* 4 Tier Selection Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '10px',
        marginBottom: '16px'
      }}>
        {Object.values(VALIDITY_TIERS).map((t) => {
          const isSelected = valueTier === t.id;
          const Icon = t.icon;
          return (
            <div
              key={t.id}
              onClick={() => handleSelectTier(t.id)}
              style={{
                cursor: 'pointer',
                borderRadius: '8px',
                padding: '12px',
                border: isSelected ? `2px solid ${t.color}` : '1px solid var(--border-subtle)',
                background: isSelected ? t.bg : 'var(--bg-glass-1)',
                boxShadow: isSelected ? `0 0 12px ${t.border}` : 'none',
                transition: 'all 0.18s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon size={16} color={t.color} />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? t.color : 'var(--text-main)' }}>
                      {t.name}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.4 }}>
                  {t.description}
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '6px',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '10px'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Skor: <strong style={{ color: t.color }}>{t.scoreRange}</strong></span>
                {t.groundTruth && (
                  <span style={{
                    color: '#059669',
                    background: 'rgba(5, 150, 105, 0.15)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: '700'
                  }}>
                    MUTLAK
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fine-Tuning Slider & Notes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '14px',
        paddingTop: '12px',
        borderTop: '1px solid var(--border-subtle)'
      }}>
        {/* Score Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Skor Validitas Spesifik (0 - 100):
            </label>
            <span style={{
              fontSize: '13px',
              fontWeight: '700',
              color: currentTier.color,
              background: currentTier.bg,
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              {currentScore} / 100
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={currentScore}
            onChange={(e) => onChangeScore && onChangeScore(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: currentTier.color,
              cursor: 'pointer'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            <span>Rendah (0)</span>
            <span>Standar Tingkat {currentTier.tierNumber}: {currentTier.defaultScore}</span>
            <span>Tertinggi (100)</span>
          </div>
        </div>

        {/* Justification Notes */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Catatan Rasionalisasi / Dasar Kebenaran (Opsional):
          </label>
          <input
            type="text"
            className="input-field"
            placeholder="Misal: Berasal dari server BPN resmi via koneksi enkripsi VPN..."
            value={valueNotes}
            onChange={(e) => onChangeNotes && onChangeNotes(e.target.value)}
            style={{ fontSize: '12px', padding: '7px 10px' }}
          />
        </div>
      </div>
    </div>
  );
}
