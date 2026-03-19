'use client';

import { useState } from 'react';

interface Props {
  code: string;
}

export function CodeBlock({ code }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="doc-code">
      <div className="doc-code-head">
        <div className="doc-code-label">Code</div>
        <button
          type="button"
          onClick={handleCopy}
          className="doc-code-copy"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="doc-code-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
