import { useEffect, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { formatDistanceToNow } from 'date-fns';
import { 
  Folder, 
  Plus, 
  RefreshCw, 
  Settings, 
  ChevronRight,
  ChevronDown,
  Sparkles,
  Pencil,
  Trash2,
  Check,
  X
} from 'lucide-react';

interface Project {
  path: string;
  name: string;
}

export function Sidebar() {
  const { 
    sessions, 
    activeSessionId, 
    setActiveSession, 
    createSession, 
    loadingSessions,
    indexingProgress,
    startIndexing,
    activePanel,
    setActivePanel,
    deleteSession,
    updateSessionTitle
  } = useAppStore();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [userProjects, setUserProjects] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('arp_user_projects');
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn('[Sidebar] Failed to parse user projects from localStorage:', err);
      return [];
    }
  });
  const [newProjectPath, setNewProjectPath] = useState('');
  const [showAddProject, setShowAddProject] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [confirmingDeleteProject, setConfirmingDeleteProject] = useState<string | null>(null);

  const handleDeleteProject = async (projectPath: string) => {
    const projectSessions = sessions.filter(s => s.workspaceDir === projectPath);
    for (const session of projectSessions) {
      await deleteSession(session.id);
    }
    setUserProjects(prev => prev.filter(p => p !== projectPath));
    setConfirmingDeleteProject(null);
  };

  useEffect(() => {
    localStorage.setItem('arp_user_projects', JSON.stringify(userProjects));
  }, [userProjects]);  // Derive unique projects list from user projects + sessions workspace directories
  const getProjects = (): Project[] => {
    const paths = new Set<string>(userProjects);
    sessions.forEach(s => {
      if (s.workspaceDir && s.workspaceDir.trim()) {
        paths.add(s.workspaceDir);
      }
    });
    return Array.from(paths).map(p => {
      // Extract project name from path
      const parts = p.split(/[/\\]/).filter(Boolean);
      const name = parts.length > 0 ? parts[parts.length - 1] : p;
      return { path: p, name };
    });
  };



  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPath.trim()) return;
    const path = newProjectPath.trim();
    if (!userProjects.includes(path)) {
      setUserProjects([...userProjects, path]);
    }
    setNewProjectPath('');
    setShowAddProject(false);
  };



  const toggleProjectCollapse = (path: string) => {
    setCollapsedProjects(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const projects = getProjects();

  return (
    <aside style={{
      width: '260px',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>


      {/* Main projects list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        
        {/* Projects header */}
        <div style={{ 
          padding: '8px 8px 4px', 
          fontSize: '12px', 
          fontWeight: 600, 
          color: 'var(--text-secondary)', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Folder size={14} style={{ opacity: 0.8 }} /> Projects
          </span>
          <button 
            onClick={() => setShowAddProject(!showAddProject)}
            style={{ 
              background: 'var(--bg-action)', 
              border: '1px solid var(--border-action)', 
              cursor: 'pointer', 
              color: 'var(--text-secondary)',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            className="project-action-btn"
            title="Add Project Workspace Folder"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Add Project Inline Form */}
        {showAddProject && (
          <form onSubmit={handleAddProject} style={{ padding: '4px 8px 12px' }}>
            <input 
              className="input-base" 
              placeholder="Absolute folder path..." 
              value={newProjectPath} 
              onChange={e => setNewProjectPath(e.target.value)}
              style={{ width: '100%', marginBottom: '6px', fontSize: '11px', padding: '6px' }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn-primary" type="submit" style={{ padding: '4px 8px', fontSize: '11px' }}>Add</button>
              <button className="btn-ghost" type="button" onClick={() => setShowAddProject(false)} style={{ padding: '4px 8px', fontSize: '11px' }}>Cancel</button>
            </div>
          </form>
        )}

        {/* Projects Folders (Accordions) */}
        {loadingSessions ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div>
        ) : (
          <div>
            {projects.map(project => {
              const projectSessions = sessions.filter(s => s.workspaceDir === project.path);
              const isCollapsed = collapsedProjects[project.path] ?? false;

              return (
                <div key={project.path} style={{ marginBottom: '8px' }}>
                  {/* Project Folder Header */}
                  <div 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                    className="project-folder-header"
                  >
                    {confirmingDeleteProject === project.path ? (
                      <div 
                        style={{ 
                          flex: 1, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                        }} 
                        onClick={e => e.stopPropagation()}
                      >
                        <span style={{ fontSize: '11px', color: 'var(--error)', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          Delete project & conversations?
                        </span>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                          <button
                            onClick={() => handleDeleteProject(project.path)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--success)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                            title="Confirm Delete Project"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmingDeleteProject(null)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div 
                          onClick={() => toggleProjectCollapse(project.path)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <ChevronDown 
                            size={14} 
                            style={{ 
                              opacity: 0.5,
                              transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                              transition: 'transform 0.2s ease',
                              flexShrink: 0
                            }} 
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              minWidth: 0,
                            }}>
                              <Folder size={16} style={{ color: 'var(--accent-primary)', opacity: 0.85, flexShrink: 0 }} />
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                                {project.name}
                              </span>
                            </div>
                            
                            {indexingProgress[project.path] && (
                              <div style={{
                                marginTop: '4px',
                                display: 'flex',
                                paddingLeft: '24px'
                              }}>
                                <span style={{
                                  fontSize: '10px',
                                  color: indexingProgress[project.path].status === 'indexing' ? 'var(--accent-primary)' : indexingProgress[project.path].status === 'completed' ? 'var(--success)' : 'var(--error)',
                                  background: indexingProgress[project.path].status === 'indexing' ? 'rgba(99, 102, 241, 0.1)' : indexingProgress[project.path].status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  border: `1px solid ${indexingProgress[project.path].status === 'indexing' ? 'rgba(99, 102, 241, 0.2)' : indexingProgress[project.path].status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                  fontWeight: 500,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {indexingProgress[project.path].status === 'indexing' ? (
                                    `indexing ${indexingProgress[project.path].progressPercent}%`
                                  ) : indexingProgress[project.path].status === 'completed' ? (
                                    'Ready'
                                  ) : (
                                    'Failed'
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => startIndexing(project.path)}
                            style={{
                              background: 'var(--bg-action)',
                              border: '1px solid var(--border-action)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                              opacity: indexingProgress[project.path]?.status === 'indexing' ? 0.4 : 1
                            }}
                            disabled={indexingProgress[project.path]?.status === 'indexing'}
                            title="Re-index codebase symbols"
                            className="project-action-btn"
                          >
                            <RefreshCw size={12} className={indexingProgress[project.path]?.status === 'indexing' ? 'animate-spin' : ''} />
                          </button>

                          {/* Quick Add Session inside this project */}
                          <button
                            onClick={async () => {
                              try {
                                const session = await createSession('New Conversation', project.path);
                                await setActiveSession(session.id);
                              } catch (err) {
                                console.error('Failed to create project session', err);
                              }
                            }}
                            style={{
                              background: 'var(--bg-action)',
                              border: '1px solid var(--border-action)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                            title="New conversation in this project"
                            className="project-action-btn"
                          >
                            <Plus size={14} />
                          </button>

                          {/* Delete Project Folder Workspace */}
                          <button
                            onClick={() => setConfirmingDeleteProject(project.path)}
                            style={{
                              background: 'var(--bg-action)',
                              border: '1px solid var(--border-action)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                            title="Delete project & conversations"
                            className="project-action-btn project-delete-btn"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Conversations under project */}
                  {!isCollapsed && (
                    <div style={{ paddingLeft: '16px', marginTop: '2px' }}>
                      {projectSessions.length === 0 ? (
                        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          No conversations
                        </div>
                      ) : (
                        projectSessions.map(session => (
                          <div
                            key={session.id}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: activeSessionId === session.id ? 'var(--bg-hover)' : 'transparent',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              marginBottom: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              position: 'relative',
                            }}
                            className="session-row"
                            onClick={() => {
                              if (editingSessionId !== session.id) {
                                setActiveSession(session.id);
                              }
                            }}
                          >
                            {/* Left part: Title & Time, or Input field */}
                            {editingSessionId === session.id ? (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingTitle}
                                  onChange={e => setEditingTitle(e.target.value)}
                                  onKeyDown={async e => {
                                    if (e.key === 'Enter') {
                                      if (editingTitle.trim()) {
                                        await updateSessionTitle(session.id, editingTitle.trim());
                                      }
                                      setEditingSessionId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingSessionId(null);
                                    }
                                  }}
                                  autoFocus
                                  style={{
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    background: 'var(--bg-primary)',
                                    border: '1px solid var(--accent-primary)',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    width: '100%',
                                    outline: 'none',
                                  }}
                                />
                                <button
                                  onClick={async () => {
                                    if (editingTitle.trim()) {
                                      await updateSessionTitle(session.id, editingTitle.trim());
                                    }
                                    setEditingSessionId(null);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex', padding: '2px' }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingSessionId(null)}
                                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '2px' }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : confirmingDeleteId === session.id ? (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>Delete?</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    onClick={async () => {
                                      await deleteSession(session.id);
                                      setConfirmingDeleteId(null);
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex', padding: '2px' }}
                                    title="Confirm Delete"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => setConfirmingDeleteId(null)}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '2px' }}
                                    title="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                    {session.title}
                                  </span>
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                                  </span>
                                </div>
                                
                                {/* Hover Action Controls */}
                                <div 
                                  className="session-actions"
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px',
                                    marginLeft: '8px',
                                    opacity: 0,
                                    transition: 'opacity 0.15s ease',
                                  }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setEditingSessionId(session.id);
                                      setEditingTitle(session.title);
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Rename Conversation"
                                    className="hover-action-btn"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => setConfirmingDeleteId(session.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Delete Conversation"
                                    className="hover-action-btn-red"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        )}

      </div>
      
      <div className="divider" style={{ margin: 0 }} />
      <button 
        onClick={() => setActivePanel('settings')}
        className="btn-ghost"
        style={{ 
          margin: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          textAlign: 'left',
          padding: '8px 12px',
          width: 'calc(100% - 16px)',
          background: activePanel === 'settings' ? 'var(--bg-hover)' : 'transparent',
        }}
      >
        <Settings size={16} style={{ opacity: 0.8 }} />
        <span style={{ fontSize: '13px', fontWeight: 500 }}>Settings</span>
      </button>
    </aside>
  );
}
