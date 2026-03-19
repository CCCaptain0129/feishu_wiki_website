export interface WikiNode {
  node_token: string;
  obj_token: string;
  obj_type: 'docx' | 'sheet' | 'bitable' | 'mindnote' | 'file' | 'slides' | 'wiki' | 'doc';
  title: string;
  parent_node_token?: string;
  has_child?: boolean;
  meta?: Record<string, unknown>;
}

export interface WikiNodeTree extends WikiNode {
  children: WikiNodeTree[];
}

export interface FeishuTextStyle {
  bold?: boolean;
  inline_code?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  link?: {
    url?: string;
  };
}

export interface FeishuTextRunElement {
  text_run?: {
    content?: string;
    text_element_style?: FeishuTextStyle;
  };
  mention_doc?: {
    title?: string;
    token?: string;
    url?: string;
    obj_type?: number;
    text_element_style?: FeishuTextStyle;
  };
  mention_user?: {
    user_name?: string;
  };
  inline_file?: {
    file_token?: string;
    source_block_id?: string;
  };
  reminder?: {
    text?: string;
  };
}

export interface FeishuBlockTextPayload {
  elements?: FeishuTextRunElement[];
  style?: {
    align?: number;
    folded?: boolean;
  };
}

export interface FeishuBlockItem {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
  page?: FeishuBlockTextPayload;
  text?: FeishuBlockTextPayload;
  heading1?: FeishuBlockTextPayload;
  heading2?: FeishuBlockTextPayload;
  heading3?: FeishuBlockTextPayload;
  heading4?: FeishuBlockTextPayload;
  heading5?: FeishuBlockTextPayload;
  heading6?: FeishuBlockTextPayload;
  bullet?: FeishuBlockTextPayload;
  ordered?: FeishuBlockTextPayload;
  code?: FeishuBlockTextPayload;
  quote?: FeishuBlockTextPayload;
  todo?: FeishuBlockTextPayload;
  callout?: Record<string, unknown>;
  image?: {
    token?: string;
    width?: number;
    height?: number;
  };
  table?: {
    cells?: string[];
    property?: {
      column_size?: number;
      column_width?: number[];
    };
  };
}

export interface FeishuBlockNode extends FeishuBlockItem {
  childBlocks: FeishuBlockNode[];
}

export interface WikiPageContent {
  node: WikiNode;
  content: string | null;
  blocks: FeishuBlockNode[];
  contentType: 'blocks' | 'raw_content' | 'unsupported';
  externalUrl: string;
}

export interface ParsedArticleContent {
  summary: string;
  tags: string[];
}

export interface ContentArticle {
  node: WikiNode;
  page: WikiPageContent;
  summary: string;
  tags: string[];
}
