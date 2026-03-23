import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FeishuWikiClient, buildAndWriteSiteData } from '../src/index';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  const envPath = resolve(process.cwd(), '.env');
  loadEnvFile(envPath);

  const required = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_WIKI_SPACE_ID', 'FEISHU_SITE_CONFIG_TOKEN'] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }

  const wikiBaseUrl = process.env.FEISHU_WIKI_BASE_URL || 'https://tcnzp7jzu5k8.feishu.cn/wiki';
  const outputDir = process.env.CONTENT_OUTPUT_DIR || './tmp/local-run-latest';
  const slugMode = (process.env.SLUG_MODE as 'title-cn' | 'ascii' | undefined) || undefined;

  const client = new FeishuWikiClient({
    appId: process.env.FEISHU_APP_ID!,
    appSecret: process.env.FEISHU_APP_SECRET!,
    wikiBaseUrl,
  });

  const { build, files } = await buildAndWriteSiteData(
    client,
    {
      spaceId: process.env.FEISHU_WIKI_SPACE_ID!,
      siteConfigNodeToken: process.env.FEISHU_SITE_CONFIG_TOKEN!,
      slugMode,
    },
    outputDir,
  );

  console.log(JSON.stringify({
    valid: build.valid,
    outputDir: files.outputDir,
    articleCount: build.articles.length,
    configErrors: build.configValidation.errors.length,
    articleErrors: build.articleIssues.filter((issue) => issue.severity === 'error').length,
  }, null, 2));
}

main().catch((error) => {
  console.error('[content:build] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

