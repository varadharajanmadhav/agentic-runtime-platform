import { useEffect } from 'react';
import { useAppStore } from './store/index.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatPanel } from './components/ChatPanel.js';
import { RightSidebar } from './components/RightSidebar.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { TerminalPanel } from './components/TerminalPanel.js';
import { ContextViewerPanel } from './components/ContextViewerPanel.js';
import { Zap, Coins } from 'lucide-react';

export default function App() {
  const { 
    fetchSessions, 
    fetchSettings, 
    sidebarOpen, 
    theme, 
    activePanel, 
    setActivePanel,
    activeSessionId,
    tasks
  } = useAppStore();

  useEffect(() => {
    fetchSessions();
    fetchSettings();
  }, [fetchSessions, fetchSettings]);

  // Calculate session tokens & cost
  const sessionTasks = tasks.filter(t => t.sessionId === activeSessionId);
  const totalTokens = sessionTasks.reduce((sum, t) => sum + (t.totalTokens || 0), 0);
  const totalCost = sessionTasks.reduce((sum, t) => sum + (t.estimatedCostUsd || 0), 0);

  const renderActivePanel = () => {
    switch (activePanel) {
      case 'chat':
      case 'graph':
        return <ChatPanel />;

      case 'terminal':
        return <TerminalPanel />;
      case 'context':
        return <ContextViewerPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <ChatPanel />;
    }
  };

  return (
    <div className={`theme-${theme}`} style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
      width: '100vw'
    }}>
      {sidebarOpen && <Sidebar />}
      
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--bg-primary)'
      }}>
        {/* Workspace Tab Bar / Header */}
        {activeSessionId && activePanel !== 'settings' && (
          <div style={{
            height: '48px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            flexShrink: 0,
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', height: '100%', alignItems: 'center' }}>
              {(['chat', 'terminal', 'context'] as const).map(tab => {
                const isActive = activePanel === tab;
                const labels = {
                  chat: 'Conversation',
                  terminal: 'Execution Terminal',
                  context: 'Context Viewer',
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActivePanel(tab)}
                    style={{
                      height: '32px',
                      padding: '0 12px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      background: isActive ? 'var(--bg-hover)' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                    className={`workspace-tab ${isActive ? 'active' : ''}`}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Token Usage & Cost counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Zap size={13} style={{ color: 'var(--accent-primary)' }} />
                <span>{totalTokens.toLocaleString()} tokens</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Coins size={13} style={{ color: '#eab308' }} />
                <span>${totalCost.toFixed(4)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {renderActivePanel()}
        </div>
      </main>

      {/* Right Info Area */}
      {activePanel !== 'settings' && <RightSidebar />}
    </div>
  );
}
