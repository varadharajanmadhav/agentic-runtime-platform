import { useState } from 'react';
import { useAppStore } from '../store/index.js';
import { Eye, EyeOff, FileText, GitBranch, Shield, Zap, Sparkles } from 'lucide-react';

export function ContextViewerPanel() {
  const { events } = useAppStore();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  // Find the latest context_assembled event
  const contextEvent = [...events].reverse().find(e => e.type === 'context_assembled');
  const payload = contextEvent?.payload as any;

  const systemPrompt = payload?.systemPrompt || '';
  const totalTokens = payload?.totalTokens || 0;
  const compressionApplied = payload?.compressionApplied || false;
  const items = payload?.items || [];

  if (!contextEvent) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-muted)',
        gap: '12px',
        padding: '24px',
      }}>
        <EyeOff size={48} style={{ opacity: 0.3 }} />
        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-secondary)' }}>No Context Assembled Yet</h3>
        <p style={{ margin: 0, fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
          Start execution on a task to view the system prompts and context snippets assembled for the AI.
        </p>
      </div>
    );
  }

  const toggleItemExpand = (id: string) => {
    setExpandedItemId(prev => (prev === id ? null : id));
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      overflowY: 'auto',
      padding: '24px',
      gap: '20px',
    }}>
      {/* Top Overview Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        {/* Token Card */}
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)',
            flexShrink: 0
          }}>
            <Zap size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>CONTEXT WINDOW TOKENS</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {totalTokens.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Compression Card */}
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: compressionApplied ? 'rgba(234, 179, 8, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            border: compressionApplied ? '1px solid rgba(234, 179, 8, 0.2)' : '1px solid rgba(34, 197, 94, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: compressionApplied ? '#eab308' : '#22c55e',
            flexShrink: 0
          }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>COMPRESSION APPLIED</div>
            <div style={{ 
              fontSize: '20px', 
              fontWeight: 700, 
              color: compressionApplied ? '#eab308' : '#22c55e',
              marginTop: '4px',
              textTransform: 'uppercase'
            }}>
              {compressionApplied ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      </div>

      {/* System Prompt Section */}
      {systemPrompt && (
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div 
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              background: 'rgba(255, 255, 255, 0.02)',
              borderBottom: showSystemPrompt ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={16} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>System Prompt</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {showSystemPrompt ? (
                <>
                  <EyeOff size={14} /> Hide
                </>
              ) : (
                <>
                  <Eye size={14} /> Show
                </>
              )}
            </div>
          </div>
          
          {showSystemPrompt && (
            <div style={{ padding: '16px', background: '#121214', overflowX: 'auto' }}>
              <pre style={{
                margin: 0,
                fontFamily: 'Consolas, monospace',
                fontSize: '12.5px',
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
              }}>
                {systemPrompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Context Items Section */}
      <div>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Assembled Context Items ({items.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((item: any, idx: number) => {
            const isExpanded = expandedItemId === item.id;
            const isGitDiff = item.type === 'git_diff';
            const itemTitle = isGitDiff ? 'Workspace Git Diff' : item.path || 'unknown file';
            const scorePercent = item.relevanceScore !== undefined ? Math.round(item.relevanceScore * 100) : null;

            return (
              <div 
                key={item.id || idx}
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div 
                  onClick={() => toggleItemExpand(item.id)}
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isExpanded ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {isGitDiff ? (
                      <GitBranch size={16} style={{ color: '#ec4899', flexShrink: 0 }} />
                    ) : (
                      <FileText size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                    )}
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap'
                    }}>
                      {itemTitle}
                    </span>
                  </div>

                  {/* Badges / Stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {scorePercent !== null && (
                      <span style={{
                        fontSize: '11px',
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: 'var(--accent-primary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 500,
                      }}>
                        Relevance: {scorePercent}%
                      </span>
                    )}
                    
                    {item.tokenCount !== undefined && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {item.tokenCount} tokens
                      </span>
                    )}

                    <span style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 500,
                      background: item.included ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      color: item.included ? '#22c55e' : '#ef4444',
                    }}>
                      {item.included ? 'Included' : 'Excluded'}
                    </span>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && item.content && (
                  <div style={{
                    padding: '16px',
                    background: '#121214',
                    borderTop: '1px solid var(--border)',
                    overflowX: 'auto',
                  }}>
                    <pre style={{
                      margin: 0,
                      fontFamily: 'Consolas, monospace',
                      fontSize: '12px',
                      color: '#cbd5e1',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                    }}>
                      {item.content}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
