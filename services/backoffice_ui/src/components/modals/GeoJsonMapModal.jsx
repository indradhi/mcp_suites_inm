import React, { useState, useMemo } from 'react';
import { 
  X, 
  MapPin, 
  ExternalLink, 
  Copy, 
  Check, 
  Compass, 
  Layers, 
  Info, 
  FileText, 
  ShieldCheck,
  Building,
  User
} from 'lucide-react';
import { calculateCentroid } from '../common/GeoJsonMapViewer';

export default function GeoJsonMapModal({ isOpen, onClose, modalData = null }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const features = useMemo(() => {
    if (!modalData) return [];
    if (modalData.features && Array.isArray(modalData.features)) {
      return modalData.features;
    }
    if (Array.isArray(modalData)) {
      return modalData;
    }
    return [modalData];
  }, [modalData]);

  // Keep active index in sync with modalData when opened
  React.useEffect(() => {
    if (modalData && typeof modalData.activeIndex === 'number' && modalData.activeIndex >= 0) {
      setSelectedIdx(modalData.activeIndex);
    } else {
      setSelectedIdx(0);
    }
  }, [modalData]);

  if (!isOpen || features.length === 0) return null;

  const currentItem = features[selectedIdx] || features[0];
  const currentGeom = currentItem.geometry || currentItem;
  const currentProps = currentItem.properties || {};
  const centroid = currentItem.centroid || calculateCentroid(currentGeom?.coordinates);

  const ring = Array.isArray(currentGeom?.coordinates?.[0]) && Array.isArray(currentGeom?.coordinates?.[0][0])
    ? currentGeom.coordinates[0]
    : (currentGeom?.coordinates || []);

  const googleMapsUrl = centroid 
    ? `https://www.google.com/maps?q=${centroid.lat},${centroid.lng}` 
    : null;

  const handleCopyGeoJson = () => {
    try {
      const exportObj = {
        type: 'Feature',
        geometry: currentGeom,
        properties: currentProps
      };
      navigator.clipboard.writeText(JSON.stringify(exportObj, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (e) {
      console.warn('Failed to copy geojson', e);
    }
  };

  const handleCopyCoordinates = () => {
    try {
      const coordStr = ring.map((pt, i) => `Titik ${i + 1}: ${pt[1].toFixed(6)}, ${pt[0].toFixed(6)}`).join('\n');
      navigator.clipboard.writeText(coordStr);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    } catch (e) {
      console.warn('Failed to copy coords', e);
    }
  };

  // Generate Leaflet srcDoc for modal
  const modalSrcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .leaflet-popup-content-wrapper { background: rgba(15, 23, 42, 0.95) !important; color: #f8fafc !important; border: 1px solid rgba(6, 182, 212, 0.5) !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0,0,0,0.7) !important; }
    .leaflet-popup-tip { background: rgba(15, 23, 42, 0.95) !important; }
    .leaflet-popup-content { margin: 10px 14px !important; line-height: 1.5 !important; font-size: 12px !important; }
    .leaflet-control-layers { background: rgba(15, 23, 42, 0.9) !important; color: #e2e8f0 !important; border: 1px solid rgba(255,255,255,0.18) !important; border-radius: 6px !important; font-size: 11px !important; }
    .badge-parcel { display: inline-block; background: rgba(6, 182, 212, 0.25); color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    try {
      var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri'
      });
      var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      });

      var map = L.map('map', {
        layers: [sat],
        zoomControl: true,
        attributionControl: false
      });

      var baseMaps = {
        "🛰️ Satelit (Esri)": sat,
        "🗺️ Jalan (OSM)": osm
      };
      L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

      var featureData = ${JSON.stringify({
        type: 'Feature',
        geometry: currentGeom,
        properties: currentProps
      }).replace(/</g, '\\u003c')};

      var geoLayer = L.geoJSON(featureData, {
        style: {
          color: '#06b6d4',
          weight: 3.5,
          opacity: 0.95,
          fillColor: '#06b6d4',
          fillOpacity: 0.38
        }
      }).addTo(map);

      var b = geoLayer.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [50, 50], maxZoom: 18 });

        var c = b.getCenter();
        var cm = L.circleMarker(c, {
          radius: 6,
          fillColor: '#fbbf24',
          color: 'var(--text-main)',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.95
        }).addTo(map);
        cm.bindPopup("<b>Titik Tengah Bidang</b><br>Lat: " + c.lat.toFixed(6) + "<br>Lng: " + c.lng.toFixed(6));
      }
    } catch(e) {
      document.body.innerHTML = "<div style='color:#f87171;padding:20px;'>Error: " + e.message + "</div>";
    }
  </script>
