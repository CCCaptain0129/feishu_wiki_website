import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container">
      <section className="panel">
        <h1>页面不存在</h1>
        <p>这篇文章可能未发布，或 slug 已变化。</p>
        <p>
          <Link href="/">返回首页</Link>
        </p>
      </section>
    </main>
  );
}
