import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { 
  Sparkles, 
  Send, 
  Paperclip, 
  Cpu, 
  Terminal as TerminalIcon, 
  Database,
  Globe,
  Settings,
  CircleStop,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  GitBranch,
  Clock,
  Brain,
  Wrench,
  ShieldCheck,
  Zap,
  Circle,
  CheckCircle,
  XCircle,
  Hash,
  Coins,
  Pencil,
  FilePlus,
  Search,
  ChevronRight,
} from 'lucide-react';

const INLINE_TOOL_LABELS: Record<string, { label: string; color: string }> = {
  read_file:       { label: 'Reading file',       color: '#60a5fa' },
  write_file:      { label: 'Writing code',       color: '#34d399' },
  list_dir:        { label: 'Listing directory',  color: '#a78bfa' },
  run_terminal:    { label: 'Executing command',  color: '#fb923c' },
  run_command:     { label: 'Executing command',  color: '#fb923c' },
  search_code:     { label: 'Searching codebase', color: '#f472b6' },
  web_search:      { label: 'Searching the web',  color: '#38bdf8' },
  grep_search:     { label: 'Scanning files',     color: '#e879f9' },
  get_diagnostics: { label: 'Running diagnostics', color: '#f59e0b' },
  create_file:     { label: 'Creating file',      color: '#4ade80' },
  delete_file:     { label: 'Deleting file',      color: '#f87171' },
  move_file:       { label: 'Moving file',        color: '#fbbf24' },
  git_log:         { label: 'Viewing git log',    color: '#06b6d4' },
  git_show:        { label: 'Viewing git commit', color: '#0d9488' },
  dotnet_build:    { label: 'Building project',   color: '#8b5cf6' },
  dotnet_test:     { label: 'Running tests',      color: '#ec4899' },
  npm_run:         { label: 'Running npm script', color: '#eab308' },
  npm_install:     { label: 'Installing packages', color: '#10b981' },
  default:         { label: 'Calling tool',       color: '#94a3b8' },
};

function getInlineToolLabel(toolName: string) {
  return INLINE_TOOL_LABELS[toolName] || INLINE_TOOL_LABELS['default'];
}

type InlinePhase = 'queueing' | 'reasoning' | 'executing' | 'validating' | 'final_response';

function getInlinePhaseFromStatus(status: string): InlinePhase {
  switch (status) {
    case 'queued':     return 'queueing';
    case 'planning':   return 'reasoning';
    case 'executing':  return 'executing';
    case 'validating': return 'validating';
    case 'completed':
    case 'failed':
    case 'cancelled':  return 'final_response';
    default:           return 'queueing';
  }
}

const INLINE_PHASE_ORDER: InlinePhase[] = ['queueing', 'reasoning', 'executing', 'validating', 'final_response'];

const INLINE_PHASE_META: Record<InlinePhase, { label: string; icon: React.ReactNode; color: string }> = {
  queueing:       { label: 'Queueing',       icon: <Clock size={12} />,       color: '#94a3b8' },
  reasoning:      { label: 'Reasoning',      icon: <Brain size={12} />,       color: '#a78bfa' },
  executing:      { label: 'Tool Execution', icon: <Wrench size={12} />,      color: '#60a5fa' },
  validating:     { label: 'Validation',     icon: <ShieldCheck size={12} />, color: '#fb923c' },
  final_response: { label: 'Final Response', icon: <Zap size={12} />,         color: '#34d399' },
};

function formatInlineDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatInlineDurationVerbose(ms: number): string {
  if (ms < 1000) return 'less than a second';
  if (ms < 60000) return `${Math.round(ms / 1000)} second${Math.round(ms / 1000) !== 1 ? 's' : ''}`;
  const mins = Math.floor(ms / 60000);
  return `${mins} minute${mins !== 1 ? 's' : ''}`;
}

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

interface InlineTimelineProps {
  task: any;
  isLive?: boolean;
  liveEvents?: any[];
  messageContent?: string;
}

// ── Shared helpers ──────────────────────────────────────────────────────────
function parsePath(pathStr: string) {
  if (!pathStr) return { filename: '', directory: '' };
  const normalized = pathStr.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const filename = parts[parts.length - 1];
  const directory = parts.slice(0, -1).join('/');
  return { filename, directory };
}

