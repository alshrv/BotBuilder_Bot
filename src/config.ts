import * as dotenv from 'dotenv';
dotenv.config();

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
export const INTERNAL_BOT_SECRET =
  process.env.INTERNAL_BOT_SECRET || process.env.BACKEND_API_KEY || '';

if (!BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is missing.');
  process.exit(1);
}

if (!INTERNAL_BOT_SECRET) {
  console.error(
    'Error: INTERNAL_BOT_SECRET is missing. Set it to the same value used by the backend.'
  );
  process.exit(1);
}
