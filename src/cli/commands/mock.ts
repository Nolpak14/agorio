/**
 * agorio mock — Start a mock merchant server for testing
 */

export interface MockOptions {
  acp?: boolean;
  mcp?: boolean;
  port?: number;
  name?: string;
}

export async function mock(options: MockOptions): Promise<void> {
  const port = options.port ?? 3456;
  const name = options.name ?? 'Agorio Mock Merchant';

  if (options.mcp) {
    const { MockMcpMerchant } = await import('../../mock/mock-mcp-merchant.js');
    const merchant = new MockMcpMerchant({ port, name });
    await merchant.start();
    console.log(`MCP mock merchant "${name}" running at ${merchant.baseUrl}`);
    console.log(`  JSON-RPC endpoint: ${merchant.baseUrl}/mcp`);
    console.log(`  UCP profile:       ${merchant.baseUrl}/.well-known/ucp`);
    console.log(`\nPress Ctrl+C to stop.`);
    setupShutdown(() => merchant.stop());
  } else if (options.acp) {
    const { MockAcpMerchant } = await import('../../mock/mock-acp-merchant.js');
    const merchant = new MockAcpMerchant({ port, name, apiKey: 'test_acp_key' });
    await merchant.start();
    console.log(`ACP mock merchant "${name}" running at ${merchant.baseUrl}`);
    console.log(`  API key: test_acp_key`);
    console.log(`  Products: ${merchant.baseUrl}/products`);
    console.log(`  Checkout: ${merchant.baseUrl}/checkout_sessions`);
    console.log(`\nPress Ctrl+C to stop.`);
    setupShutdown(() => merchant.stop());
  } else {
    const { MockMerchant } = await import('../../mock/mock-merchant.js');
    const merchant = new MockMerchant({ port, name });
    await merchant.start();
    console.log(`UCP mock merchant "${name}" running at ${merchant.baseUrl}`);
    console.log(`  UCP profile: ${merchant.baseUrl}/.well-known/ucp`);
    console.log(`  REST API:    ${merchant.baseUrl}/ucp/v1`);
    console.log(`  Products:    ${merchant.baseUrl}/ucp/v1/products`);
    console.log(`\nPress Ctrl+C to stop.`);
    setupShutdown(() => merchant.stop());
  }
}

function setupShutdown(stopFn: () => Promise<void>): void {
  const shutdown = async () => {
    console.log('\nShutting down...');
    await stopFn();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