function getEditStats(toolName: string, input: any) {
  if (!input) return { added: 0, deleted: 0 };
  let added = 0;
  let deleted = 0;

  const countLines = (str: string) => {
    if (!str) return 0;
    return str.split(/\r?\n/).length;
  };

  if (toolName === 'replace_file_content') {
    deleted = countLines(input.TargetContent || '');
    added = countLines(input.ReplacementContent || '');
  } else if (toolName === 'multi_replace_file_content') {
    const chunks = input.ReplacementChunks || [];
    chunks.forEach((chunk: any) => {
      deleted += countLines(chunk.TargetContent || '');
      added += countLines(chunk.ReplacementContent || '');
    });
  } else if (toolName === 'write_to_file' || toolName === 'create_file') {
    added = countLines(input.CodeContent || '');
  }
  return { added, deleted };
}

function formatTaskHeader(task: any) {
  return 'Execution Details';
}

function getToolCategory(toolName: string): string {
  switch (toolName) {
    case 'read_file':
      return 'read';
    case 'write_file':
    case 'create_file':
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return 'write';
    case 'run_terminal':
    case 'run_command':
      return 'command';
    case 'search_code':
    case 'grep_search':
      return 'search';
    case 'web_search':
      return 'web';
    case 'git_log':
    case 'git_show':
      return 'git';
    case 'dotnet_build':
    case 'dotnet_test':
      return 'dotnet';
    case 'npm_run':
    case 'npm_install':
      return 'npm';
    default:
      return 'default';
  }
}

function getToolIcon(toolName: string) {
  const size = 13;
  switch (toolName) {
    case 'read_file':
      return <FileText size={size} style={{ color: '#60a5fa' }} />;
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return <Pencil size={size} style={{ color: '#34d399' }} />;
    case 'write_to_file':
    case 'create_file':
      return <FilePlus size={size} style={{ color: '#4ade80' }} />;
    case 'run_terminal':
    case 'run_command':
      return <TerminalIcon size={size} style={{ color: '#fb923c' }} />;
    case 'search_code':
    case 'grep_search':
      return <Search size={size} style={{ color: '#f472b6' }} />;
    case 'web_search':
      return <Globe size={size} style={{ color: '#38bdf8' }} />;
    case 'git_log':
    case 'git_show':
      return <GitBranch size={size} style={{ color: '#06b6d4' }} />;
    case 'dotnet_build':
      return <Cpu size={size} style={{ color: '#8b5cf6' }} />;
    case 'dotnet_test':
      return <CheckCircle2 size={size} style={{ color: '#ec4899' }} />;
    case 'npm_run':
    case 'npm_install':
      return <TerminalIcon size={size} style={{ color: '#eab308' }} />;
    default:
      return <Wrench size={size} style={{ color: '#94a3b8' }} />;
  }
}

function getToolDescription(toolName: string, input: any): string {
  if (!input) return 'Called tool';
  switch (toolName) {
    case 'read_file':
      if (input.StartLine && input.EndLine) {
        return `Read lines ${input.StartLine}-${input.EndLine}`;
      }
      return 'Read file';
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return 'Edited file';
    case 'write_to_file':
    case 'create_file':
      return 'Created file';
    case 'run_terminal':
    case 'run_command':
      return 'Ran command';
    case 'search_code':
    case 'grep_search':
      return 'Searched code';
    case 'web_search':
      return 'Searched the web';
    case 'git_log':
      return 'Viewed git log';
    case 'git_show':
      return `Viewed commit ${input.commit || 'HEAD'}`;
    case 'dotnet_build':
      return `Built project ${input.projectPath ? input.projectPath.split(/[/\\]/).pop() : ''}`;
    case 'dotnet_test':
      return `Ran tests ${input.projectPath ? input.projectPath.split(/[/\\]/).pop() : ''}`;
    case 'npm_run':
      return `Ran npm script "${input.script}"`;
    case 'npm_install':
      return 'Installed npm packages';
    default:
      return toolName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
  }
}

