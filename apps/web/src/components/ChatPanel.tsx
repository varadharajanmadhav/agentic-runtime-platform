import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { Send, Loader2, CircleStop, FileText, Terminal as TerminalIcon, Globe, Search, Cpu, GitBranch, Wrench, Pencil, FilePlus, CheckCircle2, Paperclip, X } from 'lucide-react';

const INLINE_TOOL_LABELS: Record<string, { label: string; color: string }> = {
  read_file:       { label: 'read',       color: '#60a5fa' },
  write_file:      { label: 'write',      color: '#34d399' },
  list_dir:        { label: 'list',       color: '#a78bfa' },
  run_terminal:    { label: 'run',        color: '#fb923c' },
  run_command:     { label: 'run',        color: '#fb923c' },
  search_code:     { label: 'search',     color: '#f472b6' },
  web_search:      { label: 'web',        color: '#38bdf8' },
  grep_search:     { label: 'grep',       color: '#e879f9' },
  get_diagnostics: { label: 'diagnose',   color: '#f59e0b' },
  create_file:     { label: 'create',     color: '#4ade80' },
  delete_file:     { label: 'delete',     color: '#f87171' },
  move_file:       { label: 'move',       color: '#fbbf24' },
  git_log:         { label: 'log',        color: '#06b6d4' },
  git_show:        { label: 'commit',     color: '#0d9488' },
  dotnet_build:    { label: 'build',      color: '#8b5cf6' },
  dotnet_test:     { label: 'test',       color: '#ec4899' },
  npm_run:         { label: 'npm run',    color: '#eab308' },
  npm_install:     { label: 'npm install', color: '#10b981' },
  default:         { label: 'tool',       color: '#94a3b8' },
};

function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 8, height: 8 }}>
      <span style={{
        position: 'absolute', width: '100%', height: '100%', borderRadius: '50%',
        background: color, opacity: 0.4, animation: 'ping 1.4s ease-in-out infinite',
      }} />
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, position: 'relative' }} />
    </span>
  );
}

function ToolPill({ toolName, isExecuting }: { toolName: string; isExecuting?: boolean }) {
  const cfg = INLINE_TOOL_LABELS[toolName] || INLINE_TOOL_LABELS.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 6px', borderRadius: 3, fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace',
      background: `${cfg.color}18`,
      color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      lineHeight: '18px',
    }}>
      {isExecuting && <span style={{ width: 4, height: 4, borderRadius: '50%', background: cfg.color }} />}
      [{cfg.label}]
    </span>
  );
}

function getToolCalls(evts: any[]): string[] {
  const names = new Set<string>();
  for (const e of evts) {
    if (e.type === 'tool_called') {
      const name = e.payload?.toolName || e.payload?.metadata?.toolName;
      if (name) names.add(name);
    }
  }
  return Array.from(names);
}

export function ChatPanel() {
  const {
    messages, activeSessionId, setActiveSession, createSession,
    sendMessage, isStreaming, streamingText, events,
    cancelActiveTask, sessions, activeTaskId, tasks,
    selectedComplexity, setSelectedComplexity, settings,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; path?: string; isWorkspaceFile: boolean }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 1024 * 1024) continue;
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        });
        setAttachments(prev => [...prev, { name: file.name, content: text, isWorkspaceFile: false }]);
      } catch (err) { console.error(err); }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;

    let content = input.trim();
    if (attachments.length > 0) {
      content += '\n\n### Attached Files:\n';
      attachments.forEach(att => {
        content += `\n---\nFile: ${att.name}\n\`\`\`\n${att.content}\n\`\`\`\n`;
      });
    }

    setInput('');
    setAttachments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSession('New Conversation', undefined);
        targetSessionId = session.id;
        await setActiveSession(session.id);
      } catch (err) {
        return;
      }
    }

    await sendMessage(targetSessionId, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleCancel = async () => {
    await cancelActiveTask();
  };

  if (!activeSessionId && sessions.length > 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 14,
      }}>
        Select a session from the sidebar
      </div>
    );
  }

  const currentToolCalls = isStreaming ? getToolCalls(events) : [];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 100px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {messages.length === 0 && !isStreaming ? (
            <div style={{ marginTop: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Agent</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
                <MarkdownRenderer content="Hello! How can I help you today?" />
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={{ marginTop: 24 }}>
                {msg.role === 'user' ? (
                  <div style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Agent</span>
                      {msg.model && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{msg.model}</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {isStreaming && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <PulsingDot color="var(--accent-primary)" />
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Agent</span>
                {activeTaskId && tasks.find(t => t.id === activeTaskId) && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>working</span>
                )}
              </div>

              {currentToolCalls.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {currentToolCalls.map(name => (
                    <ToolPill key={name} toolName={name} isExecuting />
                  ))}
                </div>
              )}

              <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
                <MarkdownRenderer content={streamingText} />
                <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--text-primary)', marginLeft: 4, animation: 'pulse 1s infinite' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', padding: '16px 24px',
        background: 'linear-gradient(transparent, var(--bg-primary) 40%)',
        pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 800,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {settings && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
              <Cpu size={10} style={{ color: 'var(--text-muted)' }} />
              <select
                value={selectedComplexity}
                onChange={e => setSelectedComplexity(e.target.value as 'low' | 'medium' | 'high')}
                style={{
                  fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                  color: 'var(--text-muted)', background: 'transparent',
                  border: 'none', outline: 'none', cursor: 'pointer',
                  padding: 0,
                }}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
                {settings.models[selectedComplexity]?.model ?? '?'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>·</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
                {settings.models[selectedComplexity]?.provider ?? '?'}
              </span>
            </div>
          )}
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flex: 1 }}>
            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, position: 'absolute', bottom: '100%', left: 12, marginBottom: 8 }}>
                {attachments.map((att, idx) => (
                  <div key={idx} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '2px 6px', fontSize: 11, color: 'var(--text-secondary)',
                  }}>
                    <FileText size={10} style={{ color: 'var(--text-muted)' }} />
                    <span>{att.name}</span>
                    <button type="button" onClick={() => removeAttachment(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              placeholder="Ask anything..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                background: 'transparent',
                padding: '4px 0',
                fontSize: 14,
                lineHeight: 1.5,
                minHeight: 24,
                maxHeight: 200,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: 4, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                <Paperclip size={14} />
              </button>
              {isStreaming && (
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 4,
                    color: '#ef4444',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontFamily: 'inherit',
                  }}
                >
                  <CircleStop size={12} />
                  Stop
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                style={{
                  background: input.trim() && !isStreaming ? 'var(--accent-primary)' : 'var(--bg-hover)',
                  color: input.trim() && !isStreaming ? 'white' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                <Send size={12} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
