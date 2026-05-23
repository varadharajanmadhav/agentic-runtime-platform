import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer.js';

describe('MarkdownRenderer Component', () => {
  it('renders standard paragraph text', () => {
    render(<MarkdownRenderer content="Hello World" />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders bold and italic inline styles', () => {
    render(<MarkdownRenderer content="This is **bold** and *italic* text" />);
    
    const boldEl = screen.getByText('bold');
    expect(boldEl.tagName).toBe('STRONG');
    
    const italicEl = screen.getByText('italic');
    expect(italicEl.tagName).toBe('EM');
  });

  it('renders headers correctly', () => {
    render(<MarkdownRenderer content={`# Header 1
## Header 2`} />);
    
    const h1 = screen.getByText('Header 1');
    expect(h1.tagName).toBe('H1');
    
    const h2 = screen.getByText('Header 2');
    expect(h2.tagName).toBe('H2');
  });

  it('renders bullet list items', () => {
    render(<MarkdownRenderer content={`- Item A
- Item B`} />);
    
    const itemA = screen.getByText('Item A');
    expect(itemA.tagName).toBe('LI');
    expect(itemA.closest('ul')).toBeInTheDocument();
  });

  it('renders code blocks with copy button', () => {
    render(<MarkdownRenderer content={`\`\`\`javascript
const a = 123;
\`\`\``} />);
    
    expect(screen.getByText('const a = 123;')).toBeInTheDocument();
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('renders valid links and ignores unsafe protocols', () => {
    render(
      <MarkdownRenderer content="Good link: https://google.com and Bad link: javascript:alert(1)" />
    );
    
    const link = screen.getByRole('link', { name: 'https://google.com' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://google.com');

    // javascript:alert(1) should not be rendered as a link
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
  });
});
