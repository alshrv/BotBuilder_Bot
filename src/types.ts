import { Context } from 'grammy';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface BackendBot {
  id: string;
  name: string;
  telegramUsername?: string | null;
  botId?: string;
  isActive?: boolean;
  activeProdVersionId?: string | null;
  activeTestVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type BotEnvironment = 'test' | 'prod';

export interface CreateBotResult {
  success: boolean;
  message: string;
  botId: string;
  versionId: string;
}

export interface BackendAction {
  tool: string;
  args?: Record<string, unknown>;
}

export interface BackendChatResponse {
  type: string;
  content?: string;
  data?: unknown;
  action?: BackendAction;
}

export interface BotStatus {
  id: string;
  name: string;
  runtimeBotId: string;
  isActive: boolean;
  testActive: boolean;
  prodActive: boolean;
  hasTestToken: boolean;
  hasProdToken: boolean;
  latestVersion: {
    id: string;
    versionNum: number;
    prompt: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData {
  activeBotId?: string; 
  activeBotName?: string;
  activeBotUsername?: string;
  chatHistory: ChatHistoryItem[];
  step?: 'awaiting_managed_bot' | 'awaiting_bot_prompt' | 'awaiting_confirmation' | undefined;
  pendingBot?: {
    name: string;
    prompt: string;
    token: string;
    username?: string;
  } | undefined;
  pendingAction?: BackendAction | null | undefined;
}

export type MyContext = Context & { session: SessionData };
