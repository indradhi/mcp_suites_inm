import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

const ENTITY_LEGEND = [
  { type: 'ORANG', label: 'Orang / Individu', color: '#6366f1' },
  { type: 'PERUSAHAAN', label: 'Organisasi / Korporasi', color: '#06b6d4' },
  { type: 'DOKUMEN', label: 'Dokumen / Identitas', color: '#ec4899' },
  { type: 'ASET', label: 'Aset / Tanah / Ranmor', color: '#f59e0b' },
  { type: 'LOKASI', label: 'Lokasi / Wilayah', color: '#10b981' },
  { type: 'DATABASE_RECORD', label: 'Data Record', color: '#14b8a6' },
  { type: 'API_ENDPOINT', label: 'API Endpoint', color: '#f97316' },
  { type: 'REKENING', label: 'Rekening Bank', color: '#eab308' },
  { type: 'NAMA', label: 'Nama Lengkap', color: '#3b82f6' },
  { type: 'OTHER', label: 'Lainnya', color: '#8b5cf6' }
];

export default function CytoscapeGraph({ 
  elements, 
  onSelectNode, 
  selectedNodeId, 
  layoutName = 'cose',
  searchQuery = '',
  selectedType = 'ALL',
  filterMode = 'highlight',
  onSelectType = null
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [hoveredType, setHoveredType] = useState(null);

  // Theme detection for canvas & cytoscape styles
  const [isDark, setIsDark] = useState(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme === 'dark') {
        setIsDark(true);
      } else if (theme === 'light') {
        setIsDark(false);
      } else {
        setIsDark(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mql) mql.addEventListener('change', updateTheme);

    return () => {
      observer.disconnect();
      if (mql) mql.removeEventListener('change', updateTheme);
    };
  }, []);

  // Update Cytoscape styles when isDark changes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.style()
      .selector('node')
      .style({
        'color': isDark ? '#f8fafc' : '#0f172a',
        'text-outline-color': isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)',
        'text-outline-width': 2,
        'border-color': isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.25)'
      })
      .selector('edge')
      .style({
        'line-color': isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.25)',
        'target-arrow-color': isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.38)',
        'color': isDark ? '#cbd5e1' : '#334155',
        'text-background-color': isDark ? '#0f172a' : '#ffffff'
      })
      .update();
  }, [isDark]);

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
            'color': isDark ? '#f8fafc' : '#0f172a',
            'text-outline-color': isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)',
            'text-outline-width': 2,
            'font-size': '11px',
            'font-family': 'Plus Jakarta Sans, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'background-color': (ele) => {
              const type = (ele.data('type') || '').toUpperCase();
              if (type === 'PERSON' || type === 'ORANG') return '#6366f1';
              if (type === 'ORGANIZATION' || type === 'PERUSAHAAN') return '#06b6d4';
              if (type === 'DOCUMENT' || type === 'DOKUMEN') return '#ec4899';
              if (type === 'ASSET' || type === 'ASET') return '#f59e0b';
              if (type === 'LOCATION' || type === 'LOKASI') return '#10b981';
              if (type === 'DATABASE_RECORD') return '#14b8a6';
              if (type === 'API_ENDPOINT') return '#f97316';
              if (type === 'REKENING') return '#eab308';
              if (type === 'NAMA') return '#3b82f6';
              return '#8b5cf6';
            },
            'width': 28,
            'height': 28,
            'border-width': 2,
            'border-color': isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.25)',
            'overlay-opacity': 0,
            'transition-property': 'background-color, border-color, border-width, opacity',
            'transition-duration': '0.3s'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.25)',
            'target-arrow-color': isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.38)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': isDark ? '#cbd5e1' : '#334155',
            'text-rotation': 'autorotate',
            'text-background-color': isDark ? '#0f172a' : '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': 2
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': isDark ? '#ffffff' : '#0f172a',
            'background-color': '#0284c7',
            'line-color': '#0284c7',
            'target-arrow-color': '#0284c7'
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

  // 4. Live Filtering & Highlighting (by searchQuery, selectedType, filterMode, and legend hover)
  useEffect(() => {
    if (!cyRef.current) return;
    const q = (searchQuery || '').toLowerCase().trim();
    const isTypeFilterActive = selectedType && selectedType !== 'ALL';
    const effectiveHoverType = hoveredType;

    cyRef.current.batch(() => {
      const matchedNodes = [];

      cyRef.current.nodes().forEach(node => {
        const label = (node.data('label') || '').toLowerCase();
        const id = (node.data('id') || '').toLowerCase();
        const desc = (node.data('description') || '').toLowerCase();
        const nType = (node.data('type') || '').toUpperCase();

        const matchesQuery = !q || label.includes(q) || id.includes(q) || desc.includes(q);
        const matchesType = !isTypeFilterActive || nType === selectedType;
        const matchesHover = !effectiveHoverType || nType === effectiveHoverType;

        const isMatched = matchesQuery && matchesType && matchesHover;

        if (isMatched) {
          matchedNodes.push(node);
          node.style({
            'display': 'element',
            'opacity': 1,
            'border-width': q ? 4 : 2,
            'border-color': q ? '#38bdf8' : 'rgba(255, 255, 255, 0.45)'
          });
        } else {
          if (filterMode === 'isolate') {
            node.style('display', 'none');
          } else {
            node.style({
              'display': 'element',
              'opacity': 0.12,
              'border-width': 1,
              'border-color': 'var(--border-subtle)'
            });
          }
        }
      });

      // Update edges: display only if both source and target nodes are visible
      cyRef.current.edges().forEach(edge => {
        const source = edge.source();
        const target = edge.target();
        const sVisible = source.style('display') !== 'none' && parseFloat(source.style('opacity')) > 0.3;
        const tVisible = target.style('display') !== 'none' && parseFloat(target.style('opacity')) > 0.3;

        if (sVisible && tVisible) {
          edge.style({
            'display': 'element',
            'opacity': 0.85,
            'width': 1.8
          });
        } else {
          if (filterMode === 'isolate') {
            edge.style('display', 'none');
          } else {
            edge.style({
              'display': 'element',
              'opacity': 0.05,
              'width': 1
            });
          }
        }
      });

      // Auto-fit to matched nodes when searching and results exist
      if (q && matchedNodes.length > 0 && matchedNodes.length < cyRef.current.nodes().length) {
        cyRef.current.animate({
          fit: { eles: cyRef.current.collection(matchedNodes), padding: 70 }
        }, { duration: 350 });
      }
    });
  }, [searchQuery, selectedType, filterMode, hoveredType, elements]);

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
    <div className="relative w-full h-full overflow-hidden rounded-xl border border-base-300">
      {/* Cytoscape Canvas Container */}
      <div 
        ref={containerRef} 
        style={{
          width: '100%',
          height: '100%',
          background: isDark
            ? 'radial-gradient(circle at center, rgba(14, 19, 31, 0.95) 0%, rgba(7, 9, 14, 0.98) 100%)'
            : 'radial-gradient(circle at center, #ffffff 0%, #e2e8f0 100%)'
        }} 
      />

      {/* Floating Canvas Action Bar (Zoom, Fit, Re-layout) */}
      <div className="absolute top-4 right-4 flex flex-col gap-1 bg-base-100/90 backdrop-blur-md border border-base-300 rounded-xl p-1.5 shadow-xl z-10">
        <button
          onClick={handleZoomIn}
          title="Perbesar Canvas (Zoom In)"
          className="btn btn-xs btn-ghost btn-square text-base-content hover:bg-base-200"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          title="Perkecil Canvas (Zoom Out)"
          className="btn btn-xs btn-ghost btn-square text-base-content hover:bg-base-200"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleFit}
          title="Pusatkan Seluruh Jaringan (Fit View)"
          className="btn btn-xs btn-ghost btn-square text-base-content hover:bg-base-200"
        >
          <Maximize2 size={15} />
        </button>
        <button
          onClick={handleReLayout}
          title="Jalankan Ulang Algoritma Tata Letak (Re-layout)"
          className="btn btn-xs btn-ghost btn-square text-base-content hover:bg-base-200"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Floating Interactive Entity Legend (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 max-w-[calc(100%-32px)] bg-base-100/90 backdrop-blur-md border border-base-300 rounded-xl px-3.5 py-2 flex items-center gap-3 flex-wrap shadow-xl z-10">
        <span className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider">
          Tipe Entitas:
        </span>
        {ENTITY_LEGEND.map((leg, lIdx) => {
          const isFilterActive = selectedType === leg.type;
          return (
            <div
              key={lIdx}
              onClick={() => {
                if (onSelectType) {
                  onSelectType(isFilterActive ? 'ALL' : leg.type);
                }
              }}
              onMouseEnter={() => setHoveredType(leg.type)}
              onMouseLeave={() => setHoveredType(null)}
              className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-2 py-1 rounded-md transition-all ${
                isFilterActive 
                  ? 'bg-base-300 text-base-content shadow-sm' 
                  : 'text-base-content/80 hover:bg-base-200 hover:text-base-content'
              }`}
              style={{
                opacity: hoveredType && hoveredType !== leg.type && !isFilterActive ? 0.4 : 1
              }}
              title={isFilterActive ? `Klik untuk membatalkan filter ${leg.label}` : `Klik untuk memfilter hanya tipe ${leg.label}`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{
                  backgroundColor: leg.color,
                  boxShadow: isFilterActive ? `0 0 8px ${leg.color}` : 'none'
                }}
              />
              <span className="text-[11px]">{leg.label}</span>
              {isFilterActive && (
                <span 
                  className="text-[9px] text-white px-1 py-0.5 rounded font-extrabold ml-0.5"
                  style={{ backgroundColor: leg.color }}
                >
                  AKTIF
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

