import * as dotenv from 'dotenv';
dotenv.config();

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
export const BACKEND_API_KEY = process.env.BACKEND_API_KEY || '';

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is missing.');
  process.exit(1);
}
