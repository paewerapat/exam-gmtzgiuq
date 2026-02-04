'use client';

import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexRendererProps {
  content: string;
  className?: string;
}

function renderLatexInHtml(html: string): string {
  // Replace $$...$$ (block math) first
  let result = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<span class="text-red-500">[LaTeX Error]</span>`;
    }
  });

  // Replace $...$ (inline math) — avoid matching already-rendered KaTeX spans
  result = result.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="text-red-500">[LaTeX Error]</span>`;
    }
  });

  return result;
}

export default function LatexRenderer({ content, className = '' }: LatexRendererProps) {
  const renderedHtml = useMemo(() => renderLatexInHtml(content), [content]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
