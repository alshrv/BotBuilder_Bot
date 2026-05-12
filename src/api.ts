import axios from 'axios';
import { BACKEND_URL, BACKEND_API_KEY } from './config.js';

export const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'x-internal-secret': BACKEND_API_KEY,
  },
});

export async function fetchUserBots(telegramId: string) {
  try {
    const response = await api.get(`/internal/bots/user/${telegramId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching bots:', error?.response?.data || error.message || error);
    return [];
  }
}
