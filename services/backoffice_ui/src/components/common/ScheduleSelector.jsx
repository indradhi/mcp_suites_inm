import React, { useState, useEffect } from 'react';
import { Clock, Info } from 'lucide-react';

const PRESET_OPTIONS = [
  { value: '', label: 'Manual Only (Tanpa Jadwal Otomatis)' },
  { value: '1h', label: 'Setiap 1 Jam' },
  { value: '3h', label: 'Setiap 3 Jam' },
  { value: '6h', label: 'Setiap 6 Jam (Direkomendasikan)' },
  { value: '12h', label: 'Setiap 12 Jam' },
  { value: '24h', label: 'Setiap 24 Jam (Harian)' },
  { value: 'weekly', label: 'Setiap 7 Hari (Mingguan)' },
  { value: 'custom', label: 'Kustom Pola Cron (5 Bagian)...' },
];

export default function ScheduleSelector({ value = '', onChange }) {
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customCron, setCustomCron] = useState('');

  useEffect(() => {
    if (!value) {
      setSelectedPreset('');
      setCustomCron('');
    } else {
      const isKnownPreset = PRESET_OPTIONS.some(p => p.value === value && p.value !== '' && p.value !== 'custom');
      if (isKnownPreset) {
        setSelectedPreset(value);
        setCustomCron('');
      } else {
        setSelectedPreset('custom');
        setCustomCron(value);
      }
    }
  }, [value]);

  const handlePresetChange = (e) => {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val === 'custom') {
      const defaultCustom = customCron || '0 */6 * * *';
      setCustomCron(defaultCustom);
      onChange(defaultCustom);
    } else {
      onChange(val);
    }
  };

  const handleCustomChange = (e) => {
    const val = e.target.value;
    setCustomCron(val);
    onChange(val);
  };

  const getExplanation = () => {
    if (!value && !selectedPreset) {
      return 'Data hanya akan ditarik saat pertama kali dibuat atau saat tombol "Sync" ditekan secara manual.';
    }
    if (selectedPreset === '1h') return 'Sistem akan otomatis mengeksekusi pencarian web dan memperbarui vektor setiap 1 jam.';
    if (selectedPreset === '3h') return 'Sistem akan otomatis mengeksekusi pencarian web dan memperbarui vektor setiap 3 jam.';
    if (selectedPreset === '6h') return 'Sistem akan otomatis mengeksekusi pencarian web dan memperbarui vektor setiap 6 jam.';
    if (selectedPreset === '12h') return 'Sistem akan otomatis mengeksekusi pencarian web dan memperbarui vektor setiap 12 jam.';
    if (selectedPreset === '24h') return 'Sistem akan otomatis mengeksekusi pencarian web dan memperbarui vektor sekali sehari (tiap 24 jam).';
    if (selectedPreset === 'weekly') return 'Sistem akan otomatis mengeksekusi pencarian web dan memperbarui vektor seminggu sekali.';
    if (selectedPreset === 'custom') return `Eksekusi otomatis dijadwalkan dengan pola cron: "${value || customCron}". Format: [menit jam hari bulan hari_dalam_minggu].`;
    return '';
  };

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      padding: '12px 14px',
      marginTop: '4px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Clock size={15} color="var(--accent-amber)" />
        <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
          Jadwal Auto-Refresh / Periodic Scheduling
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <select
          className="input-field"
          value={selectedPreset}
          onChange={handlePresetChange}
          style={{ width: '100%', cursor: 'pointer' }}
        >
          {PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ background: '#1c1e24', color: '#fff' }}>
              {opt.label}
            </option>
          ))}
        </select>

        {selectedPreset === 'custom' && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Pola Cron (5 Bagian UTC/WIB: menit jam tanggal bulan hari_minggu)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Contoh: 0 */4 * * * (tiap 4 jam) atau 0 8 * * 1 (tiap Senin 08:00)"
              value={customCron}
              onChange={handleCustomChange}
              required
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <Info size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>{getExplanation()}</span>
        </div>
      </div>
    </div>
  );
}
