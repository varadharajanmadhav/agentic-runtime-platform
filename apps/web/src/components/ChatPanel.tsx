import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAppStore, apiFetch } from '../store/index.js';
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
  CornerDownLeft,
  Copy,
  Check,
  RotateCcw,
  Pencil,
  Zap,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const INLINE_TOOL_LABELS: Record<string, { label: string; color: string }> = {
  read_file:       { label: 'read file',        color: '#60a5fa' },
  write_file:      { label: 'write code',       color: '#34d399' },
  list_dir:        { label: 'list directory',   color: '#a78bfa' },
  run_terminal:    { label: 'exec command',     color: '#fb923c' },
  run_command:     { label: 'exec command',     color: '#fb923c' },
  search_code:     { label: 'search codebase',  color: '#f472b6' },
  web_search:      { label: 'search web',       color: '#38bdf8' },
  grep_search:     { label: 'scan files',       color: '#e879f9' },
  get_diagnostics: { label: 'run diagnostics',  color: '#f59e0b' },
  create_file:     { label: 'create file',      color: '#4ade80' },
  delete_file:     { label: 'delete file',      color: '#f87171' },
  move_file:       { label: 'move file',        color: '#fbbf24' },
  git_log:         { label: 'view git log',     color: '#06b6d4' },
  git_show:        { label: 'view commit',      color: '#0d9488' },
  dotnet_build:    { label: 'build project',    color: '#8b5cf6' },
  dotnet_test:     { label: 'run tests',        color: '#ec4899' },
  npm_run:         { label: 'run npm script',   color: '#eab308' },
  npm_install:     { label: 'install package',  color: '#10b981' },
  default:         { label: 'call tool',        color: '#94a3b8' },
};

const SLASH_COMMANDS = [
  { name: 'clear',   desc: 'Start a fresh conversation' },
  { name: 'new',     desc: 'New session in this workspace' },
  { name: 'explain', desc: 'Explain this codebase', prompt: 'Can you provide a comprehensive explanation of how this codebase is structured, its main technologies, and where the core logic resides?' },
  { name: 'fix',     desc: 'Fix the build', prompt: 'I am experiencing build issues. Can you analyze the build configuration and suggest fixes?' },
  { name: 'test',    desc: 'Run the tests', prompt: 'Can you help me run the unit tests and verify code correctness?' },
  { name: 'review',  desc: 'Review recent git changes', prompt: 'Can you review the recent git commits or local workspace changes and summarize what has changed?' },
  { name: 'help',    desc: 'Show what I can do', prompt: 'What can you help me with in this project? Please give me an overview of your capabilities.' },
] as const;

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

const toolExecutionCache = new Map<string, ToolExecution[]>();

