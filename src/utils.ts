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
      formatted += `*Current Runtime:* ${payload.isActive ? 'Running' : 'Stopped'}\n\n`;
      formatted += `Messages: *${payload.messageCount}*\n`;
      formatted += `Errors: *${payload.errorCount}*\n`;
      formatted += `Error Rate: *${payload.errorRate}*\n`;
      formatted += `Avg Response Time: *${payload.responseTime}*`;
      break;
    case 'get_versions':
      if (Array.isArray(payload)) {
        formatted += `🧾 *Version History*\n\n`;
        payload.forEach((v: any) => {
          formatted += `*v${v.versionNum}* ${v.isActive ? '🟢(Current)' : ''}\n`;
          formatted += `Prompt: _${v.prompt}_\n\n`;
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
        formatted += `*Prompt:* _${version.prompt}_`;
      }
      break;
    case 'improve_bot':
      if (payload.version) {
        formatted += `*New Version (v${payload.version.versionNum}) Created!*\n`;
        formatted += `Prompt: _${payload.version.prompt}_\n`;
      }
      break;
  }

  return formatted.trim();
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

function formatCheckedAt(value?: string) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
