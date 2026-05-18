const PROMPT_PREVIEW_LIMIT = 900;

export function truncateForTelegram(text: string, maxLength = PROMPT_PREVIEW_LIMIT) {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= maxLength) return normalized;

  const hiddenCharacters = normalized.length - maxLength;
  return `${normalized.slice(0, maxLength).trimEnd()}...\n(${hiddenCharacters} more characters hidden)`;
}

export function formatDataPayload(type: string, content: string | undefined, payload: any): string {
  if (!payload) return content || 'Action completed.';

  let formatted = content ? `${content}\n\n` : '';

  switch (type) {
    case 'get_logs':
      if (payload.lines && Array.isArray(payload.lines)) {
        const logs = payload.lines.join('\n');
        formatted += `\`\`\`\n${logs}\n\`\`\``;
      }
      break;
    case 'get_stats':
      formatted += `📊 *Statistics*\n`;
      formatted += `*Current Runtime:* ${formatRuntimeState(payload.status)}\n\n`;
      formatted += `Messages Today: *${payload.messages_today ?? 0}*\n`;
      formatted += `Total Messages: *${payload.total_messages ?? 0}*\n`;
      formatted += `Errors Today: *${payload.errors_today ?? 0}*\n`;
      formatted += `Error Rate: *${formatStatsRate(payload.error_rate)}*\n`;
      formatted += `Avg Response Time: *${formatStatsResponseTime(payload.avg_response_time_ms)}*\n`;
      formatted += `Unique Users Today: *${payload.unique_users_today ?? 0}*`;
      break;
    case 'get_versions':
      if (Array.isArray(payload)) {
        formatted += `🧾 *Version History*\n\n`;
        payload.forEach((v: any) => {
          formatted += `*v${v.versionNum}* ${v.isActive ? '🟢(Current)' : ''}\n`;
          formatted += formatPromptImprovement(v);
          formatted += `\n`;
        });
      }
      break;
    case 'get_status':
      formatted += `${payload.status === 'token_invalid' ? '🔑' : '🟢'} *${payload.name} Status*\n\n`;
      if (payload.status === 'token_invalid') {
        formatted += `🔑 Token invalid — bot deleted from BotFather\n`;
        break;
      }
      if (payload.runtime) {
        formatted += `*Current Runtime:* ${formatRuntimeState(payload.runtime.overall)}\n`;
        formatted += `*Checked:* ${formatCheckedAt(payload.runtime.checkedAt)}\n`;
      } else {
        formatted += `*Current Runtime:* ${payload.isActive ? 'Running' : 'Stopped'}\n`;
      }
      if (payload.desiredState) {
        formatted += `\n*Stored State:* ${payload.desiredState.isActive ? 'Active' : 'Inactive'}\n`;
      }
      if (payload.currentVersion || payload.latestVersion) {
        const version = payload.currentVersion ?? payload.latestVersion;
        formatted += `\n*Current Version:* v${version.versionNum}\n`;
        formatted += formatPromptImprovement(version).trimEnd();
      }
      break;
    case 'improve_bot':
      if (payload.version) {
        formatted += `*New Version (v${payload.version.versionNum}) Created!*\n`;
        formatted += formatPromptImprovement(payload.version);
      }
      break;
  }

  return formatted.trim();
}

function formatPromptImprovement(version: any): string {
  if (version.promptWasImproved && version.enhancedPrompt) {
    let formatted = `*Original Prompt Preview:* _${truncateForTelegram(version.originalPrompt || version.prompt)}_\n`;
    formatted += `*Improved Prompt Preview:* _${truncateForTelegram(version.enhancedPrompt)}_\n`;
    return formatted;
  }

  let formatted = `*Prompt Preview:* _${truncateForTelegram(version.prompt)}_\n`;
  if (version.improvementSkippedReason) {
    formatted += `*Prompt Improver:* ${formatImprovementSkippedReason(version.improvementSkippedReason)}\n`;
  }
  return formatted;
}

function formatImprovementSkippedReason(reason: string): string {
  switch (reason) {
    case 'already_good':
      return 'Skipped, prompt was already detailed';
    case 'no_provider':
      return 'Skipped, no LLM provider configured';
    case 'improvement_failed':
      return 'Skipped, improver failed';
    case 'sanity_check_failed':
      return 'Skipped, improved prompt failed validation';
    default:
      return `Skipped (${reason})`;
  }
}

function formatRuntimeState(state?: string) {
  switch (state) {
    case 'running':
      return 'Running';
    case 'launching':
      return 'Starting';
    case 'errored':
      return 'Errored';
    case 'unknown':
      return 'Unknown';
    case 'stopped':
    default:
      return 'Stopped';
  }
}

function formatStatsRate(value: unknown) {
  const numericValue = Number(value ?? 0);
  return `${Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00'}%`;
}

function formatStatsResponseTime(value: unknown) {
  if (value === null || value === undefined) return '--';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue)}ms` : '--';
}

function formatCheckedAt(value?: string) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
