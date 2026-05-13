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
      formatted += `📈 *Statistics (${payload.isActive ? 'Active' : 'Inactive'})*\n`;
      formatted += `Messages: ${payload.messageCount}\n`;
      formatted += `Errors: ${payload.errorCount}\n`;
      formatted += `Error Rate: ${payload.errorRate}\n`;
      formatted += `Avg Response Time: ${payload.responseTime}`;
      break;
    case 'get_versions':
      if (Array.isArray(payload)) {
        payload.forEach((v: any) => {
          formatted += `*v${v.versionNum}* ${v.isProd ? '🟢(Prod)' : ''}${v.isTest ? '🟡(Test)' : ''}\n`;
          formatted += `Prompt: _${v.prompt}_\n`;
          formatted += `Cost: $${v.cost}\n\n`;
        });
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
