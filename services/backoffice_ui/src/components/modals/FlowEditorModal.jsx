import React, { useState, useEffect } from 'react';
import { 
  X, GitMerge, Plus, Trash2, ArrowDown, ShieldCheck, Zap, Share2, Layers, CheckCircle2,
  GripVertical, ChevronUp, ChevronDown
} from 'lucide-react';
import api from '../../api/client';

export default function FlowEditorModal({ 
  isOpen = true, 
  onClose, 
  onSuccess, 
  onSaved, 
  initialFlow = null, 
  flow = null, 
  defaultPrompt = '' 
}) {
  const [name, setName] = useState('');
  const [promptPattern, setPromptPattern] = useState('');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [intentCategory, setIntentCategory] = useState('profiling');
  const [validityPriorityRule, setValidityPriorityRule] = useState('PRIORITIZE_HIGHEST_VALIDITY');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [apiTools, setApiTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  const activeFlow = initialFlow || flow;

  const handleSuccess = (savedData) => {
    if (typeof onSuccess === 'function') onSuccess(savedData);
    if (typeof onSaved === 'function') onSaved(savedData);
    if (typeof onClose === 'function') onClose();
  };

  useEffect(() => {
    const fetchTools = async () => {
      setToolsLoading(true);
      try {
        const res = await api.get('/knowledge/api-tools');
        setApiTools(res.data?.tools || []);
      } catch (err) {
        console.error('Error fetching tools:', err);
      } finally {
        setToolsLoading(false);
      }
    };
    if (isOpen) {
      fetchTools();
    }

    const target = initialFlow || flow;
    if (target) {
      setName(target.name || '');
      setPromptPattern(target.prompt_pattern || '');
      setTriggerKeywords(
        Array.isArray(target.trigger_keywords) 
          ? target.trigger_keywords.join(', ') 
          : (target.trigger_keywords || '')
      );
      setIntentCategory(target.intent_category || 'profiling');
      setValidityPriorityRule(target.validity_priority_rule || 'PRIORITIZE_HIGHEST_VALIDITY');
      setDescription(target.description || '');

      const rawSteps = target.steps && target.steps.length > 0 ? target.steps : [];
      if (rawSteps.length > 0) {
        const normalized = rawSteps.map((s, idx) => ({
          order: s.order || s.step_order || idx + 1,
          action: s.action || s.action_type || 'tool_call',
          target: s.target || '',
          description: s.description || s.title || '',
          required: s.required !== undefined 
            ? s.required 
            : (s.priority === 'MANDATORY' || s.priority === 'REQUIRED' || s.priority !== 'OPTIONAL'),
          parameters_mapping: s.parameters_mapping || {}
        }));
        setSteps(normalized);
      } else {
        setSteps([
          { order: 1, action: 'tool_call', target: 'api_tool', description: 'Eksekusi live tool database/API resmi', required: true }
        ]);
      }
    } else {
      setName(defaultPrompt ? `Alur Otomatis untuk: ${defaultPrompt.slice(0, 35)}...` : '');
      setPromptPattern(defaultPrompt ? defaultPrompt.trim() : '');
      setTriggerKeywords('');
      setIntentCategory('profiling');
      setValidityPriorityRule('PRIORITIZE_HIGHEST_VALIDITY');
      setDescription(defaultPrompt ? `Alur perolehan informasi yang diingat dari pengujian prompt: "${defaultPrompt}"` : '');
      setSteps([
        { order: 1, action: 'tool_call', target: 'api_dukcapil_lookup', description: 'Query basis data resmi tingkat 1 untuk fakta primer', required: true },
        { order: 2, action: 'graph_traversal', target: 'neo4j_entity_network', description: 'Telusuri jejaring kepemilikan dan relasi subjek pada Knowledge Graph', required: false },
        { order: 3, action: 'vector_search', target: 'chromadb_vector_store', description: 'Ambil berkas dokumen pendukung pada Bank Data Vektor', required: false },
        { order: 4, action: 'synthesis_rule', target: 'validity_ranking', description: 'Terapkan hierarki validitas: data resmi mutlak mengesampingkan dokumen sekunder', required: true }
      ]);
    }
  }, [isOpen, initialFlow, flow, defaultPrompt]);

  if (!isOpen && isOpen !== undefined) return null;

  const handleAddStep = () => {
    const nextOrder = steps.length + 1;
    setSteps([
      ...steps,
      {
        order: nextOrder,
        action: 'tool_call',
        target: '',
        description: '',
        required: true
      }
    ]);
  };

  const handleRemoveStep = (index) => {
    const updated = steps.filter((_, i) => i !== index).map((s, idx) => ({ ...s, order: idx + 1, step_order: idx + 1 }));
    setSteps(updated);
  };

  const handleStepChange = (index, field, value) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  };

  const handleMoveStep = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setSteps(updated.map((s, idx) => ({ ...s, order: idx + 1, step_order: idx + 1 })));
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e, index) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...steps];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(dropIndex, 0, draggedItem);

    setSteps(updated.map((s, idx) => ({ ...s, order: idx + 1, step_order: idx + 1 })));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const keywordsArray = triggerKeywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const target = initialFlow || flow;
      const targetId = target?.id || target?.flow_id || target?.flow?.id;

      const formattedSteps = steps.map((s, idx) => ({
        step_order: idx + 1,
        order: idx + 1,
        title: s.description || `Langkah ${idx + 1}`,
        description: s.description || '',
        action_type: s.action || 'tool_call',
        action: s.action || 'tool_call',
        target: s.target || '',
        priority: s.required !== false ? 'MANDATORY' : 'OPTIONAL',
        required: s.required !== false,
        parameters_mapping: s.parameters_mapping || {}
      }));

      const payload = {
        name,
        prompt_pattern: promptPattern,
        trigger_keywords: keywordsArray,
        intent_category: intentCategory,
        validity_priority_rule: validityPriorityRule,
        description,
        steps: formattedSteps,
        is_active: true
      };

      let savedResult = null;
      if (targetId) {
        const res = await api.put(`/orchestrator/flows/${targetId}`, payload);
        savedResult = res.data?.flow || res.data;
      } else {
        const res = await api.post('/orchestrator/flows', payload);
        savedResult = res.data?.flow || res.data;
      }

      handleSuccess(savedResult);
    } catch (err) {
      alert('Gagal menyimpan alur perolehan informasi: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const renderParameterMapping = (step, idx) => {
    if (idx === 0 || step.action !== 'tool_call' || !step.target) return null;
    
    const currentTool = apiTools.find(t => t.name === step.target);
    if (!currentTool) return null;

    let inputParams = [];
    if (currentTool.source_type === 'mcp' && currentTool.input_schema?.properties) {
      inputParams = Object.keys(currentTool.input_schema.properties).map(k => ({
        name: k,
        type: currentTool.input_schema.properties[k].type || 'string'
      }));
    } else if (currentTool.parameters && currentTool.parameters.length > 0) {
      inputParams = currentTool.parameters;
    }

    if (inputParams.length === 0) return null;

    const availableOutputs = [];
    for (let i = 0; i < idx; i++) {
      const prevStep = steps[i];
      if (prevStep.action === 'tool_call' && prevStep.target) {
        const pTool = apiTools.find(t => t.name === prevStep.target);
        if (pTool && pTool.field_definitions && pTool.field_definitions.length > 0) {
          pTool.field_definitions.forEach(f => {
            const fName = (typeof f === 'string') ? f : (f.name || f.field_name || f.key || 'unknown_field');
            availableOutputs.push({
              stepIdx: i,
              toolName: pTool.name,
              fieldName: fName,
              label: `Langkah ${i + 1} (${pTool.title || pTool.name}): ${fName}`
            });
          });
        } else if (pTool) {
          availableOutputs.push({
            stepIdx: i,
            toolName: pTool.name,
            fieldName: 'OUTPUT_DATA',
            label: `Langkah ${i + 1} (${pTool.title || pTool.name}): Seluruh Output`
          });
        }
      }
    }

    if (availableOutputs.length === 0) return null;

    const currentMapping = step.parameters_mapping || {};

    return (
      <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#94a3b8' }}>
          Pemetaan Parameter (Ambil dari langkah sebelumnya):
        </div>
        {inputParams.map((param, pIdx) => {
          const paramName = (typeof param === 'string') ? param : (param.name || param.key || param.field || param.parameter || `unknown_${pIdx}`);
          return (
            <div key={paramName} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', width: '120px', minWidth: '120px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={paramName}>
                {paramName}
              </div>
              <select
                className="input-field font-mono"
                value={currentMapping[paramName] || ''}
                onChange={(e) => {
                  const newMapping = { ...currentMapping, [paramName]: e.target.value };
                  handleStepChange(idx, 'parameters_mapping', newMapping);
                }}
                style={{ fontSize: '11px', padding: '4px 6px', flex: 1, minWidth: '150px', backgroundColor: '#1e293b', color: '#fff' }}
              >
                <option value="" style={{ backgroundColor: '#1e293b', color: '#fff' }}>-- Manual / Dinamis dari Chat --</option>
                {availableOutputs.map(out => (
                  <option key={`${out.stepIdx}-${out.fieldName}`} value={`step_${out.stepIdx}.${out.fieldName}`} style={{ backgroundColor: '#1e293b', color: '#fff' }}>
                    {out.label}
                  </option>
                ))}
              </select>
              {currentMapping[paramName] && (
                <div style={{ fontSize: '10px', color: '#10b981', marginLeft: '6px' }}>
                  ✓ {currentMapping[paramName].split('.').pop()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          padding: '30px', 
          maxWidth: '820px', 
          maxHeight: '90vh', 
          overflowY: 'auto' 
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(99, 102, 241, 0.35)'
            }}>
              <GitMerge size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>
                {activeFlow ? 'Sunting Alur Perolehan Informasi' : 'Buat Alur Perolehan Informasi Baru (Prompt Flow Memory)'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Alur ini akan diingat oleh Data Orchestrator sebagai acuan baku ketika menerima prompt serupa.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Tutup Modal"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Flow Name & Intent */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Nama Alur Penelusuran *
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Contoh: Alur Profiling NIK & Rekening Terpadu"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Kategori Intent *
              </label>
              <select
                className="input-field"
                value={intentCategory}
                onChange={(e) => setIntentCategory(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="profiling">👤 Profiling Identitas & Subjek</option>
                <option value="aset">🏡 Penelusuran Aset Pertanahan & Properti</option>
                <option value="relasi">🏢 Jaringan Afiliasi Korporasi & Rekening</option>
                <option value="regulasi">⚖️ Regulasi Hukum & SOP Operasional</option>
                <option value="umum">🔍 Investigasi Umum / Multidimensi</option>
              </select>
            </div>
          </div>

          {/* Prompt Pattern & Trigger Keywords */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Pola Regex / Kalimat Pemicu *
              </label>
              <input
                type="text"
                className="input-field font-mono"
                placeholder="Misal: (\b\d{16}\b|profil.*nik)"
                value={promptPattern}
                onChange={(e) => setPromptPattern(e.target.value)}
                required
                style={{ fontSize: '12px' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Regex atau frasa pemicu yang mencocokkan input pengguna
              </span>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Kata Kunci Pemicu (Pisahkan koma)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="nik, dukcapil, identitas, ktp"
                value={triggerKeywords}
                onChange={(e) => setTriggerKeywords(e.target.value)}
                style={{ fontSize: '12px' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Kata kunci pendukung untuk meningkatkan akurasi pencocokan
              </span>
            </div>
          </div>

          {/* Validity Priority Rule & Description */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Aturan Prioritas Validitas Data
              </label>
              <select
                className="input-field"
                value={validityPriorityRule}
                onChange={(e) => setValidityPriorityRule(e.target.value)}
              >
                <option value="PRIORITIZE_HIGHEST_VALIDITY">Tingkat Validitas Tertinggi Menang Mutlak (Ground Truth)</option>
                <option value="PRIMARY_THEN_CORROBORATE">Data Primer Dahulu, Diperkuat Dokumen Sekunder</option>
                <option value="ALL_WITH_SOURCE_ATTRIBUTION">Tampilkan Semua dengan Label Validitas Masing-masing</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Deskripsi Alur (Opsional)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Penjelasan sasaran dan output alur..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Sequential Steps Builder */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '16px',
            marginTop: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
                  Urutan Tahapan Perolehan Informasi (Sequential Flow Steps)
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddStep}
                style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={13} /> Tambah Tahapan
              </button>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
              💡 Tahan ikon pegangan untuk geser (drag & drop) kartu, atau klik tombol 🔼/🔽 untuk menukar urutan eksekusi langkah.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {steps.map((step, idx) => {
                const actionColors = {
                  tool_call: { color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', icon: Zap, label: 'Tool Real-time' },
                  graph_traversal: { color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)', icon: Share2, label: 'Knowledge Graph' },
                  vector_search: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Layers, label: 'Bank Data Vektor' },
                  synthesis_rule: { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)', icon: ShieldCheck, label: 'Aturan Sintesis' }
                };
                const conf = actionColors[step.action] || actionColors.tool_call;
                const ActionIcon = conf.icon;
                const isDragging = draggedIndex === idx;
                const isDragOver = dragOverIndex === idx && draggedIndex !== idx;

                return (
                  <div 
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={(e) => handleDragLeave(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    style={{
                      background: isDragOver ? 'rgba(99, 102, 241, 0.12)' : isDragging ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.03)',
                      border: isDragOver ? '2px dashed #6366f1' : isDragging ? '1px dashed rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      opacity: isDragging ? 0.45 : 1,
                      transform: isDragOver ? 'translateY(1px) scale(1.005)' : 'none',
                      transition: 'all 0.15s ease',
                      boxShadow: isDragOver ? '0 4px 16px rgba(99, 102, 241, 0.25)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div 
                          title="Tahan dan geser (drag) untuk menukar urutan langkah"
                          style={{
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px',
                            color: 'var(--text-muted)',
                            borderRadius: '4px'
                          }}
                        >
                          <GripVertical size={16} />
                        </div>
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: conf.bg,
                          color: conf.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: '700'
                        }}>
                          {idx + 1}
                        </span>
                        <ActionIcon size={16} color={conf.color} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: conf.color }}>
                          Langkah {idx + 1}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Swap Reorder Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, -1)}
                            disabled={idx === 0}
                            title="Tukar ke atas (Langkah sebelumnya)"
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '4px',
                              color: idx === 0 ? 'rgba(255, 255, 255, 0.2)' : 'var(--text-primary)',
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              padding: '3px 6px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, 1)}
                            disabled={idx === steps.length - 1}
                            title="Tukar ke bawah (Langkah berikutnya)"
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '4px',
                              color: idx === steps.length - 1 ? 'rgba(255, 255, 255, 0.2)' : 'var(--text-primary)',
                              cursor: idx === steps.length - 1 ? 'not-allowed' : 'pointer',
                              padding: '3px 6px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '4px' }}>
                          <input
                            type="checkbox"
                            checked={step.required !== false}
                            onChange={(e) => handleStepChange(idx, 'required', e.target.checked)}
                          />
                          Wajib
                        </label>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px', marginLeft: '4px' }}
                            title="Hapus langkah ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 180px 1fr', gap: '10px', alignItems: 'center' }}>
                      <div>
                        <select
                          className="input-field"
                          value={step.action}
                          onChange={(e) => handleStepChange(idx, 'action', e.target.value)}
                          style={{ fontSize: '11px', padding: '6px' }}
                        >
                          <option value="tool_call">⚡ Tool Call (API/DB)</option>
                          <option value="graph_traversal">🕸️ Knowledge Graph</option>
                          <option value="vector_search">📄 Vektor Dokumen</option>
                          <option value="synthesis_rule">🛡️ Aturan Sintesis</option>
                        </select>
                      </div>
                      <div>
                        {step.action === 'tool_call' && (
                          <select
                            className="input-field font-mono"
                            value={step.target || ''}
                            onChange={(e) => handleStepChange(idx, 'target', e.target.value)}
                            style={{ fontSize: '11px', padding: '6px 8px', width: '100%' }}
                            required
                          >
                            <option value="">-- Pilih Tool --</option>
                            {toolsLoading ? (
                              <option value="" disabled>Memuat tools...</option>
                            ) : (
                              <>
                                {apiTools.map(t => {
                                  const score = t.config?.validity_score !== undefined ? t.config.validity_score : 95;
                                  const tier = t.config?.validity_tier || 'authoritative';
                                  return (
                                    <option key={t.name} value={t.name}>
                                      {t.name} (Validitas: {score}, {tier})
                                    </option>
                                  );
                                })}
                                {step.target && !apiTools.some(t => t.name === step.target) && (
                                  <option value={step.target}>{step.target} (Tidak Ditemukan)</option>
                                )}
                              </>
                            )}
                          </select>
                        )}
                        {step.action === 'graph_traversal' && (
                          <select
                            className="input-field font-mono"
                            value={step.target || ''}
                            onChange={(e) => handleStepChange(idx, 'target', e.target.value)}
                            style={{ fontSize: '11px', padding: '6px 8px' }}
                            required
                          >
                            <option value="">-- Pilih Knowledge Graph --</option>
                            <option value="neo4j_entity_network">neo4j_entity_network</option>
                            <option value="neo4j_corporate_ownership">neo4j_corporate_ownership</option>
                            <option value="neo4j_family_tree">neo4j_family_tree</option>
                          </select>
                        )}
                        {step.action === 'vector_search' && (
                          <select
                            className="input-field font-mono"
                            value={step.target || ''}
                            onChange={(e) => handleStepChange(idx, 'target', e.target.value)}
                            style={{ fontSize: '11px', padding: '6px 8px' }}
                            required
                          >
                            <option value="">-- Pilih Vector Store --</option>
                            <option value="chromadb_vector_store">chromadb_vector_store</option>
                            <option value="milvus_document_search">milvus_document_search</option>
                            <option value="qdrant_knowledge_base">qdrant_knowledge_base</option>
                          </select>
                        )}
                        {step.action === 'synthesis_rule' && (
                          <select
                            className="input-field font-mono"
                            value={step.target || ''}
                            onChange={(e) => handleStepChange(idx, 'target', e.target.value)}
                            style={{ fontSize: '11px', padding: '6px 8px' }}
                            required
                          >
                            <option value="">-- Pilih Aturan Sintesis --</option>
                            <option value="validity_ranking">validity_ranking</option>
                            <option value="temporal_recency">temporal_recency</option>
                            <option value="source_credibility">source_credibility</option>
                            <option value="cross_validation">cross_validation</option>
                          </select>
                        )}
                        {!['tool_call', 'graph_traversal', 'vector_search', 'synthesis_rule'].includes(step.action) && (
                          <input
                            type="text"
                            className="input-field font-mono"
                            placeholder="Target (misal: api_dukcapil_lookup)"
                            value={step.target || ''}
                            onChange={(e) => handleStepChange(idx, 'target', e.target.value)}
                            style={{ fontSize: '11px', padding: '6px 8px' }}
                            required
                          />
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Deskripsi langkah investigasi..."
                          value={step.description || ''}
                          onChange={(e) => handleStepChange(idx, 'description', e.target.value)}
                          style={{ fontSize: '11px', padding: '6px 8px' }}
                          required
                        />
                      </div>
                    </div>
                    {renderParameterMapping(step, idx)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || steps.length === 0}>
              {submitting ? 'Menyimpan...' : (activeFlow ? 'Simpan Perubahan Alur' : 'Simpan Alur ke Memori')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
