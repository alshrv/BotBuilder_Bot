import axios from 'axios';
import { BACKEND_URL, INTERNAL_BOT_SECRET } from './config.js';
import type {
  BackendAction,
  BackendBot,
  BackendChatResponse,
  BotEnvironment,
  BotStatus,
  ChatHistoryItem,
  CreateBotResult,
} from './types.js';

export const api = axios.create({
  baseURL: BACKEND_URL.replace(/\/+$/, ''),
  timeout: 120000,
  headers: {
    'x-internal-secret': INTERNAL_BOT_SECRET,
  },
});

export class BackendApiError extends Error {
  status: number | undefined;
  details: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
    this.details = details;
  }
}

function toBackendApiError(error: unknown, fallbackMessage: string) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const details = error.response?.data;
    const message =
      typeof details === 'object' &&
      details &&
      'message' in details &&
      typeof details.message === 'string'
        ? details.message
        : error.message || fallbackMessage;

    return new BackendApiError(message, status, details);
  }

  return new BackendApiError(
    error instanceof Error ? error.message : fallbackMessage
  );
}

export async function fetchUserBots(telegramId: string): Promise<BackendBot[]> {
  try {
    const response = await api.get(`/internal/bots/user/${telegramId}`);
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bots.');
  }
}

export async function createUserBot(
  telegramId: string,
  input: { name: string; prompt: string; token: string }
): Promise<CreateBotResult> {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/create`,
      input
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to create bot.');
  }
}

export async function chatWithUserBot(
  telegramId: string,
  botId: string,
  input: {
    message: string;
    history: ChatHistoryItem[];
    confirmedAction?: BackendAction | null;
  }
): Promise<BackendChatResponse> {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/chat/${botId}`,
      input
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to chat with bot.');
  }
}

export async function fetchBotLogs(
  telegramId: string,
  botId: string,
  environment: BotEnvironment = 'prod'
) {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/logs`,
      { params: { environment } }
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bot logs.');
  }
}

export async function fetchBotStats(
  telegramId: string,
  botId: string,
  environment: BotEnvironment = 'prod'
) {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/stats`,
      { params: { environment } }
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bot stats.');
  }
}

export async function fetchBotStatus(
  telegramId: string,
  botId: string
): Promise<BotStatus> {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/status`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bot status.');
  }
}

export async function fetchBotVersions(telegramId: string, botId: string) {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/versions`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bot versions.');
  }
}
