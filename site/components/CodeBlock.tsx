'use client';

import { useState } from 'react';

function highlightSyntax(code: string): string {
  return code
    // Comments
    .replace(/(\/\/.*)/g, '<span class="token-comment">$1</span>')
    // Strings (double quotes)
    .replace(/(&quot;[^&]*?&quot;|"[^"]*?")/g, '<span class="token-string">$1</span>')
    // Strings (single quotes)
    .replace(/('[^']*?')/g, '<span class="token-string">$1</span>')
    // Strings (backticks - simple)
    .replace(/(`[^`]*?`)/g, '<span class="token-string">$1</span>')
    // Keywords
    .replace(
      /\b(import|from|const|let|await|new|export|if|return|async|function|type)\b/g,
      '<span class="token-keyword">$1</span>',
    )
    // Types/classes
    .replace(
      /\b(ShoppingAgent|GeminiAdapter|ClaudeAdapter|OpenAIAdapter|MockMerchant|UcpClient|Promise)\b/g,
      '<span class="token-type">$1</span>',
    )
    // Properties/methods
    .replace(/\.([\w]+)\(/g, '.<span class="token-function">$1</span>(')
    // Booleans
    .replace(/\b(true|false)\b/g, '<span class="token-property">$1</span>');
}

export default function CodeBlock({
  code,
  filename,
}: {
  code: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return (
    <div className="code-block relative group">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] text-xs text-[var(--muted)]">
          <span>{filename}</span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--fg)] cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <pre
        dangerouslySetInnerHTML={{ __html: highlightSyntax(escaped) }}
      />
    </div>
  );
}
