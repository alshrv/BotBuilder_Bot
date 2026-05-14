import axios from 'axios';
import { BACKEND_URL, INTERNAL_BOT_SECRET } from './config.js';
import type {
  BackendBot,
  BotVersion,
  BotStatus,
  CreateBotResult,
  GenerateMeta,
  ImproveBotResult,
  UpdateBotTokenResult,
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

export async function checkCreateBotAllowed(telegramId: string) {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/create-eligibility`,
    );
    return response.data as { allowed: true };
  } catch (error: unknown) {
    throw toBackendApiError(error, 'You cannot create another bot right now.');
  }
}

export async function createUserBot(
  telegramId: string,
  input: {
    name: string;
    prompt: string;
    token: string;
    telegramUsername?: string;
    generateMeta?: GenerateMeta;
  }
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

export async function fetchBotLogs(
  telegramId: string,
  botId: string,
) {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/logs`,
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bot logs.');
  }
}

export async function fetchBotStats(
  telegramId: string,
  botId: string,
) {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/stats`,
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

export async function fetchBotVersions(
  telegramId: string,
  botId: string,
): Promise<BotVersion[]> {
  try {
    const response = await api.get(
      `/internal/bots/user/${telegramId}/${botId}/versions`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to fetch bot versions.');
  }
}

export async function deployBotVersion(
  telegramId: string,
  botId: string,
  versionId: string,
) {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/versions/${versionId}/deploy`,
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to change bot version.');
  }
}

export async function improveBot(
  telegramId: string,
  botId: string,
  input: { prompt: string },
): Promise<ImproveBotResult> {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/improve`,
      input,
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to improve bot.');
  }
}

export async function stopBot(telegramId: string, botId: string) {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/stop`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to stop bot.');
  }
}

export async function restartBot(telegramId: string, botId: string) {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/restart`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to restart bot.');
  }
}

export async function resumeBot(telegramId: string, botId: string) {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/resume`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to resume bot.');
  }
}

export async function deleteBot(telegramId: string, botId: string) {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/delete`
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to delete bot.');
  }
}

export async function updateBotToken(
  telegramId: string,
  botId: string,
  input: {
    token: string;
    telegramUsername?: string;
  }
): Promise<UpdateBotTokenResult> {
  try {
    const response = await api.post(
      `/internal/bots/user/${telegramId}/${botId}/token`,
      input
    );
    return response.data;
  } catch (error: unknown) {
    throw toBackendApiError(error, 'Failed to update bot token.');
  }
}
