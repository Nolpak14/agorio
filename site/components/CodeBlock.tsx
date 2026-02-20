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
      /\b(import|from|const|let|await|new|export|if|return|async|function|type|for|of)\b/g,
      '<span class="token-keyword">$1</span>',
    )
    // Types/classes
    .replace(
      /\b(ShoppingAgent|GeminiAdapter|ClaudeAdapter|OpenAIAdapter|OllamaAdapter|MockMerchant|MockAcpMerchant|UcpClient|AcpClient|Promise)\b/g,
      '<span class="token-type">$1</span>',
    )
    // Properties/methods
    .replace(/\.([\w]+)\(/g, '.<span class="token-function">$1</span>(')
    // Booleans
    .replace(/\b(true|false)\b/g, '<span class="token-property">$1</span>');
}

function addLineNumbers(html: string): string {
  const lines = html.split('\n');
  return lines
    .map((line, i) => {
      const num = i + 1;
      return `<span class="line-numbers">${num}</span>${line}`;
    })
    .join('\n');
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

  const highlighted = addLineNumbers(highlightSyntax(escaped));

  return (
    <div className="code-block relative group">
      <div className="terminal-bar">
        <div className="terminal-dots">
          <span className="terminal-dot red" />
          <span className="terminal-dot yellow" />
          <span className="terminal-dot green" />
        </div>
        {filename && <span className="terminal-filename">{filename}</span>}
        <button
          onClick={handleCopy}
          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--fg)] cursor-pointer text-xs font-mono"
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      <pre dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  );
}
