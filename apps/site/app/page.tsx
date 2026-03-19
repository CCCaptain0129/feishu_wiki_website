import Link from 'next/link';
import { getArticles, getSiteData } from '../lib/content';

export default async function HomePage() {
  const site = await getSiteData();
  const articles = (await getArticles())
    .filter((article) => !article.frontmatter.draft)
    .sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
  const featured = articles[0];

  return (
    <main className="container">
      <header className="hero">
        <div className="heroBadge">Feishu Wiki Website</div>
        <h1>{site.config?.siteTitle || 'My Feishu Site'}</h1>
        <p>{site.config?.siteDescription || 'Content powered by Feishu Wiki'}</p>
        <div className="heroActions">
          {featured ? (
            <Link className="heroPrimaryBtn" href={`/${featured.frontmatter.slug}`}>
              开始阅读
            </Link>
          ) : null}
          {site.home?.externalUrl ? (
            <a className="heroGhostBtn" href={site.home.externalUrl} target="_blank" rel="noopener noreferrer">
              查看飞书首页
            </a>
          ) : null}
        </div>
      </header>

      <section className="panel">
        <h2>文章列表</h2>
        <ul className="articleList">
          {articles.map((article) => (
            <li key={article.frontmatter.slug} className="card">
              <h3>
                <Link href={`/${article.frontmatter.slug}`}>{article.frontmatter.title}</Link>
              </h3>
              <p className="meta">
                {article.frontmatter.date}
                {article.frontmatter.author ? ` · ${article.frontmatter.author}` : ''}
              </p>
              <p>{article.frontmatter.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
