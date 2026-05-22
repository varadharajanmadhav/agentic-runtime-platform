import { useEffect } from 'react';
import { useAppStore } from './store/index.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatPanel } from './components/ChatPanel.js';
import { RightSidebar } from './components/RightSidebar.js';
import { SettingsPanel } from './components/SettingsPanel.js';

export default function App() {
  const { fetchSessions, fetchSettings, sidebarOpen, theme, activePanel } = useAppStore();

  useEffect(() => {
    fetchSessions();
    fetchSettings();
  }, [fetchSessions, fetchSettings]);

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
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--bg-primary)'
      }}>
        {/* Main Content Area */}
        {activePanel === 'settings' ? <SettingsPanel /> : <ChatPanel />}
        
        {/* Right Info Area */}
        <RightSidebar />
      </main>
    </div>
  );
}
