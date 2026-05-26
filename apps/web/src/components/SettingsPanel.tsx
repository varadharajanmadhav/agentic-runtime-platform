import { useEffect, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { 
  Settings, 
  Cpu, 
  Key, 
  Palette, 
  Save, 
  CheckCircle2, 
  ShieldAlert, 
  Sliders, 
  FolderMinus,
  Check
} from 'lucide-react';

type TabId = 'control' | 'safety' | 'models' | 'keys' | 'exclusions' | 'appearance';

export function SettingsPanel() {
  const { 
    settings, 
    saveSettings, 
    theme, 
    setTheme,
    maxSteps,
    setMaxSteps,
    requireApproval,
    setRequireApproval,
    systemPromptInstructions,
    setSystemPromptInstructions,
    indexingExcludes,
    setIndexingExcludes
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabId>('control');

  // Existing Model state
  const [lowModel, setLowModel] = useState('qwen2.5-coder:7b');
  const [medModel, setMedModel] = useState('qwen2.5-coder:32b');
  const [highModel, setHighModel] = useState('qwen2.5-coder:32b');
  const [embedModel, setEmbedModel] = useState('nomic-embed-text');

  // Model URL overrides state
  const [lowBaseUrl, setLowBaseUrl] = useState('');
  const [medBaseUrl, setMedBaseUrl] = useState('');
  const [highBaseUrl, setHighBaseUrl] = useState('');
  const [embedBaseUrl, setEmbedBaseUrl] = useState('');

  // Available models by endpoint URL
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});

  // Existing Key state
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');

  // Load available models for a given base URL override
  const fetchAvailableModels = async (baseUrlOverride: string) => {
    const resolvedUrl = baseUrlOverride || ollamaBaseUrl || '';
    if (!resolvedUrl.trim()) return;

    try {
      const token = localStorage.getItem('arp_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const queryUrl = `${API_URL}/api/models/local-models?baseUrl=${encodeURIComponent(resolvedUrl)}`;
      const res = await fetch(queryUrl, { headers });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAvailableModels(prev => ({
          ...prev,
          [resolvedUrl]: json.data
        }));
      }
    } catch (err) {
      console.error('Failed to fetch available models for endpoint:', resolvedUrl, err);
    }
  };

  const getModelOptions = (modelBaseUrl: string) => {
    const resolvedUrl = modelBaseUrl || ollamaBaseUrl;
    return availableModels[resolvedUrl] || [];
  };

  // Extended state local hooks (saved alongside other settings)
  const [localMaxSteps, setLocalMaxSteps] = useState(20);
  const [localRequireApproval, setLocalRequireApproval] = useState(false);
  const [localInstructions, setLocalInstructions] = useState('');
  const [localExcludes, setLocalExcludes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync settings when loaded
  useEffect(() => {
    if (settings) {
      setLowModel(settings.models?.low?.model || 'qwen2.5-coder:7b');
      setMedModel(settings.models?.medium?.model || 'qwen2.5-coder:32b');
      setHighModel(settings.models?.high?.model || 'qwen2.5-coder:32b');
      setEmbedModel(settings.models?.embedding?.model || 'nomic-embed-text');

      setLowBaseUrl(settings.models?.low?.ollamaBaseUrl || '');
      setMedBaseUrl(settings.models?.medium?.ollamaBaseUrl || '');
      setHighBaseUrl(settings.models?.high?.ollamaBaseUrl || '');
      setEmbedBaseUrl(settings.models?.embedding?.ollamaBaseUrl || '');

      setOllamaBaseUrl(settings.keys?.ollamaBaseUrl || '');
    }
  }, [settings]);

  // Automatically fetch models for the currently configured base URLs
  useEffect(() => {
    const lowUrl = lowBaseUrl || ollamaBaseUrl;
    const medUrl = medBaseUrl || ollamaBaseUrl;
    const highUrl = highBaseUrl || ollamaBaseUrl;
    const embedUrl = embedBaseUrl || ollamaBaseUrl;

    const urls = Array.from(new Set([lowUrl, medUrl, highUrl, embedUrl])).filter(Boolean);

    const timer = setTimeout(() => {
      urls.forEach(url => {
        if (url) {
          fetchAvailableModels(url);
        }
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [lowBaseUrl, medBaseUrl, highBaseUrl, embedBaseUrl, ollamaBaseUrl]);

  // Sync extended fields from Zustand on load
  useEffect(() => {
    setLocalMaxSteps(maxSteps);
    setLocalRequireApproval(requireApproval);
    setLocalInstructions(systemPromptInstructions);
    setLocalExcludes(indexingExcludes);
  }, [maxSteps, requireApproval, systemPromptInstructions, indexingExcludes]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    // Save extended configurations to Zustand store & local storage
    setMaxSteps(localMaxSteps);
    setRequireApproval(localRequireApproval);
    setSystemPromptInstructions(localInstructions);
    setIndexingExcludes(localExcludes);

    // Save model routing & keys to API backend
    const models = {
      low: { provider: 'ollama', model: lowModel, ollamaBaseUrl: lowBaseUrl || undefined },
      medium: { provider: 'ollama', model: medModel, ollamaBaseUrl: medBaseUrl || undefined },
      high: { provider: 'ollama', model: highModel, ollamaBaseUrl: highBaseUrl || undefined },
      embedding: { provider: 'ollama', model: embedModel, ollamaBaseUrl: embedBaseUrl || undefined }
    };

    const keys = {
      ollamaBaseUrl: ollamaBaseUrl,
    };

    const result = await saveSettings(models as any, keys as any);
    setSaving(false);
    if (result.success) {
      setSaveSuccess(true);
      setError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setError(result.error || 'Failed to save settings');
    }
  };

  // Swatch configuration for Appearance preview
  const THEME_SWATCHES = [
    { id: 'obsidian', name: 'Obsidian Dark', bg: '#090d16', panel: '#0f1524', text: '#cbd5e1', accent: '#6366f1' },
    { id: 'nord', name: 'Nord Dark', bg: '#232831', panel: '#2e3440', text: '#e5e9f0', accent: '#88c0d0' },
    { id: 'matrix', name: 'Matrix Terminal', bg: '#040604', panel: '#0a0d0a', text: '#99cc9f', accent: '#10b981' },
    { id: 'midnight', name: 'Midnight Onyx', bg: '#0a0a09', panel: '#141412', text: '#d6d3d1', accent: '#d97706' },
    { id: 'light-glass', name: 'Glass Light', bg: '#f8fafc', panel: '#ffffff', text: '#334155', accent: '#4f46e5' },
    { id: 'light-nord', name: 'Nordic Snow', bg: '#eceff4', panel: '#ffffff', text: '#3b4252', accent: '#5e81ac' },
  ];

  const sidebarTabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'control', label: 'Agent Control', icon: <Sliders size={15} /> },
    { id: 'safety', label: 'Execution Safety', icon: <ShieldAlert size={15} /> },
    { id: 'models', label: 'Local Models', icon: <Cpu size={15} /> },
    { id: 'keys', label: 'Local Endpoint', icon: <Key size={15} /> },
    { id: 'exclusions', label: 'Index Exclusions', icon: <FolderMinus size={15} /> },
    { id: 'appearance', label: 'Appearance Theme', icon: <Palette size={15} /> },
  ];

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg-primary)'
    }}>
      {/* 2-Column Settings View */}
      <div style={{
        maxWidth: '1000px',
        width: '100%',
        margin: '24px auto',
        padding: '0 24px',
        display: 'flex',
        gap: '24px',
        height: 'calc(100% - 48px)',
      }}>
        
        {/* Settings Navigation Sidebar */}
        <aside style={{
          width: '220px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flexShrink: 0
        }}>
          <div style={{ padding: '0 12px 12px 12px' }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'Outfit, sans-serif',
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Settings size={20} style={{ color: 'var(--accent-primary)' }} />
              Settings
            </h2>
          </div>

          {sidebarTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: '8px',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </aside>

        {/* Tab Content Panel */}
        <form 
          onSubmit={handleSaveSettings} 
          style={{
            flex: 1,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Header section of the content card */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {sidebarTabs.find(t => t.id === activeTab)?.label}
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Configure {sidebarTabs.find(t => t.id === activeTab)?.label.toLowerCase()} preferences.
              </p>
            </div>
            {saveSuccess && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--success)',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500
              }}>
                <CheckCircle2 size={13} /> Saved
              </div>
            )}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--error, #ef4444)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500
              }}>
                <ShieldAlert size={13} /> {error}
              </div>
            )}
          </div>

          {/* Form fields main scrolling body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            
            {/* ─── TAB 1: AGENT CONTROL ───────────────────────────────────── */}
            {activeTab === 'control' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Max Tool Execution Steps
                  </label>
                  <input 
                    type="number"
                    min={1}
                    max={100}
                    className="input-base" 
                    style={{ width: '120px' }} 
                    value={localMaxSteps} 
                    onChange={e => setLocalMaxSteps(Number(e.target.value))} 
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Limits the maximum step iterations an agent can process for a single task (default is 20). Prevents runaway loops.
                  </p>
                </div>

                <div className="divider" />

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Custom Agent Instructions Profile
                  </label>
                  <textarea 
                    className="input-base" 
                    style={{ 
                      width: '100%', 
                      height: '140px', 
                      resize: 'vertical',
                      fontFamily: 'Consolas, monospace',
                      fontSize: '12px',
                      lineHeight: 1.5,
                      padding: '10px 12px'
                    }} 
                    value={localInstructions} 
                    onChange={e => setLocalInstructions(e.target.value)} 
                    placeholder="e.g. Always write tests. Follow functional python coding standards. Write strict TypeScript."
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Additional instructions appended to the agent's system prompt during task execution.
                  </p>
                </div>
              </div>
            )}

            {/* ─── TAB 2: EXECUTION SAFETY ────────────────────────────────── */}
            {activeTab === 'safety' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <input
                    type="checkbox"
                    id="requireApproval"
                    checked={localRequireApproval}
                    onChange={e => setLocalRequireApproval(e.target.checked)}
                    style={{
                      marginTop: '4px',
                      cursor: 'pointer',
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--accent-primary)'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <label 
                      htmlFor="requireApproval"
                      style={{ 
                        display: 'block', 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      Require Interactive Approval
                    </label>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                      When checked, the backend agent will pause and prompt for confirmation before executing file writes or terminal commands. Safe mode for production workspaces.
                    </span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(245, 158, 11, 0.05)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '11px',
                  color: 'var(--warning)',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    Note: Running arbitrary CLI tasks or modifying system configuration files without Interactive Approval can result in modifications to your local environment.
                  </span>
                </div>
              </div>
            )}

            {/* ─── TAB 3: MODELS & PROVIDERS ──────────────────────────────── */}
            {activeTab === 'models' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Low */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Low Complexity Tasks</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select 
                      className="input-base" 
                      style={{ minWidth: '140px', cursor: 'pointer' }}
                      value="ollama" 
                      onChange={() => {}}
                    >
                      <option value="ollama">Ollama / Local</option>
                    </select>
                    <input 
                      className="input-base" 
                      style={{ flex: 1 }} 
                      value={lowModel} 
                      onChange={e => setLowModel(e.target.value)} 
                      placeholder="Model name" 
                      list="low-models-list"
                    />
                    <datalist id="low-models-list">
                      {getModelOptions(lowBaseUrl).map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <input 
                      className="input-base" 
                      style={{ width: '240px' }} 
                      value={lowBaseUrl} 
                      onChange={e => setLowBaseUrl(e.target.value)} 
                      placeholder="Base URL override (optional)" 
                    />
                  </div>
                </div>

                {/* Medium */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Medium Complexity Tasks</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select 
                      className="input-base" 
                      style={{ minWidth: '140px', cursor: 'pointer' }}
                      value="ollama" 
                      onChange={() => {}}
                    >
                      <option value="ollama">Ollama / Local</option>
                    </select>
                    <input 
                      className="input-base" 
                      style={{ flex: 1 }} 
                      value={medModel} 
                      onChange={e => setMedModel(e.target.value)} 
                      placeholder="Model name" 
                      list="med-models-list"
                    />
                    <datalist id="med-models-list">
                      {getModelOptions(medBaseUrl).map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <input 
                      className="input-base" 
                      style={{ width: '240px' }} 
                      value={medBaseUrl} 
                      onChange={e => setMedBaseUrl(e.target.value)} 
                      placeholder="Base URL override (optional)" 
                    />
                  </div>
                </div>

                {/* High */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>High Complexity Tasks</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select 
                      className="input-base" 
                      style={{ minWidth: '140px', cursor: 'pointer' }}
                      value="ollama" 
                      onChange={() => {}}
                    >
                      <option value="ollama">Ollama / Local</option>
                    </select>
                    <input 
                      className="input-base" 
                      style={{ flex: 1 }} 
                      value={highModel} 
                      onChange={e => setHighModel(e.target.value)} 
                      placeholder="Model name" 
                      list="high-models-list"
                    />
                    <datalist id="high-models-list">
                      {getModelOptions(highBaseUrl).map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <input 
                      className="input-base" 
                      style={{ width: '240px' }} 
                      value={highBaseUrl} 
                      onChange={e => setHighBaseUrl(e.target.value)} 
                      placeholder="Base URL override (optional)" 
                    />
                  </div>
                </div>

                {/* Embedding */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Embedding Model (RAG)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select 
                      className="input-base" 
                      style={{ minWidth: '140px', cursor: 'pointer' }}
                      value="ollama" 
                      onChange={() => {}}
                    >
                      <option value="ollama">Ollama / Local</option>
                    </select>
                    <input 
                      className="input-base" 
                      style={{ flex: 1 }} 
                      value={embedModel} 
                      onChange={e => setEmbedModel(e.target.value)} 
                      placeholder="Embedding model name" 
                      list="embed-models-list"
                    />
                    <datalist id="embed-models-list">
                      {getModelOptions(embedBaseUrl).map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <input 
                      className="input-base" 
                      style={{ width: '240px' }} 
                      value={embedBaseUrl} 
                      onChange={e => setEmbedBaseUrl(e.target.value)} 
                      placeholder="Base URL override (optional)" 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── TAB 4: API CREDENTIALS ─────────────────────────────────── */}
            {activeTab === 'keys' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Local Model Base URL</label>
                  <input className="input-base" style={{ width: '100%' }} value={ollamaBaseUrl} onChange={e => setOllamaBaseUrl(e.target.value)} placeholder="http://localhost:11434/api or http://localhost:1234/v1" />
                </div>

              </div>
            )}

            {/* ─── TAB 5: INDEX EXCLUSIONS ────────────────────────────────── */}
            {activeTab === 'exclusions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Indexing Exclude Globs
                  </label>
                  <input 
                    type="text"
                    className="input-base" 
                    style={{ width: '100%', fontFamily: 'Consolas, monospace', fontSize: '12px' }} 
                    value={localExcludes} 
                    onChange={e => setLocalExcludes(e.target.value)} 
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                    Comma-separated list of glob file patterns to ignore during codebase context searches and semantic index builds. Default: `**/node_modules/**, **/.git/**, **/dist/**`.
                  </p>
                </div>
              </div>
            )}

            {/* ─── TAB 6: APPEARANCE ───────────────────────────────────────── */}
            {activeTab === 'appearance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Select Interface Theme
                  </label>
                  
                  {/* Theme Preview Swatches */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px'
                  }}>
                    {THEME_SWATCHES.map(sw => {
                      const isSelected = theme === sw.id;
                      return (
                        <div
                          key={sw.id}
                          onClick={() => setTheme(sw.id as any)}
                          style={{
                            background: sw.panel,
                            border: `2px solid ${isSelected ? sw.accent : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            position: 'relative',
                            boxShadow: isSelected ? `0 0 12px ${sw.accent}44` : 'none',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) e.currentTarget.style.borderColor = 'var(--text-muted)';
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: sw.text }}>
                              {sw.name}
                            </span>
                            {isSelected && (
                              <span style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: sw.accent,
                                color: '#ffffff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <Check size={11} strokeWidth={3} />
                              </span>
                            )}
                          </div>
                          
                          {/* Mini Layout Swatch Previews */}
                          <div style={{
                            background: sw.bg,
                            height: '40px',
                            borderRadius: '6px',
                            padding: '6px',
                            display: 'flex',
                            gap: '4px'
                          }}>
                            <div style={{ width: '16px', background: sw.panel, borderRight: `1px solid ${sw.accent}33`, borderRadius: '3px' }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ height: '8px', background: sw.panel, borderRadius: '2px', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                                <div style={{ width: '12px', height: '3px', background: sw.accent, borderRadius: '1px' }} />
                              </div>
                              <div style={{ flex: 1, background: sw.panel, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ width: '80%', height: '3px', background: sw.text, opacity: 0.3, borderRadius: '1px' }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Form Actions Footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0
          }}>
            <button 
              className="btn-primary" 
              type="submit" 
              disabled={saving} 
              style={{ 
                background: 'var(--accent-primary)', 
                color: 'white', 
                border: 'none',
                padding: '8px 18px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <Save size={15} /> {saving ? 'Saving Preferences...' : 'Save Settings'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
