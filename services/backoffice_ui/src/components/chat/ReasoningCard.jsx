import React, { useState } from 'react';
import { Lightbulb, ChevronDown, ChevronRight, Copy, Check, Sparkles, BrainCircuit } from 'lucide-react';

/**
 * ReasoningCard Component
 * Displays OpenAI o1 / DeepSeek R1 style thought process and reasoning trace.
 * Features collapsible view, token/char stats, execution duration, and copy to clipboard.
 */
export default function ReasoningCard({
  thinking,
  isLoading = false,
  duration = null,
  isExpanded = false,
  onToggle = () => {}
}) {
  const [copied, setCopied] = useState(false);

  if (!thinking && !isLoading) return null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!thinking) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(thinking);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = thinking;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy reasoning:', err);
    }
  };

  const charCount = thinking ? thinking.length : 0;
  const approxTokens = Math.round(charCount / 4);

  return (
    <div
      style={{
        margin: '10px 0 14px 0',
        borderRadius: '12px',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(15, 23, 42, 0.6) 100%)',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(8px)'
      }}
    >
      {/* Header bar */}
      <div
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 14px',
          background: isExpanded ? 'rgba(30, 41, 59, 0.7)' : 'rgba(30, 41, 59, 0.4)',
          borderBottom: isExpanded ? '1px solid rgba(245, 158, 11, 0.2)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(30, 41, 59, 0.85)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isExpanded ? 'rgba(30, 41, 59, 0.7)' : 'rgba(30, 41, 59, 0.4)';
        }}
      >
        {/* Left side: Icon, title, badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.15) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24'
            }}
          >
            {isLoading ? (
              <BrainCircuit size={14} className="animate-spin" />
            ) : (
              <Lightbulb size={14} />
            )}
          </div>

          <span style={{ fontSize: '12px', fontWeight: '700', color: '#fbbf24', letterSpacing: '0.01em' }}>
            {isLoading
              ? 'Reasoning in progress...'
              : duration
              ? `Thought for ${duration}s`
              : 'Reasoning Process'}
          </span>

          {/* Tokens / Chars badge */}
          {charCount > 0 && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 7px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#fcd34d',
                fontFamily: 'JetBrains Mono, monospace'
              }}
            >
              ~{approxTokens} tokens ({charCount.toLocaleString()} chars)
            </span>
          )}

          {/* OpenAI Standard tag */}
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#a5b4fc',
              fontWeight: '600'
            }}
          >
            o1 / R1 Standard
          </span>
        </div>

        {/* Right side: Actions (Copy, Toggle) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {thinking && (
            <button
              type="button"
              onClick={handleCopy}
              title="Salin proses reasoning"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${copied ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                color: copied ? '#34d399' : '#94a3b8',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!copied) e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                if (!copied) e.currentTarget.style.color = '#94a3b8';
              }}
            >
              {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
              <span>{copied ? 'Tersalin' : 'Salin'}</span>
            </button>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: '600',
              color: '#94a3b8'
            }}
          >
            <span>{isExpanded ? 'Tutup' : 'Lihat'}</span>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>
      </div>

      {/* Expanded Reasoning Body */}
      {isExpanded && (
        <div
          style={{
            padding: '14px 16px',
            fontSize: '12px',
            lineHeight: '1.7',
            color: '#cbd5e1',
            fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '360px',
            overflowY: 'auto',
            background: 'rgba(10, 15, 29, 0.75)',
            borderLeft: '3px solid rgba(245, 158, 11, 0.6)'
          }}
        >
          {thinking || (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontStyle: 'italic' }}>
              <Sparkles size={14} className="animate-spin" />
              <span>Memproses penalaran bertahap...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
