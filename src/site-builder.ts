import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FeishuWikiClient } from './client';
import type {
  ArticleFrontmatterParseResult,
  GeneratedArticle,
  HomePageData,
  SlugMode,
  SiteArtifactWriteResult,
  SiteBuildOptions,
  SiteBuildResult,
  SiteNavItem,
  SiteRouteItem,
  ValidationIssue,
  WikiNode,
  WikiNodeTree,
} from './types';
import {
  extractContentLines,
  parseArticleContent,
  parseArticleFrontmatter,
  parseSiteConfig,
  validateArticleFrontmatter,
  validateArticleFrontmatters,
  validateSiteConfig,
} from './parser';

function flattenWikiTree(nodes: WikiNodeTree[]): WikiNode[] {
  const output: WikiNode[] = [];
  const queue = [...nodes];

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    output.push(node);
    if (node.children?.length) {
      queue.push(...node.children);
    }
  }

  return output;
}

function readNodeString(node: WikiNode, key: string) {
  const value = (node as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function toISODate(value: string) {
  if (!value) return '';

  if (/^\d{10,13}$/.test(value)) {
    const numeric = Number(value);
    const ms = value.length === 13 ? numeric : numeric * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeSlug(raw: string, mode: SlugMode) {
  const base = raw.trim();
  if (!base) return '';

  if (mode === 'title-cn') {
    return base
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function hasMeaningfulBody(body: string, fallbackSummary: string) {
  const normalizedBody = body.trim();
  if (!normalizedBody) return false;
  return normalizedBody !== fallbackSummary.trim();
}

function cleanDisplayTitle(input: string) {
  return input.replace(/\s*[-—–:：]?\s*副本\s*$/u, '').trim();
}

function normalizeBodyLines(lines: string[], title: string) {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === title.trim()) continue;
    if (/^(摘要|summary|标签|tag)[:：]/i.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }

  return output;
}

function resolveFrontmatter(
  node: WikiNode,
  parsed: ArticleFrontmatterParseResult,
  summary: string,
  tags: string[],
  slugMode: SlugMode,
) {
  const title = cleanDisplayTitle(parsed.frontmatter.title || node.title);
  const slug = parsed.frontmatter.slug || normalizeSlug(title, slugMode) || node.node_token.toLowerCase();
  const date =
    parsed.frontmatter.date ||
    toISODate(readNodeString(node, 'obj_edit_time')) ||
    toISODate(readNodeString(node, 'obj_create_time')) ||
    toISODate(readNodeString(node, 'node_create_time')) ||
    new Date().toISOString().slice(0, 10);
  const author = parsed.frontmatter.author || readNodeString(node, 'owner') || readNodeString(node, 'creator') || '';
  const mergedTags = parsed.frontmatter.tags.length ? parsed.frontmatter.tags : tags;

  return {
    frontmatter: {
      slug,
      title,
      date,
      summary: parsed.frontmatter.summary || summary || title,
      tags: Array.from(new Set(mergedTags)),
      author,
      cover: parsed.frontmatter.cover,
      draft: parsed.frontmatter.draft ?? false,
      toc: parsed.frontmatter.toc ?? true,
    },
    body: hasMeaningfulBody(parsed.body, summary) ? parsed.body : '',
  };
}

function toNavItems(client: FeishuWikiClient, nodes: WikiNodeTree[]): SiteNavItem[] {
  return nodes.map((node) => ({
    nodeToken: node.node_token,
    title: node.title,
    url: client.buildWikiPageUrl(node.node_token),
    children: toNavItems(client, node.children || []),
  }));
}

async function loadHomePage(
  client: FeishuWikiClient,
  homeToken: string | undefined,
): Promise<HomePageData | null> {
  if (!homeToken) return null;

  const page = await client.getWikiPageContent(homeToken).catch(() => null);
  if (!page) return null;

  const parsed = parseArticleContent(page);
  return {
    nodeToken: page.node.node_token,
    title: page.node.title,
    summary: parsed.summary,
    tags: parsed.tags,
    externalUrl: page.externalUrl,
  };
}

async function loadArticlesFromNodes(
  client: FeishuWikiClient,
  nodes: WikiNode[],
  slugMode: SlugMode,
  excludedNodeTokens: Set<string>,
): Promise<GeneratedArticle[]> {
  const docNodes = nodes.filter(
    (node) =>
      node.obj_type === 'docx' &&
      !excludedNodeTokens.has(node.node_token) &&
      !/站点配置文档|site\s*config/i.test(node.title),
  );
  const output: GeneratedArticle[] = [];

  // Keep sequential fetching to reduce API rate-limit risk in early versions.
  for (const node of docNodes) {
    const page = await client.getWikiPageContent(node.node_token).catch(() => null);
    if (!page) continue;

    const contentMeta = parseArticleContent(page);
    const contentLines = extractContentLines(page);
    const parsed = parseArticleFrontmatter((page.content || contentLines.join('\n')).trim());
    const resolved = resolveFrontmatter(node, parsed, contentMeta.summary, contentMeta.tags, slugMode);
    const normalizedLines = normalizeBodyLines(contentLines, resolved.frontmatter.title);
    const fallbackBody = normalizedLines.join('\n\n');
    const body = resolved.body || fallbackBody || contentMeta.summary || resolved.frontmatter.title;
    const normalizedForValidation: ArticleFrontmatterParseResult = {
      frontmatter: resolved.frontmatter,
      missingKeys: [],
      body,
      raw: parsed.raw,
    };

    output.push({
      node: page.node,
      page,
      frontmatter: resolved.frontmatter,
      contentMeta,
      body,
      validation: validateArticleFrontmatter(normalizedForValidation),
    });
  }

  return output;
}

export async function buildSiteData(client: FeishuWikiClient, options: SiteBuildOptions): Promise<SiteBuildResult> {
  const configPage = await client.getWikiPageContent(options.siteConfigNodeToken).catch(() => null);
  if (!configPage) {
    const missingConfigIssue: ValidationIssue = {
      severity: 'error',
      field: 'siteConfigNodeToken',
      code: 'site_config_not_found',
      message: '无法读取站点配置文档，请检查 siteConfigNodeToken',
    };
    return {
      valid: false,
      config: { config: {}, missingKeys: ['siteTitle', 'siteDescription', 'baseUrl', 'theme', 'homeToken', 'navRootToken'], raw: {} },
      configValidation: {
        valid: false,
        issues: [missingConfigIssue],
        errors: [missingConfigIssue],
        warnings: [],
      },
      home: null,
      navigation: [],
      articles: [],
      articleIssues: [],
    };
  }

  const config = parseSiteConfig(configPage);
  const configValidation = validateSiteConfig(config);
  const slugMode: SlugMode = options.slugMode || config.config.slugMode || 'title-cn';

  const navRootToken = config.config.navRootToken || '';
  const navTree = navRootToken ? await client.getWikiNodeTree(options.spaceId, navRootToken).catch(() => []) : [];
  const navigation = toNavItems(client, navTree);

  const home = await loadHomePage(client, config.config.homeToken);
  const articleNodes = flattenWikiTree(navTree);
  const excludedNodeTokens = new Set<string>([options.siteConfigNodeToken]);
  const articles = await loadArticlesFromNodes(client, articleNodes, slugMode, excludedNodeTokens);

  const articleIssues = [
    ...articles.flatMap((article) => article.validation.issues),
    ...validateArticleFrontmatters(articles.map((article) => ({
      frontmatter: article.frontmatter,
      missingKeys: [],
      body: '',
      raw: {},
    }))),
  ];

  return {
    valid: configValidation.valid && !articleIssues.some((issue) => issue.severity === 'error'),
    config,
    configValidation,
    home,
    navigation,
    articles,
    articleIssues,
  };
}

function sanitizeFileName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildRoutes(articles: GeneratedArticle[]): SiteRouteItem[] {
  return articles.map((article) => {
    const slug = article.frontmatter.slug || article.node.node_token;
    return {
      slug,
      nodeToken: article.node.node_token,
      title: article.frontmatter.title || article.node.title,
      externalUrl: article.page.externalUrl,
      draft: Boolean(article.frontmatter.draft),
    };
  });
}

export async function writeSiteArtifacts(result: SiteBuildResult, outputDir: string): Promise<SiteArtifactWriteResult> {
  const resolvedOutputDir = resolve(outputDir);
  const articleDir = join(resolvedOutputDir, 'articles');
  const siteFile = join(resolvedOutputDir, 'site.json');
  const routesFile = join(resolvedOutputDir, 'routes.json');

  await mkdir(resolvedOutputDir, { recursive: true });
  await mkdir(articleDir, { recursive: true });

  const routes = buildRoutes(result.articles);
  const articleFiles: string[] = [];
  const fileNameCount = new Map<string, number>();

  for (const article of result.articles) {
    const baseName = sanitizeFileName(article.frontmatter.slug || article.node.node_token) || article.node.node_token;
    const currentCount = fileNameCount.get(baseName) || 0;
    fileNameCount.set(baseName, currentCount + 1);
    const fileName = currentCount === 0 ? `${baseName}.json` : `${baseName}-${currentCount + 1}.json`;
    const filePath = join(articleDir, fileName);
    const articlePayload = {
      node: article.node,
      externalUrl: article.page.externalUrl,
      frontmatter: article.frontmatter,
      contentMeta: article.contentMeta,
      body: article.body,
      validation: article.validation,
    };
    await writeFile(filePath, `${JSON.stringify(articlePayload, null, 2)}\n`, 'utf8');
    articleFiles.push(filePath);
  }

  const sitePayload = {
    generatedAt: new Date().toISOString(),
    valid: result.valid,
    config: result.config.config,
    slugMode: result.config.config.slugMode || 'title-cn',
    configValidation: result.configValidation,
    home: result.home,
    navigation: result.navigation,
    articleCount: result.articles.length,
    issueCount: result.articleIssues.length + result.configValidation.issues.length,
  };

  await writeFile(siteFile, `${JSON.stringify(sitePayload, null, 2)}\n`, 'utf8');
  await writeFile(routesFile, `${JSON.stringify(routes, null, 2)}\n`, 'utf8');

  return {
    outputDir: resolvedOutputDir,
    siteFile,
    routesFile,
    articleDir,
    articleFiles,
  };
}

export async function buildAndWriteSiteData(
  client: FeishuWikiClient,
  options: SiteBuildOptions,
  outputDir: string,
): Promise<{ build: SiteBuildResult; files: SiteArtifactWriteResult }> {
  const build = await buildSiteData(client, options);
  const files = await writeSiteArtifacts(build, outputDir);
  return { build, files };
}
