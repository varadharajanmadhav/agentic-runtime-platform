import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Session, Task, Message, AgentEvent, TaskStatus } from '@arp/shared';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// H-1: Track active polling timers per workspaceDir to prevent leaks
const indexingPollingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const INDEXING_MAX_POLLS = 150; // 150 × 2s = 5 minutes max

function cleanTitleFromMessage(content: string): string {
  let clean = content
    .replace(/[#*`>_\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length > 40) {
    const words = clean.split(' ');
    if (words.length > 5) {
      clean = words.slice(0, 5).join(' ') + '...';
    } else {
      clean = clean.slice(0, 37) + '...';
    }
  }

  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function isDuplicateAgentEvent(eventsList: AgentEvent[], newEvent: AgentEvent): boolean {
  if (eventsList.some(e => e.id === newEvent.id)) return true;

  const normalizePayload = (p: any) => {
    if (!p) return '';
    const { eventId, timestamp, duration, ...rest } = p;
    return JSON.stringify(rest);
  };

  const newNormalized = normalizePayload(newEvent.payload);
  return eventsList.some(e => {
    if (e.type !== newEvent.type) return false;
    return normalizePayload(e.payload) === newNormalized;
  });
}

interface SettingsConfig {
  models: {
    low: { provider: string; model: string };
    medium: { provider: string; model: string };
    high: { provider: string; model: string };
    embedding: { provider: string; model: string };
  };
  keys: {
    ollamaBaseUrl: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    googleApiKey?: string;
    groqApiKey?: string;
  };
  availableProviders: string[];
}

interface AppState {
  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  loadingSessions: boolean;

  // Tasks
  tasks: Task[];
  activeTaskId: string | null;

  // Messages
  messages: Message[];

  // Events (live)
  events: AgentEvent[];
  streamingText: string;
  isStreaming: boolean;
  activeWs: WebSocket | null;

  // UI
  activePanel: 'chat' | 'editor' | 'terminal' | 'context' | 'graph' | 'settings' | 'admin';
  activeRightTab: 'overview' | 'review' | 'terminal' | 'tasks';
  sidebarOpen: boolean;
  
  // Model Configuration
  selectedComplexity: 'low' | 'medium' | 'high';
  settings: SettingsConfig | null;

  // Context Indexing Progress
  indexingProgress: Record<string, { status: string; progressPercent: number }>;

  // Theme
  theme: 'obsidian' | 'nord' | 'matrix' | 'midnight' | 'light-glass' | 'light-nord';
  setTheme: (theme: 'obsidian' | 'nord' | 'matrix' | 'midnight' | 'light-glass' | 'light-nord') => void;

  maxSteps: number;
  setMaxSteps: (steps: number) => void;
  requireApproval: boolean;
  setRequireApproval: (appr: boolean) => void;
  systemPromptInstructions: string;
  setSystemPromptInstructions: (ins: string) => void;
  indexingExcludes: string;
  setIndexingExcludes: (excl: string) => void;

  // Workspace Files
  activeFile: string | null;
  activeFileContent: string | null;
  activeFileLoading: boolean;
  workspaceFiles: string[];

  // Authentication
  token: string | null;
  user: { id: string; email: string; name: string; role: string } | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, name: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (title: string, workspaceDir?: string) => Promise<Session>;
  setActiveSession: (id: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string, workspaceDir?: string) => Promise<void>;
  setActivePanel: (panel: AppState['activePanel']) => void;
  setActiveRightTab: (tab: AppState['activeRightTab']) => void;
  toggleSidebar: () => void;
  appendStreamingText: (text: string) => void;
  clearStreaming: () => void;
  addEvent: (event: AgentEvent) => void;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;
  
  setSelectedComplexity: (complexity: 'low' | 'medium' | 'high') => void;
  fetchSettings: () => Promise<void>;
  saveSettings: (models: SettingsConfig['models'], keys: SettingsConfig['keys']) => Promise<{ success: boolean; error?: string }>;
  cancelActiveTask: () => Promise<void>;
  setActiveTaskId: (id: string) => Promise<void>;
  startIndexing: (workspaceDir: string) => Promise<void>;
  checkIndexingStatus: (workspaceDir: string, pollCount?: number) => Promise<void>;

  fetchFileContent: (filePath: string) => Promise<void>;
  saveFileContent: (filePath: string, content: string) => Promise<boolean>;
  fetchWorkspaceFiles: () => Promise<void>;
  connectTaskStream: (taskId: string, sessionId: string) => void;
}

const apiFetch = async (path: string, options: RequestInit = {}) => {
  const token = useAppStore.getState()?.token;
  const headers = {
    ...options.headers,
  } as Record<string, string>;

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    useAppStore.getState()?.logout();
  }
  return res;
};

export const useAppStore = create<AppState>()(subscribeWithSelector((set, get) => ({
  sessions: [],
  activeSessionId: null,
  loadingSessions: false,
  tasks: [],
  activeTaskId: null,
  messages: [],
  events: [],
  streamingText: '',
  isStreaming: false,
  activeWs: null,
  activePanel: 'chat',
  activeRightTab: 'tasks',
  sidebarOpen: true,

  // Authentication
  token: localStorage.getItem('arp_token'),
  user: localStorage.getItem('arp_user') ? JSON.parse(localStorage.getItem('arp_user')!) : null,

  login: async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (json.success && json.token) {
        localStorage.setItem('arp_token', json.token);
        localStorage.setItem('arp_user', JSON.stringify(json.user));
        set({ token: json.token, user: json.user });
        await get().fetchSessions();
        return { success: true };
      }
      return { success: false, error: json.error || 'Login failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  },

  register: async (email, name, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      const json = await res.json();
      if (json.success && json.token) {
        localStorage.setItem('arp_token', json.token);
        localStorage.setItem('arp_user', JSON.stringify(json.user));
        set({ token: json.token, user: json.user });
        await get().fetchSessions();
        return { success: true };
      }
      return { success: false, error: json.error || 'Registration failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  },

  logout: () => {
    const ws = get().activeWs;
    if (ws) {
      try { ws.close(); } catch {}
    }
    localStorage.removeItem('arp_token');
    localStorage.removeItem('arp_user');
    set({
      token: null,
      user: null,
      sessions: [],
      activeSessionId: null,
      tasks: [],
      activeTaskId: null,
      messages: [],
      events: [],
      streamingText: '',
      isStreaming: false,
      activeWs: null,
    });
  },
  
  selectedComplexity: 'medium',
  settings: null,
  indexingProgress: {},

  theme: (localStorage.getItem('arp_theme') as any) || 'obsidian',
  setTheme: (theme) => {
    localStorage.setItem('arp_theme', theme);
    set({ theme });
  },

  maxSteps: Number(localStorage.getItem('arp_max_steps') || '20'),
  setMaxSteps: (maxSteps) => {
    localStorage.setItem('arp_max_steps', String(maxSteps));
    set({ maxSteps });
  },
  requireApproval: localStorage.getItem('arp_require_approval') === 'true',
  setRequireApproval: (requireApproval) => {
    localStorage.setItem('arp_require_approval', String(requireApproval));
    set({ requireApproval });
  },
  systemPromptInstructions: localStorage.getItem('arp_system_prompt_instructions') || '',
  setSystemPromptInstructions: (systemPromptInstructions) => {
    localStorage.setItem('arp_system_prompt_instructions', systemPromptInstructions);
    set({ systemPromptInstructions });
  },
  indexingExcludes: localStorage.getItem('arp_indexing_excludes') || '**/node_modules/**, **/.git/**, **/dist/**',
  setIndexingExcludes: (indexingExcludes) => {
    localStorage.setItem('arp_indexing_excludes', indexingExcludes);
    set({ indexingExcludes });
  },

  activeFile: null,
  activeFileContent: null,
  activeFileLoading: false,
  workspaceFiles: [],

  fetchSessions: async () => {
    set({ loadingSessions: true });
    try {
      const res = await apiFetch(`${API_URL}/api/sessions`);
      const json = await res.json();
      set({ sessions: json.data ?? [], loadingSessions: false });
    } catch {
      set({ loadingSessions: false });
    }
  },

  createSession: async (title, workspaceDir) => {
    const res = await apiFetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, workspaceDir }),
    });
    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to create session');
    }
    const session = json.data as Session;
    set(state => ({ sessions: [session, ...state.sessions] }));
    if (workspaceDir) {
      get().startIndexing(workspaceDir);
    }
    return session;
  },

  deleteSession: async (id) => {
    try {
      const res = await apiFetch(`${API_URL}/api/sessions/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        set(state => {
          const updatedSessions = state.sessions.filter(s => s.id !== id);
          let nextActiveId = state.activeSessionId;
          if (state.activeSessionId === id) {
            nextActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null;
          }
          return {
            sessions: updatedSessions,
            activeSessionId: nextActiveId,
          };
        });
        const nextActiveId = get().activeSessionId;
        if (nextActiveId) {
          await get().setActiveSession(nextActiveId);
        } else {
          set({ messages: [], tasks: [], events: [], streamingText: '', isStreaming: false });
        }
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  },

  updateSessionTitle: async (id, title) => {
    try {
      const res = await apiFetch(`${API_URL}/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (json.success) {
        set(state => ({
          sessions: state.sessions.map(s => s.id === id ? { ...s, title } : s)
        }));
      }
    } catch (err) {
      console.error('Failed to update session title', err);
    }
  },

  setActiveSession: async (id) => {
    // Close any active WebSocket connection to prevent socket/listener leaks
    const currentWs = get().activeWs;
    if (currentWs) {
      try {
        currentWs.close();
      } catch (err) {
        console.error('Failed to close active websocket connection', err);
      }
    }

    set({ 
      activeSessionId: id, 
      messages: [], 
      tasks: [], 
      events: [], 
      streamingText: '', 
      isStreaming: false, 
      activeWs: null,
      activePanel: 'chat' 
    });

    // Fetch messages
    const res = await apiFetch(`${API_URL}/api/sessions/${id}/messages`);
    const json = await res.json();
    set({ messages: json.data ?? [] });

    // Fetch tasks & events for session
    try {
      const tasksRes = await apiFetch(`${API_URL}/api/tasks?sessionId=${id}`);
      const tasksJson = await tasksRes.json();
      const sessionTasks = tasksJson.data ?? [];
      set({ tasks: sessionTasks });

      const activeTask = sessionTasks[0]; // ordered desc
      if (activeTask) {
        set({ activeTaskId: activeTask.id });
        const eventsRes = await apiFetch(`${API_URL}/api/tasks/${activeTask.id}/events`);
        const eventsJson = await eventsRes.json();
        // L-9: Cap events loaded from history to prevent unbounded state
        set({ events: (eventsJson.data ?? []).slice(-200) });

        // Auto-reconnect if the task is currently active/running
        const runningStatuses: TaskStatus[] = ['queued', 'planning', 'executing', 'validating', 'reflecting'];
        if (runningStatuses.includes(activeTask.status)) {
          get().connectTaskStream(activeTask.id, id);
        }
      } else {
        set({ activeTaskId: null, events: [] });
      }
    } catch (err) {
      console.error('Failed to fetch tasks/events for session', err);
    }

    // Check indexing status if session has workspace
    const session = get().sessions.find(s => s.id === id);
    if (session?.workspaceDir) {
      get().checkIndexingStatus(session.workspaceDir);
      get().fetchWorkspaceFiles();
    } else {
      set({ workspaceFiles: [], activeFile: null, activeFileContent: null });
    }
  },

  sendMessage: async (sessionId, content, workspaceDir) => {
    // Add user message optimistically
    const userMsg: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    const activeSession = get().sessions.find(s => s.id === sessionId);
    const hasDefaultTitle = activeSession && (
      activeSession.title === 'New Conversation' || 
      activeSession.title === 'Draft' || 
      activeSession.title.startsWith('New Conversation')
    );

    set(state => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
      streamingText: '',
      sessions: hasDefaultTitle ? state.sessions.map(s => 
        s.id === sessionId ? { ...s, title: cleanTitleFromMessage(content) } : s
      ) : state.sessions
    }));

    if (hasDefaultTitle) {
      apiFetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitleFromMessage(content) }),
      }).catch(err => console.error('Failed to update session title', err));
    }

    const resolvedWorkspaceDir = workspaceDir ?? activeSession?.workspaceDir;

    // H-2: Create task and verify success before opening EventSource
    let task: Task;
    try {
      const taskRes = await apiFetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          title: content.slice(0, 100),
          description: content,
          workspaceDir: resolvedWorkspaceDir,
          complexity: get().selectedComplexity,
        }),
      });
      if (!taskRes.ok) {
        const errJson = await taskRes.json().catch(() => ({}));
        throw new Error(errJson.error ?? `Task creation failed: HTTP ${taskRes.status}`);
      }
      const taskJson = await taskRes.json();
      task = taskJson.data as Task;
    } catch (err) {
      // H-2: Reset streaming state cleanly on task creation failure
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errMessage: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: 'assistant',
        content: `❌ **Error: Failed to create task**\n\n\`\`\`\n${errorMsg}\n\`\`\``,
        createdAt: new Date(),
      };
      set(state => ({ messages: [...state.messages, errMessage], isStreaming: false }));
      return;
    }

    set(state => ({ tasks: [task, ...state.tasks], activeTaskId: task.id, events: [] }));

    // Delegate live streaming to connectTaskStream
    get().connectTaskStream(task.id, sessionId);
  },

  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveRightTab: (tab) => set({ activeRightTab: tab }),
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  appendStreamingText: (text) => set(state => ({ streamingText: state.streamingText + text })),
  clearStreaming: () => set({ streamingText: '', isStreaming: false }),
  addEvent: (event) => set(state => ({ events: [...state.events.slice(-200), event] })),
  
  setSelectedComplexity: (complexity) => set({ selectedComplexity: complexity }),
  
  fetchSettings: async () => {
    try {
      const res = await apiFetch(`${API_URL}/api/models/config`);
      const json = await res.json();
      if (json.success) {
        set({ settings: json.data });
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  },

  saveSettings: async (models, keys) => {
    try {
      const res = await apiFetch(`${API_URL}/api/models/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models, keys }),
      });
      const json = await res.json();
      if (json.success) {
        await get().fetchSettings();
        return { success: true };
      }
      return { success: false, error: json.error || 'Failed to save settings' };
    } catch (err: any) {
      console.error('Failed to save settings', err);
      return { success: false, error: err.message || 'Network error' };
    }
  },

  cancelActiveTask: async () => {
    const taskId = get().activeTaskId;
    if (!taskId) return;
    try {
      const res = await apiFetch(`${API_URL}/api/tasks/${taskId}/cancel`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success && json.data) {
        const updatedTask = json.data as Task;
        set(state => ({
          isStreaming: false,
          tasks: state.tasks.map(t => t.id === taskId ? updatedTask : t)
        }));
      } else {
        set({ isStreaming: false });
      }
    } catch (err) {
      console.error('Failed to cancel task', err);
      set({ isStreaming: false });
    }
  },

  setActiveTaskId: async (id) => {
    set({ activeTaskId: id, events: [] });
    try {
      const taskRes = await apiFetch(`${API_URL}/api/tasks/${id}`);
      const taskJson = await taskRes.json();
      if (taskJson.success && taskJson.data) {
        const updatedTask = taskJson.data as Task;
        set(state => ({
          tasks: state.tasks.map(t => t.id === id ? updatedTask : t)
        }));
      }
    } catch (err) {
      console.error('Failed to fetch task details', id, err);
    }

    try {
      const eventsRes = await apiFetch(`${API_URL}/api/tasks/${id}/events`);
      const eventsJson = await eventsRes.json();
      // L-9: Cap events loaded from history to prevent unbounded state growth
      set({ events: (eventsJson.data ?? []).slice(-200) });
    } catch (err) {
      console.error('Failed to fetch events for task', id, err);
    }
  },

  startIndexing: async (workspaceDir) => {
    try {
      await apiFetch(`${API_URL}/api/context/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceDir }),
      });
      get().checkIndexingStatus(workspaceDir, 0);
    } catch (err) {
      console.error('Failed to start indexing', err);
    }
  },

  // H-1: Added pollCount parameter and max-retry guard to prevent infinite loops
  checkIndexingStatus: async (workspaceDir, pollCount = 0) => {
    try {
      const res = await apiFetch(`${API_URL}/api/context/status?workspaceDir=${encodeURIComponent(workspaceDir)}`);
      const json = await res.json();
      if (json.success && json.data) {
        const { status, progressPercent } = json.data;
        set(state => ({
          indexingProgress: {
            ...state.indexingProgress,
            [workspaceDir]: { status, progressPercent }
          }
        }));

        if (status === 'indexing' && pollCount < INDEXING_MAX_POLLS) {
          // Clear any previous timer for this workspace before scheduling a new one
          const existingTimer = indexingPollingTimers.get(workspaceDir);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = setTimeout(() => {
            indexingPollingTimers.delete(workspaceDir);
            get().checkIndexingStatus(workspaceDir, pollCount + 1);
          }, 2000);
          indexingPollingTimers.set(workspaceDir, timer);
        } else if (status !== 'indexing') {
          // Clean up timer if indexing finished
          const existingTimer = indexingPollingTimers.get(workspaceDir);
          if (existingTimer) clearTimeout(existingTimer);
          indexingPollingTimers.delete(workspaceDir);
        } else {
          // Max polls reached
          console.warn(`[indexing] Max poll attempts (${INDEXING_MAX_POLLS}) reached for ${workspaceDir}`);
        }
      }
    } catch (err) {
      console.error('Failed to check indexing status', err);
    }
  },

  fetchFileContent: async (filePath) => {
    const session = get().sessions.find(s => s.id === get().activeSessionId);
    if (!session?.workspaceDir) return;
    set({ activeFileLoading: true, activeFile: filePath });
    try {
      const res = await apiFetch(`${API_URL}/api/context/file-content?workspaceDir=${encodeURIComponent(session.workspaceDir)}&path=${encodeURIComponent(filePath)}`);
      const json = await res.json();
      if (json.success && json.data) {
        set({ activeFileContent: json.data.content });
      } else {
        set({ activeFileContent: null });
      }
    } catch (err) {
      console.error('Failed to fetch file content', filePath, err);
      set({ activeFileContent: null });
    } finally {
      set({ activeFileLoading: false });
    }
  },

  saveFileContent: async (filePath, content) => {
    const session = get().sessions.find(s => s.id === get().activeSessionId);
    if (!session?.workspaceDir) return false;
    try {
      const res = await apiFetch(`${API_URL}/api/context/file-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceDir: session.workspaceDir,
          path: filePath,
          content,
        }),
      });
      const json = await res.json();
      if (json.success) {
        set({ activeFileContent: content });
        return true;
      }
    } catch (err) {
      console.error('Failed to save file content', filePath, err);
    }
    return false;
  },

  fetchWorkspaceFiles: async () => {
    const session = get().sessions.find(s => s.id === get().activeSessionId);
    if (!session?.workspaceDir) {
      set({ workspaceFiles: [] });
      return;
    }
    try {
      const res = await apiFetch(`${API_URL}/api/context/files?workspaceDir=${encodeURIComponent(session.workspaceDir)}`);
      const json = await res.json();
      if (json.success && json.data) {
        set({ workspaceFiles: json.data });
      } else {
        set({ workspaceFiles: [] });
      }
    } catch (err) {
      console.error('Failed to fetch workspace files', err);
      set({ workspaceFiles: [] });
    }
  },

  connectTaskStream: (taskId: string, sessionId: string) => {
    // 1. Close any existing WebSocket connection for different tasks
    const currentWs = get().activeWs;
    if (currentWs) {
      if (currentWs.url.includes(`/api/stream/task/${taskId}/ws`)) {
        // Already connected to the stream for this task
        return;
      }
      try {
        currentWs.close();
      } catch (err) {
        console.error('Failed to close active websocket connection', err);
      }
    }

    set({ isStreaming: true, streamingText: '' });

    const token = get().token;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = API_URL.replace(/^https?/, wsProtocol) || `${wsProtocol}//${window.location.host}`;
    const ws = new WebSocket(`${wsBase}/api/stream/task/${taskId}/ws${token ? `?token=${token}` : ''}`);
    set({ activeWs: ws });

    ws.onmessage = async (evt) => {
      let msg: { type: string; data: Record<string, unknown> };
      try { msg = JSON.parse(evt.data); } catch { return; }
      const { type, data } = msg;

      if (type === 'ping' || type === 'history_end') return;

      const agentEvent: AgentEvent = {
        id: (data.eventId as string) || crypto.randomUUID(),
        taskId,
        sessionId,
        type: type as AgentEvent['type'],
        payload: data,
        timestamp: (data.timestamp as string | Date) ? new Date(data.timestamp as string) : new Date(),
      };

      if (type === 'token_chunk') {
        get().appendStreamingText((data.text as string) ?? '');
        return; // Don't add token chunks to event list
      }

      // Check if event is duplicate
      const isDuplicate = isDuplicateAgentEvent(get().events, agentEvent);

      if (type === 'task_started') {
        set(state => {
          const nextEvents = isDuplicate ? state.events : [...state.events, agentEvent];
          return {
            tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'planning' } : t),
            events: nextEvents,
          };
        });
        return;
      }

      if (type === 'task_completed') {
        // Defer to let any queued token_chunk events flush before capturing streamingText
        await new Promise(r => setTimeout(r, 0));
        ws.close(1000);

        if (get().activeWs === ws) {
          set({ activeWs: null });
        }

        const finalText = get().streamingText;
        const fallbackText = (data.output as string) || finalText || '';
        
        // Prevent duplicate assistant message
        const hasAssistantMessage = get().messages.some(m => 
          m.role === 'assistant' && (m.content === fallbackText || (data.output && m.content === data.output))
        );

        set(state => {
          const nextEvents = isDuplicate ? state.events : [...state.events, agentEvent];
          const nextMessages = hasAssistantMessage 
            ? state.messages 
            : [...state.messages, {
                id: crypto.randomUUID(),
                sessionId,
                role: 'assistant',
                content: fallbackText,
                createdAt: new Date(),
              } as Message];
          
          return {
            messages: nextMessages,
            isStreaming: false,
            streamingText: '',
            tasks: state.tasks.map(t => t.id === taskId ? {
              ...t,
              status: 'completed',
              promptTokens: (data.promptTokens as number) ?? (data.totalTokens ? Math.round((data.totalTokens as number) * 0.7) : 0),
              completionTokens: (data.completionTokens as number) ?? (data.totalTokens ? Math.round((data.totalTokens as number) * 0.3) : 0),
              totalTokens: (data.totalTokens as number) || 0,
              estimatedCostUsd: (data.cost as number) || 0,
              result: { success: true, output: (data.output as string) || fallbackText, retryCount: t.result?.retryCount || 0 },
            } : t),
            events: nextEvents,
          };
        });

        // Sync from DB for full task record
        try {
          const res = await apiFetch(`${API_URL}/api/tasks/${taskId}`);
          const json = await res.json();
          if (json.success && json.data) {
            const updatedTask = json.data as Task;
            set(state => ({ tasks: state.tasks.map(t => t.id === taskId ? updatedTask : t) }));
          }
        } catch {}

        // Sync messages from DB to ensure UI shows the latest assistant message
        try {
          const res = await apiFetch(`${API_URL}/api/sessions/${sessionId}/messages`);
          const json = await res.json();
          if (json.success && json.data) {
            set({ messages: json.data });
          }
        } catch (err) {
          console.error('Failed to sync messages:', err);
        }
        return;
      }

      if (type === 'task_failed') {
        ws.close(1000);
        if (get().activeWs === ws) {
          set({ activeWs: null });
        }
        const errorMsg = (data.error as string) || 'Unknown error';
        const isCancelled = (data.cancelled as boolean) === true || errorMsg.toLowerCase() === 'task was cancelled by user' || errorMsg.toLowerCase() === 'agent is stopped';

        const fallbackText = isCancelled
          ? `Agent is stopped`
          : `❌ **Error: Task Execution Failed**\n\n\`\`\`\n${errorMsg}\n\`\`\``;

        // Prevent duplicate assistant message
        const hasAssistantMessage = get().messages.some(m => 
          m.role === 'assistant' && (
            m.content.includes(errorMsg) || 
            (isCancelled && (m.content.includes('Task Cancelled') || m.content.includes('Agent is stopped')))
          )
        );

        set(state => {
          const nextEvents = isDuplicate ? state.events : [...state.events, agentEvent];
          const nextMessages = hasAssistantMessage 
            ? state.messages 
            : [...state.messages, {
                id: crypto.randomUUID(),
                sessionId,
                role: 'assistant',
                content: fallbackText,
                createdAt: new Date(),
              } as Message];

          return {
            messages: nextMessages,
            isStreaming: false,
            tasks: state.tasks.map(t => t.id === taskId ? {
              ...t,
              status: isCancelled ? 'cancelled' : 'failed',
              result: { success: false, output: '', failureReason: errorMsg, retryCount: t.result?.retryCount || 0 },
            } : t),
            events: nextEvents,
          };
        });

        // Sync from DB
        try {
          const res = await apiFetch(`${API_URL}/api/tasks/${taskId}`);
          const json = await res.json();
          if (json.success && json.data) {
            const updatedTask = json.data as Task;
            set(state => ({ tasks: state.tasks.map(t => t.id === taskId ? updatedTask : t) }));
          }
        } catch {}

        // Sync messages from DB to ensure UI shows the latest error or stopped message
        try {
          const res = await apiFetch(`${API_URL}/api/sessions/${sessionId}/messages`);
          const json = await res.json();
          if (json.success && json.data) {
            set({ messages: json.data });
          }
        } catch (err) {
          console.error('Failed to sync messages on failure:', err);
        }
        return;
      }

      if (type === 'tool_called') {
        set(state => {
          const nextEvents = isDuplicate ? state.events : [...state.events, agentEvent];
          return {
            tasks: state.tasks.map(t => t.id === taskId ? { ...t, status: 'executing' } : t),
            events: nextEvents,
          };
        });
        return;
      }

      // All other events (tool_result, context_assembled, etc.)
      if (!isDuplicate) {
        set(state => ({ events: [...state.events, agentEvent] }));
      }
    };

    ws.onerror = () => {
      ws.close(1000);
      if (get().activeWs === ws) {
        set({ isStreaming: false, activeWs: null });
      }
    };

    ws.onclose = (ev) => {
      if (get().activeWs === ws) {
        set({ activeWs: null });
        // If closed unexpectedly while still streaming, reset state
        if (get().isStreaming && ev.code !== 1000) {
          set({ isStreaming: false });
        }
      }
    };
  },
})));
