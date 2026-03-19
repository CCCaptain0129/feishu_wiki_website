import type { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { getExternalLinkRel } from './link';
import type { FeishuBlockNode, FeishuTextRunElement } from '../types';

interface LinkCardFallback {
  title: string;
  url: string;
}

interface Props {
  blocks: FeishuBlockNode[];
  nodeToken: string;
  externalUrl: string;
  getLinkCardFallback?: (nodeToken: string, blockId: string) => LinkCardFallback | null;
  rewriteMentionDocHref?: (token: string, title: string) => string;
  resolveImageSrc?: (imageToken: string) => string;
}

type ListType = 'bullet' | 'ordered';
const URL_ONLY_RE = /^https?:\/\/[^\s]+$/i;
const HAS_URL_RE = /https?:\/\/[^\s]+/i;
const URL_IN_TEXT_RE = /(https?:\/\/[^\s]+)/g;

function getTextPayload(block: FeishuBlockNode) {
  return (
    block.page ||
    block.text ||
    block.heading1 ||
    block.heading2 ||
    block.heading3 ||
    block.heading4 ||
    block.heading5 ||
    block.heading6 ||
    block.bullet ||
    block.ordered ||
    block.quote ||
    block.todo ||
    block.code ||
    null
  );
}

function getPlainText(elements?: FeishuTextRunElement[]) {
  if (!elements?.length) return '';
  return elements
    .map((element) => {
      if (element.text_run?.content) return element.text_run.content;
      if (element.mention_doc?.title) return element.mention_doc.title;
      if (element.mention_user?.user_name) return `@${element.mention_user.user_name}`;
      if (element.reminder?.text) return element.reminder.text;
      return '';
    })
    .join('')
    .trim();
}

function getHeadingId(text: string) {
  if (!text) return undefined;
  return text
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function renderInline(
  elements: FeishuTextRunElement[] | undefined,
  rewriteMentionDocHref: ((token: string, title: string) => string) | undefined,
): ReactNode {
  if (!elements?.length) return null;

  return elements.map((element, index) => {
    if (element.text_run) {
      const content = element.text_run.content || '';
      const style = element.text_run.text_element_style || {};
      const autoLinkedNode: ReactNode =
        !style.link && HAS_URL_RE.test(content)
          ? content.split(URL_IN_TEXT_RE).map((part, partIndex) =>
              URL_ONLY_RE.test(part) ? (
                <a key={partIndex} href={part} target="_blank" rel={getExternalLinkRel(part)}>
                  {part}
                </a>
              ) : (
                <span key={partIndex}>{part}</span>
              ),
            )
          : content;

      let node: ReactNode = autoLinkedNode;
      if (style.link?.url) {
        node = (
          <a href={style.link.url} target="_blank" rel={getExternalLinkRel(style.link.url)}>
            {node}
          </a>
        );
      }
      if (style.inline_code) node = <code>{node}</code>;
      if (style.bold) node = <strong>{node}</strong>;
      if (style.italic) node = <em>{node}</em>;
      if (style.underline) node = <span className="underline">{node}</span>;
      if (style.strikethrough) node = <span className="line-through">{node}</span>;

      return <span key={index}>{node}</span>;
    }

    if (element.mention_user?.user_name) {
      return <span key={index}>@{element.mention_user.user_name}</span>;
    }

    if (element.mention_doc?.title && element.mention_doc?.token) {
      const href = rewriteMentionDocHref
        ? rewriteMentionDocHref(element.mention_doc.token, element.mention_doc.title)
        : element.mention_doc.url || '#';
      return (
        <a key={index} href={href} className="font-medium">
          {element.mention_doc.title}
        </a>
      );
    }

    if (element.reminder?.text) return <span key={index}>{element.reminder.text}</span>;
    if (element.inline_file) return <span key={index}>[附件]</span>;
    return null;
  });
}

function renderCellContent(
  cell: FeishuBlockNode,
  props: Props,
): ReactNode {
  if (cell.childBlocks.length > 0) {
    return cell.childBlocks.map((child) => (
      <div key={child.block_id} className="py-1">
        {renderBlock(child, props)}
      </div>
    ));
  }
  const payload = getTextPayload(cell);
  return payload?.elements ? renderInline(payload.elements, props.rewriteMentionDocHref) : null;
}

function renderTable(block: FeishuBlockNode, props: Props) {
  const columnSize = block.table?.property?.column_size || 1;
  const cells = block.table?.cells || [];
  const rows: FeishuBlockNode[][] = [];

  for (let index = 0; index < cells.length; index += columnSize) {
    const row = cells
      .slice(index, index + columnSize)
      .map((cellId) => block.childBlocks.find((child) => child.block_id === cellId))
      .filter((cell): cell is FeishuBlockNode => Boolean(cell));
    rows.push(row);
  }

  const headerRow = rows[0] || [];
  const bodyRows = rows.slice(1);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        {headerRow.length > 0 && (
          <thead>
            <tr>
              {headerRow.map((cell) => (
                <th key={cell.block_id} className="border border-border bg-card-hover px-4 py-3 font-semibold align-top">
                  {renderCellContent(cell, props)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`${block.block_id}-row-${rowIndex}`}>
              {row.map((cell) => (
                <td key={cell.block_id} className="border border-border px-4 py-3 align-top">
                  {renderCellContent(cell, props)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderHeading(
  block: FeishuBlockNode,
  Tag: 'h1' | 'h2' | 'h3' | 'h4',
  className: string,
  props: Props,
  elements?: FeishuTextRunElement[],
) {
  const heading = (
    <Tag id={getHeadingId(getPlainText(elements))} className={className}>
      {renderInline(elements, props.rewriteMentionDocHref)}
    </Tag>
  );

  if (!block.childBlocks.length) return heading;
  return (
    <div className="space-y-4">
      {heading}
      {renderChildren(block, props)}
    </div>
  );
}

function renderListItemBlock(block: FeishuBlockNode, props: Props) {
  const elements = block.block_type === 12 ? block.bullet?.elements : block.ordered?.elements;
  return (
    <li key={block.block_id}>
      <div className="leading-8 text-foreground/90">{renderInline(elements, props.rewriteMentionDocHref)}</div>
      {block.childBlocks.length ? (
        <div className="mt-3 space-y-3">{renderBlockSequence(block.childBlocks, props)}</div>
      ) : null}
    </li>
  );
}

function renderQuoteGroup(items: FeishuBlockNode[], props: Props) {
  return (
    <blockquote className="border-l-4 border-primary bg-primary-light/35 px-4 py-3 text-secondary">
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.block_id} className="space-y-3">
            {item.quote?.elements ? (
              <p className="leading-8 text-foreground/85">{renderInline(item.quote.elements, props.rewriteMentionDocHref)}</p>
            ) : null}
            {item.childBlocks.length ? (
              <div className="space-y-3">{renderBlockSequence(item.childBlocks, props)}</div>
            ) : null}
          </div>
        ))}
      </div>
    </blockquote>
  );
}

function renderBlockSequence(blocks: FeishuBlockNode[], props: Props) {
  const rendered: ReactNode[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    if (!block) {
      index += 1;
      continue;
    }

    if (block.block_type === 12 || block.block_type === 13) {
      const listType: ListType = block.block_type === 12 ? 'bullet' : 'ordered';
      const items: FeishuBlockNode[] = [];

      while (index < blocks.length) {
        const current = blocks[index];
        if (!current) break;
        const isSameType = listType === 'bullet' ? current.block_type === 12 : current.block_type === 13;
        if (!isSameType) break;
        items.push(current);
        index += 1;
      }

      if (items.length > 0) {
        const first = items[0];
        if (first) {
          rendered.push(
            listType === 'bullet' ? (
              <ul key={`${first.block_id}-group`} className="list-disc space-y-3 pl-6">
                {items.map((item) => renderListItemBlock(item, props))}
              </ul>
            ) : (
              <ol key={`${first.block_id}-group`} className="list-decimal space-y-3 pl-6">
                {items.map((item) => renderListItemBlock(item, props))}
              </ol>
            ),
          );
        }
      }
      continue;
    }

    if (block.block_type === 15) {
      const items: FeishuBlockNode[] = [];
      while (index < blocks.length) {
        const current = blocks[index];
        if (!current || current.block_type !== 15) break;
        items.push(current);
        index += 1;
      }
      if (items.length > 0) {
        rendered.push(<div key={`${items[0]?.block_id || 'quote'}-group`}>{renderQuoteGroup(items, props)}</div>);
      }
      continue;
    }

    rendered.push(<div key={block.block_id}>{renderBlock(block, props)}</div>);
    index += 1;
  }

  return rendered;
}

function renderLinkCardFallback(block: FeishuBlockNode, props: Props) {
  const fallback = props.getLinkCardFallback?.(props.nodeToken, block.block_id) || null;

  if (fallback) {
    return (
      <a
        href={fallback.url}
        target="_blank"
        rel={getExternalLinkRel(fallback.url)}
        className="group block rounded-2xl border border-border bg-card-hover px-5 py-4 transition-colors hover:border-primary hover:bg-primary-light/70"
      >
        <div className="text-lg font-semibold text-foreground group-hover:text-primary">{fallback.title}</div>
      </a>
    );
  }

  return (
    <a
      href={props.externalUrl}
      target="_blank"
      rel={getExternalLinkRel(props.externalUrl)}
      className="block rounded-2xl border border-dashed border-border bg-card-hover/70 px-5 py-4 transition-colors hover:border-primary"
    >
      <div className="text-base font-semibold text-foreground">查看相关链接</div>
    </a>
  );
}

function renderUrlCard(url: string) {
  return (
    <a
      href={url}
      target="_blank"
      rel={getExternalLinkRel(url)}
      className="group block rounded-2xl border border-border bg-card-hover px-5 py-4 transition-colors hover:border-primary hover:bg-primary-light/60"
    >
      <div className="text-sm text-secondary">链接预览</div>
      <div className="mt-1 break-all text-base font-semibold text-foreground group-hover:text-primary">{url}</div>
      <div className="mt-2 text-xs text-secondary">点击打开</div>
    </a>
  );
}

function renderBlock(block: FeishuBlockNode, props: Props): ReactNode {
  switch (block.block_type) {
    case 1:
      return <div className="space-y-6">{renderChildren(block, props)}</div>;
    case 2: {
      const text = getPlainText(block.text?.elements);
      if (!text) return <div className="h-4" aria-hidden="true" />;
      if (URL_ONLY_RE.test(text)) return renderUrlCard(text);
      return <p className="leading-8 text-foreground/90">{renderInline(block.text?.elements, props.rewriteMentionDocHref)}</p>;
    }
    case 3:
      return renderHeading(block, 'h1', 'text-3xl font-bold leading-[1.35] tracking-tight', props, block.heading1?.elements);
    case 4:
      return renderHeading(block, 'h2', 'text-2xl font-semibold leading-[1.45] tracking-tight', props, block.heading2?.elements);
    case 5:
      return renderHeading(block, 'h3', 'text-xl font-semibold leading-[1.55]', props, block.heading3?.elements);
    case 6:
      return renderHeading(block, 'h4', 'text-lg font-semibold leading-[1.55] tracking-tight', props, block.heading4?.elements);
    case 14:
      return <CodeBlock code={getPlainText(block.code?.elements)} />;
    case 12:
      return <ul className="list-disc pl-6">{renderListItemBlock(block, props)}</ul>;
    case 13:
      return <ol className="list-decimal pl-6">{renderListItemBlock(block, props)}</ol>;
    case 22:
      return <hr className="border-divider" />;
    case 15:
      return renderQuoteGroup([block], props);
    case 17:
      return (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card-hover/60 px-4 py-3">
          <span
            aria-hidden="true"
            className={`mt-1 inline-flex h-4 w-4 shrink-0 rounded border ${block.todo?.style?.done ? 'border-primary bg-primary' : 'border-divider bg-white'}`}
          />
          <div className={`leading-8 text-foreground/90 ${block.todo?.style?.done ? 'line-through text-secondary' : ''}`}>
            {renderInline(block.todo?.elements, props.rewriteMentionDocHref)}
          </div>
        </div>
      );
    case 19:
      return (
        <div className="rounded-2xl border border-primary/30 bg-primary-light/45 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg" aria-hidden="true">{block.callout?.emoji_id ? '💡' : '📌'}</span>
            <div className="min-w-0 space-y-3">{renderChildren(block, props)}</div>
          </div>
        </div>
      );
    case 27:
      return block.image?.token ? (
        <figure className="overflow-hidden rounded-2xl border border-border bg-card-bg/70 p-2">
          <img
            src={props.resolveImageSrc ? props.resolveImageSrc(block.image.token) : block.image.token}
            alt=""
            width={block.image.width}
            height={block.image.height}
            className="h-auto w-full rounded-xl"
            loading="lazy"
          />
        </figure>
      ) : null;
    case 31:
      return renderTable(block, props);
    case 32:
      return <>{renderCellContent(block, props)}</>;
    case 34:
      return (
        <blockquote className="border-l-4 border-primary bg-primary-light/40 px-4 py-3 text-secondary">
          <div className="space-y-3">{renderChildren(block, props)}</div>
        </blockquote>
      );
    case 30:
      return (
        <div className="rounded-2xl border border-border bg-card-hover/60 px-5 py-4">
          <div className="text-sm text-secondary">表格内容</div>
          <a
            href={props.externalUrl}
            target="_blank"
            rel={getExternalLinkRel(props.externalUrl)}
            className="mt-1 inline-block text-base font-semibold text-foreground underline decoration-primary/40 underline-offset-4 hover:text-primary"
          >
            在飞书中查看表格
          </a>
        </div>
      );
    case 999:
      return renderLinkCardFallback(block, props);
    default: {
      const payload = getTextPayload(block);
      if (payload?.elements?.length) {
        return <p className="leading-8 text-foreground/90">{renderInline(payload.elements, props.rewriteMentionDocHref)}</p>;
      }
      if (payload && !payload.elements?.length) {
        return <div className="h-4" aria-hidden="true" />;
      }
      return renderChildren(block, props);
    }
  }
}

function renderChildren(block: FeishuBlockNode, props: Props) {
  if (!block.childBlocks.length) return null;
  return renderBlockSequence(block.childBlocks, props);
}

export function FeishuBlockRenderer(props: Props) {
  return <div className="feishu-doc space-y-6">{renderBlockSequence(props.blocks, props)}</div>;
}