function renderToolDetails(exec: ToolExecution, isLive: boolean): React.ReactNode {
  const isDone = !isLive || exec.durationMs > 0 || exec.output !== undefined;
  if (!isDone) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: 4 }}>
        Executing...
      </div>
    );
  }

  const getLinesCount = (txt: any) => (typeof txt !== 'string' ? 0 : txt.split('\n').length);

  switch (exec.toolName) {
    case 'read_file': {
      const code = typeof exec.output === 'string' ? exec.output : JSON.stringify(exec.output, null, 2);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>▼ {getLinesCount(code)} lines</div>
          <pre style={{ margin: 0, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
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
      let totalAdded = 0, totalDeleted = 0;
      if (exec.input) {
        if (exec.input.ReplacementChunks && Array.isArray(exec.input.ReplacementChunks)) {
          exec.input.ReplacementChunks.forEach((c: any) => chunks.push({ target: c.TargetContent, replacement: c.ReplacementContent }));
        } else if (exec.input.TargetContent || exec.input.ReplacementContent) {
          chunks.push({ target: exec.input.TargetContent, replacement: exec.input.ReplacementContent });
        }
      }
      chunks.forEach(c => {
        if (c.target) totalDeleted += getLinesCount(c.target);
        if (c.replacement) totalAdded += getLinesCount(c.replacement);
      });
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>▼ +{totalAdded} −{totalDeleted} lines</div>
          <pre style={{ margin: 0, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'monospace', overflowX: 'auto', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {chunks.map((chunk, idx) => (
              <div key={idx} style={{ borderBottom: idx < chunks.length - 1 ? '1px dashed var(--border)' : 'none', paddingBottom: idx < chunks.length - 1 ? 8 : 0, marginBottom: idx < chunks.length - 1 ? 8 : 0 }}>
                {chunk.target && chunk.target.split('\n').map((line, lIdx) => (
                  <div key={`del-${lIdx}`} style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.05)', padding: '0 4px' }}>- {line}</div>
                ))}
                {chunk.replacement && chunk.replacement.split('\n').map((line, lIdx) => (
                  <div key={`add-${lIdx}`} style={{ color: 'var(--success)', background: 'rgba(16,185,129,0.05)', padding: '0 4px' }}>+ {line}</div>
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
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: exec.success ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>▼ exit {exec.success ? '0' : '1'}</div>
          <pre style={{ margin: 0, padding: 10, background: '#090d16', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'monospace', color: exec.success ? '#86efac' : '#fca5a5', overflowX: 'auto', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {outputTxt || '(no output)'}
          </pre>
        </div>
      );
    }
    default: {
      const outTxt = typeof exec.output === 'string' ? exec.output : JSON.stringify(exec.output, null, 2);
      return (
        <pre style={{ margin: 0, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', overflowX: 'auto', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {outTxt || '(no output)'}
        </pre>
      );
    }
  }
}

function ToolCard({ exec, isLive }: { exec: ToolExecution; isLive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = INLINE_TOOL_LABELS[exec.toolName] ?? INLINE_TOOL_LABELS.default;
  const isDone = !isLive || exec.durationMs > 0 || exec.output !== undefined;

  return (
    <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 2 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: 'pointer', background: 'transparent', userSelect: 'none' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: config.color, fontWeight: 600, fontFamily: 'monospace' }}>{config.label}</span>
        {exec.input?.path && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {exec.input.path}
          </span>
        )}
        {exec.input?.command && !exec.input?.path && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {exec.input.command}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {exec.durationMs > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{exec.durationMs}ms</span>
          )}
          {expanded ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />}
          {isDone ? (
            exec.success !== false
              ? <CheckCircle2 size={12} style={{ color: config.color }} />
              : <X size={12} style={{ color: 'var(--error)' }} />
          ) : (
            <Loader2 size={12} className="animate-spin" style={{ color: config.color }} />
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', padding: 10 }}>
          {renderToolDetails(exec, isLive)}
        </div>
      )}
    </div>
  );
}

function ToolCardsSection({ taskId }: { taskId: string }) {
  const [dbExecutions, setDbExecutions] = useState<ToolExecution[]>(() => toolExecutionCache.get(taskId) ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (toolExecutionCache.has(taskId)) {
      setDbExecutions(toolExecutionCache.get(taskId)!);
      return;
    }
    let active = true;
    const fetchTools = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${API_URL}/api/tasks/${taskId}/tools`);
        const json = await res.json();
        if (active && json.success && json.data) {
          toolExecutionCache.set(taskId, json.data);
          setDbExecutions(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch tool executions', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchTools();
    return () => { active = false; };
  }, [taskId]);

  if (loading && dbExecutions.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11, color: 'var(--text-muted)' }}>
        <Loader2 size={12} className="animate-spin" />
        <span>Loading steps...</span>
      </div>
    );
  }
  if (dbExecutions.length === 0) return null;

  return (
    <div style={{ marginBottom: 10, padding: '4px 0', borderRadius: 6, background: 'rgba(255,255,255,0.01)' }}>
      {dbExecutions.map(exec => <ToolCard key={exec.id} exec={exec} isLive={false} />)}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* blocked */ }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        background: 'var(--bg-action)', border: '1px solid var(--border-action)', borderRadius: 6,
        color: copied ? 'var(--success)' : 'var(--text-muted)', width: 26, height: 26, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', flexShrink: 0,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function formatTime(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ChatPanel() {
  const {
    messages, activeSessionId, setActiveSession, createSession,
    sendMessage, isStreaming, streamingText, events,
    cancelActiveTask, sessions, activeTaskId, tasks,
    selectedComplexity, setSelectedComplexity, settings,
    user, showToast, workspaceFiles, fetchWorkspaceFiles,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; path?: string; isWorkspaceFile: boolean }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);

  // @file mention state
  const [atOpen, setAtOpen] = useState(false);
  const [atFilter, setAtFilter] = useState('');
  const [atIdx, setAtIdx] = useState(0);
  const [atCursorPos, setAtCursorPos] = useState(0);

  const filteredSlashCmds = useMemo(() => {
    if (!slashFilter) return [...SLASH_COMMANDS];
    return SLASH_COMMANDS.filter(c => c.name.startsWith(slashFilter));
  }, [slashFilter]);

  const filteredFiles = useMemo(() => {
    if (!workspaceFiles.length) return [];
    if (!atFilter) return workspaceFiles.slice(0, 8);
    const lc = atFilter.toLowerCase();
    return workspaceFiles.filter(f => f.toLowerCase().includes(lc)).slice(0, 8);
  }, [workspaceFiles, atFilter]);

  const taskStartedEvent = events.find(e => e.type === 'task_started');
  const taskEndEvent = events.find(e => e.type === 'task_completed' || e.type === 'task_failed');

  useEffect(() => {
    if (isStreaming && taskStartedEvent) {
      const startTs = new Date(taskStartedEvent.timestamp).getTime();
      timerRef.current = setInterval(() => { setElapsedMs(Date.now() - startTs); }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (taskStartedEvent && taskEndEvent) {
        setElapsedMs(new Date(taskEndEvent.timestamp).getTime() - new Date(taskStartedEvent.timestamp).getTime());
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

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > 1024 * 1024) { showToast(`"${file.name}" exceeds 1 MB`, 'error'); continue; }
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
  }, [showToast]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) await processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const executeSlashCommand = useCallback(async (cmd: typeof SLASH_COMMANDS[number]) => {
    setSlashOpen(false);
    setInput('');
    if (cmd.name === 'clear' || cmd.name === 'new') {
      const session = await createSession('New Conversation', sessions.find(s => s.id === activeSessionId)?.workspaceDir);
      await setActiveSession(session.id);
      return;
    }
    if ('prompt' in cmd && cmd.prompt) {
      setInput(cmd.prompt);
      textareaRef.current?.focus();
    }
  }, [createSession, setActiveSession, activeSessionId, sessions]);

  const selectAtFile = useCallback(async (filePath: string) => {
    setAtOpen(false);
    const textBefore = input.slice(0, atCursorPos).replace(/@\S*$/, '');
    const textAfter = input.slice(atCursorPos);
    setInput(textBefore + textAfter);
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
    try {
      const session = sessions.find(s => s.id === activeSessionId);
      const res = await apiFetch(`${API_URL}/api/context/file-content?workspaceDir=${encodeURIComponent(session?.workspaceDir ?? '')}&path=${encodeURIComponent(filePath)}`);
      const json = await res.json();
      if (json.success && json.data?.content !== undefined) {
        setAttachments(prev => [...prev, { name: fileName, content: json.data.content, path: filePath, isWorkspaceFile: true }]);
        showToast(`Attached ${fileName}`, 'success');
      } else {
        showToast(`Could not attach ${fileName}`, 'error');
      }
    } catch (err) {
      console.error('Failed to fetch file for @mention', err);
      showToast(`Failed to attach ${fileName}`, 'error');
    }
    textareaRef.current?.focus();
  }, [input, atCursorPos, activeSessionId, sessions, showToast]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    if (val.startsWith('/')) {
      const filter = val.slice(1).split(' ')[0];
      setSlashFilter(filter);
      setSlashOpen(true);
      setSlashIdx(0);
      setAtOpen(false);
    } else {
      setSlashOpen(false);
    }

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\S*)$/);
    if (atMatch) {
      setAtFilter(atMatch[1]);
      setAtCursorPos(cursorPos);
      setAtOpen(true);
      setSlashOpen(false);
      if (workspaceFiles.length === 0) fetchWorkspaceFiles();
    } else {
      setAtOpen(false);
    }
  }, [workspaceFiles.length, fetchWorkspaceFiles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;

    const userText = input.trim();
    let apiContent = userText;
    let displayContent: string | undefined;

    if (attachments.length > 0) {
      const fileRefs = attachments.map(a => `[${a.name}]`).join(' ');
      displayContent = userText ? `${userText} ${fileRefs}` : fileRefs;
      apiContent += '\n\n### Attached Files:\n';
      attachments.forEach(att => { apiContent += `\n---\nFile: ${att.name}\n\`\`\`\n${att.content}\n\`\`\`\n`; });
    }

    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSession('New Conversation', undefined);
        targetSessionId = session.id;
        await setActiveSession(session.id);
      } catch { return; }
    }
    await sendMessage(targetSessionId, apiContent, undefined, displayContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashOpen && filteredSlashCmds.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filteredSlashCmds.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => (i - 1 + filteredSlashCmds.length) % filteredSlashCmds.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); executeSlashCommand(filteredSlashCmds[slashIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return; }
    }
    if (atOpen && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAtIdx(i => (i + 1) % filteredFiles.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAtIdx(i => (i - 1 + filteredFiles.length) % filteredFiles.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectAtFile(filteredFiles[atIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAtOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleCancel = async () => { await cancelActiveTask(); };

  const activeTaskObj = activeTaskId ? tasks.find(t => t.id === activeTaskId) : undefined;
  const activeTaskStatus = activeTaskObj?.status ?? 'queued';

  const chronoTasks = useMemo(() => [...tasks].reverse(), [tasks]);
  const chronoAssistantMsgs = useMemo(() => messages.filter(m => m.role === 'assistant'), [messages]);

  const lastUserMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i];
    }
    return null;
  }, [messages]);

  // Live tool pairs for streaming turn
  const liveToolPairs = useMemo((): ToolExecution[] => {
    if (!isStreaming || !activeTaskId) return [];
    const callEvts = events.filter(e => e.type === 'tool_called' && e.taskId === activeTaskId);
    const resEvts = events.filter(e => e.type === 'tool_result' && e.taskId === activeTaskId);
    return callEvts.map(call => {
      const name = (call.payload as any)?.toolName;
      const res = resEvts.find(r => (r.payload as any)?.toolName === name && new Date(r.timestamp) > new Date(call.timestamp));
      return {
        id: call.id || Math.random().toString(),
        toolName: name || 'tool',
        input: (call.payload as any)?.input,
        output: res ? (res.payload as any)?.output : undefined,
        success: res ? (res.payload as any)?.success ?? true : false,
        durationMs: res ? (res.payload as any)?.durationMs ?? 0 : 0,
        createdAt: new Date(call.timestamp).toISOString(),
      };
    });
  }, [events, isStreaming, activeTaskId]);

  const charCount = input.length;
  const charColor = charCount > 4000 ? 'var(--error)' : charCount > 2000 ? '#f59e0b' : 'var(--text-muted)';
  const userInitials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'U';

  if (!activeSessionId && sessions.length > 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Select a session from the sidebar
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Scrollable messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '0 20px 128px 20px' }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>

          {messages.length === 0 && !isStreaming ? (
            /* Empty state */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 16px 32px', textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
              <div className="avatar-gradient" style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Sparkles size={28} style={{ color: '#fff' }} />
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary) 30%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8, letterSpacing: '-0.02em' }}>
                Agentic Runtime Platform
              </h1>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.5 }}>
                How can I assist you today? Type below or pick a prompt — use <code style={{ fontSize: 12, background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>/</code> for commands, <code style={{ fontSize: 12, background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>@</code> to attach workspace files.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: '100%' }}>
                {[
                  { label: 'Explain this codebase', prompt: 'Can you provide a comprehensive explanation of how this codebase is structured, its main technologies, and where the core logic resides?' },
                  { label: 'Fix the build', prompt: 'I am experiencing issues building the project. Can you analyze the build configuration and suggest fixes?' },
                  { label: 'Run the tests', prompt: 'Can you help me run the unit tests and verify the code correctness?' },
                  { label: 'Review recent changes', prompt: 'Can you review the recent git commits or local workspace changes and summarize what has changed?' },
                  { label: 'Check project health', prompt: 'Could you run diagnostics on the repository and identify any syntax errors or lint issues?' },
                  { label: 'Optimize code efficiency', prompt: 'Can you inspect the core package files and suggest performance improvements or optimizations?' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => { setInput(chip.prompt); textareaRef.current?.focus(); }}
                    className="prompt-chip"
                    style={{ padding: '12px 14px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{chip.label}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>{chip.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              let matchingTaskId = '';
              if (!isUser) {
                const astIndex = chronoAssistantMsgs.indexOf(msg);
                if (astIndex !== -1 && chronoTasks[astIndex]) {
                  matchingTaskId = chronoTasks[astIndex].id;
                }
              }
              const timestamp = formatTime((msg as any).createdAt);
              const msgId = msg.id || String(index);
              const isHovered = hoveredMsgId === msgId;

              return (
                <div
                  key={msgId}
                  onMouseEnter={() => setHoveredMsgId(msgId)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                  style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', width: '100%' }}
                >
                  {isUser ? (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '65%' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div className="msg-user" style={{
                          padding: '10px 16px',
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          lineHeight: 1.5,
                        }}>
                          <MarkdownRenderer content={msg.content} />
                        </div>
                        {/* Hover actions for user message */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          opacity: isHovered ? 1 : 0,
                          transition: 'opacity 150ms ease',
                          pointerEvents: isHovered ? 'auto' : 'none',
                        }}>
                          {timestamp && (
                            <time
                              dateTime={typeof (msg as any).createdAt === 'string' ? (msg as any).createdAt : (msg as any).createdAt?.toISOString?.()}
                              style={{ fontSize: 10, color: 'var(--text-muted)' }}
                            >{timestamp}</time>
                          )}
                          <button
                            onClick={() => {
                              const raw = msg.content;
                              const attachIdx = raw.indexOf('\n\n### Attached Files:');
                              setInput(attachIdx !== -1 ? raw.slice(0, attachIdx) : raw);
                              textareaRef.current?.focus();
                            }}
                            title="Edit message"
                            style={{ background: 'var(--bg-action)', border: '1px solid var(--border-action)', borderRadius: 6, color: 'var(--text-muted)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Pencil size={11} />
                          </button>
                          {msg === lastUserMsg && !isStreaming && (
                            <button
                              onClick={() => {
                                const raw = msg.content;
                                const attachIdx = raw.indexOf('\n\n### Attached Files:');
                                setInput(attachIdx !== -1 ? raw.slice(0, attachIdx) : raw);
                                textareaRef.current?.focus();
                              }}
                              title="Retry"
                              style={{ background: 'var(--bg-action)', border: '1px solid var(--border-action)', borderRadius: 6, color: 'var(--text-muted)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Initials */}
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0, marginBottom: 2 }}>
                        {userInitials}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{ width: '100%', borderLeft: '3px solid var(--accent-primary)', paddingLeft: 14, position: 'relative' }}
                    >
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        {(msg as any).model && (
                          <span style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }}>
                            {(msg as any).model}
                          </span>
                        )}
                        {timestamp && (
                          <time
                            dateTime={typeof (msg as any).createdAt === 'string' ? (msg as any).createdAt : (msg as any).createdAt?.toISOString?.()}
                            style={{ fontSize: 10, color: 'var(--text-muted)' }}
                          >{timestamp}</time>
                        )}
                        {/* Hover actions for assistant message */}
                        <div style={{
                          marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center',
                          opacity: isHovered ? 1 : 0,
                          transition: 'opacity 150ms ease',
                          pointerEvents: isHovered ? 'auto' : 'none',
                        }}>
                          <CopyButton text={msg.content} />
                          {!isStreaming && (
                            <button
                              onClick={async () => {
                                if (!lastUserMsg || !activeSessionId) return;
                                const raw = lastUserMsg.content;
                                const attachIdx = raw.indexOf('\n\n### Attached Files:');
                                await sendMessage(activeSessionId, attachIdx !== -1 ? raw.slice(0, attachIdx) : raw);
                              }}
                              title="Regenerate response"
                              style={{ background: 'var(--bg-action)', border: '1px solid var(--border-action)', borderRadius: 6, color: 'var(--text-muted)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Historical tool cards */}
                      {matchingTaskId && <ToolCardsSection taskId={matchingTaskId} />}

                      {/* Message content */}
                      <div className="msg-assistant" style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Active streaming turn */}
          {isStreaming && (
            <div style={{ marginTop: 24, width: '100%', borderLeft: '3px solid var(--accent-primary)', paddingLeft: 14, position: 'relative' }}>
              {/* Status line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: liveToolPairs.length > 0 || streamingText ? 10 : 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', animation: 'ping 1.4s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {activeTaskStatus === 'planning'
                    ? 'Planning...'
                    : activeTaskStatus === 'executing' && !streamingText
                      ? 'Generating...'
                      : activeTaskStatus === 'executing'
                        ? 'Responding...'
                        : 'Working...'}
                </span>
              </div>

              {/* Live tool cards */}
              {liveToolPairs.length > 0 && (
                <div style={{ marginBottom: streamingText ? 10 : 0 }}>
                  {liveToolPairs.map(exec => <ToolCard key={exec.id} exec={exec} isLive={true} />)}
                </div>
              )}

              {/* Streaming text */}
              {streamingText && (
                <div className="msg-assistant" style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
                  <MarkdownRenderer content={streamingText} />
                  <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--accent-primary)', marginLeft: 4, animation: 'pulse 1s infinite' }} />
                </div>
              )}

              {/* Elapsed + stop */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {elapsedMs > 0 ? (elapsedMs / 1000).toFixed(0) + 's' : '0s'}
                </span>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 12, color: '#ef4444', cursor: 'pointer', padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'inherit', fontWeight: 600 }}
                >
                  <CircleStop size={11} />
                  Stop
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          title="Scroll to latest"
          style={{ position: 'absolute', bottom: 140, right: 32, width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 10, transition: 'all 0.15s ease' }}
        >
          <ChevronDown size={16} />
        </button>
      )}

      {/* Input composer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '16px 20px', background: 'linear-gradient(transparent, var(--bg-primary) 30%)', pointerEvents: 'none' }}>
        <div
          onClick={e => e.stopPropagation()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="input-composer"
          style={{ width: '100%', maxWidth: 800, padding: '12px 16px', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', outline: isDragging ? '2px solid var(--accent-primary)' : 'none', transition: 'outline 0.15s ease', position: 'relative' }}
        >
          {/* Slash command dropdown */}
          {slashOpen && filteredSlashCmds.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 50, overflow: 'hidden', boxShadow: '0 -4px 20px rgba(0,0,0,0.4)' }}>
              {filteredSlashCmds.map((cmd, idx) => (
                <div
                  key={cmd.name}
                  onClick={() => executeSlashCommand(cmd)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', background: idx === slashIdx ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.1s ease' }}
                  onMouseEnter={() => setSlashIdx(idx)}
                >
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-primary)', fontWeight: 700, minWidth: 80 }}>/{cmd.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.desc}</span>
                  {idx === slashIdx && <ChevronRight size={10} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                </div>
              ))}
            </div>
          )}

          {/* @file mention dropdown */}
          {atOpen && filteredFiles.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 50, overflow: 'hidden', boxShadow: '0 -4px 20px rgba(0,0,0,0.4)' }}>
              {filteredFiles.map((file, idx) => (
                <div
                  key={file}
                  onClick={() => selectAtFile(file)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', background: idx === atIdx ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.1s ease' }}
                  onMouseEnter={() => setAtIdx(idx)}
                >
                  <FileText size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 500 }}>{file.split(/[/\\]/).pop()}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top bar: model chip + hints */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            {settings && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<'low' | 'medium' | 'high', 'low' | 'medium' | 'high'> = { low: 'medium', medium: 'high', high: 'low' };
                    setSelectedComplexity(next[selectedComplexity]);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 12, fontSize: 10.5, fontFamily: 'monospace', background: 'var(--bg-action)', border: '1px solid var(--border-action)', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <Cpu size={11} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontWeight: 700 }}>{selectedComplexity.toUpperCase()}</span>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span>{settings.models?.[selectedComplexity]?.model ?? '?'}</span>
                </button>
                <button
                  type="button"
                  title={selectedComplexity === 'low' ? 'Fast mode on — click for standard' : 'Enable fast mode (uses low-complexity model)'}
                  onClick={() => setSelectedComplexity(selectedComplexity === 'low' ? 'medium' : 'low')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, fontSize: 10.5, background: selectedComplexity === 'low' ? 'rgba(234,179,8,0.12)' : 'var(--bg-action)', border: selectedComplexity === 'low' ? '1px solid rgba(234,179,8,0.35)' : '1px solid var(--border-action)', color: selectedComplexity === 'low' ? '#eab308' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <Zap size={10} style={{ fill: selectedComplexity === 'low' ? '#eab308' : 'none' }} />
                  <span style={{ fontWeight: 600 }}>Fast</span>
                </button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>/ commands</span>
              <span style={{ opacity: 0.3 }}>·</span>
              <span>@ files</span>
              <span style={{ opacity: 0.3 }}>·</span>
              <span>Enter to send</span>
              <CornerDownLeft size={10} style={{ opacity: 0.7 }} />
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

            {/* Attachment tags */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, position: 'absolute', bottom: '100%', left: 16, marginBottom: 8 }}>
                {attachments.map((att, idx) => (
                  <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: 'var(--text-secondary)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                    <FileText size={10} style={{ color: 'var(--accent-primary)' }} />
                    <span>{att.name}</span>
                    <button type="button" onClick={() => removeAttachment(idx)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, marginLeft: 2, display: 'inline-flex' }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea */}
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={textareaRef}
                placeholder="Ask anything, use / for commands or @ for files..."
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                rows={1}
                style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', padding: '4px 0', fontSize: 14, lineHeight: 1.5, minHeight: 24, maxHeight: 200, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
              />
              {charCount > 500 && (
                <span style={{ position: 'absolute', bottom: 4, right: 4, fontSize: 10, color: charColor, fontFamily: 'monospace', pointerEvents: 'none', lineHeight: 1 }}>
                  {charCount}
                </span>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingBottom: 2 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file (max 1 MB)"
                style={{ background: 'var(--bg-action)', border: '1px solid var(--border-action)', borderRadius: '50%', color: 'var(--text-secondary)', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}
              >
                <Paperclip size={13} />
              </button>

              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                style={{ background: input.trim() && !isStreaming ? 'var(--accent-primary)' : 'var(--bg-action)', color: input.trim() && !isStreaming ? 'white' : 'var(--text-muted)', border: input.trim() && !isStreaming ? 'none' : '1px solid var(--border-action)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !isStreaming ? 'pointer' : 'default', transition: 'all 0.2s ease' }}
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
