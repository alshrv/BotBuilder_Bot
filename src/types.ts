import { Context } from 'grammy';

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

export interface GenerateMeta {
  description: boolean;
  about: boolean;
  commands: boolean;
}

export interface ImproveBotResult {
  success: boolean;
  message: string;
  version: {
    id: string;
    versionNum: number;
    prompt: string;
    originalPrompt?: string | null;
    enhancedPrompt?: string | null;
    promptWasImproved?: boolean;
    improvementSkippedReason?: string | null;
    createdAt: string;
  };
}

export interface BotVersion {
  id: string;
  versionNum: number;
  prompt: string;
  originalPrompt?: string | null;
  enhancedPrompt?: string | null;
  promptWasImproved?: boolean;
  improvementSkippedReason?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface PromptedVersion {
  id: string;
  versionNum: number;
  prompt: string;
  originalPrompt?: string | null;
  enhancedPrompt?: string | null;
  promptWasImproved?: boolean;
  improvementSkippedReason?: string | null;
  createdAt: string;
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
  currentVersion: PromptedVersion | null;
  latestVersion: PromptedVersion | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData {
  activeBotId?: string; 
  activeBotName?: string;
  activeBotUsername?: string;
  flowMessageId?: number;
  createSourceMessageId?: number;
  step?:
    | 'awaiting_managed_bot'
    | 'awaiting_bot_prompt'
    | 'awaiting_bot_generate_options'
    | 'awaiting_update_managed_bot'
    | 'awaiting_improve_prompt'
    | undefined;
  pendingBot?: {
    name: string;
    prompt: string;
    token: string;
    username?: string;
    generateMeta?: GenerateMeta;
  } | undefined;
}

export type MyContext = Context & { session: SessionData };
