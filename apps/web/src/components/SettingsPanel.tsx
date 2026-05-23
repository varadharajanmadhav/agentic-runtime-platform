import { useEffect, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { Settings, Cpu, Key, Palette, Save, CheckCircle2 } from 'lucide-react';

export function SettingsPanel() {
  const { settings, saveSettings, theme, setTheme } = useAppStore();

  const [lowProvider, setLowProvider] = useState('ollama');
  const [lowModel, setLowModel] = useState('qwen2.5-coder:7b');
  const [medProvider, setMedProvider] = useState('ollama');
  const [medModel, setMedModel] = useState('qwen2.5-coder:32b');
  const [highProvider, setHighProvider] = useState('ollama');
  const [highModel, setHighModel] = useState('qwen2.5-coder:32b');
  const [embedProvider, setEmbedProvider] = useState('ollama');
  const [embedModel, setEmbedModel] = useState('nomic-embed-text');

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync settings when loaded
  useEffect(() => {
    if (settings) {
      setLowProvider(settings.models?.low?.provider || 'ollama');
      setLowModel(settings.models?.low?.model || 'qwen2.5-coder:7b');
      setMedProvider(settings.models?.medium?.provider || 'ollama');
      setMedModel(settings.models?.medium?.model || 'qwen2.5-coder:32b');
      setHighProvider(settings.models?.high?.provider || 'ollama');
      setHighModel(settings.models?.high?.model || 'qwen2.5-coder:32b');
      setEmbedProvider(settings.models?.embedding?.provider || 'ollama');
      setEmbedModel(settings.models?.embedding?.model || 'nomic-embed-text');

      setOllamaBaseUrl(settings.keys?.ollamaBaseUrl || '');
      setOpenaiApiKey(settings.keys?.openaiApiKey || '');
      setAnthropicApiKey(settings.keys?.anthropicApiKey || '');
      setGoogleApiKey(settings.keys?.googleApiKey || '');
      setGroqApiKey(settings.keys?.groqApiKey || '');
    }
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    const models = {
      low: { provider: lowProvider, model: lowModel },
      medium: { provider: medProvider, model: medModel },
      high: { provider: highProvider, model: highModel },
      embedding: { provider: embedProvider, model: embedModel }
    };

    const keys = {
      ollamaBaseUrl: ollamaBaseUrl,
      openaiApiKey: openaiApiKey,
      anthropicApiKey: anthropicApiKey,
      googleApiKey: googleApiKey,
      groqApiKey: groqApiKey
    };

    const success = await saveSettings(models as any, keys as any);
    setSaving(false);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      padding: '24px 24px 120px 24px',
      background: 'var(--bg-primary)'
    }}>
      <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'Outfit, sans-serif',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Settings size={26} style={{ color: 'var(--accent-primary)' }} />
              Settings
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Configure intelligence routing, API keys, local URLs, and design preferences.
            </p>
          </div>
          {saveSuccess && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500
            }}>
              <CheckCircle2 size={16} /> Saved Successfully
            </div>
          )}
        </div>

        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: Intelligence Routing */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '12px'
            }}>
              <Cpu size={18} style={{ color: 'var(--accent-primary)' }} />
              Intelligence Routing
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Low */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Low Complexity</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input-base" 
                    style={{ 
                      minWidth: '140px', 
                      background: 'var(--bg-input)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '10px', 
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }} 
                    value={lowProvider} 
                    onChange={e => {
                      const prov = e.target.value;
                      setLowProvider(prov);
                      if (prov === 'openai') setLowModel('gpt-4o-mini');
                      else if (prov === 'anthropic') setLowModel('claude-3-5-haiku-latest');
                      else if (prov === 'google') setLowModel('gemini-1.5-flash');
                      else if (prov === 'ollama') setLowModel('qwen2.5-coder:7b');
                      else if (prov === 'groq') setLowModel('llama-3.3-70b-versatile');
                    }}
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="groq">Groq</option>
                  </select>
                  <input className="input-base" style={{ flex: 1 }} value={lowModel} onChange={e => setLowModel(e.target.value)} placeholder="Model name (e.g. qwen2.5-coder:7b)" />
                </div>
              </div>

              {/* Medium */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Medium Complexity</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input-base" 
                    style={{ 
                      minWidth: '140px', 
                      background: 'var(--bg-input)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '10px', 
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }} 
                    value={medProvider} 
                    onChange={e => {
                      const prov = e.target.value;
                      setMedProvider(prov);
                      if (prov === 'openai') setMedModel('gpt-4o');
                      else if (prov === 'anthropic') setMedModel('claude-3-5-sonnet-latest');
                      else if (prov === 'google') setMedModel('gemini-1.5-pro');
                      else if (prov === 'ollama') setMedModel('qwen2.5-coder:32b');
                      else if (prov === 'groq') setMedModel('llama-3.3-70b-versatile');
                    }}
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="groq">Groq</option>
                  </select>
                  <input className="input-base" style={{ flex: 1 }} value={medModel} onChange={e => setMedModel(e.target.value)} placeholder="Model name (e.g. qwen2.5-coder:32b)" />
                </div>
              </div>

              {/* High */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>High Complexity</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input-base" 
                    style={{ 
                      minWidth: '140px', 
                      background: 'var(--bg-input)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '10px', 
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }} 
                    value={highProvider} 
                    onChange={e => {
                      const prov = e.target.value;
                      setHighProvider(prov);
                      if (prov === 'openai') setHighModel('gpt-4o');
                      else if (prov === 'anthropic') setHighModel('claude-3-5-sonnet-latest');
                      else if (prov === 'google') setHighModel('gemini-1.5-pro');
                      else if (prov === 'ollama') setHighModel('qwen2.5-coder:32b');
                      else if (prov === 'groq') setHighModel('llama-3.3-70b-versatile');
                    }}
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="groq">Groq</option>
                  </select>
                  <input className="input-base" style={{ flex: 1 }} value={highModel} onChange={e => setHighModel(e.target.value)} placeholder="Model name (e.g. qwen2.5-coder:32b)" />
                </div>
              </div>

              {/* Embedding */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Embedding Model</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input-base" 
                    style={{ 
                      minWidth: '140px', 
                      background: 'var(--bg-input)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '10px', 
                      padding: '8px 12px',
                      cursor: 'pointer'
                    }} 
                    value={embedProvider} 
                    onChange={e => {
                      const prov = e.target.value;
                      setEmbedProvider(prov);
                      if (prov === 'openai') setEmbedModel('text-embedding-3-small');
                      else if (prov === 'google') setEmbedModel('text-embedding-004');
                      else if (prov === 'ollama') setEmbedModel('nomic-embed-text');
                    }}
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                  </select>
                  <input className="input-base" style={{ flex: 1 }} value={embedModel} onChange={e => setEmbedModel(e.target.value)} placeholder="Model name (e.g. nomic-embed-text)" />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Credentials & Endpoints */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '12px'
            }}>
              <Key size={18} style={{ color: 'var(--accent-primary)' }} />
              Credentials & Endpoints
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Ollama / LM Studio Base URL</label>
                <input className="input-base" style={{ width: '100%' }} value={ollamaBaseUrl} onChange={e => setOllamaBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Provide the connection endpoint to your local Ollama or LM Studio instance. Default is `http://localhost:11434`.
                </p>
              </div>

              <div className="divider" style={{ margin: '16px 0' }} />

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>OpenAI API Key</label>
                <input 
                  type="password"
                  className="input-base" 
                  style={{ width: '100%' }} 
                  value={openaiApiKey} 
                  onChange={e => setOpenaiApiKey(e.target.value)} 
                  placeholder={openaiApiKey === '*****' ? '••••••••' : 'sk-...'} 
                />
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Required if routing tasks to OpenAI models. Leave empty if unused.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Anthropic API Key</label>
                <input 
                  type="password"
                  className="input-base" 
                  style={{ width: '100%' }} 
                  value={anthropicApiKey} 
                  onChange={e => setAnthropicApiKey(e.target.value)} 
                  placeholder={anthropicApiKey === '*****' ? '••••••••' : 'sk-ant-...'} 
                />
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Required if routing tasks to Anthropic models (e.g. Claude 3.5 Sonnet).
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Google Gemini API Key</label>
                <input 
                  type="password"
                  className="input-base" 
                  style={{ width: '100%' }} 
                  value={googleApiKey} 
                  onChange={e => setGoogleApiKey(e.target.value)} 
                  placeholder={googleApiKey === '*****' ? '••••••••' : 'AIzaSy...'} 
                />
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Required if routing tasks to Gemini models (e.g. Gemini 1.5 Pro/Flash).
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Groq API Key</label>
                <input 
                  type="password"
                  className="input-base" 
                  style={{ width: '100%' }} 
                  value={groqApiKey} 
                  onChange={e => setGroqApiKey(e.target.value)} 
                  placeholder={groqApiKey === '*****' ? '••••••••' : 'gsk_...'} 
                />
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Required if routing tasks to Groq models (e.g. LLaMA 3.3 70B).
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Theme Preferences */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '12px'
            }}>
              <Palette size={18} style={{ color: 'var(--accent-primary)' }} />
              Appearance Theme
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Interface Theme</label>
              <select 
                className="input-base" 
                style={{ width: '100%' }} 
                value={theme} 
                onChange={e => setTheme(e.target.value as any)}
              >
                <option value="obsidian">Obsidian Dark (Indigo Accent)</option>
                <option value="nord">Nord Cool Grey (Ice Blue Accent)</option>
                <option value="matrix">Matrix Hacker (Neon Green Accent)</option>
                <option value="midnight">Midnight Onyx (Warm Amber Accent)</option>
                <option value="light-glass">Glass Light (Indigo Accent)</option>
                <option value="light-nord">Nordic Snow (Steel Blue Accent)</option>
              </select>
            </div>
          </div>

          {/* Actions Footer */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="btn-primary" type="submit" disabled={saving} style={{ 
              background: 'var(--accent-primary)', 
              color: 'white', 
              border: 'none',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}>
              <Save size={16} /> {saving ? 'Saving Configurations...' : 'Save Configurations'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
