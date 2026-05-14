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
  status?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBotResult {
  success: boolean;
  message: string;
  botId: string;
  versionId: string;
}

export interface UpdateBotTokenResult {
  success: boolean;
  message: string;
  status: string;
  telegramUsername?: string | null;
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
  status?: string;
  runtimeBotId: string;
  isActive: boolean;
  desiredState?: {
    isActive: boolean;
  };
  runtime?: {
    overall: string;
    state?: string;
    processName?: string;
    checkedAt: string;
    pm2Status?: string;
    restartCount?: number;
    pid?: number;
  };
  hasToken: boolean;
  currentVersion: {
    id: string;
    versionNum: number;
    prompt: string;
    createdAt: string;
  } | null;
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
  flowMessageId?: number;
  chatHistory: ChatHistoryItem[];
  step?:
    | 'awaiting_managed_bot'
    | 'awaiting_bot_prompt'
    | 'awaiting_update_managed_bot'
    | 'awaiting_confirmation'
    | undefined;
  pendingBot?: {
    name: string;
    prompt: string;
    token: string;
    username?: string;
  } | undefined;
  pendingAction?: BackendAction | null | undefined;
}

export type MyContext = Context & { session: SessionData };
