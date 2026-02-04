'use client';

import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexTextProps {
  text: string;
  className?: string;
}

function renderLatexInText(text: string): string {
  // For plain text (not HTML), parse $...$ patterns
  const parts: string[] = [];
  let lastIndex = 0;
  const regex = /\$([^\$\n]+?)\$/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, match.index)));
    }

    // Render the LaTeX
    try {
      parts.push(
        katex.renderToString(match[1].trim(), {
          displayMode: false,
          throwOnError: false,
        }),
      );
    } catch {
      parts.push(`<span class="text-red-500">[LaTeX Error]</span>`);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)));
  }

  return parts.join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function LatexText({ text, className = '' }: LatexTextProps) {
  const renderedHtml = useMemo(() => renderLatexInText(text), [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
