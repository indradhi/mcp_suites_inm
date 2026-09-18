import React, { useState, useMemo } from 'react';
import { 
  MapPin, 
  Maximize2, 
  ExternalLink, 
  Copy, 
  Check, 
  Layers, 
  ChevronDown, 
  ChevronRight,
  Compass,
  FileText
} from 'lucide-react';

/**
 * Calculates centroid of a polygon's coordinates [[lng, lat], ...]
 */
export function calculateCentroid(coordinates) {
  if (!coordinates || !Array.isArray(coordinates)) return null;
  const ring = Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0]) 
    ? coordinates[0] 
    : coordinates;

  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  for (const pt of ring) {
    if (Array.isArray(pt) && pt.length >= 2) {
      sumLng += Number(pt[0]);
      sumLat += Number(pt[1]);
      count++;
    }
  }

  return count > 0 ? { lat: sumLat / count, lng: sumLng / count } : null;
}

/**
 * Extracts and normalizes GeoJSON Polygons from any object, array, or tool output payload.
 */
export function extractPolygonsFromData(data, maxCount = 10) {
  const results = [];
  if (!data) return results;

  const traverse = (item, parentContext = {}) => {
    if (results.length >= maxCount) return;
    if (!item) return;

    if (Array.isArray(item)) {
      item.forEach(sub => traverse(sub, parentContext));
      return;
    }

    if (typeof item === 'object') {
      // Direct Polygon GeoJSON
      if (item.type === 'Polygon' && Array.isArray(item.coordinates)) {
        const centroid = calculateCentroid(item.coordinates);
        results.push({
          geometry: item,
          properties: { ...parentContext },
          centroid
        });
        return;
      }

      if (item.type === 'MultiPolygon' && Array.isArray(item.coordinates)) {
        const centroid = calculateCentroid(item.coordinates[0]);
        results.push({
          geometry: item,
          properties: { ...parentContext },
          centroid
        });
        return;
      }

      if (item.type === 'Feature' && item.geometry && (item.geometry.type === 'Polygon' || item.geometry.type === 'MultiPolygon')) {
        const centroid = calculateCentroid(item.geometry.coordinates);
        results.push({
          geometry: item.geometry,
          properties: { ...parentContext, ...(item.properties || {}) },
          centroid
        });
        return;
      }

      if (item.type === 'FeatureCollection' && Array.isArray(item.features)) {
        item.features.forEach(f => traverse(f, parentContext));
        return;
      }

      // Check if this object itself has a Polygon property (e.g. BPN API response)
      const polyKey = Object.keys(item).find(k => k.toLowerCase() === 'polygon');
      if (polyKey && item[polyKey] && typeof item[polyKey] === 'object') {
        const polyObj = item[polyKey];
        if ((polyObj.type === 'Polygon' || polyObj.type === 'MultiPolygon') && Array.isArray(polyObj.coordinates)) {
          // Collect other keys as properties
          const props = {};
          for (const [k, v] of Object.entries(item)) {
            if (k.toLowerCase() !== 'polygon' && v !== null && typeof v !== 'object') {
              props[k] = v;
            }
          }
          const mergedProps = { ...parentContext, ...props };
          const centroid = calculateCentroid(polyObj.coordinates);
          results.push({
            geometry: polyObj,
            properties: mergedProps,
            centroid
          });
        }
      }

      // Context gathering for children (e.g. pemilik, result, dokumenhak)
      const currentProps = { ...parentContext };
      for (const [k, v] of Object.entries(item)) {
        if (v !== null && typeof v !== 'object' && String(v).length < 200) {
          currentProps[k] = v;
        }
      }

      // Traverse children
      for (const [k, v] of Object.entries(item)) {
        if (typeof v === 'object' && k.toLowerCase() !== 'polygon') {
          traverse(v, currentProps);
        }
      }
    }
  };

  traverse(data);
  return results;
}

/**
 * Builds HTML template for Leaflet interactive map inside iframe srcDoc.
 */
