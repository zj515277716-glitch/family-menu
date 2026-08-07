// tools/content-pipeline/src/ark.ts
// 豆包 API client 封装（火山方舟 OpenAI 兼容 SDK）
// 对齐 AC7：用 openai npm 包，baseURL 设火山方舟 endpoint，apiKey 用 ARK_API_KEY
// 工具仅本机运行，不进服务器（实施方案第792行）；运行时代码 apps/ 不调用 LLM（DEC-006）

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

// 加载根目录 .env（ARK_API_KEY / ARK_BASE_URL / ARK_MODEL）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/** 聊天消息（OpenAI 兼容格式） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Ark 聊天客户端抽象（便于测试 mock 注入）。
 * 真实实现用 openai SDK 调火山方舟；测试用 mock 实现。
 */
export interface ArkChatClient {
  /** 发送聊天请求，返回助手消息文本 */
  complete(messages: ChatMessage[]): Promise<string>;
}

/** 默认系统提示词占位（实际由 draft.ts 注入 menu-draft.md 内容） */
const DEFAULT_SYSTEM_PROMPT = '你是家庭菜谱内容起草助手。';

/**
 * 创建真实的豆包（火山方舟）聊天客户端。
 * 使用 openai npm 包，baseURL/apiKey/model 从环境变量读取。
 * 仅本机运行，不进服务器。
 */
export function createArkClient(overrides?: {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}): ArkChatClient {
  const apiKey = overrides?.apiKey ?? process.env.ARK_API_KEY;
  const baseURL = overrides?.baseURL ?? process.env.ARK_BASE_URL;
  const model = overrides?.model ?? process.env.ARK_MODEL;

  if (!apiKey) {
    throw new Error('ARK_API_KEY 未设置：请在根目录 .env 配置 ARK_API_KEY（火山方舟）');
  }
  if (!baseURL) {
    throw new Error('ARK_BASE_URL 未设置：请在根目录 .env 配置 ARK_BASE_URL');
  }
  if (!model) {
    throw new Error('ARK_MODEL 未设置：请在根目录 .env 配置 ARK_MODEL（豆包模型ID）');
  }

  const openai = new OpenAI({ apiKey, baseURL });

  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      // 确保有 system 消息
      const fullMessages: ChatMessage[] =
        messages[0]?.role === 'system' ? messages : [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...messages];
      const response = await openai.chat.completions.create({
        model,
        messages: fullMessages,
        // 火山方舟兼容 OpenAI 的 JSON 输出模式
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('豆包 API 返回空内容');
      }
      return content;
    },
  };
}
