import type { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { getExternalLinkRel } from './link';

interface Props {
  content: string;
}

const URL_ONLY_RE = /^https?:\/\/[^\s]+$/i;
const URL_IN_TEXT_RE = /(^|[^"'>])(https?:\/\/[^\s<]+)/g;

function relAttr(url: string) {
  return getExternalLinkRel(url).replaceAll('"', '&quot;');
}

function isEmojiBullet(line: string): boolean {
  return /^[\p{Extended_Pictographic}][^\n]+/u.test(line);
}

function isSectionHeading(line: string, previousLine: string | undefined, nextLine: string | undefined): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(#{1,6})\s+/.test(trimmed)) return false;
  if (/^第.+部分[:：、]/.test(trimmed) || /^第.+部分/.test(trimmed)) return true;
  if (/^\d+\.\s+/.test(trimmed)) return true;
  if (trimmed.length <= 24 && isEmojiBullet(trimmed) && !trimmed.includes(' - ')) return true;

  const prevBlank = !previousLine || previousLine.trim() === '';
  const nextBlank = !nextLine || nextLine.trim() === '';
  return prevBlank && nextBlank && trimmed.length <= 18;
}

function isListItem(line: string): boolean {
  const trimmed = line.trim();
  return /^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed) || (isEmojiBullet(trimmed) && trimmed.includes(' - '));
}

function normalizeListItem(line: string): string {
  const trimmed = line.trim();
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return trimmed.replace(/^([-*+]|\d+\.)\s+/, '');
  }
  return trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInline(value: string): string {
  let html = escapeHtml(value);

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, url: string) => `<a href="${url}" target="_blank" rel="${relAttr(url)}">${label}</a>`,
  );
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(
    URL_IN_TEXT_RE,
    (_match, prefix: string, url: string) =>
      `${prefix}<a href="${url}" target="_blank" rel="${relAttr(url)}">${url}</a>`,
  );

  return html;
}

export function FeishuDocContent({ content }: Props) {
  const normalized = content.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return (
      <div className="doc-empty">
        当前文档暂无可展示内容。
      </div>
    );
  }

  const lines = normalized.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const previousLine = index > 0 ? lines[index - 1] : undefined;
    const nextLine = index + 1 < lines.length ? lines[index + 1] : undefined;

    if (!trimmed) {
      const prevHasText = Boolean(previousLine && previousLine.trim());
      const nextHasText = Boolean(nextLine && nextLine.trim());
      if (prevHasText && nextHasText) {
        blocks.push(<div key={(key += 1)} className="doc-gap" aria-hidden="true" />);
      }
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const fence = trimmed;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && (lines[index]?.trim() ?? '') !== fence) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<CodeBlock key={(key += 1)} code={codeLines.join('\n')} />);
      continue;
    }

    if (URL_ONLY_RE.test(trimmed)) {
      blocks.push(
        <a
          key={(key += 1)}
          href={trimmed}
          target="_blank"
          rel={getExternalLinkRel(trimmed)}
          className="doc-link-card"
        >
          <div className="doc-link-label">链接预览</div>
          <div className="doc-link-url">{trimmed}</div>
        </a>,
      );
      index += 1;
      continue;
    }

    if (isSectionHeading(trimmed, previousLine, nextLine)) {
      blocks.push(
        <h2 key={(key += 1)} className="doc-h2">
          {trimmed}
        </h2>,
      );
      index += 1;
      continue;
    }

    if (isListItem(trimmed)) {
      const listItems: string[] = [];
      let cursor = index;
      while (cursor < lines.length && isListItem(lines[cursor] ?? '')) {
        listItems.push(normalizeListItem(lines[cursor] ?? ''));
        cursor += 1;
      }
      blocks.push(
        <ul key={(key += 1)} className="doc-list">
          {listItems.map((item) => (
            <li key={item}>
              <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
            </li>
          ))}
        </ul>,
      );
      index = cursor;
      continue;
    }

    blocks.push(
      <p key={(key += 1)} className="doc-p" dangerouslySetInnerHTML={{ __html: renderInline(trimmed) }} />,
    );
    index += 1;
  }

  return <div className="feishu-doc">{blocks}</div>;
}
