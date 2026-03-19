import type { FeishuWikiClient } from './client';
import type {
  GeneratedArticle,
  HomePageData,
  SiteBuildOptions,
  SiteBuildResult,
  SiteNavItem,
  ValidationIssue,
  WikiNode,
  WikiNodeTree,
} from './types';
import {
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
): Promise<GeneratedArticle[]> {
  const docNodes = nodes.filter((node) => node.obj_type === 'docx');
  const output: GeneratedArticle[] = [];

  // Keep sequential fetching to reduce API rate-limit risk in early versions.
  for (const node of docNodes) {
    const page = await client.getWikiPageContent(node.node_token).catch(() => null);
    if (!page) continue;

    const contentMeta = parseArticleContent(page);
    const frontmatterInput =
      page.contentType === 'raw_content'
        ? page.content || ''
        : [
            `title: ${page.node.title}`,
            contentMeta.summary ? `summary: ${contentMeta.summary}` : '',
            contentMeta.tags.length ? `tags: ${contentMeta.tags.map((tag) => `#${tag}`).join(' ')}` : '',
          ]
            .filter(Boolean)
            .join('\n');
    const frontmatter = parseArticleFrontmatter(frontmatterInput);

    output.push({
      node: page.node,
      page,
      frontmatter: frontmatter.frontmatter,
      contentMeta,
      validation: validateArticleFrontmatter(frontmatter),
    });
  }

  return output;
}

export async function buildSiteData(client: FeishuWikiClient, options: SiteBuildOptions): Promise<SiteBuildResult> {
  const configPage = await client.getWikiPageContent(options.siteConfigNodeToken);
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

  const navRootToken = config.config.navRootToken || '';
  const navTree = navRootToken ? await client.getWikiNodeTree(options.spaceId, navRootToken).catch(() => []) : [];
  const navigation = toNavItems(client, navTree);

  const home = await loadHomePage(client, config.config.homeToken);
  const articleNodes = flattenWikiTree(navTree);
  const articles = await loadArticlesFromNodes(client, articleNodes);

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
