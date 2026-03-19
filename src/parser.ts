import type { ContentArticle, FeishuBlockNode, FeishuTextRunElement, ParsedArticleContent } from './types';
import type { FeishuWikiClient } from './client';

export function plainTextFromElements(elements?: FeishuTextRunElement[]) {
  if (!elements?.length) return '';
  return elements
    .map((el) => el.text_run?.content || el.mention_doc?.title || el.mention_user?.user_name || el.reminder?.text || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function flattenNodeTree<T extends { children: T[] }>(nodes: T[]): T[] {
  return nodes.flatMap((node) => [node, ...flattenNodeTree(node.children)]);
}

function collectBlockTextLines(blocks: FeishuBlockNode[]) {
  const lines: string[] = [];
  const queue = [...blocks];

  while (queue.length) {
    const block = queue.shift();
    if (!block) continue;

    const payloads = [
      block.page,
      block.text,
      block.heading1,
      block.heading2,
      block.heading3,
      block.heading4,
      block.heading5,
      block.heading6,
      block.bullet,
      block.ordered,
      block.code,
      block.quote,
      block.todo,
    ];

    for (const payload of payloads) {
      const line = plainTextFromElements(payload?.elements);
      if (line) lines.push(line);
    }

    if (block.childBlocks.length) {
      queue.push(...block.childBlocks);
    }
  }

  return lines;
}

export function extractSummaryFromLines(lines: string[]) {
  const explicit = lines.find((line) => line.startsWith('摘要：') || line.startsWith('摘要:'));
  if (explicit) return explicit.replace(/^摘要[:：]\s*/, '').trim();
  return lines.find((line) => line.length > 12) || '';
}

export function extractTagsFromLines(lines: string[]) {
  const explicit = lines.find((line) =>
    line.startsWith('tag：') || line.startsWith('tag:') || line.startsWith('标签：') || line.startsWith('标签:'),
  );
  const base = explicit ? explicit.replace(/^(tag|标签)[:：]\s*/i, '') : '';

  return Array.from(
    new Set(
      base
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.startsWith('#'))
        .map((token) => token.replace(/^#/, ''))
        .filter(Boolean),
    ),
  );
}

export function parseArticleContent(input: { contentType: 'blocks' | 'raw_content' | 'unsupported'; blocks: FeishuBlockNode[]; content: string | null }): ParsedArticleContent {
  const lines =
    input.contentType === 'blocks'
      ? collectBlockTextLines(input.blocks)
      : (input.content || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

  return {
    summary: extractSummaryFromLines(lines),
    tags: extractTagsFromLines(lines),
  };
}

export async function getContentArticlesByParent(
  client: FeishuWikiClient,
  spaceId: string,
  parentNodeToken: string,
): Promise<ContentArticle[]> {
  const nodes = await client.getWikiNodes(spaceId, parentNodeToken);

  const pages = await Promise.all(
    nodes.map(async (node) => {
      const page = await client.getWikiPageContent(node.node_token).catch(() => null);
      if (!page) return null;
      return { node, page };
    }),
  );

  return pages
    .filter((item): item is { node: typeof nodes[number]; page: NonNullable<Awaited<ReturnType<FeishuWikiClient['getWikiPageContent']>>> } => Boolean(item))
    .map(({ node, page }) => {
      const parsed = parseArticleContent(page);
      return {
        node,
        page,
        summary: parsed.summary,
        tags: parsed.tags,
      };
    });
}
