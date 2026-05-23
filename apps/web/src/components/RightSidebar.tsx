import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/index.js';
import { 
  Activity, 
  FileCode, 
  Terminal, 
  CheckCircle, 
  XCircle, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  Layers,
  ExternalLink,
  Clock,
  Cpu,
  Brain,
  Wrench,
  ShieldCheck,
  Zap,
  Circle,
  GitBranch,
  Hash,
} from 'lucide-react';

// ── Tool-name → human-readable label mapping ─────────────────────────────
const TOOL_LABELS: Record<string, { label: string; color: string }> = {
  read_file:       { label: 'Reading file',       color: '#60a5fa' },
  write_file:      { label: 'Writing code',       color: '#34d399' },
  list_dir:        { label: 'Listing directory',  color: '#a78bfa' },
  run_terminal:    { label: 'Executing command',  color: '#fb923c' },
  search_code:     { label: 'Searching codebase', color: '#f472b6' },
  web_search:      { label: 'Searching the web',  color: '#38bdf8' },
  grep_search:     { label: 'Scanning files',     color: '#e879f9' },
  get_diagnostics: { label: 'Running diagnostics', color: '#f59e0b' },
  create_file:     { label: 'Creating file',      color: '#4ade80' },
  delete_file:     { label: 'Deleting file',      color: '#f87171' },
  move_file:       { label: 'Moving file',        color: '#fbbf24' },
  git_log:         { label: 'Viewing git log',    color: '#06b6d4' },
  git_show:        { label: 'Viewing commit',     color: '#0d9488' },
  dotnet_build:    { label: 'Building project',   color: '#8b5cf6' },
  dotnet_test:     { label: 'Running tests',      color: '#ec4899' },
  npm_run:         { label: 'Running npm script', color: '#eab308' },
  npm_install:     { label: 'Installing packages', color: '#10b981' },
  default:         { label: 'Calling tool',       color: '#94a3b8' },
};

function getToolLabel(toolName: string) {
  return TOOL_LABELS[toolName] || TOOL_LABELS['default'];
}

// ── Execution phases ──────────────────────────────────────────────────────
type Phase = 'queueing' | 'reasoning' | 'executing' | 'validating' | 'final_response';

function getPhaseFromStatus(status: string): Phase {
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

const PHASE_ORDER: Phase[] = ['queueing', 'reasoning', 'executing', 'validating', 'final_response'];

const PHASE_META: Record<Phase, { label: string; icon: React.ReactNode; color: string }> = {
  queueing:       { label: 'Queueing',       icon: <Clock size={13} />,      color: '#94a3b8' },
  reasoning:      { label: 'Reasoning',      icon: <Brain size={13} />,      color: '#a78bfa' },
  executing:      { label: 'Tool Execution', icon: <Wrench size={13} />,     color: '#60a5fa' },
  validating:     { label: 'Validation',     icon: <ShieldCheck size={13} />, color: '#fb923c' },
  final_response: { label: 'Final Response', icon: <Zap size={13} />,        color: '#34d399' },
};

// ── Duration helpers ──────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatDurationVerbose(ms: number): string {
  if (ms < 1000) return 'less than a second';
  if (ms < 60000) return `${Math.round(ms / 1000)} second${Math.round(ms / 1000) !== 1 ? 's' : ''}`;
  const mins = Math.floor(ms / 60000);
  return `${mins} minute${mins !== 1 ? 's' : ''}`;
}

