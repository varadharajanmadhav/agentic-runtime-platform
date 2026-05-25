import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore } from '../store/index.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { 
  Send, 
  Loader2, 
  CircleStop, 
  FileText, 
  Paperclip, 
  X, 
  Sparkles, 
  Cpu, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  Bot,
  CornerDownLeft
} from 'lucide-react';

const INLINE_TOOL_LABELS: Record<string, { label: string; color: string }> = {
  read_file:       { label: 'read file',       color: '#60a5fa' },
  write_file:      { label: 'write code',      color: '#34d399' },
  list_dir:        { label: 'list directory',  color: '#a78bfa' },
  run_terminal:    { label: 'exec command',    color: '#fb923c' },
  run_command:     { label: 'exec command',    color: '#fb923c' },
  search_code:     { label: 'search codebase', color: '#f472b6' },
  web_search:      { label: 'search web',      color: '#38bdf8' },
  grep_search:     { label: 'scan files',      color: '#e879f9' },
  get_diagnostics: { label: 'run diagnostics', color: '#f59e0b' },
  create_file:     { label: 'create file',     color: '#4ade80' },
  delete_file:     { label: 'delete file',     color: '#f87171' },
  move_file:       { label: 'move file',        color: '#fbbf24' },
  git_log:         { label: 'view git log',    color: '#06b6d4' },
  git_show:        { label: 'view commit',     color: '#0d9488' },
  dotnet_build:    { label: 'build project',   color: '#8b5cf6' },
  dotnet_test:     { label: 'run tests',      color: '#ec4899' },
  npm_run:         { label: 'run npm script', color: '#eab308' },
  npm_install:     { label: 'install package', color: '#10b981' },
  default:         { label: 'call tool',       color: '#94a3b8' },
};

interface ToolExecution {
  id: string;
  toolName: string;
  input: any;
  output: any;
  error?: string;
  durationMs: number;
  success: boolean;
  createdAt: string;
}

