# feishu-wiki-site-kit

将飞书知识库（Wiki + Docx）作为网站 CMS 的轻量工具包，聚焦“拉取 -> 解析 -> 输出站点可用数据”。

## 功能概览

- 飞书鉴权与租户 `tenant_access_token` 缓存
- Wiki 节点查询（支持分页、按父节点过滤）
- Wiki 树构建（递归 children）
- Docx 文档内容拉取
  - 优先拉取 blocks 并构建 block tree
  - 失败时回退到 `raw_content`
- 文章摘要和标签解析
  - `摘要: ...` / `摘要：...`
  - `标签: #tagA #tagB` / `tag: #tagA #tagB`
- 输出可用于前端渲染和索引的统一数据结构

## 安装与使用

当前仓库为 `private: true`，更适合在 monorepo 或本地项目中直接引用源码。

### 1) 依赖环境

- Node.js 18+（需要全局 `fetch`）
- 飞书自建应用（具备 Wiki/Docx 读取权限）

### 2) 初始化客户端

```ts
import { FeishuWikiClient } from 'feishu-wiki-site-kit';

const client = new FeishuWikiClient({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  wikiBaseUrl: process.env.FEISHU_WIKI_BASE_URL, // 可选，默认值见下方
});
```

### 3) 按父节点获取内容文章

```ts
import { FeishuWikiClient, getContentArticlesByParent } from 'feishu-wiki-site-kit';

const client = new FeishuWikiClient({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  wikiBaseUrl: 'https://your-domain.feishu.cn/wiki',
});

const spaceId = process.env.FEISHU_WIKI_SPACE_ID!;
const parentNodeToken = process.env.FEISHU_COMMUNITY_ROOT_TOKEN!;

const articles = await getContentArticlesByParent(client, spaceId, parentNodeToken);

for (const article of articles) {
  console.log(article.node.title, article.summary, article.tags, article.page.externalUrl);
}
```

## 环境变量建议

```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_WIKI_SPACE_ID=xxx
FEISHU_COMMUNITY_ROOT_TOKEN=xxx
FEISHU_WIKI_BASE_URL=https://your-domain.feishu.cn/wiki
```

`wikiBaseUrl` 默认值为 `https://tcnzp7jzu5k8.feishu.cn/wiki`，建议在业务项目中显式传入，避免多环境混淆。

## API 说明

### `FeishuWikiClient`

- `getAccessToken()`
  - 获取并缓存租户 token（过期前 60 秒自动刷新）
- `getWikiNodes(spaceId, parentNodeToken?)`
  - 拉取 Wiki 节点列表（自动分页）
- `getWikiNodeTree(spaceId, parentNodeToken?)`
  - 构建递归节点树
- `getWikiNodeByToken(nodeToken)`
  - 根据 token 获取单节点信息
- `getDocumentBlocks(documentId)`
  - 拉取 Docx blocks（自动分页）
- `buildBlockTree(blocks)`
  - 将扁平 block 列表转换为树
- `getDocumentContent(documentId)`
  - 拉取 `raw_content`
- `getWikiPageContent(nodeToken)`
  - 统一页面内容读取入口，返回：
    - `contentType: "blocks"`（优先）
    - `contentType: "raw_content"`（blocks 失败回退）
    - `contentType: "unsupported"`（非 docx 类型）

### Parser 工具

- `plainTextFromElements(elements)`
  - 从 text run / mention / reminder 提取纯文本
- `parseArticleContent(pageContent)`
  - 解析 `summary` 和 `tags`
- `getContentArticlesByParent(client, spaceId, parentNodeToken)`
  - 一次性拉取指定父节点下内容并输出 `ContentArticle[]`

## 输出数据结构（核心）

- `WikiPageContent`
  - `node`: Wiki 节点元数据
  - `content`: `raw_content` 字符串（仅回退场景）
  - `blocks`: block tree（首选内容来源）
  - `contentType`: `"blocks" | "raw_content" | "unsupported"`
  - `externalUrl`: 页面外链
- `ContentArticle`
  - `node` / `page` / `summary` / `tags`

## 行为说明与限制

- 仅 `obj_type === "docx"` 时会尝试读取正文，其他类型返回 `unsupported`
- `getWikiNodeTree` 为递归拉取，大空间下可能较慢
- `getContentArticlesByParent` 当前采用 `Promise.all` 并发抓取，节点很多时可能触发 API 频率限制
- 标签解析基于 `#tag` 约定，不会自动抽取自然语言关键词

## 目录结构

- `src/client.ts`：飞书 API 客户端（鉴权、Wiki、Docx）
- `src/parser.ts`：内容解析（摘要、标签、文本抽取）
- `src/types.ts`：类型定义（节点、blocks、文章结构）
- `src/index.ts`：统一导出

## 优化方向

### 短期（建议优先）

1. 增加请求重试和退避
   - 对 429/5xx 增加指数退避与最大重试次数，降低偶发失败率。
2. 增加并发控制
   - 对 `getContentArticlesByParent` 引入并发上限（如 5~10），降低限流风险。
3. 完善错误语义
   - 区分鉴权失败、权限不足、资源不存在、限流等错误类型，便于上层处理。
4. 补齐单元测试
   - 覆盖摘要/标签解析、block tree 构建、回退路径和边界输入。

### 中期

1. 增加缓存层
   - 对节点树与文档内容加 TTL 缓存，减少重复拉取。
2. 丰富解析能力
   - 解析图片、表格、Callout、代码块等结构化内容，输出更适配前端渲染的数据模型。
3. 可观测性
   - 增加日志埋点（请求耗时、失败率、命中率）和可选 debug 模式。

### 长期

1. 工程化发布
   - 增加 `build`、`lint`、`test`、`changeset`，输出稳定 npm 包（ESM/CJS + `.d.ts`）。
2. 增量同步机制
   - 基于更新时间或 webhook 实现增量抓取，减少全量扫描成本。
3. 多站点内容策略
   - 支持多 space、多根节点聚合，统一索引和路由映射。