// ── PulsingDot ────────────────────────────────────────────────────────────
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 10, height: 10 }}>
      <span style={{
        position: 'absolute', width: '100%', height: '100%', borderRadius: '50%',
        background: color, opacity: 0.4, animation: 'ping 1.4s ease-in-out infinite',
      }} />
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, position: 'relative' }} />
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export function RightSidebar() {
  const { 
    events, 
    tasks, 
    isStreaming,
    activeRightTab, 
    setActiveRightTab,
  } = useAppStore();

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived metrics ─────────────────────────────────────────────────────
  const totalTokens = tasks.reduce((sum, t) => sum + (t.totalTokens || 0), 0);
  const promptTokens = tasks.reduce((sum, t) => sum + (t.promptTokens || 0), 0);
  const completionTokens = tasks.reduce((sum, t) => sum + (t.completionTokens || 0), 0);
  const totalCost = tasks.reduce((sum, t) => sum + (t.estimatedCostUsd || 0), 0);

  // Active task (most recent)
  const activeTask = tasks[0];
  const activeTaskStatus: string = activeTask?.status ?? 'queued';

  // Duration tracking
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

  // ── Phase computation from events ───────────────────────────────────────
  const activePhase = getPhaseFromStatus(activeTaskStatus);
  const phaseIdx = PHASE_ORDER.indexOf(activePhase);

  // ── Helper: extract files touched ───────────────────────────────────────
  const getFilesTouched = () => {
    const files = new Set<string>();
    events.forEach(e => {
      if (e.type === 'tool_called' && (e.payload as any).toolName === 'write_file') {
        const path = (e.payload as any).input?.path;
        if (path) files.add(path);
      }
      if (e.type === 'tool_result' && (e.payload as any).toolName === 'write_file') {
        const path = (e.payload as any).output?.path || (e.payload as any).input?.path;
        if (path) files.add(path);
      }
    });
    return Array.from(files);
  };
  const filesTouched = getFilesTouched();

  // ── Helper: extract terminal verification results ───────────────────────
  const getVerifications = () => {
    const runs: { command: string; success: boolean; output: string; timestamp: Date }[] = [];
    events.forEach(e => {
      if (e.type === 'tool_result' && (e.payload as any).toolName === 'run_terminal') {
        const cmd = (e.payload as any).input?.command || 'terminal command';
        const success = (e.payload as any).success;
        const outputVal = (e.payload as any).output;
        const rawOutput = outputVal 
          ? (typeof outputVal === 'string' ? outputVal : (outputVal.stdout || outputVal.stderr || ''))
          : '';
        runs.push({
          command: cmd,
          success,
          output: rawOutput.slice(0, 1200),
          timestamp: e.timestamp ? new Date(e.timestamp) : new Date()
        });
      }
    });
    return runs;
  };
  const verifications = getVerifications();

  // ── Tool call pairs for Timeline ────────────────────────────────────────
  const toolCallPairs: Array<{
    id: string;
    toolName: string;
    callEvent: typeof events[0] | undefined;
    resultEvent: typeof events[0] | undefined;
    durationMs: number;
    success: boolean;
    input: unknown;
    output: unknown;
    timestamp: Date;
  }> = [];

  const callEvents = events.filter(e => e.type === 'tool_called');
  const resultEvents = events.filter(e => e.type === 'tool_result');

  callEvents.forEach((callEvt) => {
    const toolName = (callEvt.payload as any)?.toolName || (callEvt.payload as any)?.metadata?.toolName;
    // Find matching result
    const resultEvt = resultEvents.find(r => {
      const rTool = (r.payload as any)?.toolName || (r.payload as any)?.metadata?.toolName;
      return rTool === toolName && new Date(r.timestamp) > new Date(callEvt.timestamp);
    });
    const durationMs = resultEvt ? (resultEvt.payload as any)?.durationMs || (resultEvt.payload as any)?.metadata?.durationMs || 0 : 0;
    const success = resultEvt ? (resultEvt.payload as any)?.success ?? (resultEvt.payload as any)?.metadata?.success ?? true : false;
    toolCallPairs.push({
      id: callEvt.id || crypto.randomUUID(),
      toolName,
      callEvent: callEvt,
      resultEvent: resultEvt,
      durationMs,
      success,
      input: (callEvt.payload as any)?.input || (callEvt.payload as any)?.metadata?.input,
      output: resultEvt ? ((resultEvt.payload as any)?.output || (resultEvt.payload as any)?.metadata?.output) : undefined,
      timestamp: new Date(callEvt.timestamp),
    });
  });

  // ── Context items ────────────────────────────────────────────────────────
  const contextEvent = events.find(e => e.type === 'context_assembled');
  const contextItems: any[] = contextEvent ? ((contextEvent.payload as any)?.items || (contextEvent.payload as any)?.metadata?.items || []) : [];

  // ── Live status label ────────────────────────────────────────────────────
  const lastToolCallEvent = [...events].reverse().find(e => e.type === 'tool_called');
  const lastToolName: string = lastToolCallEvent ? ((lastToolCallEvent.payload as any)?.toolName || '') : '';

  const getLiveStateLabel = (): { label: string; color: string } => {
    if (!isStreaming) {
      if (activeTaskStatus === 'completed') return { label: 'Completed', color: 'var(--success)' };
      if (activeTaskStatus === 'failed') return { label: 'Failed', color: 'var(--error)' };
      if (activeTaskStatus === 'cancelled') return { label: 'Cancelled', color: 'var(--text-muted)' };
      return { label: 'Idle', color: 'var(--text-muted)' };
    }
    if (activeTaskStatus === 'planning') return { label: 'Thinking...', color: '#a78bfa' };
    if (lastToolName) {
      const info = getToolLabel(lastToolName);
      return { label: `${info.label}...`, color: info.color };
    }
    return { label: 'Working...', color: '#60a5fa' };
  };
  const liveState = getLiveStateLabel();

  // ── Tool events list for Terminal tab ────────────────────────────────────
  const toolEvents = events.filter(e => e.type === 'tool_called' || e.type === 'tool_result');

  return (
    <>
      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.8; }
          70% { transform: scale(2); opacity: 0; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .timeline-step-enter {
          animation: fadeSlideIn 0.25s ease forwards;
        }
        .phase-connector {
          width: 2px;
          background: var(--border);
          flex-shrink: 0;
          margin-left: 5px;
        }
        .phase-connector.active {
          background: linear-gradient(to bottom, var(--accent-primary), transparent);
        }
        .sidebar-tab:hover {
          color: var(--text-primary) !important;
          background: rgba(255,255,255,0.04) !important;
        }
      `}</style>
      <aside style={{
        width: '320px',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        
        {/* Premium Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          padding: '0 4px',
        }}>
          {[
            { id: 'timeline',  label: 'Timeline',  icon: <GitBranch size={14} /> },
            { id: 'overview',  label: 'Overview',  icon: <Layers size={14} /> },
            { id: 'review',    label: 'Review',    icon: <FileCode size={14} /> },
            { id: 'terminal',  label: 'Logs',      icon: <Terminal size={14} /> },
          ].map(tab => {
            const isActive = activeRightTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveRightTab(tab.id as any)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '11px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                className="sidebar-tab"
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ─── TIMELINE PANEL ─────────────────────────────────────────── */}
          {activeRightTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

              {/* Header: live state + duration */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isStreaming ? (
                      <PulsingDot color={liveState.color} />
                    ) : (
                      <Circle size={8} style={{ color: liveState.color, fill: liveState.color }} />
                    )}
                    <span style={{ fontSize: '12px', fontWeight: 700, color: liveState.color }}>
                      {liveState.label}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {elapsedMs > 0 ? formatDuration(elapsedMs) : '—'}
                  </span>
                </div>
                {elapsedMs > 0 && !isStreaming && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Worked for {formatDurationVerbose(elapsedMs)}
                  </div>
                )}
              </div>

              {/* Execution phases pipeline */}
              <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  EXECUTION PIPELINE
                </div>
                {PHASE_ORDER.map((phase, idx) => {
                  const meta = PHASE_META[phase];
                  const isDone = phaseIdx > idx;
                  const isActive = phaseIdx === idx && (isStreaming || activeTaskStatus === 'queued');
                  const isFailed = !isStreaming && (activeTaskStatus === 'failed' || activeTaskStatus === 'cancelled') && phaseIdx === idx;
                  const isLast = idx === PHASE_ORDER.length - 1;

                  let dotColor = 'var(--border)';
                  if (isDone) dotColor = 'var(--success)';
                  if (isActive) dotColor = meta.color;
                  if (isFailed) dotColor = 'var(--error)';

                  return (
                    <div key={phase} style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
                      {/* Left column: dot + connector */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px', flexShrink: 0 }}>
                        <div style={{
                          width: 12, height: 12, borderRadius: '50%',
                          background: dotColor,
                          border: isActive ? `2px solid ${meta.color}` : '2px solid transparent',
                          boxShadow: isActive ? `0 0 8px ${meta.color}88` : 'none',
                          flexShrink: 0,
                          transition: 'all 0.3s ease',
                          marginTop: '2px',
                        }} />
                        {!isLast && (
                          <div style={{
                            flex: 1,
                            width: '2px',
                            minHeight: '20px',
                            background: isDone ? 'var(--success)' : 'var(--border)',
                            opacity: isDone ? 0.5 : 0.3,
                            marginTop: '2px',
                            marginBottom: '2px',
                          }} />
                        )}
                      </div>
                      {/* Right column: label + extras */}
                      <div style={{ paddingBottom: isLast ? 0 : '8px', flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          color: isDone ? 'var(--text-secondary)' : isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                          fontWeight: isActive ? 600 : 500,
                          fontSize: '12px',
                        }}>
                          <span style={{ color: dotColor }}>{meta.icon}</span>
                          {meta.label}
                          {isFailed && <XCircle size={11} style={{ color: 'var(--error)', marginLeft: '2px' }} />}
                          {isDone && <CheckCircle size={11} style={{ color: 'var(--success)', marginLeft: '2px', opacity: 0.7 }} />}
                        </div>

                        {/* Phase-specific details */}
                        {phase === 'reasoning' && contextItems.length > 0 && (isDone || isActive) && (
                          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                            {contextItems.length} context item{contextItems.length !== 1 ? 's' : ''} retrieved
                          </div>
                        )}
                        {phase === 'executing' && toolCallPairs.length > 0 && (isDone || isActive) && (
                          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                            {toolCallPairs.length} tool call{toolCallPairs.length !== 1 ? 's' : ''}
                            {toolCallPairs.some(p => !p.success) && (
                              <span style={{ color: 'var(--error)', marginLeft: '6px' }}>
                                {toolCallPairs.filter(p => !p.success).length} failed
                              </span>
                            )}
                          </div>
                        )}
                        {phase === 'validating' && verifications.length > 0 && (isDone || isActive) && (
                          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                            {verifications.length} build check{verifications.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {phase === 'final_response' && !isStreaming && activeTaskStatus === 'completed' && (
                          <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                            {totalTokens > 0 ? `${totalTokens.toLocaleString()} tokens · $${totalCost.toFixed(4)}` : 'Response generated'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Divider */}
              <div style={{ margin: '16px 16px 0', borderTop: '1px solid var(--border)' }} />

              {/* Tool Calls timeline */}
              {toolCallPairs.length > 0 && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                    TOOL CALLS ({toolCallPairs.length})
                  </div>
                  {toolCallPairs.map((pair, idx) => {
                    const tInfo = getToolLabel(pair.toolName);
                    const isExp = expandedEventId === pair.id;
                    const isDone = !!pair.resultEvent;
                    return (
                      <div
                        key={pair.id}
                        className="timeline-step-enter"
                        style={{
                          background: 'var(--bg-secondary)',
                          border: `1px solid ${isExp ? tInfo.color + '55' : 'var(--border)'}`,
                          borderRadius: '8px',
                          overflow: 'hidden',
                          transition: 'border-color 0.2s',
                        }}
                      >
                        <div
                          onClick={() => setExpandedEventId(isExp ? null : pair.id)}
                          style={{
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                            {isExp ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: isDone ? (pair.success ? 'var(--success)' : 'var(--error)') : tInfo.color,
                              flexShrink: 0,
                              boxShadow: !isDone ? `0 0 6px ${tInfo.color}` : 'none',
                            }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pair.toolName}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, fontSize: '10px' }}>
                            {pair.durationMs > 0 && (
                              <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {formatDuration(pair.durationMs)}
                              </span>
                            )}
                            {isDone && (
                              <span style={{ color: pair.success ? 'var(--success)' : 'var(--error)', fontWeight: 700 }}>
                                {pair.success ? '✓' : '✗'}
                              </span>
                            )}
                            {!isDone && isStreaming && (
                              <PulsingDot color={tInfo.color} />
                            )}
                          </div>
                        </div>

                        {isExp && (
                          <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                            {/* Input args */}
                            <div style={{ padding: '8px 10px' }}>
                              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>INPUT</div>
                              <pre style={{
                                margin: 0, padding: 0,
                                fontSize: '9px', fontFamily: 'JetBrains Mono, monospace',
                                color: 'var(--text-secondary)',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                lineHeight: 1.5,
                                maxHeight: '120px', overflowY: 'auto',
                              }}>
                                {JSON.stringify(pair.input, null, 2)}
                              </pre>
                            </div>
                            {/* Output */}
                            {pair.output !== undefined && (
                              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '4px' }}>OUTPUT</div>
                                <pre style={{
                                  margin: 0, padding: 0,
                                  fontSize: '9px', fontFamily: 'JetBrains Mono, monospace',
                                  color: 'var(--text-secondary)',
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                  lineHeight: 1.5,
                                  maxHeight: '120px', overflowY: 'auto',
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
              )}

              {/* Empty state */}
              {!isStreaming && events.length === 0 && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center',
                  padding: '32px 24px',
                  gap: '10px',
                }}>
                  <GitBranch size={32} style={{ opacity: 0.25 }} />
                  <div style={{ fontWeight: 600 }}>No task running</div>
                  <div style={{ opacity: 0.7, fontSize: '10px' }}>Send a message to see live execution details</div>
                </div>
              )}

            </div>
          )}

          {/* ─── OVERVIEW PANEL ─────────────────────────────────────────── */}
          {activeRightTab === 'overview' && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Token Usage Card */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={14} style={{ color: 'var(--accent-primary)' }} /> Token Usage Metrics
                </div>
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {/* Token counts */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { label: 'Prompt', value: promptTokens, color: 'var(--accent-primary)' },
                      { label: 'Completion', value: completionTokens, color: 'var(--success)' },
                      { label: 'Total', value: totalTokens, color: 'var(--text-secondary)' },
                    ].map(item => (
                      <div key={item.label} style={{
                        flex: 1, background: 'var(--bg-panel)', borderRadius: '8px',
                        padding: '8px', textAlign: 'center', border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: item.color, fontFamily: 'JetBrains Mono, monospace' }}>
                          {item.value > 0 ? item.value.toLocaleString() : '—'}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Progress bar */}
                  <div>
                    <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', display: 'flex', overflow: 'hidden' }}>
                      <div style={{
                        width: totalTokens ? `${(promptTokens / totalTokens) * 100}%` : '0%',
                        background: 'var(--accent-primary)',
                        height: '100%',
                        transition: 'width 0.5s ease',
                      }} title={`Prompt: ${promptTokens}`} />
                      <div style={{
                        width: totalTokens ? `${(completionTokens / totalTokens) * 100}%` : '0%',
                        background: 'var(--success)',
                        height: '100%',
                        transition: 'width 0.5s ease',
                      }} title={`Completion: ${completionTokens}`} />
                    </div>
                  </div>
                  {/* Cost */}
                  {totalCost > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                      Estimated cost: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>${totalCost.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Files Touched Card */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCode size={14} style={{ color: 'var(--accent-primary)' }} /> Files Touched ({filesTouched.length})
                </div>
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}>
                  {filesTouched.length === 0 ? (
                    <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                      No files written yet.
                    </div>
                  ) : (
                    filesTouched.map((p, idx) => {
                      const parts = p.split(/[/\\]/);
                      const name = parts[parts.length - 1];
                      return (
                        <div key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderBottom: idx < filesTouched.length - 1 ? '1px solid var(--border)' : 'none',
                          fontSize: '11px',
                        }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '80%' }} title={p}>
                            {name}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>modified</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ─── REVIEW PANEL ───────────────────────────────────────────── */}
          {activeRightTab === 'review' && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Verification Status */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} /> Task Verifications
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {verifications.length === 0 ? (
                    <div style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '24px 16px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                    }}>
                      <Activity size={24} style={{ margin: '0 auto 8px', opacity: 0.4, display: 'block' }} />
                      No build or verification logs detected in this session yet.
                    </div>
                  ) : (
                    verifications.map((run, idx) => (
                      <div key={idx} style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '12px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '75%' }}>
                            $ {run.command}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                            color: run.success ? 'var(--success)' : 'var(--error)'
                          }}>
                            {run.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {run.success ? 'PASSED' : 'FAILED'}
                          </span>
                        </div>
                        <pre style={{
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '8px',
                          fontSize: '9px',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: 'var(--text-secondary)',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '120px',
                          margin: 0
                        }}>
                          {run.output}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Changes Drawer */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCode size={14} style={{ color: 'var(--accent-primary)' }} /> Changes for Review ({filesTouched.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filesTouched.map((p, idx) => (
                    <div key={idx} style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={p}>
                          {p.split(/[/\\]/).pop()}
                        </span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {p}
                        </span>
                      </div>
                      <button style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        flexShrink: 0
                      }}>
                        Diff <ExternalLink size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ─── LOGS PANEL ─────────────────────────────────────────────── */}
          {activeRightTab === 'terminal' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>OPERATIONAL EVENT LOGS</span>
                <span style={{ color: 'var(--text-muted)' }}>{toolEvents.length} events</span>
              </div>
              
              <div style={{ flex: 1, padding: '0 12px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {toolEvents.length === 0 ? (
                  <div style={{
                    padding: '48px 0',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}>
                    No active operational logs.
                  </div>
                ) : (
                  toolEvents.map((e, idx) => {
                    const isCall = e.type === 'tool_called';
                    const isExpanded = expandedEventId === e.id;
                    const payload = e.payload as any;
                    const toolName = payload.toolName || payload.metadata?.toolName;
                    const durationMs = payload.durationMs || payload.metadata?.durationMs;
                    const success = payload.success ?? payload.metadata?.success;
                    const input = payload.input || payload.metadata?.input;
                    const output = payload.output || payload.metadata?.output;

                    return (
                      <div 
                        key={e.id || idx} 
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '11px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div 
                          onClick={() => setExpandedEventId(isExpanded ? null : e.id)}
                          style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            background: isCall ? 'rgba(99, 102, 241, 0.03)' : 'rgba(16, 185, 129, 0.03)',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            {isExpanded ? <ChevronDown size={12} style={{ opacity: 0.5 }} /> : <ChevronRight size={12} style={{ opacity: 0.5 }} />}
                            <span style={{ color: isCall ? 'var(--accent-primary)' : 'var(--success)', fontWeight: 600 }}>
                              {isCall ? '▶ CALL' : '◀ RESP'}
                            </span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {toolName}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, fontSize: '9px', color: 'var(--text-muted)' }}>
                            {!isCall && durationMs !== undefined && (
                              <span>{(durationMs / 1000).toFixed(1)}s</span>
                            )}
                            {!isCall && (
                              <span style={{ color: success ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                                {success ? 'SUCCESS' : 'FAILED'}
                              </span>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{
                            padding: '12px',
                            borderTop: '1px solid var(--border)',
                            background: 'var(--bg-panel)',
                          }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                              {isCall ? 'INPUT ARGUMENTS' : 'OUTPUT PAYLOAD'}
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: 0,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              fontSize: '10px',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.5,
                            }}>
                              {JSON.stringify(isCall ? input : (output || e.payload), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </aside>
    </>
  );
}