function generateLeafletSrcDoc(features, activeIndex = -1) {
  const normalizedFC = {
    type: 'FeatureCollection',
    features: features.map((f, idx) => ({
      type: 'Feature',
      geometry: f.geometry || f,
      properties: {
        ...(f.properties || {}),
        _colorIndex: idx,
        _isActive: activeIndex === -1 || activeIndex === idx,
        title: f.properties?.title || f.title || (f.properties?.nomorhak ? `${f.properties?.jenishak || 'Bidang'} No. ${f.properties?.nomorhak}` : `Bidang ${idx + 1}`)
      }
    }))
  };

  const jsonStr = JSON.stringify(normalizedFC).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .leaflet-popup-content-wrapper { background: rgba(15, 23, 42, 0.95) !important; color: #f8fafc !important; border: 1px solid rgba(6, 182, 212, 0.5) !important; border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0,0,0,0.7) !important; backdrop-filter: blur(8px); }
    .leaflet-popup-tip { background: rgba(15, 23, 42, 0.95) !important; }
    .leaflet-popup-content { margin: 10px 14px !important; line-height: 1.5 !important; font-size: 12px !important; }
    .leaflet-control-layers { background: rgba(15, 23, 42, 0.9) !important; color: #e2e8f0 !important; border: 1px solid rgba(255,255,255,0.18) !important; border-radius: 6px !important; font-size: 11px !important; }
    .leaflet-bar a { background-color: rgba(15, 23, 42, 0.85) !important; color: #38bdf8 !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important; }
    .leaflet-bar a:hover { background-color: rgba(30, 41, 59, 0.95) !important; color: #ffffff !important; }
    .badge-parcel { display: inline-block; background: rgba(6, 182, 212, 0.25); color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; margin-bottom: 6px; border: 1px solid rgba(6, 182, 212, 0.4); }
    .prop-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 3px; font-size: 11px; }
    .prop-label { color: #94a3b8; font-weight: 500; }
    .prop-val { color: #f1f5f9; font-weight: 600; text-align: right; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    try {
      var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri & GIS Community'
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

      var geojsonData = ${jsonStr};
      var colors = ['#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

      var geoLayer = L.geoJSON(geojsonData, {
        style: function (feature) {
          var p = feature.properties || {};
          var idx = p._colorIndex || 0;
          var col = colors[idx % colors.length];
          var isActive = p._isActive !== false;

          return {
            color: col,
            weight: isActive ? 3.5 : 1.5,
            opacity: isActive ? 0.95 : 0.4,
            fillColor: col,
            fillOpacity: isActive ? 0.4 : 0.1
          };
        },
        onEachFeature: function (feature, layer) {
          var p = feature.properties || {};
          var html = "<div>";
          html += "<div class='badge-parcel'>🗺️ " + (p.title || 'Bidang Tanah') + "</div>";
          
          if (p.jenishak && p.nomorhak) {
            html += "<div style='font-weight: 700; font-size: 13px; color: #ffffff; margin-bottom: 6px;'>" + p.jenishak + " No. " + p.nomorhak + "</div>";
          }
          if (p.desa || p.kecamatan || p.kabupaten) {
            html += "<div class='prop-row'><span class='prop-label'>Wilayah:</span><span class='prop-val'>" + [p.desa, p.kecamatan, p.kabupaten].filter(Boolean).join(', ') + "</span></div>";
          }
          if (p.LUAS) {
            html += "<div class='prop-row'><span class='prop-label'>Luas:</span><span class='prop-val' style='color:#34d399;'>" + p.LUAS + " m²</span></div>";
          }
          if (p.nib) {
            html += "<div class='prop-row'><span class='prop-label'>NIB:</span><span class='prop-val'>" + p.nib + "</span></div>";
          }
          if (p.suratukur) {
            html += "<div class='prop-row'><span class='prop-label'>Surat Ukur:</span><span class='prop-val'>" + p.suratukur + "</span></div>";
          }
          if (p.statusht) {
            html += "<div class='prop-row'><span class='prop-label'>Status HT:</span><span class='prop-val'>" + p.statusht + "</span></div>";
          }
          if (p.pemilik_nama) {
            html += "<div class='prop-row'><span class='prop-label'>Pemilik:</span><span class='prop-val'>" + p.pemilik_nama + "</span></div>";
          }

          html += "</div>";
          layer.bindPopup(html);

          // Add centroid marker
          var b = layer.getBounds();
          if (b.isValid()) {
            var c = b.getCenter();
            var cm = L.circleMarker(c, {
              radius: 5,
              fillColor: '#fbbf24',
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.95
            }).addTo(map);
            cm.bindPopup(html);
          }
        }
      }).addTo(map);

      var activeLayers = [];
      geoLayer.eachLayer(function (layer) {
        if (layer.feature && layer.feature.properties && layer.feature.properties._isActive) {
          activeLayers.push(layer);
        }
      });

      var targetGroup = activeLayers.length > 0 ? L.featureGroup(activeLayers) : geoLayer;
      var b = targetGroup.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [40, 40], maxZoom: 18 });
      } else {
        map.setView([-6.2, 106.8], 11);
      }
    } catch (e) {
      document.body.innerHTML = "<div style='color:#f87171;padding:16px;'>Gagal memuat peta spasial: " + e.message + "</div>";
    }
  </script>
</body>
</html>`;
}

export default function GeoJsonMapViewer({ 
  data, 
  height = '280px', 
  title = null,
  onExpand = null,
  showControls = true 
}) {
  const [activeTab, setActiveTab] = useState(-1); // -1 = show all, 0, 1... = specific polygon
  const [copied, setCopied] = useState(false);

  // Normalize input data into list of feature items
  const features = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].geometry) {
        return data;
      }
      return extractPolygonsFromData(data);
    }
    if (typeof data === 'object') {
      if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        return data.features.map(f => ({
          geometry: f.geometry,
          properties: f.properties || {},
          centroid: calculateCentroid(f.geometry?.coordinates)
        }));
      }
      if (data.type === 'Feature') {
        return [{
          geometry: data.geometry,
          properties: data.properties || {},
          centroid: calculateCentroid(data.geometry?.coordinates)
        }];
      }
      if (data.type === 'Polygon' || data.type === 'MultiPolygon') {
        return [{
          geometry: data,
          properties: {},
          centroid: calculateCentroid(data.coordinates)
        }];
      }
      return extractPolygonsFromData(data);
    }
    return [];
  }, [data]);

  if (features.length === 0) {
    return null;
  }

  const currentFeature = activeTab >= 0 && activeTab < features.length 
    ? features[activeTab] 
    : features[0];

  const centroid = currentFeature?.centroid || calculateCentroid(currentFeature?.geometry?.coordinates);

  const displayTitle = title || (
    features.length === 1 
      ? (currentFeature.properties?.title || (currentFeature.properties?.nomorhak ? `${currentFeature.properties?.jenishak || 'Bidang'} No. ${currentFeature.properties?.nomorhak}` : 'Peta Bidang Tanah'))
      : `Peta Bidang Tanah (${features.length} Bidang)`
  );

  const googleMapsUrl = centroid 
    ? `https://www.google.com/maps?q=${centroid.lat},${centroid.lng}` 
    : null;

  const handleCopyGeoJson = () => {
    try {
      const exportObj = features.length === 1 
        ? (features[0].geometry || features[0]) 
        : {
            type: 'FeatureCollection',
            features: features.map(f => ({
              type: 'Feature',
              geometry: f.geometry || f,
              properties: f.properties || {}
            }))
          };
      navigator.clipboard.writeText(JSON.stringify(exportObj, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy geojson', e);
    }
  };

  const srcDoc = useMemo(() => {
    return generateLeafletSrcDoc(features, activeTab);
  }, [features, activeTab]);

  return (
    <div style={{
      margin: '12px 0',
      borderRadius: '10px',
      overflow: 'hidden',
      border: '1px solid rgba(6, 182, 212, 0.35)',
      background: 'rgba(5, 7, 15, 0.85)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)'
    }}>
      {/* Header Bar */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(6, 182, 212, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        borderBottom: '1px solid rgba(6, 182, 212, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', fontWeight: '700' }}>
            <Compass size={15} color="var(--accent-cyan)" />
            <span>{displayTitle}</span>
          </div>

          {currentFeature.properties?.LUAS && (
            <span style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontWeight: '600'
            }}>
              Luas: {currentFeature.properties.LUAS} m²
            </span>
          )}

          {currentFeature.properties?.kabupaten && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              ({[currentFeature.properties.desa, currentFeature.properties.kabupaten].filter(Boolean).join(', ')})
            </span>
          )}

          {centroid && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              [{centroid.lat.toFixed(5)}, {centroid.lng.toFixed(5)}]
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {showControls && (
            <>
              <button
                onClick={handleCopyGeoJson}
                title="Salin GeoJSON ke clipboard"
                style={{
                  background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${copied ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.12)'}`,
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  color: copied ? '#34d399' : '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {copied ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                <span>{copied ? 'Tersalin' : 'GeoJSON'}</span>
              </button>

              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Buka titik koordinat di Google Maps"
                  style={{
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none'
                  }}
                >
                  <span>Google Maps</span>
                  <ExternalLink size={11} />
                </a>
              )}

              {onExpand && (
                <button
                  onClick={() => onExpand({ features, activeIndex: activeTab >= 0 ? activeTab : 0 })}
                  title="Perbesar Peta (Fullscreen Viewer)"
                  style={{
                    background: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    color: '#e9d5ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <Maximize2 size={11} />
                  <span>Perbesar</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Multi-Polygon Tab Bar if multiple parcels exist */}
      {features.length > 1 && (
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '6px 12px',
          background: 'rgba(15, 23, 42, 0.7)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          overflowX: 'auto'
        }}>
          <button
            onClick={() => setActiveTab(-1)}
            style={{
              background: activeTab === -1 ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${activeTab === -1 ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.1)'}`,
              color: activeTab === -1 ? '#ffffff' : '#94a3b8',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: activeTab === -1 ? '700' : '500',
              whiteSpace: 'nowrap'
            }}
          >
            Semua Bidang ({features.length})
          </button>
          {features.map((f, idx) => {
            const tabTitle = f.properties?.nomorhak 
              ? `${f.properties?.desa || 'Bidang'} (${f.properties.nomorhak})` 
              : `Bidang ${idx + 1}`;
            const isSelected = activeTab === idx;

            return (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                style={{
                  background: isSelected ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
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

      {/* Interactive Map Iframe */}
      <div style={{ position: 'relative', width: '100%', height }}>
        <iframe
          title="GeoJSON Polygon Map"
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          srcDoc={srcDoc}
          style={{ border: 0, display: 'block', width: '100%', height: '100%' }}
        />
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '8px',
          fontSize: '10px',
          color: '#94a3b8',
          background: 'rgba(15, 23, 42, 0.85)',
          padding: '2px 6px',
          borderRadius: '4px',
          pointerEvents: 'none',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          🛰️ Esri Satellite / 🗺️ OSM • Scroll Zoom • Klik bidang untuk detail
        </div>
      </div>
    </div>
  );
}