function InlineTimeline({ task, isLive = false, liveEvents = [], messageContent = '' }: InlineTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const API_URL = import.meta.env.VITE_API_URL ?? '';

  useEffect(() => {
    if (isLive) return;
    if (expanded && events.length === 0) {
      setLoading(true);
      fetch(`${API_URL}/api/tasks/${task.id}/events`)
        .then(res => res.json())
        .then(json => {
          if (json.success && json.data) {
            setEvents(json.data);
          }
        })
        .catch(err => console.error("Failed to fetch historical events:", err))
        .finally(() => setLoading(false));
    }
  }, [expanded, task.id, isLive, API_URL]);

  useEffect(() => {
    if (!isLive) {
      const startTs = task.startedAt ? new Date(task.startedAt).getTime() : new Date(task.createdAt).getTime();
      const endTs = task.completedAt ? new Date(task.completedAt).getTime() : (task.updatedAt ? new Date(task.updatedAt).getTime() : startTs);
      setElapsedMs(Math.max(0, endTs - startTs));
      return;
    }

    const taskStartedEvent = liveEvents.find(e => e.type === 'task_started');
    const taskEndEvent = liveEvents.find(e => e.type === 'task_completed' || e.type === 'task_failed');

    if (taskStartedEvent) {
      const startTs = new Date(taskStartedEvent.timestamp).getTime();
      if (taskEndEvent) {
        const endTs = new Date(taskEndEvent.timestamp).getTime();
        setElapsedMs(Math.max(0, endTs - startTs));
      } else {
        setElapsedMs(Math.max(0, Date.now() - startTs));
        timerRef.current = setInterval(() => {
          setElapsedMs(Math.max(0, Date.now() - startTs));
        }, 500);
      }
    } else {
      setElapsedMs(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLive, liveEvents, task.startedAt, task.completedAt, task.updatedAt, task.createdAt]);

  const currentEvents = isLive ? (liveEvents || []) : events;

  // Extract Tool Call Pairs
  const toolCallPairs: Array<{
    id: string;
    toolName: string;
    callEvent: any;
    resultEvent: any;
    durationMs: number;
    success: boolean;
    input: any;
    output: any;
    timestamp: Date;
  }> = [];

  const callEvents = currentEvents.filter(e => e.type === 'tool_called');
  const resultEvents = currentEvents.filter(e => e.type === 'tool_result');

  callEvents.forEach((callEvt) => {
    const toolName = callEvt.payload?.toolName || callEvt.payload?.metadata?.toolName;
    const resultEvt = resultEvents.find(r => {
      const rTool = r.payload?.toolName || r.payload?.metadata?.toolName;
      return rTool === toolName && new Date(r.timestamp) > new Date(callEvt.timestamp);
    });
    const durationMs = resultEvt ? resultEvt.payload?.durationMs || resultEvt.payload?.metadata?.durationMs || 0 : 0;
    const success = resultEvt ? resultEvt.payload?.success ?? resultEvt.payload?.metadata?.success ?? true : false;
    toolCallPairs.push({
      id: callEvt.id || callEvt.payload?.eventId || Math.random().toString(),
      toolName,
      callEvent: callEvt,
      resultEvent: resultEvt,
      durationMs,
      success,
      input: callEvt.payload?.input || callEvt.payload?.metadata?.input,
      output: resultEvt ? (resultEvt.payload?.output || resultEvt.payload?.metadata?.output) : undefined,
      timestamp: new Date(callEvt.timestamp),
    });
  });

  // Group tool calls chronologically into batches
  const batches: Array<typeof toolCallPairs> = [];
  let currentBatch: typeof toolCallPairs = [];

  toolCallPairs.forEach((pair, idx) => {
    if (idx === 0) {
      currentBatch.push(pair);
    } else {
      const prevPair = toolCallPairs[idx - 1];
      const timeDiffSec = (pair.timestamp.getTime() - prevPair.timestamp.getTime()) / 1000;
      const catChange = getToolCategory(pair.toolName) !== getToolCategory(prevPair.toolName);
      
      if (catChange || timeDiffSec > 15) {
        batches.push(currentBatch);
        currentBatch = [pair];
      } else {
        currentBatch.push(pair);
      }
    }
  });
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // Split messageContent by double newlines into paragraphs
  const paragraphs = messageContent ? messageContent.split(/\n\n+/) : [];

  // Render paragraphs and tool calls
  const maxLen = Math.max(paragraphs.length, batches.length);
  const elements = [];

  for (let i = 0; i < maxLen; i++) {
    if (i < paragraphs.length) {
      const para = paragraphs[i];
      const isLast = i === paragraphs.length - 1;
      elements.push(
        <div key={`para-${i}`} style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '12px' }}>
          <MarkdownRenderer content={para} />
          {isLive && isLast && paragraphs.length > 0 && (
            <span style={{ display: 'inline-block', width: '8px', height: '14px', background: 'var(--text-primary)', marginLeft: '4px', animation: 'pulse 1s infinite' }} />
          )}
        </div>
      );
    }
    
    if (expanded && i < batches.length) {
      const batch = batches[i];
      elements.push(
        <div key={`batch-${i}`} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginTop: '6px',
          marginBottom: '16px',
          paddingLeft: '12px',
          borderLeft: '2px solid var(--border)',
        }}>
          {batch.map((pair) => {
            const isExp = expandedEventId === pair.id;
            const isDone = !!pair.resultEvent;
            const dotColor = isDone ? (pair.success ? '#10b981' : '#ef4444') : '#3b82f6';
            const { added, deleted } = getEditStats(pair.toolName, pair.input);
            
            return (
              <div
                key={pair.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${isExp ? 'var(--accent-primary)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  onClick={() => setExpandedEventId(isExp ? null : pair.id)}
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '12px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    {getToolIcon(pair.toolName)}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, flexShrink: 0 }}>
                      {getToolDescription(pair.toolName, pair.input)}:
                    </span>
                    {(() => {
                      if (pair.toolName === 'run_command' || pair.toolName === 'run_terminal') {
                        const cmd = pair.input?.CommandLine || pair.input?.command || '';
                        return (
                          <span style={{ 
                            fontFamily: 'JetBrains Mono, monospace', 
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {cmd}
                          </span>
                        );
                      }
                      
                      const pathVal = pair.input?.TargetFile || pair.input?.AbsolutePath || pair.input?.path || '';
                      if (pathVal) {
                        const { filename, directory } = parsePath(pathVal);
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{filename}</strong>
                            {directory && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                in {directory}
                              </span>
                            )}
                          </span>
                        );
                      }

                      const queryVal = pair.input?.Query || pair.input?.query || '';
                      if (queryVal) {
                        return (
                          <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            "{queryVal}"
                          </span>
                        );
                      }

                      return null;
                    })()}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {getToolCategory(pair.toolName) === 'write' && (added > 0 || deleted > 0) && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {added > 0 && <span style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>+{added}</span>}
                        {deleted > 0 && <span style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.2)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>-{deleted}</span>}
                      </div>
                    )}
                    
                    {pair.durationMs > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {formatInlineDuration(pair.durationMs)}
                      </span>
                    )}

                    {isExp ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}

                    {!isDone && isLive ? (
                      <PulsingDot color={dotColor} />
                    ) : (
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                        boxShadow: `0 0 4px ${dotColor}88`
                      }} />
                    )}
                  </div>
                </div>

                {isExp && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    background: 'rgba(0, 0, 0, 0.15)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Input</div>
                      <pre style={{
                        margin: 0,
                        padding: '8px 10px',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        lineHeight: 1.4,
                      }}>
                        {JSON.stringify(pair.input, null, 2)}
                      </pre>
                    </div>

                    {pair.output !== undefined && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Output</div>
                        <pre style={{
                          margin: 0,
                          padding: '8px 10px',
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: pair.success ? 'var(--text-secondary)' : '#f87171',
                          background: 'var(--bg-panel)',
                          border: pair.success ? '1px solid var(--border)' : '1px solid rgba(248, 113, 113, 0.2)',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          lineHeight: 1.4,
                        }}>
                          {typeof pair.output === 'string' ? pair.output : JSON.stringify(pair.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }
  }

  if (paragraphs.length === 0 && isLive) {
    elements.push(
      <div key="para-live-empty" style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6 }}>
        <span style={{ display: 'inline-block', width: '8px', height: '14px', background: 'var(--text-primary)', animation: 'pulse 1s infinite' }} />
      </div>
    );
  }

  if (toolCallPairs.length === 0) {
    return (
      <div style={{ marginBottom: '16px' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 12px' }}>
            <Loader2 size={14} className="animate-spin" />
            <span>Loading execution history...</span>
          </div>
        )}
        <div style={{ marginTop: '4px' }}>
          {elements}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Collapsible Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '13px',
          fontWeight: 500,
          userSelect: 'none',
          marginBottom: '12px',
          padding: '4px 8px',
          borderRadius: '6px',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          transition: 'all 0.2s ease',
          maxWidth: '100%',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatTaskHeader(task)}</strong>
        </span>
        {expanded ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 12px' }}>
          <Loader2 size={14} className="animate-spin" />
          <span>Loading execution history...</span>
        </div>
      )}

      {/* Interleaved paragraphs and tool calls */}
      <div style={{ marginTop: '4px' }}>
        {elements}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { 
    messages, 
    activeSessionId, 
    sendMessage, 
    isStreaming, 
    streamingText, 
    events,
    selectedComplexity,
    setSelectedComplexity,
    settings,
    cancelActiveTask,
    sessions,
    activeTaskId,
    tasks,
  } = useAppStore();

  const findTaskForMessage = (msg: any) => {
    if (msg.role !== 'assistant') return null;

    // First, try to match by exact output
    let found = tasks.find(t => t.result?.output === msg.content);
    if (found) return found;

    // Second, try to match by failure content
    const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
    for (const t of failedTasks) {
      if (t.result?.failureReason && msg.content.includes(t.result.failureReason)) {
        return t;
      }
      if (t.status === 'cancelled' && msg.content.includes('Task Cancelled')) {
        return t;
      }
    }

    // Fallback: chronological index matching
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const sortedTasks = [...tasks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const msgIndex = assistantMessages.findIndex(m => m.id === msg.id);
    if (msgIndex !== -1 && msgIndex < sortedTasks.length) {
      return sortedTasks[msgIndex];
    }

    return null;
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const contextEvent = events.find(e => e.type === 'context_assembled');
  const contextItems = (contextEvent?.payload?.items as any[]) || [];

  const handleCancel = async () => {
    await cancelActiveTask();
  };
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // States for interactive features
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; path?: string; isWorkspaceFile: boolean }>>([]);
  const [fileQuery, setFileQuery] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [contextExpanded, setContextExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const API_URL = import.meta.env.VITE_API_URL ?? '';

  useEffect(() => {
    setContextExpanded(true);
  }, [activeTaskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, events]);

  // Auto-grow textarea height as content changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';               // shrink first
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'; // then grow, capped at 200px
  }, [input]);

  // Load and cache workspace files
  useEffect(() => {
    if (activeSession?.workspaceDir) {
      fetchWorkspaceFiles(activeSession.workspaceDir);
    } else {
      setWorkspaceFiles([]);
    }
  }, [activeSessionId, activeSession?.workspaceDir]);

  const fetchWorkspaceFiles = async (dir: string) => {
    try {
      const res = await fetch(`${API_URL}/api/context/files?workspaceDir=${encodeURIComponent(dir)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setWorkspaceFiles(json.data);
      }
    } catch (err) {
      console.error('Error fetching workspace files:', err);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleWindowClick = () => {
      setShowFileSuggestions(false);
      setShowCommandSuggestions(false);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const getBasename = (path: string) => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      if (attachments.some(att => att.name === file.name && !att.isWorkspaceFile)) {
        continue;
      }
      if (file.size > 1024 * 1024) {
        alert(`File ${file.name} is too large (max 1MB for text attachments).`);
        continue;
      }
      
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        });
        
        setAttachments(prev => [...prev, {
          name: file.name,
          content: text,
          isWorkspaceFile: false
        }]);
      } catch (err) {
        console.error('Error reading file:', err);
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const ALL_COMMANDS = [
    { cmd: '/explain', desc: 'Explain how code works', template: 'Explain the following code:\n' },
    { cmd: '/test', desc: 'Write unit tests for this code', template: 'Write unit tests for the following code:\n' },
    { cmd: '/fix', desc: 'Find and fix bugs in this code', template: 'Find and fix any bugs in the following code:\n' },
    { cmd: '/help', desc: 'Show help information', template: 'How do I use this platform and its features?' },
    { cmd: '/complexity low', desc: 'Set complexity routing to Low', action: 'complexity_low' },
    { cmd: '/complexity medium', desc: 'Set complexity routing to Medium', action: 'complexity_medium' },
    { cmd: '/complexity high', desc: 'Set complexity routing to High', action: 'complexity_high' },
  ];

  const filteredFiles = workspaceFiles.filter(file =>
    file.toLowerCase().includes(fileQuery.toLowerCase())
  ).slice(0, 10);

  const filteredCommands = ALL_COMMANDS.filter(c =>
    c.cmd.toLowerCase().includes(('/' + commandQuery).toLowerCase())
  );

  const selectFileSuggestion = (file: string) => {
    const basename = getBasename(file);
    if (!attachments.some(att => att.path === file)) {
      setAttachments(prev => [...prev, {
        name: basename,
        path: file,
        isWorkspaceFile: true,
        content: ''
      }]);
    }
    const lastAtIndex = input.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      setInput(input.substring(0, lastAtIndex));
    }
    setShowFileSuggestions(false);
  };

  const selectCommandSuggestion = (cmdItem: typeof ALL_COMMANDS[number]) => {
    const lastSlashIndex = input.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const textBefore = input.substring(0, lastSlashIndex);
      if ('template' in cmdItem && cmdItem.template) {
        setInput(textBefore + cmdItem.template);
      } else if (cmdItem.action) {
        setInput(textBefore);
        if (cmdItem.action === 'complexity_low') setSelectedComplexity('low');
        else if (cmdItem.action === 'complexity_medium') setSelectedComplexity('medium');
        else if (cmdItem.action === 'complexity_high') setSelectedComplexity('high');
      }
    }
    setShowCommandSuggestions(false);
  };

  const handleInputChange = (val: string) => {
    setInput(val);

    // Check for @ mentions
    const lastAtIndex = val.lastIndexOf('@');
    let fileTriggered = false;
    if (lastAtIndex !== -1) {
      const afterAt = val.substring(lastAtIndex + 1);
      if (!/\s/.test(afterAt)) {
        const beforeAt = lastAtIndex === 0 ? '' : val.charAt(lastAtIndex - 1);
        if (beforeAt === '' || /\s/.test(beforeAt)) {
          setFileQuery(afterAt);
          setShowFileSuggestions(true);
          setShowCommandSuggestions(false);
          fileTriggered = true;
        }
      }
    }

    if (!fileTriggered) {
      setShowFileSuggestions(false);
      setFileQuery('');
    }

    // Check for / commands
    const lastSlashIndex = val.lastIndexOf('/');
    let cmdTriggered = false;
    if (!fileTriggered && lastSlashIndex !== -1) {
      const afterSlash = val.substring(lastSlashIndex + 1);
      if (!/\s/.test(afterSlash)) {
        const beforeSlash = lastSlashIndex === 0 ? '' : val.charAt(lastSlashIndex - 1);
        if (beforeSlash === '' || /\s/.test(beforeSlash)) {
          setCommandQuery(afterSlash);
          setShowCommandSuggestions(true);
          setShowFileSuggestions(false);
          cmdTriggered = true;
        }
      }
    }

    if (!cmdTriggered) {
      setShowCommandSuggestions(false);
      setCommandQuery('');
    }

    setSelectedIndex(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || !activeSessionId || isStreaming) return;
    
    let finalContent = input.trim();
    
    const workspaceMentions = attachments.filter(att => att.isWorkspaceFile);
    const localAttachments = attachments.filter(att => !att.isWorkspaceFile);
    
    if (workspaceMentions.length > 0) {
      finalContent += '\n\n### Referenced Workspace Files:\n';
      workspaceMentions.forEach(att => {
        finalContent += `- ${att.path}\n`;
      });
    }
    
    if (localAttachments.length > 0) {
      finalContent += '\n\n### Attached Files:\n';
      localAttachments.forEach(att => {
        finalContent += `\n---\nFile: ${att.name}\n\`\`\`\n${att.content}\n\`\`\`\n`;
      });
    }

    setInput('');
    setAttachments([]);
    setShowFileSuggestions(false);
    setShowCommandSuggestions(false);

    // Reset textarea height back to single-line after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    await sendMessage(activeSessionId, finalContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const showSuggestions = showFileSuggestions || showCommandSuggestions;
    const suggestionCount = showFileSuggestions 
      ? filteredFiles.length 
      : (showCommandSuggestions ? filteredCommands.length : 0);

    if (showSuggestions && suggestionCount > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestionCount);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestionCount) % suggestionCount);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (showFileSuggestions) {
          selectFileSuggestion(filteredFiles[selectedIndex]);
        } else if (showCommandSuggestions) {
          selectCommandSuggestion(filteredCommands[selectedIndex]);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowFileSuggestions(false);
        setShowCommandSuggestions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };



  if (!activeSessionId) {
    return (
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: 'var(--text-muted)',
        padding: '48px',
        overflowY: 'auto'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '640px', width: '100%' }}>
          {/* Glowing/Pulsing Sparkles Header Icon */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '24px'
          }}>
            <div style={{
              background: 'rgba(99, 102, 241, 0.04)',
              border: '1px solid rgba(99, 102, 241, 0.1)',
              borderRadius: '16px',
              padding: '20px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 30px rgba(99, 102, 241, 0.05)'
            }}>
              <Sparkles size={32} style={{ color: 'var(--accent-primary)', animation: 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            </div>
          </div>

          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: 'var(--text-primary)', 
            marginBottom: '8px',
            fontFamily: 'Outfit, sans-serif',
            letterSpacing: '-0.02em'
          }}>
            Agentic Runtime Platform
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '36px' }}>
            Select an existing conversation from the sidebar or create a new one to begin development.
          </p>

          {/* Feature Highlight Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginTop: '20px',
            textAlign: 'left'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
              transition: 'all 0.2s ease',
            }} className="feature-card">
              <div style={{
                color: 'var(--accent-primary)',
                marginBottom: '10px',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                <Database size={18} />
              </div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Workspace Context</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Index codebase symbols and retrieve files to ground agent actions automatically.
              </p>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
              transition: 'all 0.2s ease',
            }} className="feature-card">
              <div style={{
                color: 'var(--accent-primary)',
                marginBottom: '10px',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                <Cpu size={18} />
              </div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Adaptive Routing</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Route queries to Low, Med, or High complexity LLMs based on task demands.
              </p>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
              transition: 'all 0.2s ease',
            }} className="feature-card">
              <div style={{
                color: 'var(--accent-primary)',
                marginBottom: '10px',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                <TerminalIcon size={18} />
              </div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Secure Executions</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Run background tools and commands securely inside your designated workspace environment.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 120px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          {messages.map((msg, index) => (
            <div key={msg.id} style={{ marginBottom: '32px' }}>
              {msg.role === 'user' ? (
                // User Message Bubble
                <div style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                }}>
                  {msg.content}
                </div>
              ) : (
                // Assistant Message
                <div style={{ padding: '0 8px' }}>
                  <div style={{ 
                    marginBottom: '12px', 
                    color: 'var(--text-secondary)', 
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Agent</span>
                    {msg.model && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        {msg.model} ({msg.provider})
                      </span>
                    )}
                  </div>
                  
                  {(() => {
                    const matchedTask = findTaskForMessage(msg);
                    if (matchedTask) {
                      return <InlineTimeline task={matchedTask} messageContent={msg.content} />;
                    }
                    return (
                      <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6 }}>
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}

          {/* Streaming Indicator */}
          {isStreaming && (
            <div style={{ padding: '0 8px', marginBottom: '32px' }}>
               <div style={{ 
                  marginBottom: '12px', 
                  color: 'var(--text-secondary)', 
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Agent</span> is working...
               </div>

               {(() => {
                 const activeTask = tasks.find(t => t.id === activeTaskId) || tasks[0];
                 if (activeTask) {
                   return <InlineTimeline task={activeTask} isLive={true} liveEvents={events} messageContent={streamingText} />;
                 }
                 return (
                   <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6 }}>
                     <MarkdownRenderer content={streamingText} />
                     <span style={{ display: 'inline-block', width: '8px', height: '14px', background: 'var(--text-primary)', marginLeft: '4px', animation: 'pulse 1s infinite' }} />
                   </div>
                 );
               })()}
            </div>
          )}
          
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating Input Area */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '0',
        right: '0',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 24px',
        pointerEvents: 'none'
      }}>
        <div 
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '800px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '12px 16px',
            pointerEvents: 'auto',
            boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.08), 0 4px 12px -4px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            position: 'relative'
          }}
        >
          
          {/* Suggestion Dropdown Overlays */}
          {(showFileSuggestions || showCommandSuggestions) && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: '0',
              right: '0',
              marginBottom: '12px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
              maxHeight: '260px',
              overflowY: 'auto',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 0',
              backdropFilter: 'blur(12px)',
            }}>
              <div style={{
                padding: '4px 12px 8px 12px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
                marginBottom: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <span>{showFileSuggestions ? 'Workspace Files' : 'Shortcut Commands'}</span>
                <span>Use ↑↓ and Enter</span>
              </div>

              {showFileSuggestions && (
                filteredFiles.length > 0 ? (
                  filteredFiles.map((file, index) => {
                    const basename = getBasename(file);
                    const isSelected = index === selectedIndex;
                    return (
                      <div
                        key={file}
                        onClick={() => {
                          selectFileSuggestion(file);
                          textareaRef.current?.focus();
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-hover)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <FileText size={14} style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{basename}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{file}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    No matching files found
                  </div>
                )
              )}

              {showCommandSuggestions && (
                filteredCommands.length > 0 ? (
                  filteredCommands.map((cmdItem, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <div
                        key={cmdItem.cmd}
                        onClick={() => {
                          selectCommandSuggestion(cmdItem);
                          textareaRef.current?.focus();
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-hover)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <span style={{
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 600,
                          color: 'var(--accent-primary)',
                          background: 'rgba(99, 102, 241, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(99, 102, 241, 0.2)'
                        }}>
                          {cmdItem.cmd}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {cmdItem.desc}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    No matching commands found
                  </div>
                )
              )}
            </div>
          )}

          {/* Active Tasks Pill */}
          {isStreaming && (
            <div style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '4px',
              width: '100%'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-neutral">1 task running</span>
                <span>Agent executing task</span>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'opacity 0.2s',
                }}
              >
                <CircleStop size={12} />
                Stop Agent
              </button>
            </div>
          )}

          {/* File Attachments list */}
          {attachments.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '4px',
              padding: '2px 0'
            }}>
              {attachments.map((att, idx) => (
                <div key={idx} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center' }}>
                    {att.isWorkspaceFile ? <Database size={10} /> : <Paperclip size={10} />}
                  </span>
                  <span style={{ fontWeight: 500, userSelect: 'none' }}>{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef}
              className="input-base"
              placeholder="Ask anything, @ to mention, / for actions"
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                background: 'transparent',
                boxShadow: 'none',
                padding: '4px 0',
                fontSize: '14px',
                overflowY: 'auto',
                lineHeight: '1.5',
                minHeight: '24px',
                maxHeight: '200px',
                transition: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <Cpu size={12} style={{ color: 'var(--text-muted)' }} />
                <select
                  value={selectedComplexity}
                  onChange={e => setSelectedComplexity(e.target.value as any)}
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    cursor: 'pointer',
                    paddingRight: '4px'
                  }}
                >
                  <option value="low">
                    Low: {settings?.models.low.model || 'qwen2.5-coder:7b'}
                  </option>
                  <option value="medium">
                    Medium: {settings?.models.medium.model || 'qwen2.5-coder:32b'}
                  </option>
                  <option value="high">
                    High: {settings?.models.high.model || 'qwen2.5-coder:32b'}
                  </option>
                </select>
              </div>
              <button
                type="submit"
                disabled={(!input.trim() && attachments.length === 0) || isStreaming}
                style={{
                  background: (input.trim() || attachments.length > 0) && !isStreaming ? 'var(--accent-primary)' : 'var(--bg-hover)',
                  color: (input.trim() || attachments.length > 0) && !isStreaming ? 'white' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: (input.trim() || attachments.length > 0) && !isStreaming ? 'pointer' : 'default',
                  transition: 'all 0.2s'
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
