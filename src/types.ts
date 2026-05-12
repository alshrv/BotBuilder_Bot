import { Context } from 'grammy';

export interface SessionData {
  activeBotId?: string; 
  activeBotName?: string;
  chatHistory: { role: string; text: string }[];
  step?: 'awaiting_managed_bot' | 'awaiting_bot_prompt' | 'awaiting_confirmation' | undefined;
  pendingBot?: { name: string; prompt: string; token: string } | undefined;
  pendingAction?: any;
}

export type MyContext = Context & { session: SessionData };