</body>
</html>`;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.82)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{
        background: 'var(--bg-glass-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1200px',
        height: '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '14px 20px',
          background: 'rgba(6, 182, 212, 0.08)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Compass size={20} color="var(--accent-cyan)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>
                {currentProps.jenishak && currentProps.nomorhak 
                  ? `${currentProps.jenishak} No. ${currentProps.nomorhak}` 
                  : (currentProps.title || 'Inspektur Peta Spasial Bidang Tanah')}
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Format: GeoJSON Polygon • Proyeksi Koordinat WGS84
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--accent-cyan)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none'
                }}
              >
                <span>Google Maps</span>
                <ExternalLink size={13} />
              </a>
            )}

            <button
              onClick={handleCopyGeoJson}
              style={{
                background: copiedJson ? 'rgba(16, 185, 129, 0.25)' : 'var(--bg-glass-light)',
                border: `1px solid ${copiedJson ? '#10b981' : 'var(--border-subtle)'}`,
                color: copiedJson ? '#059669' : 'var(--text-main)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              {copiedJson ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedJson ? 'Tersalin' : 'Salin GeoJSON'}</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-glass-light)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Multi-parcel Selector Tabs */}
        {features.length > 1 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 20px',
            background: 'var(--bg-glass-2)',
            borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto'
          }}>
            {features.map((f, idx) => {
              const isSelected = selectedIdx === idx;
              const tabTitle = f.properties?.nomorhak
                ? `${f.properties.desa || 'Bidang'} (${f.properties.nomorhak})`
                : `Bidang ${idx + 1}`;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  style={{
                    background: isSelected ? 'rgba(6, 182, 212, 0.25)' : 'var(--bg-glass-light)',
                    border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                    color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: isSelected ? '700' : '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tabTitle}
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Body: Split Map & Inspector */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Interactive Map */}
          <div style={{ flex: '1 1 65%', position: 'relative', height: '100%', background: '#0b0f19' }}>
            <iframe
              key={`modal-map-${selectedIdx}`}
              title="Interactive GeoJSON Inspector"
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              srcDoc={modalSrcDoc}
              style={{ border: 0, width: '100%', height: '100%' }}
            />
          </div>

          {/* Right: Metadata & Coordinate Inspector */}
          <div style={{
            flex: '0 0 35%',
            maxWidth: '420px',
            background: 'var(--bg-glass-1)',
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px'
          }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Rincian Sertifikat & Bidang
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {currentProps.nomorhak && (
                <div style={{ background: 'var(--bg-glass-light)', padding: '8px 10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Nomor Sertifikat Hak:</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
                    {currentProps.jenishak} {currentProps.nomorhak}
                  </div>
                </div>
              )}

              {currentProps.LUAS && (
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '8px 10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#059669' }}>Luas Bidang Tanah:</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#059669' }}>
                    {currentProps.LUAS} m²
                  </div>
                </div>
              )}

              {(currentProps.desa || currentProps.kecamatan || currentProps.kabupaten) && (
                <div style={{ background: 'var(--bg-glass-light)', padding: '8px 10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Lokasi / Administrasi:</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)', marginTop: '2px' }}>
                    {[currentProps.desa, currentProps.kecamatan, currentProps.kabupaten].filter(Boolean).join(', ')}
                  </div>
                </div>
              )}

              {currentProps.pemilik_nama && (
                <div style={{ background: 'var(--bg-glass-light)', padding: '8px 10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Nama Pemilik:</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)' }}>
                    {currentProps.pemilik_nama}
                  </div>
                </div>
              )}

              {currentProps.nib && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>NIB:</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{currentProps.nib}</span>
                </div>
              )}

              {currentProps.suratukur && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Surat Ukur:</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{currentProps.suratukur}</span>
                </div>
              )}

              {currentProps.tglTerbit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tanggal Terbit:</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{currentProps.tglTerbit}</span>
                </div>
              )}

              {currentProps.statusht && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status Hak Tanggungan:</span>
                  <span style={{ fontWeight: '600', color: currentProps.statusht === 'Ya' ? '#dc2626' : '#059669' }}>
                    {currentProps.statusht}
                  </span>
                </div>
              )}

              {centroid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Titik Tengah (Centroid):</span>
                  <span style={{ fontWeight: '600', color: '#d97706', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                    {centroid.lat.toFixed(5)}, {centroid.lng.toFixed(5)}
                  </span>
                </div>
              )}
            </div>

            {/* Polygon Vertices / Coordinates */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: '700' }}>
                  Titik Sudut Polygon ({ring.length}):
                </span>
                <button
                  onClick={handleCopyCoordinates}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedCoords ? '#059669' : 'var(--accent-cyan)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {copiedCoords ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedCoords ? 'Tersalin' : 'Salin Titik'}</span>
                </button>
              </div>

              <div style={{
                maxHeight: '160px',
                overflowY: 'auto',
                background: 'var(--bg-glass-3)',
                borderRadius: '6px',
                padding: '6px 8px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                color: 'var(--text-sub)'
              }}>
                {ring.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ opacity: 0.6 }}>#{i + 1}</span>
                    <span>Lat: {pt[1].toFixed(6)}</span>
                    <span>Lng: {pt[0].toFixed(6)}</span>
                  </div>
                ))}
              </div>
            </div>

            {currentProps.riwayat_catatan && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: '700', marginBottom: '4px' }}>
                  Riwayat / Catatan:
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, background: 'var(--bg-glass-3)', padding: '8px', borderRadius: '6px' }}>
                  {currentProps.riwayat_catatan}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
