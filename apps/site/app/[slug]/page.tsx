import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticleBySlug, getRoutes } from '../../lib/content';
import { FeishuDocContent } from '../../../../src/renderer/FeishuDocContent';

export async function generateStaticParams() {
  const routes = await getRoutes();
  return routes.map((route) => ({ slug: route.slug }));
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || article.frontmatter.draft) {
    notFound();
  }

  return (
    <main className="container">
      <p>
        <Link href="/">← 返回首页</Link>
      </p>

      <article className="panel">
        <h1>{article.frontmatter.title}</h1>
        <p className="meta">
          {article.frontmatter.date}
          {article.frontmatter.author ? ` · ${article.frontmatter.author}` : ''}
        </p>
        <p>{article.frontmatter.summary}</p>
        <FeishuDocContent content={article.body || article.frontmatter.summary || ''} />
      </article>
    </main>
  );
}
