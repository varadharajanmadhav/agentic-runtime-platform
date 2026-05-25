import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/index.js';
import { TerminalPanel } from './TerminalPanel.js';
import { DiffViewer } from './DiffViewer.js';
import { 
  Activity, 
  Terminal, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Brain, 
  Wrench, 
  ShieldCheck, 
  Zap, 
  Circle, 
  GitBranch,
  ChevronDown,
  ChevronRight,
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

export function RightSidebar() {
  const { 
    events, 
    tasks, 
    isStreaming,
    activeRightTab, 
  } = useAppStore();

  const [localTab, setLocalTab] = useState<'diffs' | 'terminal' | 'timeline' | 'metrics'>('diffs');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync tab focus when clicked from ChatPanel (contextual links)
  useEffect(() => {
    if (activeRightTab === 'review') {
      setLocalTab('diffs');
    } else if (activeRightTab === 'terminal') {
      setLocalTab('terminal');
    } else if (activeRightTab === 'timeline') {
      setLocalTab('timeline');
    }
  }, [activeRightTab]);

  // ── Derived metrics ─────────────────────────────────────────────────────
  const totalTokens = tasks.reduce((sum, t) => sum + (t.totalTokens || 0), 0);
  const promptTokens = tasks.reduce((sum, t) => sum + (t.promptTokens || 0), 0);
  const completionTokens = tasks.reduce((sum, t) => sum + (t.completionTokens || 0), 0);
  const totalCost = tasks.reduce((sum, t) => sum + (t.estimatedCostUsd || 0), 0);

  // Active task
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

  const activePhase = getPhaseFromStatus(activeTaskStatus);
  const phaseIdx = PHASE_ORDER.indexOf(activePhase);

  // Diagnostics / builds
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

  // Tool pairs
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

  // Render Timeline
  const renderTimeline = () => (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 0', overflowY: 'auto' }}>
      {/* Live duration */}
      <div style={{
        padding: '0 16px 12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isStreaming ? <PulsingDot color={liveState.color} /> : <Circle size={8} style={{ color: liveState.color, fill: liveState.color }} />}
          <span style={{ fontSize: '11px', fontWeight: 700, color: liveState.color }}>{liveState.label}</span>
        </div>
        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {elapsedMs > 0 ? formatDuration(elapsedMs) : '—'}
        </span>
      </div>

      {/* Execution phases */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
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
            <div key={phase} style={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px', flexShrink: 0 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: dotColor,
                  border: isActive ? `2px solid ${meta.color}` : '2px solid transparent',
                  flexShrink: 0,
                  marginTop: '3px',
                }} />
                {!isLast && (
                  <div style={{
                    flex: 1, width: '1.5px', minHeight: '16px',
                    background: isDone ? 'var(--success)' : 'var(--border)',
                    opacity: isDone ? 0.5 : 0.3,
                  }} />
                )}
              </div>
              <div style={{ paddingBottom: isLast ? 0 : '8px', flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  color: isDone ? 'var(--text-secondary)' : isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '11px',
                }}>
                  <span style={{ color: dotColor }}>{meta.icon}</span>
                  {meta.label}
                  {isFailed && <XCircle size={10} style={{ color: 'var(--error)', marginLeft: '2px' }} />}
                  {isDone && <CheckCircle size={10} style={{ color: 'var(--success)', marginLeft: '2px', opacity: 0.7 }} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', margin: '12px 16px 0' }} />

      {/* Tool timeline */}
      {toolCallPairs.length > 0 ? (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {toolCallPairs.map((pair) => {
            const tInfo = getToolLabel(pair.toolName);
            const isExp = expandedEventId === pair.id;
            const isDone = !!pair.resultEvent;
            return (
              <div
                key={pair.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${isExp ? tInfo.color + '55' : 'var(--border)'}`,
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setExpandedEventId(isExp ? null : pair.id)}
                  style={{
                    padding: '6px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
                    {isExp ? <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />}
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: isDone ? (pair.success ? 'var(--success)' : 'var(--error)') : tInfo.color,
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '10.5px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pair.toolName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontSize: '9px' }}>
                    {pair.durationMs > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {formatDuration(pair.durationMs)}
                      </span>
                    )}
                    {isDone && <span style={{ color: pair.success ? 'var(--success)' : 'var(--error)', fontWeight: 700 }}>{pair.success ? '✓' : '✗'}</span>}
                  </div>
                </div>

                {isExp && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', padding: '6px' }}>
                    <pre style={{
                      margin: 0, fontSize: '9px', fontFamily: 'monospace',
                      color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      maxHeight: '100px', overflowY: 'auto'
                    }}>
                      {JSON.stringify(pair.input, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px', padding: '24px', textAlign: 'center' }}>
          No active runs in this session.
        </div>
      )}
    </div>
  );

  // Render Metrics
  const renderMetrics = () => (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
      {/* Token details */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>TOKEN UTILIZATION</div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            {[
              { label: 'Prompt', value: promptTokens, color: 'var(--accent-primary)' },
              { label: 'Completion', value: completionTokens, color: 'var(--success)' },
              { label: 'Total', value: totalTokens, color: 'var(--text-secondary)' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, background: 'var(--bg-panel)', borderRadius: '6px', padding: '6px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: item.color, fontFamily: 'monospace' }}>
                  {item.value > 0 ? item.value.toLocaleString() : '—'}
                </div>
                <div style={{ fontSize: '8.5px', color: 'var(--text-muted)', marginTop: '1px' }}>{item.label}</div>
              </div>
            ))}
          </div>
          {totalTokens > 0 && (
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'right' }}>
              Est. Session Cost: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${totalCost.toFixed(4)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Build Diagnostics list */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>TASK DIAGNOSTICS ({verifications.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {verifications.length === 0 ? (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '10.5px' }}>
              No test or build verifications run.
            </div>
          ) : (
            verifications.map((run, idx) => (
              <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '70%' }}>
                    $ {run.command}
                  </span>
                  <span style={{ color: run.success ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                    {run.success ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.8; }
          70% { transform: scale(2); opacity: 0; }
          100% { transform: scale(2); opacity: 0; }
        }
        .pane-tab:hover {
          color: var(--text-primary) !important;
          background: rgba(255,255,255,0.02) !important;
        }
      `}</style>
      <aside style={{
        width: '400px',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        height: '100%',
      }}>
        {/* Tab Headers */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}>
          {[
            { id: 'diffs', label: 'Diffs', icon: <CheckCircle size={13} /> },
            { id: 'terminal', label: 'Terminal', icon: <Terminal size={13} /> },
            { id: 'timeline', label: 'Timeline', icon: <GitBranch size={13} /> },
            { id: 'metrics', label: 'Metrics', icon: <Activity size={13} /> },
          ].map(tab => {
            const isActive = localTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setLocalTab(tab.id as any)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '10px 4px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                className="pane-tab"
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        
        {/* Content Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {localTab === 'diffs' && <DiffViewer />}
          {localTab === 'terminal' && <TerminalPanel />}
          {localTab === 'timeline' && renderTimeline()}
          {localTab === 'metrics' && renderMetrics()}
        </div>
      </aside>
    </>
  );
}
