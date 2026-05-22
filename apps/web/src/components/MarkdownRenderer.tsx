import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

/** M-7: Validates a URL has http/https protocol before rendering as a link */
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Split content by code blocks to separate code blocks from markdown
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="markdown-body" style={{ lineHeight: '1.6', fontSize: '14px' }}>
      {/* M-8: Use stable key based on position + content prefix instead of raw index */}
      {parts.map((part, index) => {
        const stableKey = `part-${index}-${part.slice(0, 12).replace(/\s/g, '_')}`;
        if (part.startsWith('```')) {
          // It is a code block
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <div key={stableKey} style={{ margin: '12px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              {lang && (
                <div style={{ background: 'var(--border)', padding: '6px 12px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{lang}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(code)}
                    style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Copy
                  </button>
                </div>
              )}
              <pre style={{ margin: 0, padding: '12px', overflowX: 'auto', fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                <code>{code}</code>
              </pre>
            </div>
          );
        } else {
          // It is markdown text, split by lines
          const lines = part.split('\n');
          const elements: React.ReactNode[] = [];
          let currentList: React.ReactNode[] = [];
          let listType: 'bullet' | 'number' | null = null;

          const flushList = (key: number) => {
            if (currentList.length > 0) {
              if (listType === 'bullet') {
                elements.push(<ul key={`ul-${key}`} style={{ paddingLeft: '20px', margin: '8px 0' }}>{currentList}</ul>);
              } else if (listType === 'number') {
                elements.push(<ol key={`ol-${key}`} style={{ paddingLeft: '20px', margin: '8px 0' }}>{currentList}</ol>);
              }
              currentList = [];
              listType = null;
            }
          };

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Handle Bullet List
            const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
            if (bulletMatch) {
              flushList(i); // flush any previous number list if switching
              listType = 'bullet';
              currentList.push(<li key={`li-${i}`} style={{ marginBottom: '4px' }}>{renderInlineFormatting(bulletMatch[2])}</li>);
              continue;
            }

            // Handle Numbered List
            const numberMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
            if (numberMatch) {
              flushList(i); // flush any previous bullet list if switching
              listType = 'number';
              currentList.push(<li key={`li-${i}`} style={{ marginBottom: '4px' }}>{renderInlineFormatting(numberMatch[2])}</li>);
              continue;
            }

            // If not a list item, flush list first
            flushList(i);

            // Handle Headers
            const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
            if (headerMatch) {
              const depth = headerMatch[1].length;
              const title = headerMatch[2];
              const formattedTitle = renderInlineFormatting(title);
              if (depth === 1) {
                elements.push(<h1 key={`h-${i}`} style={{ fontSize: '20px', fontWeight: 600, margin: '24px 0 12px 0', color: 'var(--text-primary)' }}>{formattedTitle}</h1>);
              } else if (depth === 2) {
                elements.push(<h2 key={`h-${i}`} style={{ fontSize: '18px', fontWeight: 600, margin: '16px 0 8px 0', color: 'var(--text-primary)' }}>{formattedTitle}</h2>);
              } else if (depth === 3) {
                elements.push(<h3 key={`h-${i}`} style={{ fontSize: '16px', fontWeight: 600, margin: '16px 0 8px 0', color: 'var(--text-primary)' }}>{formattedTitle}</h3>);
              } else {
                elements.push(<h4 key={`h-${i}`} style={{ fontSize: '14px', fontWeight: 600, margin: '16px 0 8px 0', color: 'var(--text-primary)' }}>{formattedTitle}</h4>);
              }
              continue;
            }

            // Handle Blockquote
            const quoteMatch = line.match(/^>\s*(.*)/);
            if (quoteMatch) {
              elements.push(
                <blockquote key={`q-${i}`} style={{ borderLeft: '4px solid var(--accent-primary)', paddingLeft: '12px', margin: '12px 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  {renderInlineFormatting(quoteMatch[1])}
                </blockquote>
              );
              continue;
            }

            // Empty line
            if (line.trim() === '') {
              continue;
            }

            // Regular paragraph
            elements.push(<p key={`p-${i}`} style={{ margin: '8px 0 12px 0' }}>{renderInlineFormatting(line)}</p>);
          }

          // Final flush of lists
          flushList(lines.length);

          return <React.Fragment key={stableKey}>{elements}</React.Fragment>;
        }
      })}
    </div>
  );
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  // Regex to match bold, italic, inline code, and URLs
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|https?:\/\/[^\s]+)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const key = `inline-${index}-${part.slice(0, 8)}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent-primary)' }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    // M-7: Validate URL protocol before rendering as link
    if ((part.startsWith('http://') || part.startsWith('https://')) && isValidHttpUrl(part)) {
      return (
        <a key={key} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}