// Collapsible Tool Steps Component inside conversation turn
function TaskToolSteps({ taskId, isLive }: { taskId: string; isLive: boolean }) {
  const { events } = useAppStore();
  const [dbExecutions, setDbExecutions] = useState<ToolExecution[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLive) return;

    let active = true;
    const fetchTools = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/tools`);
        const json = await res.json();
        if (active && json.success && json.data) {
          setDbExecutions(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch tool executions', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchTools();

    return () => {
      active = false;
    };
  }, [taskId, isLive]);

  // Derive live paired tool executions from store events
  const livePairs = useMemo(() => {
    if (!isLive) return [];
    const pairs: ToolExecution[] = [];
    const callEvts = events.filter(e => e.type === 'tool_called' && e.taskId === taskId);
    const resEvts = events.filter(e => e.type === 'tool_result' && e.taskId === taskId);

    callEvts.forEach((call) => {
      const name = (call.payload as any)?.toolName;
      const res = resEvts.find(r => (r.payload as any)?.toolName === name && new Date(r.timestamp) > new Date(call.timestamp));
      pairs.push({
        id: call.id || Math.random().toString(),
        toolName: name || 'tool',
        input: (call.payload as any)?.input,
        output: res ? (res.payload as any)?.output : undefined,
        success: res ? (res.payload as any)?.success ?? true : false,
        durationMs: res ? (res.payload as any)?.durationMs ?? 0 : 0,
        createdAt: new Date(call.timestamp).toISOString(),
      });
    });
    return pairs;
  }, [events, isLive, taskId]);

  const list = isLive ? livePairs : dbExecutions;

  if (loading && list.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
        <Loader2 size={12} className="animate-spin" />
        <span>Loading execution details...</span>
      </div>
    );
  }

  if (list.length === 0) return null;

  // Helper to render output details by action type
  const renderToolDetails = (exec: ToolExecution) => {
    const isDone = !isLive || exec.durationMs > 0 || exec.output !== undefined;
    if (!isDone) {
      return (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>
          Tool is executing...
        </div>
      );
    }

    const getLinesCount = (txt: any) => {
      if (typeof txt !== 'string') return 0;
      return txt.split('\n').length;
    };

    switch (exec.toolName) {
      case 'read_file': {
        const code = typeof exec.output === 'string' ? exec.output : JSON.stringify(exec.output, null, 2);
        const lineCount = getLinesCount(code);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ▼ {lineCount} lines
            </div>
            <pre style={{
              margin: 0,
              padding: '10px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              overflowX: 'auto',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      case 'write_file':
      case 'edit_file':
      case 'replace_file_content':
      case 'multi_replace_file_content': {
        const chunks: Array<{ target?: string; replacement?: string }> = [];
        let totalAdded = 0;
        let totalDeleted = 0;

        if (exec.input) {
          if (exec.input.ReplacementChunks && Array.isArray(exec.input.ReplacementChunks)) {
            exec.input.ReplacementChunks.forEach((c: any) => {
              chunks.push({ target: c.TargetContent, replacement: c.ReplacementContent });
            });
          } else if (exec.input.TargetContent || exec.input.ReplacementContent) {
            chunks.push({ target: exec.input.TargetContent, replacement: exec.input.ReplacementContent });
          }
        }

        chunks.forEach(c => {
          if (c.target) totalDeleted += getLinesCount(c.target);
          if (c.replacement) totalAdded += getLinesCount(c.replacement);
        });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ▼ +{totalAdded} −{totalDeleted} lines
            </div>
            <pre style={{
              margin: 0,
              padding: '10px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'monospace',
              overflowX: 'auto',
              maxHeight: '200px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {chunks.map((chunk, idx) => (
                <div key={idx} style={{ borderBottom: idx < chunks.length - 1 ? '1px dashed var(--border)' : 'none', paddingBottom: idx < chunks.length - 1 ? '8px' : 0, marginBottom: idx < chunks.length - 1 ? '8px' : 0 }}>
                  {chunk.target && chunk.target.split('\n').map((line, lIdx) => (
                    <div key={`del-${lIdx}`} style={{ color: 'var(--error)', background: 'rgba(239, 68, 68, 0.05)', padding: '0 4px' }}>
                      - {line}
                    </div>
                  ))}
                  {chunk.replacement && chunk.replacement.split('\n').map((line, lIdx) => (
                    <div key={`add-${lIdx}`} style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)', padding: '0 4px' }}>
                      + {line}
                    </div>
                  ))}
                </div>
              ))}
              {chunks.length === 0 && (
                <div style={{ color: 'var(--text-muted)' }}>
                  {typeof exec.output === 'string' ? exec.output : JSON.stringify(exec.output, null, 2)}
                </div>
              )}
            </pre>
          </div>
        );
      }

      case 'run_terminal':
      case 'run_command': {
        const outputTxt = typeof exec.output === 'string' 
          ? exec.output 
          : exec.output?.stdout || exec.output?.stderr || JSON.stringify(exec.output, null, 2);
        
        const success = exec.success;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: success ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
              ▼ exit {success ? '0' : '1'}
            </div>
            <pre style={{
              margin: 0,
              padding: '10px',
              background: '#090d16',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: success ? '#cbd5e1' : 'var(--error)',
              overflowX: 'auto',
              maxHeight: '200px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              <code>
                $ {exec.input?.command || exec.input?.CommandLine || 'terminal command'}{'\n'}
                {outputTxt}
              </code>
            </pre>
          </div>
        );
      }

      case 'grep_search':
      case 'search_code': {
        const matches = Array.isArray(exec.output) 
          ? exec.output 
          : exec.output?.matches || [];
        const hitsCount = matches.length;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ▼ {hitsCount} hits
            </div>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {matches.map((match: any, mIdx: number) => (
                <div key={mIdx} style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                    {match.Filename || match.file || 'file'}
                  </span>
                  <span style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                    :{match.LineNumber || match.line || ''}
                  </span>
                </div>
              ))}
              {hitsCount === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No matches found.
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'list_dir': {
        const files = Array.isArray(exec.output) 
          ? exec.output 
          : (exec.output && typeof exec.output === 'object') ? Object.keys(exec.output) : [];
        const filesCount = files.length;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ▼ {filesCount} items
            </div>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {files.map((file: any, fIdx: number) => {
                const name = typeof file === 'string' ? file : file.name || file.path;
                return (
                  <span key={fIdx} style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: 'var(--text-secondary)'
                  }}>
                    {name}
                  </span>
                );
              })}
              {filesCount === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Empty directory.
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'web_search': {
        const results = Array.isArray(exec.output) 
          ? exec.output 
          : exec.output?.results || [];
        const resCount = results.length;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ▼ {resCount} results
            </div>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {results.map((res: any, rIdx: number) => (
                <a 
                  key={rIdx} 
                  href={res.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    fontSize: '11px', 
                    color: 'var(--accent-primary)', 
                    textDecoration: 'underline',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {res.title || res.url}
                </a>
              ))}
              {resCount === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No search results.
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'create_file':
      case 'write_to_file': {
        const code = exec.input?.CodeContent || (typeof exec.output === 'string' ? exec.output : '');
        const lineCount = getLinesCount(code);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ▼ {lineCount} lines
            </div>
            <pre style={{
              margin: 0,
              padding: '10px',
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'monospace',
              overflowX: 'auto',
              maxHeight: '200px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {code.split('\n').map((line: string, lIdx: number) => (
                <div key={lIdx} style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)', padding: '0 4px' }}>
                  + {line}
                </div>
              ))}
            </pre>
          </div>
        );
      }

      default:
        return (
          <pre style={{
            margin: 0,
            padding: '8px',
            background: 'var(--bg-secondary)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            fontSize: '10.5px',
            fontFamily: 'monospace',
            color: 'var(--text-secondary)',
            overflowX: 'auto',
            maxHeight: '200px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {typeof exec.output === 'string' ? exec.output : JSON.stringify(exec.output, null, 2)}
          </pre>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0 16px 0', maxWidth: '800px' }}>
      {list.map((exec, idx) => {
        const isExp = expandedId === exec.id;
        const isDone = !isLive || exec.durationMs > 0 || exec.output !== undefined;
        const config = INLINE_TOOL_LABELS[exec.toolName] || INLINE_TOOL_LABELS.default;

        // Custom headers verbs and icons based on toolName
        let toolVerb = exec.toolName;
        let toolIcon = '⚡';
        
        switch (exec.toolName) {
          case 'read_file':       toolVerb = 'Read';      toolIcon = '📄'; break;
          case 'write_file':      toolVerb = 'Written';   toolIcon = '✏️'; break;
          case 'edit_file':
          case 'replace_file_content':
          case 'multi_replace_file_content': toolVerb = 'Edited'; toolIcon = '✏️'; break;
          case 'run_terminal':
          case 'run_command':     toolVerb = 'Ran';       toolIcon = '🖥️'; break;
          case 'search_code':
          case 'grep_search':     toolVerb = 'Searched';  toolIcon = '🔍'; break;
          case 'list_dir':        toolVerb = 'Listed';    toolIcon = '📂'; break;
          case 'web_search':      toolVerb = 'Searched';  toolIcon = '🌐'; break;
          case 'create_file':
          case 'write_to_file':   toolVerb = 'Created';   toolIcon = '📝'; break;
        }

        // Path or command preview
        let preview = '';
        if (exec.input) {
          if (exec.input.path) preview = exec.input.path;
          else if (exec.input.TargetFile) preview = exec.input.TargetFile;
          else if (exec.input.CommandLine) preview = exec.input.CommandLine;
          else if (exec.input.command) preview = exec.input.command;
          else if (exec.input.DirectoryPath) preview = exec.input.DirectoryPath;
          else if (exec.input.SearchPath) preview = exec.input.SearchPath;
          else if (exec.input.Query) preview = `"${exec.input.Query}"`;
          else if (exec.input.Url) preview = exec.input.Url;
        }
        if (preview && preview.length > 50) {
          preview = '...' + preview.slice(-47);
        }

        return (
          <div 
            key={exec.id || idx} 
            className={`tool-card ${!isDone ? 'tool-card--running' : ''}`}
            style={{ overflow: 'hidden' }}
          >
            <div
              onClick={() => setExpandedId(isExp ? null : exec.id)}
              style={{
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                {isExp ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />}
                
                <span style={{ fontSize: '12px' }}>{toolIcon}</span>

                <span style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {toolVerb}
                </span>

                {preview && (
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preview}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {exec.durationMs > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {(exec.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {isDone ? (
                  exec.success ? (
                    <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
                  ) : (
                    <X size={12} style={{ color: 'var(--error)' }} />
                  )
                ) : (
                  <Loader2 size={12} className="animate-spin" style={{ color: config.color }} />
                )}
              </div>
            </div>

            {isExp && (
              <div style={{
                background: 'rgba(15, 21, 36, 0.4)',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                padding: '10px'
              }}>
                {renderToolDetails(exec)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ChatPanel() {
  const {
    messages, activeSessionId, setActiveSession, createSession,
    sendMessage, isStreaming, streamingText, events,
    cancelActiveTask, sessions, activeTaskId, tasks,
    selectedComplexity, setSelectedComplexity, settings,
    user
  } = useAppStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; path?: string; isWorkspaceFile: boolean }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active task started time
  const taskStartedEvent = events.find(e => e.type === 'task_started');
  const taskEndEvent = events.find(e => e.type === 'task_completed' || e.type === 'task_failed');

  useEffect(() => {
    if (isStreaming && taskStartedEvent) {
      const startTs = new Date(taskStartedEvent.timestamp).getTime();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTs);
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (taskStartedEvent && taskEndEvent) {
        const startTs = new Date(taskStartedEvent.timestamp).getTime();
        const endTs = new Date(taskEndEvent.timestamp).getTime();
        setElapsedMs(endTs - startTs);
      } else {
        setElapsedMs(0);
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isStreaming, taskStartedEvent, taskEndEvent]);

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

  const activeTaskObj = activeTaskId ? tasks.find(t => t.id === activeTaskId) : undefined;
  const activeTaskStatus = activeTaskObj?.status ?? 'queued';

  // Chronological matching lists
  const chronoTasks = useMemo(() => [...tasks].reverse(), [tasks]);
  const chronoAssistantMsgs = useMemo(() => messages.filter(m => m.role === 'assistant'), [messages]);

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

  // Get user initials for user avatar
  const userInitials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'U';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Scrollable messages container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 120px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
          
          {messages.length === 0 && !isStreaming ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 16px 32px 16px',
              textAlign: 'center',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              {/* Sparkle Logo */}
              <div className="avatar-gradient" style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <Sparkles size={28} style={{ color: '#fff' }} />
              </div>

              <h1 style={{
                fontSize: '28px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, var(--text-primary) 30%, #a855f7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: '8px',
                letterSpacing: '-0.02em'
              }}>
                Agentic Runtime Platform
              </h1>
              
              <p style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                marginBottom: '32px',
                lineHeight: '1.5'
              }}>
                How can I assist you with your project today? Select a prompt below or start typing.
              </p>

              {/* Grid of suggested prompts */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                width: '100%',
              }}>
                {[
                  { label: "Explain this codebase", prompt: "Can you provide a comprehensive explanation of how this codebase is structured, its main technologies, and where the core logic resides?" },
                  { label: "Fix the build", prompt: "I am experiencing issues building the project. Can you analyze the build configuration and suggest fixes?" },
                  { label: "Run the tests", prompt: "Can you help me run the unit tests and verify the code correctness?" },
                  { label: "Review recent changes", prompt: "Can you review the recent git commits or local workspace changes and summarize what has changed?" },
                  { label: "Check project health", prompt: "Could you run diagnostics on the repository and identify any syntax errors or lint issues?" },
                  { label: "Optimize code efficiency", prompt: "Can you inspect the core package files and suggest performance improvements or optimizations?" },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => {
                      setInput(chip.prompt);
                      textareaRef.current?.focus();
                    }}
                    className="prompt-chip"
                    style={{
                      padding: '12px 14px',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{chip.label}</span>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
                      {chip.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Render messages
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              
              // If assistant, find matching task to render tool execution checklist inline
              let matchingTaskId = '';
              if (!isUser) {
                const astIndex = chronoAssistantMsgs.indexOf(msg);
                if (astIndex !== -1 && chronoTasks[astIndex]) {
                  matchingTaskId = chronoTasks[astIndex].id;
                }
              }

              return (
                <div 
                  key={msg.id || index} 
                  style={{ 
                    marginTop: 28, 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  
                  {isUser ? (
                    // User bubble
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: '75%' }}>
                      <div className="msg-user" style={{ padding: '12px 16px', color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.5' }}>
                        {msg.content}
                      </div>
                      {/* User initials circle */}
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        flexShrink: 0
                      }}>
                        {userInitials}
                      </div>
                    </div>
                  ) : (
                    // Assistant response flow
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                      {/* Gradient-ring robot avatar */}
                      <div className="avatar-gradient" style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Bot size={16} style={{ color: '#fff' }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Header details */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }}>Agent</span>
                          {msg.model && (
                            <span style={{ 
                              background: 'var(--bg-hover)', 
                              border: '1px solid var(--border)', 
                              borderRadius: '4px', 
                              padding: '1px 6px', 
                              color: 'var(--text-muted)', 
                              fontSize: '10px',
                              fontFamily: 'monospace'
                            }}>
                              {msg.model}
                            </span>
                          )}
                        </div>

                        {/* Collapsible tool execution checklist */}
                        {matchingTaskId && (
                          <TaskToolSteps taskId={matchingTaskId} isLive={false} />
                        )}

                        {/* Message content */}
                        <div className="msg-assistant" style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6' }}>
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}

          {/* Active Streaming turn */}
          {isStreaming && (
            <div style={{ marginTop: 28, display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
              {/* Gradient-ring pulsing avatar */}
              <div className="avatar-gradient" style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Loader2 size={16} className="animate-spin" style={{ color: '#fff' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Header details */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  marginBottom: 10,
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  width: '100%',
                  maxWidth: '800px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', animation: 'ping 1.4s ease-in-out infinite' }} />
                    <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }}>Agent</span>
                    {(() => {
                      const steps = activeTaskObj?.plan?.steps;
                      if (!Array.isArray(steps) || steps.length === 0) return null;
                      const runningIdx = steps.findIndex(s => s.status === 'running');
                      const currentStepNum = runningIdx !== -1 ? runningIdx + 1 : 1;
                      return (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                          Step {currentStepNum} of {steps.length}
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 500 }}>
                      {activeTaskStatus === 'planning' ? 'Planning...' : activeTaskStatus === 'executing' ? 'Executing tools...' : 'Working...'}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {elapsedMs > 0 ? (elapsedMs / 1000).toFixed(0).padStart(2, '0') + 's' : '00s'}
                    </span>
                  </div>
                </div>

                {/* Live execution steps checklist */}
                {activeTaskId && (
                  <TaskToolSteps taskId={activeTaskId} isLive={true} />
                )}

                {/* Streaming text markdown */}
                <div className="msg-assistant" style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6' }}>
                  <MarkdownRenderer content={streamingText} />
                  <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--accent-primary)', marginLeft: 4, animation: 'pulse 1s infinite' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input composer pane */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', padding: '16px 24px',
        background: 'linear-gradient(transparent, var(--bg-primary) 30%)',
        pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          className="input-composer"
          style={{
            width: '100%', maxWidth: 800,
            padding: '12px 16px',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          
          {/* Top selection bar (model chip + file attachment previews) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
            
            {/* Model switch cycling chip */}
            {settings && (
              <button
                type="button"
                onClick={() => {
                  const next: Record<'low' | 'medium' | 'high', 'low' | 'medium' | 'high'> = {
                    low: 'medium',
                    medium: 'high',
                    high: 'low'
                  };
                  setSelectedComplexity(next[selectedComplexity]);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  fontSize: '10.5px',
                  fontFamily: 'monospace',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Cpu size={11} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontWeight: 700 }}>{selectedComplexity.toUpperCase()}</span>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{settings.models?.[selectedComplexity]?.model ?? '?'}</span>
              </button>
            )}

            {/* Floating keyboard helper tags */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
              <span>Enter to Send</span>
              <CornerDownLeft size={10} style={{ opacity: 0.7 }} />
            </div>

          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
            
            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
            
            {/* Attachment tags bar */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, position: 'absolute', bottom: '100%', left: 16, marginBottom: 8, pointerEvents: 'auto' }}>
                {attachments.map((att, idx) => (
                  <div key={idx} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '4px 8px', fontSize: 11, color: 'var(--text-secondary)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                  }}>
                    <FileText size={10} style={{ color: 'var(--accent-primary)' }} />
                    <span>{att.name}</span>
                    <button 
                      type="button" 
                      onClick={() => removeAttachment(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, marginLeft: 2, display: 'inline-flex' }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input Composer Textarea */}
            <textarea
              ref={textareaRef}
              placeholder="Ask anything or invoke /commands..."
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

            {/* Composer control buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingBottom: '2px' }}>
              
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid rgba(255,255,255,0.05)', 
                  borderRadius: '50%',
                  color: 'var(--text-secondary)',
                  width: 28,
                  height: 28,
                  cursor: 'pointer', 
                  display: 'flex',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <Paperclip size={13} />
              </button>

              {isStreaming && (
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '16px',
                    color: '#ef4444',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontFamily: 'inherit',
                    height: 28,
                    fontWeight: 600
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
                  background: input.trim() && !isStreaming ? 'var(--accent-primary)' : 'rgba(255,255,255,0.02)',
                  color: input.trim() && !isStreaming ? 'white' : 'var(--text-muted)',
                  border: input.trim() && !isStreaming ? 'none' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '50%',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
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
