import { useState, useMemo } from 'react';
import { useAppStore } from '../store/index.js';
import { FileCode, ChevronRight, ChevronDown, Check, ArrowRight } from 'lucide-react';

interface DiffBlock {
  type: 'added' | 'deleted' | 'unchanged';
  text: string;
}

export function DiffViewer() {
  const { events, activeFile, fetchFileContent } = useAppStore();

  // Parse the event log for any file writing or replacement tool executions
  const fileDiffs = useMemo(() => {
    const diffs: Record<string, { tool: string; timestamp: Date; original: string; modified: string }> = {};

    // Sort events chronologically to get the progression of edits
    const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    sortedEvents.forEach(e => {
      if (e.type === 'tool_result' && e.payload) {
        const payload = e.payload as any;
        const toolName = payload.toolName || payload.metadata?.toolName;
        const success = payload.success ?? payload.metadata?.success;
        if (!success) return;

        const input = payload.input || payload.metadata?.input;
        const output = payload.output || payload.metadata?.output;
        if (!input) return;

        const filePath = input.TargetFile || input.AbsolutePath || input.path || '';
        if (!filePath) return;

        if (toolName === 'replace_file_content') {
          diffs[filePath] = {
            tool: toolName,
            timestamp: new Date(e.timestamp),
            original: input.TargetContent || '',
            modified: input.ReplacementContent || '',
          };
        } else if (toolName === 'multi_replace_file_content') {
          const chunks = input.ReplacementChunks || [];
          let originalText = '';
          let modifiedText = '';
          chunks.forEach((chunk: any) => {
            originalText += (chunk.TargetContent || '') + '\n';
            modifiedText += (chunk.ReplacementContent || '') + '\n';
          });
          diffs[filePath] = {
            tool: toolName,
            timestamp: new Date(e.timestamp),
            original: originalText.trim(),
            modified: modifiedText.trim(),
          };
        } else if (toolName === 'write_file' || toolName === 'write_to_file' || toolName === 'create_file') {
          diffs[filePath] = {
            tool: toolName,
            timestamp: new Date(e.timestamp),
            original: '',
            modified: input.content || input.CodeContent || '',
          };
        }
      }
    });

    return diffs;
  }, [events]);

  const filePaths = Object.keys(fileDiffs);

  // Sync selectedFile with activeFile from store (fallback to first edited path)
  const selectedFile = activeFile || (filePaths.length > 0 ? filePaths[0] : null);

  const handleSelectFile = async (path: string) => {
    await fetchFileContent(path);
  };

  // Parse original vs modified text into line diff blocks
  const diffBlocks = useMemo((): DiffBlock[] => {
    if (!selectedFile || !fileDiffs[selectedFile]) return [];
    const item = fileDiffs[selectedFile];
    const blocks: DiffBlock[] = [];

    const origLines = item.original ? item.original.split(/\r?\n/) : [];
    const modLines = item.modified ? item.modified.split(/\r?\n/) : [];

    // Simple line-by-line diff mapping
    if (origLines.length > 0) {
      origLines.forEach(line => {
        blocks.push({ type: 'deleted', text: line });
      });
    }
    if (modLines.length > 0) {
      modLines.forEach(line => {
        blocks.push({ type: 'added', text: line });
      });
    }

    return blocks;
  }, [selectedFile, fileDiffs]);

  if (filePaths.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        padding: '24px',
        textAlign: 'center',
        fontSize: '12px'
      }}>
        No code modifications detected in this task run yet.
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      overflow: 'hidden'
    }}>
      {/* File select bar */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>FILES TOUCHED:</span>
        <select
          value={selectedFile || ''}
          onChange={e => handleSelectFile(e.target.value)}
          className="input-base"
          style={{
            flex: 1,
            height: '26px',
            padding: '2px 6px',
            fontSize: '11px',
            background: 'var(--bg-primary)',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          {filePaths.map(path => (
            <option key={path} value={path}>
              {path.split(/[/\\]/).pop()}
            </option>
          ))}
        </select>
      </div>

      {/* Diff Output Panel */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        background: '#121214',
        padding: '12px',
        fontFamily: 'Consolas, monospace',
        fontSize: '11.5px',
        lineHeight: 1.5,
      }}>
        {diffBlocks.map((block, idx) => {
          const isAdded = block.type === 'added';
          const isDeleted = block.type === 'deleted';

          let bgColor = 'transparent';
          let textColor = '#e2e8f0';
          let prefix = ' ';

          if (isAdded) {
            bgColor = 'rgba(34, 197, 94, 0.1)';
            textColor = '#4ade80';
            prefix = '+';
          } else if (isDeleted) {
            bgColor = 'rgba(239, 68, 68, 0.1)';
            textColor = '#f87171';
            prefix = '-';
          }

          return (
            <div
              key={idx}
              style={{
                background: bgColor,
                color: textColor,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                padding: '1px 6px',
                borderRadius: '2px',
                display: 'flex',
                gap: '8px'
              }}
            >
              <span style={{ width: '12px', opacity: 0.5, userSelect: 'none', flexShrink: 0 }}>{prefix}</span>
              <span style={{ flex: 1 }}>{block.text || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
