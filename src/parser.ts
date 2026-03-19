import type {
  ArticleFrontmatter,
  ArticleFrontmatterParseResult,
  ContentArticle,
  FeishuBlockNode,
  FeishuTextRunElement,
  ParsedArticleContent,
  SiteConfig,
  SiteConfigParseResult,
  ValidationIssue,
  ValidationResult,
} from './types';
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

function normalizeConfigKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function parseKeyValueLine(line: string) {
  const match = line.match(/^([^:：]+)[:：]\s*(.*)$/);
  if (!match) return null;

  const key = normalizeConfigKey(match[1]);
  const value = (match[2] || '').trim();
  if (!key) return null;

  return { key, value };
}

function collectKeyValueMap(lines: string[]) {
  const raw: Record<string, string> = {};

  for (const line of lines) {
    const normalizedLine = line.trim();
    if (!normalizedLine || normalizedLine.startsWith('#')) continue;
    const parsed = parseKeyValueLine(normalizedLine);
    if (!parsed) continue;
    raw[parsed.key] = parsed.value;
  }

  return raw;
}

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLikelyDate(value: string) {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) && Number.isNaN(Date.parse(value))) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function buildValidationResult(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}

function splitFrontmatterAndBody(content: string) {
  const text = content.trim();
  if (!text) return { frontmatterText: '', body: '' };

  if (text.startsWith('---')) {
    const lines = text.split('\n');
    const frontmatterLines: string[] = [];
    let endIndex = -1;

    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === '---') {
        endIndex = i;
        break;
      }
      frontmatterLines.push(lines[i]);
    }

    if (endIndex >= 0) {
      return {
        frontmatterText: frontmatterLines.join('\n').trim(),
        body: lines.slice(endIndex + 1).join('\n').trim(),
      };
    }
  }

  const lines = text.split('\n');
  const frontmatterLines: string[] = [];
  let bodyStart = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      bodyStart = i + 1;
      break;
    }
    if (!parseKeyValueLine(line)) {
      bodyStart = i;
      break;
    }
    frontmatterLines.push(lines[i]);
  }

  return {
    frontmatterText: frontmatterLines.join('\n').trim(),
    body: lines.slice(bodyStart).join('\n').trim(),
  };
}

