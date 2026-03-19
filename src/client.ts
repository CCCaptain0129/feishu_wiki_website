import type { FeishuBlockItem, FeishuBlockNode, WikiNode, WikiNodeTree, WikiPageContent } from './types';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

interface TokenCache {
  accessToken: string;
  expireAt: number;
}

export interface FeishuWikiClientOptions {
  appId: string;
  appSecret: string;
  wikiBaseUrl?: string;
}

export class FeishuWikiClient {
  private appId: string;
  private appSecret: string;
  private wikiBaseUrl: string;
  private tokenCache: TokenCache | null = null;

  constructor(options: FeishuWikiClientOptions) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.wikiBaseUrl = options.wikiBaseUrl || 'https://tcnzp7jzu5k8.feishu.cn/wiki';
  }

  async getAccessToken() {
    const cached = this.tokenCache;
    if (cached && cached.expireAt > Date.now()) {
      return cached.accessToken;
    }

    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      throw new Error(`Failed to get access token: ${data?.msg || response.status}`);
    }

    this.tokenCache = {
      accessToken: data.tenant_access_token,
      expireAt: Date.now() + (Number(data.expire || 7200) - 60) * 1000,
    };

    return this.tokenCache.accessToken;
  }

  async getWikiNodes(spaceId: string, parentNodeToken?: string): Promise<WikiNode[]> {
    const token = await this.getAccessToken();
    const nodes: WikiNode[] = [];
    let pageToken = '';

    while (true) {
      const url = new URL(`${FEISHU_API_BASE}/wiki/v2/spaces/${spaceId}/nodes`);
      if (parentNodeToken) {
        url.searchParams.set('parent_node_token', parentNodeToken);
      }
      if (pageToken) {
        url.searchParams.set('page_token', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || data.code !== 0) {
        throw new Error(`Failed to get wiki nodes: ${data?.msg || response.status}`);
      }

      const items = (data.data?.items || data.data?.nodes || []) as WikiNode[];
      nodes.push(...items);
      pageToken = data.data?.page_token || '';
      if (!pageToken) break;
    }

    return nodes;
  }

  async getWikiNodeTree(spaceId: string, parentNodeToken?: string): Promise<WikiNodeTree[]> {
    const nodes = await this.getWikiNodes(spaceId, parentNodeToken);
    return Promise.all(
      nodes.map(async (node) => ({
        ...node,
        children: node.has_child ? await this.getWikiNodeTree(spaceId, node.node_token) : [],
      })),
    );
  }

  async getWikiNodeByToken(nodeToken: string): Promise<WikiNode | null> {
    const token = await this.getAccessToken();
    const response = await fetch(`${FEISHU_API_BASE}/wiki/v2/spaces/get_node?token=${nodeToken}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      return null;
    }
    return data.data?.node || null;
  }

  async getDocumentContent(documentId: string): Promise<string | null> {
    const token = await this.getAccessToken();
    const response = await fetch(`${FEISHU_API_BASE}/docx/v1/documents/${documentId}/raw_content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      return null;
    }
    return data.data?.content || null;
  }

  async getDocumentBlocks(documentId: string): Promise<FeishuBlockItem[]> {
    const token = await this.getAccessToken();
    const blocks: FeishuBlockItem[] = [];
    let pageToken = '';

    while (true) {
      const url = new URL(`${FEISHU_API_BASE}/docx/v1/documents/${documentId}/blocks`);
      url.searchParams.set('page_size', '500');
      if (pageToken) {
        url.searchParams.set('page_token', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || data.code !== 0) {
        throw new Error(`Failed to get document blocks: ${data?.msg || response.status}`);
      }

      blocks.push(...((data.data?.items || []) as FeishuBlockItem[]));
      pageToken = data.data?.page_token || '';
      if (!pageToken) break;
    }

    return blocks;
  }

  buildBlockTree(blocks: FeishuBlockItem[]): FeishuBlockNode[] {
    const map = new Map<string, FeishuBlockNode>();

    for (const block of blocks) {
      map.set(block.block_id, {
        ...block,
        childBlocks: [],
      });
    }

    for (const block of map.values()) {
      if (block.children?.length) {
        block.childBlocks = block.children
          .map((childId) => map.get(childId))
          .filter((child): child is FeishuBlockNode => Boolean(child));
      }
    }

    for (const block of map.values()) {
      if (!block.parent_id) continue;
      const parent = map.get(block.parent_id);
      if (!parent) continue;
      if (!parent.childBlocks.some((child) => child.block_id === block.block_id)) {
        parent.childBlocks.push(block);
      }
    }

    return Array.from(map.values()).filter((block) => !block.parent_id || !map.has(block.parent_id));
  }

  buildWikiPageUrl(nodeToken: string) {
    return `${this.wikiBaseUrl}/${nodeToken}`;
  }

  async getWikiPageContent(nodeToken: string): Promise<WikiPageContent | null> {
    const node = await this.getWikiNodeByToken(nodeToken);
    if (!node) return null;

    const externalUrl = this.buildWikiPageUrl(nodeToken);

    if (node.obj_type !== 'docx') {
      return {
        node,
        content: null,
        blocks: [],
        contentType: 'unsupported',
        externalUrl,
      };
    }

    try {
      const blocks = this.buildBlockTree(await this.getDocumentBlocks(node.obj_token));
      if (blocks.length > 0) {
        return {
          node,
          content: null,
          blocks,
          contentType: 'blocks',
          externalUrl,
        };
      }
    } catch {
      // fallback to raw content
    }

    const content = await this.getDocumentContent(node.obj_token);
    return {
      node,
      content,
      blocks: [],
      contentType: 'raw_content',
      externalUrl,
    };
  }
}
