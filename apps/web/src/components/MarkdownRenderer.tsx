import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Configure marked options
  useEffect(() => {
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }, []);

  const html = React.useMemo(() => {
    try {
      return marked.parse(content) as string;
    } catch (err) {
      console.error('Failed to parse markdown', err);
      return content;
    }
  }, [content]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Highlight all code blocks
    const codeBlocks = containerRef.current.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      if ((block as any).dataset.highlighted) return;
      hljs.highlightElement(block as HTMLElement);
      (block as any).dataset.highlighted = 'true';
    });

    // Add Copy buttons to pre blocks
    const preBlocks = containerRef.current.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
      if (pre.querySelector('.copy-code-btn')) return;

      // Position relative for copy button container
      pre.style.position = 'relative';

      const button = document.createElement('button');
      button.className = 'copy-code-btn';
      button.innerText = 'Copy';
      button.style.position = 'absolute';
      button.style.top = '8px';
      button.style.right = '8px';
      button.style.padding = '4px 8px';
      button.style.fontSize = '11px';
      button.style.background = 'rgba(15, 21, 36, 0.7)';
      button.style.border = '1px solid rgba(255, 255, 255, 0.15)';
      button.style.borderRadius = '4px';
      button.style.color = '#cbd5e1';
      button.style.cursor = 'pointer';
      button.style.zIndex = '10';
      button.style.transition = 'all 0.15s ease';

      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(15, 21, 36, 0.9)';
        button.style.color = '#f8fafc';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(15, 21, 36, 0.7)';
        button.style.color = '#cbd5e1';
      });

      button.addEventListener('click', () => {
        const codeText = pre.querySelector('code')?.innerText || '';
        navigator.clipboard.writeText(codeText).then(() => {
          button.innerText = 'Copied!';
          button.style.borderColor = '#10b981';
          button.style.color = '#10b981';
          setTimeout(() => {
            button.innerText = 'Copy';
            button.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            button.style.color = '#cbd5e1';
          }, 2000);
        });
      });

      pre.appendChild(button);
    });
  }, [html]);

  return (
    <div 
      ref={containerRef}
      className="markdown-body" 
      style={{ 
        lineHeight: '1.6', 
        fontSize: '14px',
        color: 'var(--text-primary)',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