function extractLinesFromInput(input: { contentType: 'blocks' | 'raw_content' | 'unsupported'; blocks: FeishuBlockNode[]; content: string | null }) {
  return input.contentType === 'blocks'
    ? collectBlockTextLines(input.blocks)
    : (input.content || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
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
  const lines = extractLinesFromInput(input);

  return {
    summary: extractSummaryFromLines(lines),
    tags: extractTagsFromLines(lines),
  };
}

export function parseSiteConfig(input: { contentType: 'blocks' | 'raw_content' | 'unsupported'; blocks: FeishuBlockNode[]; content: string | null }): SiteConfigParseResult {
  const lines = extractLinesFromInput(input);
  return parseSiteConfigFromLines(lines);
}

export function parseSiteConfigFromLines(lines: string[]): SiteConfigParseResult {
  const raw = collectKeyValueMap(lines);

  const config: Partial<SiteConfig> = {
    siteTitle: raw.site_title || raw.title || '',
    siteDescription: raw.site_description || raw.description || '',
    baseUrl: raw.base_url || '',
    theme: raw.theme || '',
    homeToken: raw.home_token || '',
    navRootToken: raw.nav_root_token || '',
  };

  const missingKeys = (['siteTitle', 'siteDescription', 'baseUrl', 'theme', 'homeToken', 'navRootToken'] as const).filter(
    (key) => !config[key],
  );

  return { config, missingKeys, raw };
}

export function parseArticleFrontmatter(content: string): ArticleFrontmatterParseResult {
  const { frontmatterText, body } = splitFrontmatterAndBody(content);
  const raw = collectKeyValueMap(frontmatterText ? frontmatterText.split('\n') : []);

  const fallbackTags = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('标签:') || line.startsWith('标签：') || line.startsWith('tag:') || line.startsWith('tag：'))
    .flatMap((line) => line.replace(/^(tag|标签)[:：]\s*/i, '').split(/\s+/))
    .filter((tag) => tag.startsWith('#'))
    .map((tag) => tag.replace(/^#/, ''))
    .filter(Boolean);

  const rawTags = (raw.tags || raw.tag || '')
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.startsWith('#') || Boolean(tag))
    .map((tag) => tag.replace(/^#/, ''))
    .filter(Boolean);

  const frontmatter: Partial<ArticleFrontmatter> & { tags: string[] } = {
    slug: raw.slug || '',
    title: raw.title || '',
    date: raw.date || '',
    summary: raw.summary || '',
    tags: Array.from(new Set(rawTags.length ? rawTags : fallbackTags)),
    cover: raw.cover || undefined,
    draft: parseBoolean(raw.draft),
    toc: parseBoolean(raw.toc),
  };

  const missingKeys = (['slug', 'title', 'date', 'summary'] as const).filter((key) => !frontmatter[key]);

  return {
    frontmatter,
    missingKeys,
    body,
    raw,
  };
}

export function validateSiteConfig(result: SiteConfigParseResult): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { config, missingKeys } = result;

  for (const key of missingKeys) {
    issues.push({
      severity: 'error',
      field: key,
      code: 'missing_required_field',
      message: `缺少必填站点配置字段: ${key}`,
    });
  }

  if (config.baseUrl && !isValidUrl(config.baseUrl)) {
    issues.push({
      severity: 'error',
      field: 'baseUrl',
      code: 'invalid_url',
      message: 'baseUrl 必须是以 http/https 开头的有效 URL',
    });
  }

  if (config.siteTitle && config.siteTitle.length > 80) {
    issues.push({
      severity: 'warning',
      field: 'siteTitle',
      code: 'title_too_long',
      message: 'siteTitle 超过 80 字符，可能影响导航和 SEO 展示',
    });
  }

  if (config.siteDescription && config.siteDescription.length > 160) {
    issues.push({
      severity: 'warning',
      field: 'siteDescription',
      code: 'description_too_long',
      message: 'siteDescription 超过 160 字符，可能影响搜索摘要展示',
    });
  }

  return buildValidationResult(issues);
}

export function validateArticleFrontmatter(result: ArticleFrontmatterParseResult): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { frontmatter, missingKeys, body } = result;

  for (const key of missingKeys) {
    issues.push({
      severity: 'error',
      field: key,
      code: 'missing_required_field',
      message: `缺少必填文章字段: ${key}`,
    });
  }

  if (frontmatter.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.slug)) {
    issues.push({
      severity: 'error',
      field: 'slug',
      code: 'invalid_slug',
      message: 'slug 仅支持小写字母、数字和中划线，且不能以中划线开头或结尾',
    });
  }

  if (frontmatter.date && !isLikelyDate(frontmatter.date)) {
    issues.push({
      severity: 'error',
      field: 'date',
      code: 'invalid_date',
      message: 'date 格式无效，建议使用 YYYY-MM-DD',
    });
  }

  if (frontmatter.cover && !isValidUrl(frontmatter.cover)) {
    issues.push({
      severity: 'warning',
      field: 'cover',
      code: 'invalid_cover_url',
      message: 'cover 不是有效 URL，前端可能无法正确渲染封面图',
    });
  }

  if (!frontmatter.tags.length) {
    issues.push({
      severity: 'warning',
      field: 'tags',
      code: 'missing_tags',
      message: '未设置 tags，文章将难以被聚合推荐和检索',
    });
  }

  if (!body.trim()) {
    issues.push({
      severity: 'warning',
      field: 'body',
      code: 'empty_body',
      message: '正文内容为空',
    });
  }

  return buildValidationResult(issues);
}

export function validateArticleFrontmatters(results: ArticleFrontmatterParseResult[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const slugMap = new Map<string, number[]>();

  for (let i = 0; i < results.length; i += 1) {
    const slug = results[i].frontmatter.slug;
    if (!slug) continue;
    const list = slugMap.get(slug) || [];
    list.push(i);
    slugMap.set(slug, list);
  }

  for (const [slug, indexes] of slugMap.entries()) {
    if (indexes.length < 2) continue;
    issues.push({
      severity: 'error',
      field: 'slug',
      code: 'duplicate_slug',
      message: `检测到重复 slug: ${slug}（出现 ${indexes.length} 次）`,
    });
  }

  return issues;
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
