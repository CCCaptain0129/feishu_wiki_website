import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export interface SiteData {
  config?: {
    siteTitle?: string;
    siteDescription?: string;
    baseUrl?: string;
    theme?: string;
  };
  home?: {
    title?: string;
    summary?: string;
    externalUrl?: string;
  } | null;
  navigation?: NavItem[];
}

export interface NavItem {
  nodeToken: string;
  title: string;
  url: string;
  children: NavItem[];
}

export interface RouteItem {
  slug: string;
  nodeToken: string;
  title: string;
  externalUrl: string;
  draft: boolean;
}

export interface ArticleData {
  node: {
    node_token: string;
    title: string;
  };
  frontmatter: {
    slug: string;
    title: string;
    date: string;
    summary: string;
    tags: string[];
    author?: string;
    cover?: string;
    draft?: boolean;
    toc?: boolean;
  };
  body: string;
  externalUrl: string;
}

function getContentDir() {
  const fromEnv = process.env.CONTENT_DIR || '../../tmp/local-run-latest';
  return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getSiteData() {
  return readJsonFile<SiteData>(join(getContentDir(), 'site.json'), {});
}

export async function getRoutes() {
  return readJsonFile<RouteItem[]>(join(getContentDir(), 'routes.json'), []);
}

export async function getArticles() {
  const dir = join(getContentDir(), 'articles');
  try {
    const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
    const all = await Promise.all(files.map((file) => readJsonFile<ArticleData | null>(join(dir, file), null)));
    return all.filter((item): item is ArticleData => Boolean(item));
  } catch {
    return [];
  }
}

export async function getArticleBySlug(slug: string) {
  const articles = await getArticles();
  const candidates = new Set<string>();
  candidates.add(slug);

  try {
    candidates.add(decodeURIComponent(slug));
  } catch {
    // ignore malformed URI
  }

  try {
    candidates.add(encodeURIComponent(slug));
  } catch {
    // ignore malformed URI
  }

  return (
    articles.find((article) => {
      const itemSlug = article.frontmatter.slug;
      if (candidates.has(itemSlug)) return true;
      try {
        return candidates.has(decodeURIComponent(itemSlug));
      } catch {
        return false;
      }
    }) || null
  );
}
