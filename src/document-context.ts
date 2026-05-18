import axios from 'axios';
import { Buffer } from 'node:buffer';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { BOT_TOKEN } from './config.js';
import type { MyContext } from './types.js';

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_CONTEXT_CHARS = 3000;
const PREVIEW_CHARS = 200;
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.pdf', '.docx', '.csv', '.md']);

export const UNSUPPORTED_DOCUMENT_MESSAGE =
  '⚠️ Please send a TXT, PDF, DOCX, CSV, or MD file. Images and other formats are not supported.';
export const DOCUMENT_TOO_LARGE_MESSAGE =
  '⚠️ File is too large. Please send a file under 2MB.';
export const DOCUMENT_READ_FAILED_MESSAGE =
  '❌ Could not read this document. Please try a different file or type your description directly.';

type DocumentReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'unsupported' | 'too_large' | 'read_failed' };

type DocumentReadFailure = Extract<DocumentReadResult, { ok: false }>;

function getFileExtension(fileName?: string) {
  const match = fileName?.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? null;
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripMarkdownFormatting(text: string) {
  return text
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/^\s*(?:---|\*\*\*)\s*$/gm, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}

function truncateAtSentenceBoundary(text: string, maxLength = MAX_CONTEXT_CHARS) {
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, maxLength);
  const sentenceBoundary = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('.\n'),
    slice.lastIndexOf('!\n'),
    slice.lastIndexOf('?\n'),
  );

  if (sentenceBoundary >= Math.floor(maxLength * 0.6)) {
    return slice.slice(0, sentenceBoundary + 1).trim();
  }

  const wordBoundary = slice.lastIndexOf(' ');
  if (wordBoundary >= Math.floor(maxLength * 0.6)) {
    return slice.slice(0, wordBoundary).trim();
  }

  return slice.trim();
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocumentText(buffer: Buffer, extension: string) {
  if (extension === '.txt' || extension === '.csv') {
    return buffer.toString('utf8');
  }

  if (extension === '.md') {
    return stripMarkdownFormatting(buffer.toString('utf8'));
  }

  if (extension === '.pdf') {
    return extractPdfText(buffer);
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported document extension: ${extension}`);
}

export async function readDocumentContext(ctx: MyContext): Promise<DocumentReadResult> {
  const validationError = getDocumentUploadError(ctx);
  if (validationError) return validationError;

  const document = ctx.message?.document;
  const extension = getFileExtension(document?.file_name);
  if (!document || !extension) return { ok: false, reason: 'unsupported' };

  try {
    const file = await ctx.api.getFile(document.file_id);
    if (!file.file_path) return { ok: false, reason: 'read_failed' };

    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      maxContentLength: MAX_DOCUMENT_BYTES,
      maxBodyLength: MAX_DOCUMENT_BYTES,
    });
    const buffer = Buffer.from(response.data);
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
      return { ok: false, reason: 'too_large' };
    }

    const extracted = normalizeExtractedText(
      await extractDocumentText(buffer, extension),
    );
    const text = truncateAtSentenceBoundary(extracted);
    if (!text) return { ok: false, reason: 'read_failed' };

    return { ok: true, text };
  } catch (error) {
    console.error('Document extraction failed:', error);
    return { ok: false, reason: 'read_failed' };
  }
}

export function getDocumentUploadError(ctx: MyContext): DocumentReadFailure | null {
  const document = ctx.message?.document;
  if (!document) return { ok: false, reason: 'unsupported' };

  const extension = getFileExtension(document.file_name);
  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) {
    return { ok: false, reason: 'unsupported' };
  }

  if (
    typeof document.file_size === 'number' &&
    document.file_size > MAX_DOCUMENT_BYTES
  ) {
    return { ok: false, reason: 'too_large' };
  }

  return null;
}

export function formatDocumentPreview(
  text: string,
  nextInstruction = 'Now describe what your bot should do with this information:',
) {
  const preview = text.slice(0, PREVIEW_CHARS).trim();
  return [
    '📄 Document received (truncated to fit)',
    '',
    'Here is what I extracted:',
    `${preview}...`,
    '',
    nextInstruction,
  ].join('\n');
}
