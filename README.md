# feishu-wiki-site-kit

将飞书知识库（Wiki + Docx）作为网站 CMS 的轻量工具包。

## 目标

- 拉取 Wiki 节点树
- 拉取 Docx Block 内容
- 转换为网站可用的数据结构
- 提供文章摘要/标签解析能力

## 使用方式（示例）

```ts
import { FeishuWikiClient, getContentArticlesByParent } from 'feishu-wiki-site-kit';

const client = new FeishuWikiClient({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  wikiBaseUrl: 'https://tcnzp7jzu5k8.feishu.cn/wiki',
});

const spaceId = process.env.FEISHU_WIKI_SPACE_ID!;
const parentNodeToken = process.env.FEISHU_COMMUNITY_ROOT_TOKEN!;

const articles = await getContentArticlesByParent(client, spaceId, parentNodeToken);
console.log(articles[0]?.node.title, articles[0]?.summary);
```

## 结构

- `src/client.ts`：飞书 API 客户端（鉴权、Wiki、Docx）
- `src/parser.ts`：内容解析（摘要、标签、列表转换）
- `src/index.ts`：统一导出
