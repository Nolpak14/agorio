/**
 * agorio discover — Discover a merchant's protocol and capabilities
 */

import { UcpClient } from '../../client/ucp-client.js';

export async function discover(domain: string): Promise<string> {
  const client = new UcpClient({ timeoutMs: 10_000 });

  console.log(`Discovering ${domain}...`);

  try {
    const result = await client.discover(domain);

    const lines: string[] = [
      `\nMerchant: ${result.domain}`,
      `Protocol: UCP`,
      `Version:  ${result.version}`,
      `Profile:  ${result.profileUrl}`,
      '',
      'Services:',
    ];

    for (const service of result.services) {
      const transports = Object.entries(service.transports)
        .filter(([, v]) => v)
        .map(([k]) => k);
      lines.push(`  ${service.name} (v${service.version})`);
      lines.push(`    Transports: ${transports.join(', ') || 'none'}`);
      if (service.transports.rest?.endpoint) {
        lines.push(`    REST endpoint: ${service.transports.rest.endpoint}`);
      }
      if (service.transports.mcp?.endpoint) {
        lines.push(`    MCP endpoint:  ${service.transports.mcp.endpoint}`);
      }
    }

    lines.push('');
    lines.push('Capabilities:');
    for (const cap of result.capabilities) {
      lines.push(`  ${cap.name} (v${cap.version})${cap.extends ? ` extends ${cap.extends}` : ''}`);
    }

    if (result.paymentHandlers.length > 0) {
      lines.push('');
      lines.push('Payment Handlers:');
      for (const handler of result.paymentHandlers) {
        lines.push(`  ${handler.name} (${handler.id})`);
      }
    }

    const output = lines.join('\n');
    console.log(output);
    return output;
  } catch (err) {
    const message = `Failed to discover ${domain}: ${err instanceof Error ? err.message : String(err)}`;
    console.error(message);
    process.exitCode = 1;
    return message;
  }
}
