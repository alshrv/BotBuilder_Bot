import { Context } from 'grammy';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface BackendBot {
  id: string;
  name: string;
  botId?: string;
  isActive?: boolean;
  activeProdVersionId?: string | null;
  activeTestVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

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

export interface SessionData {
  activeBotId?: string; 
  activeBotName?: string;
  chatHistory: ChatHistoryItem[];
  step?: 'awaiting_managed_bot' | 'awaiting_bot_prompt' | 'awaiting_confirmation' | undefined;
  pendingBot?: { name: string; prompt: string; token: string } | undefined;
  pendingAction?: BackendAction | null | undefined;
}

export type MyContext = Context & { session: SessionData };
