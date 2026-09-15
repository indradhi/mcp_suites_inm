import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';

export default function CytoscapeGraph({ elements, onSelectNode, selectedNodeId, layoutName = 'cose' }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
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
            'width': 26,
            'height': 26,
            'border-width': 2,
            'border-color': 'rgba(255, 255, 255, 0.4)',
            'overlay-opacity': 0
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': 'rgba(255, 255, 255, 0.15)',
            'target-arrow-color': 'rgba(255, 255, 255, 0.25)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-background-color': '#07090e',
            'text-background-opacity': 0.8,
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
        animationDuration: 500,
        fit: true,
        padding: 40
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
  }, [elements, layoutName]);

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

  return (
    <div 
      ref={containerRef} 
      style={{
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at center, rgba(14, 19, 31, 0.9) 0%, rgba(7, 9, 14, 0.95) 100%)',
        borderRadius: '12px'
      }} 
    />
  );
}
