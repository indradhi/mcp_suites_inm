import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

const ENTITY_LEGEND = [
  { type: 'PERSON', label: 'Orang / Individu', color: '#6366f1' },
  { type: 'ORGANIZATION', label: 'Organisasi / Korporasi', color: '#06b6d4' },
  { type: 'DATABASE_RECORD', label: 'Data Record', color: '#10b981' },
  { type: 'API_ENDPOINT', label: 'API Endpoint', color: '#f59e0b' },
  { type: 'DOCUMENT', label: 'Dokumen', color: '#ec4899' },
  { type: 'OTHER', label: 'Lainnya', color: '#8b5cf6' }
];

export default function CytoscapeGraph({ elements, onSelectNode, selectedNodeId, layoutName = 'cose' }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [hoveredType, setHoveredType] = useState(null);

  // 1. Initialize Cytoscape on elements change
  useEffect(() => {
    if (!containerRef.current) return;

    const cytoscapeFn = typeof cytoscape === 'function' ? cytoscape : (cytoscape.default || cytoscape);
    const cy = cytoscapeFn({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#f8fafc',
            'font-size': '11px',
            'font-family': 'Plus Jakarta Sans, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'background-color': (ele) => {
              const type = (ele.data('type') || '').toUpperCase();
              if (type === 'PERSON') return '#6366f1';
              if (type === 'ORGANIZATION') return '#06b6d4';
              if (type === 'DATABASE_RECORD') return '#10b981';
              if (type === 'API_ENDPOINT') return '#f59e0b';
              if (type === 'DOCUMENT') return '#ec4899';
              return '#8b5cf6';
            },
            'width': 28,
            'height': 28,
            'border-width': 2,
            'border-color': 'rgba(255, 255, 255, 0.45)',
            'overlay-opacity': 0,
            'transition-property': 'background-color, border-color, border-width, opacity',
            'transition-duration': '0.3s'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': 'rgba(255, 255, 255, 0.18)',
            'target-arrow-color': 'rgba(255, 255, 255, 0.28)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-color': '#07090e',
            'text-background-opacity': 0.85,
            'text-background-padding': 2
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': '#ffffff',
            'background-color': '#38bdf8',
            'line-color': '#38bdf8',
            'target-arrow-color': '#38bdf8'
          }
        }
      ],
      layout: {
        name: layoutName,
        animate: true,
        animationDuration: 600,
        fit: true,
        padding: 50
      }
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (onSelectNode) {
        onSelectNode({
          id: node.data('id'),
          label: node.data('label'),
          type: node.data('type'),
          description: node.data('description')
        });
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [elements]);

  // 2. Smoothly animate nodes to new layout when layoutName changes
  useEffect(() => {
    if (!cyRef.current) return;
    try {
      const layout = cyRef.current.layout({
        name: layoutName,
        animate: true,
        animationDuration: 600,
        fit: true,
        padding: 50
      });
      layout.run();
    } catch (e) {
      console.warn('Error applying layout switch:', e);
    }
  }, [layoutName]);

  // 3. Selection zoom focus
  useEffect(() => {
    if (cyRef.current && selectedNodeId) {
      cyRef.current.nodes().unselect();
      const target = cyRef.current.$(`node[id = "${selectedNodeId}"]`);
      if (target.length) {
        target.select();
        cyRef.current.animate({
          center: { eles: target },
          zoom: 1.5
        }, { duration: 400 });
      }
    }
  }, [selectedNodeId]);

  // 4. Highlight nodes when hovering legend
  useEffect(() => {
    if (!cyRef.current) return;
    if (!hoveredType) {
      cyRef.current.nodes().style('opacity', 1);
      cyRef.current.edges().style('opacity', 1);
    } else {
      cyRef.current.nodes().forEach(node => {
        const nType = (node.data('type') || '').toUpperCase();
        if (nType === hoveredType) {
          node.style('opacity', 1);
          node.style('border-width', 3);
        } else {
          node.style('opacity', 0.2);
          node.style('border-width', 1);
        }
      });
      cyRef.current.edges().style('opacity', 0.15);
    }
  }, [hoveredType]);

  // Canvas Action Helpers
  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: cyRef.current.zoom() * 1.3,
        center: { eles: cyRef.current.nodes(':selected').length ? cyRef.current.nodes(':selected') : cyRef.current.elements() }
      }, { duration: 250 });
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: cyRef.current.zoom() * 0.75,
        center: { eles: cyRef.current.nodes(':selected').length ? cyRef.current.nodes(':selected') : cyRef.current.elements() }
      }, { duration: 250 });
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.animate({
        fit: { eles: cyRef.current.elements(), padding: 45 }
      }, { duration: 400 });
    }
  };

  const handleReLayout = () => {
    if (cyRef.current) {
      try {
        const layout = cyRef.current.layout({
          name: layoutName,
          animate: true,
          animationDuration: 600,
          fit: true,
          padding: 50
        });
        layout.run();
      } catch (e) {
        console.warn('Error re-running layout:', e);
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: '12px' }}>
      {/* Cytoscape Canvas Container */}
      <div 
        ref={containerRef} 
        style={{
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle at center, rgba(14, 19, 31, 0.95) 0%, rgba(7, 9, 14, 0.98) 100%)'
        }} 
      />

      {/* Floating Canvas Action Bar (Zoom, Fit, Re-layout) */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        background: 'rgba(11, 15, 25, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        padding: '6px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        zIndex: 10
      }}>
        <button
          onClick={handleZoomIn}
          title="Perbesar Canvas (Zoom In)"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)'; e.currentTarget.style.color = '#818cf8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#ffffff'; }}
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          title="Perkecil Canvas (Zoom Out)"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)'; e.currentTarget.style.color = '#818cf8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#ffffff'; }}
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleFit}
          title="Pusatkan Seluruh Jaringan (Fit View)"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(6, 182, 212, 0.25)'; e.currentTarget.style.color = '#22d3ee'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#ffffff'; }}
        >
          <Maximize2 size={15} />
        </button>
        <button
          onClick={handleReLayout}
          title="Jalankan Ulang Algoritma Tata Letak (Re-layout)"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)'; e.currentTarget.style.color = '#34d399'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#ffffff'; }}
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Floating Interactive Entity Legend (Bottom-Left) */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        background: 'rgba(11, 15, 25, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        zIndex: 10
      }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tipe Entitas:
        </span>
        {ENTITY_LEGEND.map((leg, lIdx) => (
          <div
            key={lIdx}
            onMouseEnter={() => setHoveredType(leg.type)}
            onMouseLeave={() => setHoveredType(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: '600',
              color: hoveredType === leg.type ? '#ffffff' : '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              opacity: hoveredType && hoveredType !== leg.type ? 0.4 : 1
            }}
            title={`Sorot entitas tipe ${leg.label}`}
          >
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: leg.color,
              boxShadow: `0 0 8px ${leg.color}88`,
              display: 'inline-block'
            }} />
            {leg.label}
          </div>
        ))}
      </div>
    </div>
  );
}

