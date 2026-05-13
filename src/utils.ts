export function formatDataPayload(type: string, content: string | undefined, payload: any): string {
  if (!payload) return content || 'Action completed.';

  let formatted = content ? `${content}\n\n` : '';

  switch (type) {
    case 'get_logs':
      if (payload.lines && Array.isArray(payload.lines)) {
        const logs = payload.lines.join('\n');
        formatted += `*Environment:* ${payload.environment || 'auto'}\n\n`;
        formatted += `\`\`\`\n${logs}\n\`\`\``;
      }
      break;
    case 'get_stats':
      formatted += `📊 *Statistics*\n`;
      formatted += `*Environment:* ${payload.environment || 'auto'}\n`;
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
          formatted += `*v${v.versionNum}* ${v.isProd ? '🟢(Prod)' : ''}${v.isTest ? '🟡(Test)' : ''}\n`;
          formatted += `Prompt: _${v.prompt}_\n\n`;
        });
      }
      break;
    case 'get_status':
      formatted += `🟢 *${payload.name} Status*\n\n`;
      if (payload.runtime) {
        formatted += `*Current Runtime:* ${formatRuntimeState(payload.runtime.overall)}\n`;
        formatted += `*Test:* ${formatRuntimeState(payload.runtime.test?.state)}\n`;
        formatted += `*Production:* ${formatRuntimeState(payload.runtime.prod?.state)}\n`;
        formatted += `*Checked:* ${formatCheckedAt(payload.runtime.checkedAt)}\n`;
      } else {
        formatted += `*Current Runtime:* ${payload.isActive ? 'Running' : 'Stopped'}\n`;
        formatted += `*Test:* ${payload.testActive ? 'Running' : 'Stopped'}\n`;
        formatted += `*Production:* ${payload.prodActive ? 'Running' : 'Stopped'}\n`;
      }
      if (payload.desiredState) {
        formatted += `\n*Stored State:* ${payload.desiredState.isActive ? 'Active' : 'Inactive'}\n`;
      }
      if (payload.latestVersion) {
        formatted += `\n*Latest Version:* v${payload.latestVersion.versionNum}\n`;
        formatted += `*Prompt:* _${payload.latestVersion.prompt}_`;
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
