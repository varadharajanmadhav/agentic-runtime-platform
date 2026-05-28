import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../store/index.js';
import { Terminal as TerminalIcon, RefreshCw, Trash2 } from 'lucide-react';

export function TerminalPanel() {
  const { events, activeTaskId, tasks, sessions, activeSessionId } = useAppStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const printedEventIds = useRef<Set<string>>(new Set());

  const activeTask = tasks.find(t => t.id === activeTaskId);
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const workspaceDir = activeSession?.workspaceDir ?? null;

  // Initialize Terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#121214',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#cbd5e1',
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: true,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;

    // Welcome message
    term.writeln('\x1b[1;36m[ARP Terminal Engine v0.1.0]\x1b[0m');
    term.writeln('Console ready. Monitoring active task tool executions and outputs...\r\n');

    // Handle resize
    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (e) {
        // ignore fit issues during layout transitions
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      printedEventIds.current.clear();
    };
  }, []);

  // Print workspace dir when session changes
  useEffect(() => {
    if (!xtermRef.current || !workspaceDir) return;
    xtermRef.current.writeln(`\x1b[90m\x1b[2m$ cd ${workspaceDir}\x1b[0m`);
  }, [activeSessionId, workspaceDir]);

  // Handle activeTask change - clear and reset
  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.clear();
    xtermRef.current.writeln(`\x1b[1;34m[System] Switched to Task: ${activeTask?.title || 'System Feed'}\x1b[0m`);
    if (workspaceDir) xtermRef.current.writeln(`\x1b[90m$ cd ${workspaceDir}\x1b[0m`);
    xtermRef.current.writeln(`\x1b[90mID: ${activeTaskId || 'none'}\x1b[0m\r\n`);
    printedEventIds.current.clear();
  }, [activeTaskId, activeTask?.title]);

  // Handle stream of events
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    events.forEach(e => {
      if (printedEventIds.current.has(e.id)) return;
      printedEventIds.current.add(e.id);

      const timestampStr = e.timestamp ? `\x1b[90m[${new Date(e.timestamp).toLocaleTimeString()}]\x1b[0m ` : '';

      switch (e.type) {
        case 'task_started':
          term.writeln(`${timestampStr}\x1b[1;32m● Task Started: ${activeTask?.title || 'Execution'}\x1b[0m`);
          break;

        case 'task_completed':
          term.writeln(`\r\n${timestampStr}\x1b[1;32m✔ Task Completed Successfully!\x1b[0m`);
          break;

        case 'task_failed':
          const err = (e.payload as any)?.error || 'Unknown error';
          term.writeln(`\r\n${timestampStr}\x1b[1;31m✖ Task Failed: ${err}\x1b[0m`);
          break;

        case 'tool_called': {
          const tool = (e.payload as any)?.toolName || 'tool';
          const input = JSON.stringify((e.payload as any)?.input || {});
          term.writeln(`\r\n${timestampStr}\x1b[1;33m» Executing Tool:\x1b[0m \x1b[36m${tool}\x1b[0m`);
          if (tool === 'run_terminal') {
            const cmd = (e.payload as any)?.input?.command || '';
            term.writeln(`\x1b[32m$ ${cmd}\x1b[0m`);
          } else {
            term.writeln(`\x1b[90mInput: ${input}\x1b[0m`);
          }
          break;
        }

        case 'tool_result': {
          const tool = (e.payload as any)?.toolName || 'tool';
          const success = (e.payload as any)?.success;
          const outputVal = (e.payload as any)?.output;
          
          let content = '';
          if (outputVal) {
            if (typeof outputVal === 'string') {
              content = outputVal;
            } else if (typeof outputVal === 'object') {
              const obj = outputVal as Record<string, any>;
              content = obj.stdout || obj.stderr || JSON.stringify(obj);
            }
          }

          if (success) {
            term.writeln(`\x1b[90m[Tool Result: Success]\x1b[0m`);
          } else {
            term.writeln(`\x1b[31m[Tool Result: Failed]\x1b[0m`);
          }

          if (content.trim()) {
            // Write output lines
            term.writeln(content);
          }
          break;
        }

        case 'error': {
          const errMsg = (e.payload as any)?.message || 'An error occurred';
          term.writeln(`${timestampStr}\x1b[1;31m[Error] ${errMsg}\x1b[0m`);
          break;
        }

        default:
          break;
      }
    });

    // Auto-scroll to bottom
    try {
      if (events.length > 0) {
        term.scrollToBottom();
      }
    } catch (err) {
      // ignore scroll errors
    }
  }, [events, activeTask]);

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      printedEventIds.current.clear();
      xtermRef.current.writeln('\x1b[90mConsole cleared.\x1b[0m\r\n');
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#121214',
      overflow: 'hidden',
    }}>
      {/* Terminal Header */}
      <div style={{
        height: '48px',
        borderBottom: '1px solid #27272a',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#18181b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <TerminalIcon size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Terminal Output {activeTask ? `— ${activeTask.title}` : ''}
            </span>
            {workspaceDir && (
              <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {workspaceDir}
              </span>
            )}
          </div>
          {activeTask?.status === 'executing' && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: '#eab308',
              background: 'rgba(234, 179, 8, 0.1)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(234, 179, 8, 0.2)',
              marginLeft: '8px'
            }}>
              <RefreshCw size={10} className="animate-spin" /> Running
            </span>
          )}
        </div>

        <button
          onClick={handleClear}
          className="btn-ghost"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#a1a1aa',
            borderColor: '#27272a'
          }}
          title="Clear Console"
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>

      {/* Terminal container */}
      <div 
        ref={terminalRef} 
        style={{ 
          flex: 1, 
          padding: '12px',
          overflow: 'hidden',
        }} 
      />
    </div>
  );
}
