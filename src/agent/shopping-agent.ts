/**
 * Shopping Agent Orchestrator
 *
 * The core agent loop: plan → act (tool call) → observe (tool result) → repeat.
 *
 * This orchestrates the LLM, UCP client, and tool execution to complete
 * shopping tasks like browsing products, adding to cart, and checking out.
 *
 * v0.4: Multi-merchant support — each discovered merchant gets its own
 * isolated context (cart, checkout, orders). The agent switches between
 * merchants via the `switch_merchant` tool or by discovering new ones.
 */

import { UcpClient } from '../client/ucp-client.js';
import { AcpClient } from '../client/acp-client.js';
import { SHOPPING_AGENT_TOOLS } from '../llm/tools.js';
import type {
  AgentOptions,
  AgentPlugin,
  AgentResult,
  AgentStep,
  AgentStreamEvent,
  AgentLogEvent,
  AgentUsageSummary,
  AcpCheckoutSession,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  CartItem,
  CartState,
  MoneyAmount,
  MockProduct,
  ShippingAddress,
  MockOrder,
  CheckoutResult,
  MerchantContext,
  MerchantAdapter,
  ProductReviewResult,
} from '../types/index.js';

const DEFAULT_MAX_ITERATIONS = 20;

export class ShoppingAgent {
  private readonly options: Required<
    Pick<AgentOptions, 'maxIterations' | 'verbose'>
  > & AgentOptions;
  private readonly client: UcpClient;
  private readonly acpClient: AcpClient | null;
  private readonly steps: AgentStep[] = [];
  private readonly plugins: Map<string, AgentPlugin>;
  private readonly allTools: ToolDefinition[];
  private iteration = 0;

  // Multi-merchant state
  private merchants: Map<string, MerchantContext> = new Map();
  private activeMerchantDomain: string | null = null;

  // Legacy single-merchant state (for backward compatibility)
  private protocol: 'ucp' | 'acp' | null = null;
  private acpBaseUrl: string | null = null;

  // Adapters for real merchant connectivity
  private readonly adapters: MerchantAdapter[];

  // Webhook configuration
  private readonly webhookUrl: string | null;
  private readonly webhookSecret: string | null;

  // Observability state
  private runStartTime = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private llmCallCount = 0;
  private toolCallCount = 0;
  private toolCallLatency: Record<string, number[]> = {};

  // Shopping state (legacy — single-merchant backward compat)
  private cart: CartItem[] = [];
  private checkoutSessionId: string | null = null;
  private shippingAddress: ShippingAddress | null = null;
  private orders: Map<string, MockOrder> = new Map();

  constructor(options: AgentOptions) {
    this.options = {
      ...options,
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      verbose: options.verbose ?? false,
    };
    this.client = new UcpClient(options.clientOptions);
    this.acpClient = options.acpOptions
      ? new AcpClient(options.acpOptions)
      : null;
    this.adapters = options.adapters ?? [];
    this.webhookUrl = options.webhookUrl ?? null;
    this.webhookSecret = options.webhookSecret ?? null;

    // Register plugins
    this.plugins = new Map();
    const builtInNames = new Set(SHOPPING_AGENT_TOOLS.map(t => t.name));
    const pluginTools: ToolDefinition[] = [];

    for (const plugin of options.plugins ?? []) {
      if (builtInNames.has(plugin.name)) {
        throw new Error(
          `Plugin "${plugin.name}" conflicts with a built-in tool. Choose a different name.`
        );
      }
      if (this.plugins.has(plugin.name)) {
        throw new Error(
          `Duplicate plugin name: "${plugin.name}". Each plugin must have a unique name.`
        );
      }
      this.plugins.set(plugin.name, plugin);
      pluginTools.push({
        name: plugin.name,
        description: plugin.description,
        parameters: plugin.parameters,
      });
    }

    this.allTools = [...SHOPPING_AGENT_TOOLS, ...pluginTools];
  }

  /**
   * Run the agent with a user task.
   *
   * The agent will use the LLM to reason about the task, call tools
   * to interact with the UCP merchant, and return the final result.
   */
  async run(task: string): Promise<AgentResult> {
    this.resetMetrics();
    const runSpan = this.options.tracer?.startSpan('agent.run', { task: task.slice(0, 100) });

    const messages: ChatMessage[] = [
      { role: 'user', content: task },
    ];

    this.iteration = 0;
    this.emitLog('info', 'Agent run started', { task: task.slice(0, 200) });

    while (this.iteration < this.options.maxIterations) {
      this.iteration++;

      // Ask the LLM what to do next
      const llmStart = Date.now();
      const llmSpan = this.options.tracer?.startSpan('agent.llm_call', { iteration: this.iteration });
      const llmResponse = await this.options.llm.chat(
        messages,
        this.allTools
      );
      const llmLatency = Date.now() - llmStart;
      llmSpan?.end();
      this.trackLlmUsage(llmResponse.usage, llmLatency);

      // Record thinking step
      if (llmResponse.content) {
        const thinkingStep = this.recordStep({
          type: 'thinking',
          content: llmResponse.content,
        });
        this.log(`[Think] ${thinkingStep.content}`);
      }

      // If no tool calls, the agent is done
      if (llmResponse.finishReason === 'stop' || llmResponse.toolCalls.length === 0) {
        this.emitLog('info', 'Agent run completed', { iterations: this.iteration, success: true });
        runSpan?.end();
        return this.buildResult(true, llmResponse.content);
      }

      // Add the assistant's response (with tool calls) to message history
      messages.push({
        role: 'assistant',
        content: llmResponse.content,
        toolCalls: llmResponse.toolCalls,
      });

      // Execute each tool call
      for (const toolCall of llmResponse.toolCalls) {
        this.recordStep({
          type: 'tool_call',
          toolName: toolCall.name,
          toolInput: toolCall.arguments,
        });
        this.log(`[Tool] ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);

        const toolStart = Date.now();
        const toolSpan = this.options.tracer?.startSpan('agent.tool_call', { tool: toolCall.name });
        let result: unknown;
        try {
          result = await this.executeTool(toolCall);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
          this.emitLog('warn', `Tool ${toolCall.name} failed`, { error: (result as Record<string, unknown>).error });
        }
        const toolLatency = Date.now() - toolStart;
        toolSpan?.end();
        this.trackToolCall(toolCall.name, toolLatency);

        this.recordStep({
          type: 'tool_result',
          toolName: toolCall.name,
          toolOutput: result,
        });
        this.log(`[Result] ${JSON.stringify(result).slice(0, 200)}`);
        this.emitLog('debug', `Tool ${toolCall.name} completed`, { latencyMs: toolLatency });

        // Add tool result to message history
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.name,
        });
      }
    }

    // Max iterations reached
    this.emitLog('warn', 'Agent reached max iterations', { maxIterations: this.options.maxIterations });
    runSpan?.end();
    return this.buildResult(
      false,
      `Agent reached maximum iterations (${this.options.maxIterations}) without completing the task.`
    );
  }

  /**
   * Run the agent with streaming output.
   *
   * Yields AgentStreamEvent objects as the agent reasons and acts.
   * If the LLM adapter supports chatStream(), text is streamed in real-time.
   * Otherwise, falls back to chat() and emits the full text as a single delta.
   */
  async *runStream(task: string): AsyncGenerator<AgentStreamEvent> {
    this.resetMetrics();
    const runSpan = this.options.tracer?.startSpan('agent.runStream', { task: task.slice(0, 100) });

    const messages: ChatMessage[] = [
      { role: 'user', content: task },
    ];

    this.iteration = 0;
    const adapter = this.options.llm;
    const supportsStreaming = typeof adapter.chatStream === 'function';
    this.emitLog('info', 'Agent stream started', { task: task.slice(0, 200) });

    try {
      while (this.iteration < this.options.maxIterations) {
        this.iteration++;

        let textContent = '';
        let toolCalls: ToolCall[] = [];

        const llmStart = Date.now();
        const llmSpan = this.options.tracer?.startSpan('agent.llm_call', { iteration: this.iteration, streaming: supportsStreaming });

        if (supportsStreaming) {
          let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
          for await (const chunk of adapter.chatStream!(messages, this.allTools)) {
            switch (chunk.type) {
              case 'text_delta':
                textContent += chunk.text;
                yield {
                  type: 'text_delta',
                  iteration: this.iteration,
                  text: chunk.text,
                  timestamp: Date.now(),
                };
                break;
              case 'tool_call_complete':
                toolCalls.push(chunk.toolCall);
                break;
              case 'done':
                textContent = chunk.response.content || textContent;
                toolCalls = chunk.response.toolCalls.length > 0
                  ? chunk.response.toolCalls
                  : toolCalls;
                streamUsage = chunk.response.usage;
                break;
            }
          }
          const llmLatency = Date.now() - llmStart;
          llmSpan?.end();
          this.trackLlmUsage(streamUsage, llmLatency);
        } else {
          const response = await adapter.chat(messages, this.allTools);
          const llmLatency = Date.now() - llmStart;
          llmSpan?.end();
          this.trackLlmUsage(response.usage, llmLatency);
          textContent = response.content;
          toolCalls = response.toolCalls;

          if (textContent) {
            yield {
              type: 'text_delta',
              iteration: this.iteration,
              text: textContent,
              timestamp: Date.now(),
            };
          }
        }

        // Record thinking step
        if (textContent) {
          this.recordStep({ type: 'thinking', content: textContent });
          this.log(`[Think] ${textContent}`);
        }

        // If no tool calls, the agent is done
        if (toolCalls.length === 0) {
          this.emitLog('info', 'Agent stream completed', { iterations: this.iteration, success: true });
          runSpan?.end();
          const result = this.buildResult(true, textContent);
          yield { type: 'done', result, iteration: this.iteration, timestamp: Date.now() };
          return;
        }

        // Add assistant message to history
        messages.push({
          role: 'assistant',
          content: textContent,
          toolCalls,
        });

        // Execute each tool call
        for (const toolCall of toolCalls) {
          this.recordStep({
            type: 'tool_call',
            toolName: toolCall.name,
            toolInput: toolCall.arguments,
          });
          this.log(`[Tool] ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);

          yield {
            type: 'tool_call',
            iteration: this.iteration,
            toolName: toolCall.name,
            toolInput: toolCall.arguments,
            timestamp: Date.now(),
          };

          const toolStart = Date.now();
          const toolSpan = this.options.tracer?.startSpan('agent.tool_call', { tool: toolCall.name });
          let result: unknown;
          try {
            result = await this.executeTool(toolCall);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) };
            this.emitLog('warn', `Tool ${toolCall.name} failed`, { error: (result as Record<string, unknown>).error });
          }
          const toolLatency = Date.now() - toolStart;
          toolSpan?.end();
          this.trackToolCall(toolCall.name, toolLatency);

          this.recordStep({
            type: 'tool_result',
            toolName: toolCall.name,
            toolOutput: result,
          });
          this.log(`[Result] ${JSON.stringify(result).slice(0, 200)}`);
          this.emitLog('debug', `Tool ${toolCall.name} completed`, { latencyMs: toolLatency });

          yield {
            type: 'tool_result',
            iteration: this.iteration,
            toolName: toolCall.name,
            toolOutput: result,
            timestamp: Date.now(),
          };

          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: toolCall.name,
          });
        }
      }

      // Max iterations reached
      this.emitLog('warn', 'Agent reached max iterations', { maxIterations: this.options.maxIterations });
      runSpan?.end();
      const result = this.buildResult(
        false,
        `Agent reached maximum iterations (${this.options.maxIterations}) without completing the task.`
      );
      yield { type: 'done', result, iteration: this.iteration, timestamp: Date.now() };
    } catch (err) {
      this.emitLog('error', 'Agent stream error', { error: err instanceof Error ? err.message : String(err) });
      runSpan?.end();
      yield {
        type: 'error',
        iteration: this.iteration,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get the names of all registered plugins.
   */
  getPlugins(): string[] {
    return [...this.plugins.keys()];
  }

  /**
   * Get the current cart state (active merchant's cart).
   */
  getCart(): CartState {
    const ctx = this.getActiveMerchantContext();
    const cart = ctx ? ctx.cart : this.cart;
    return {
      items: [...cart],
      subtotal: this.calculateSubtotal(cart),
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  /**
   * Get all discovered merchants.
   */
  getMerchants(): string[] {
    return [...this.merchants.keys()];
  }

  /**
   * Get the active merchant domain.
   */
  getActiveMerchant(): string | null {
    return this.activeMerchantDomain;
  }

  // ─── Multi-Merchant Helpers ───

  private getActiveMerchantContext(): MerchantContext | null {
    if (!this.activeMerchantDomain) return null;
    return this.merchants.get(this.activeMerchantDomain) ?? null;
  }

  private getActiveCart(): CartItem[] {
    const ctx = this.getActiveMerchantContext();
    return ctx ? ctx.cart : this.cart;
  }

  private setActiveCart(cart: CartItem[]): void {
    const ctx = this.getActiveMerchantContext();
    if (ctx) {
      ctx.cart = cart;
    } else {
      this.cart = cart;
    }
  }

  private getActiveOrders(): Map<string, MockOrder> {
    const ctx = this.getActiveMerchantContext();
    return ctx ? ctx.orders : this.orders;
  }

  private getActiveCheckoutSessionId(): string | null {
    const ctx = this.getActiveMerchantContext();
    return ctx ? ctx.checkoutSessionId : this.checkoutSessionId;
  }

  private setActiveCheckoutSessionId(id: string | null): void {
    const ctx = this.getActiveMerchantContext();
    if (ctx) {
      ctx.checkoutSessionId = id;
    } else {
      this.checkoutSessionId = id;
    }
  }

  private getActiveShippingAddress(): ShippingAddress | null {
    const ctx = this.getActiveMerchantContext();
    return ctx ? ctx.shippingAddress : this.shippingAddress;
  }

  private setActiveShippingAddress(address: ShippingAddress | null): void {
    const ctx = this.getActiveMerchantContext();
    if (ctx) {
      ctx.shippingAddress = address;
    } else {
      this.shippingAddress = address;
    }
  }

  private getActiveProtocol(): 'ucp' | 'acp' | 'adapter' | null {
    const ctx = this.getActiveMerchantContext();
    return ctx ? ctx.protocol : this.protocol;
  }

  private getActiveAdapter(): MerchantAdapter | undefined {
    return this.getActiveMerchantContext()?.adapter;
  }

  /**
   * Find an adapter that matches a given domain.
   */
  private findAdapterForDomain(domain: string): MerchantAdapter | undefined {
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    for (const adapter of this.adapters) {
      if ('matchesDomain' in adapter && typeof (adapter as { matchesDomain: (d: string) => boolean }).matchesDomain === 'function') {
        if ((adapter as { matchesDomain: (d: string) => boolean }).matchesDomain(clean)) {
          return adapter;
        }
      }
    }
    return undefined;
  }

  // ─── Tool Execution ───

  private async executeTool(toolCall: ToolCall): Promise<unknown> {
    const args = toolCall.arguments;

    switch (toolCall.name) {
      case 'discover_merchant':
        return this.toolDiscoverMerchant(args.domain as string);

      case 'list_capabilities':
        return this.toolListCapabilities();

      case 'browse_products':
        return this.toolBrowseProducts(args);

      case 'search_products':
        return this.toolSearchProducts(args);

      case 'get_product':
        return this.toolGetProduct(args.productId as string);

      case 'add_to_cart':
        return this.toolAddToCart(args);

      case 'view_cart':
        return this.toolViewCart();

      case 'remove_from_cart':
        return this.toolRemoveFromCart(args.productId as string);

      case 'initiate_checkout':
        return this.toolInitiateCheckout();

      case 'submit_shipping':
        return this.toolSubmitShipping(args as unknown as ShippingAddress);

      case 'submit_payment':
        return this.toolSubmitPayment(args);

      case 'get_order_status':
        return this.toolGetOrderStatus(args.orderId as string);

      case 'switch_merchant':
        return this.toolSwitchMerchant(args.domain as string);

      case 'get_product_reviews':
        return this.toolGetProductReviews(
          args.productId as string,
          args.limit as number | undefined
        );

      case 'apply_discount_code':
        return this.toolApplyDiscountCode(args.code as string);

      case 'compare_prices':
        return this.toolComparePrices(args.query as string);

      case 'subscribe_order_updates':
        return this.toolSubscribeOrderUpdates(args.orderId as string);

      default: {
        const plugin = this.plugins.get(toolCall.name);
        if (plugin) {
          return await plugin.handler(args);
        }
        return { error: `Unknown tool: ${toolCall.name}` };
      }
    }
  }

  private async toolDiscoverMerchant(domain: string) {
    // Check if an adapter matches this domain
    const adapter = this.findAdapterForDomain(domain);
    if (adapter) {
      try {
        const discovery = await adapter.discover(domain);
        const ctx: MerchantContext = {
          domain: discovery.domain,
          protocol: 'adapter',
          adapter,
          cart: [],
          checkoutSessionId: null,
          shippingAddress: null,
          orders: new Map(),
          discoveryInfo: discovery as unknown as Record<string, unknown>,
        };
        this.merchants.set(discovery.domain, ctx);
        this.activeMerchantDomain = discovery.domain;
        this.protocol = null; // Adapter handles routing
        this.log(`[Discovery] Adapter (${adapter.adapterType}) connected to ${discovery.domain}`);
        return {
          domain: discovery.domain,
          protocol: 'adapter',
          adapterType: adapter.adapterType,
          name: discovery.name,
          capabilities: discovery.capabilities,
        };
      } catch (err) {
        this.emitLog('warn', `Adapter discovery failed for ${domain}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        // Fall through to UCP/ACP
      }
    }

    // Try UCP discovery
    try {
      const discovery = await this.client.discover(domain);
      this.protocol = 'ucp';
      const ctx: MerchantContext = {
        domain: discovery.domain,
        protocol: 'ucp',
        cart: [],
        checkoutSessionId: null,
        shippingAddress: null,
        orders: new Map(),
        discoveryInfo: {
          version: discovery.version,
          capabilities: discovery.capabilities.map(c => c.name),
        },
      };
      this.merchants.set(discovery.domain, ctx);
      this.activeMerchantDomain = discovery.domain;
      this.log(`[Discovery] UCP protocol detected for ${domain}`);
      return {
        domain: discovery.domain,
        protocol: 'ucp',
        version: discovery.version,
        capabilities: discovery.capabilities.map(c => c.name),
        services: discovery.services.map(s => ({
          name: s.name,
          transports: Object.keys(s.transports).filter(
            t => s.transports[t as keyof typeof s.transports]
          ),
        })),
        paymentHandlers: discovery.paymentHandlers.map(h => ({
          id: h.id,
          name: h.name,
        })),
      };
    } catch {
      // UCP discovery failed — try ACP if configured
    }

    if (this.acpClient) {
      // Derive product base URL from ACP endpoint or domain
      const acpEndpoint = this.acpClient.getEndpoint();
      this.acpBaseUrl = acpEndpoint;

      // Verify ACP merchant is reachable by hitting /health or /products
      try {
        const fetchFn = this.options.clientOptions?.fetch ?? globalThis.fetch.bind(globalThis);
        const res = await fetchFn(`${this.acpBaseUrl}/health`);
        if (res.ok) {
          this.protocol = 'acp';
          const info = await res.json() as Record<string, unknown>;
          const ctx: MerchantContext = {
            domain,
            protocol: 'acp',
            cart: [],
            checkoutSessionId: null,
            shippingAddress: null,
            orders: new Map(),
          };
          this.merchants.set(domain, ctx);
          this.activeMerchantDomain = domain;
          this.log(`[Discovery] ACP protocol detected for ${domain}`);
          return {
            domain,
            protocol: 'acp',
            version: '2026-01-30',
            capabilities: ['checkout'],
            merchant: info.merchant ?? domain,
            paymentHandlers: [{ type: 'stripe_shared_payment_token' }],
          };
        }
      } catch {
        // ACP health check failed — try products endpoint
      }

      // Fallback: try product listing to confirm merchant is reachable
      try {
        const fetchFn = this.options.clientOptions?.fetch ?? globalThis.fetch.bind(globalThis);
        const res = await fetchFn(`${this.acpBaseUrl}/products`);
        if (res.ok) {
          this.protocol = 'acp';
          const ctx: MerchantContext = {
            domain,
            protocol: 'acp',
            cart: [],
            checkoutSessionId: null,
            shippingAddress: null,
            orders: new Map(),
          };
          this.merchants.set(domain, ctx);
          this.activeMerchantDomain = domain;
          this.log(`[Discovery] ACP protocol detected for ${domain} (via products)`);
          return {
            domain,
            protocol: 'acp',
            version: '2026-01-30',
            capabilities: ['checkout'],
            paymentHandlers: [{ type: 'stripe_shared_payment_token' }],
          };
        }
      } catch {
        // Both checks failed
      }
    }

    return { error: `Could not discover merchant at ${domain}. No UCP profile found and ACP is not configured.` };
  }

  private toolSwitchMerchant(domain: string) {
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    // Try exact match first, then partial match
    let found: string | null = null;
    for (const key of this.merchants.keys()) {
      if (key === clean || key.includes(clean) || clean.includes(key)) {
        found = key;
        break;
      }
    }

    if (!found) {
      return {
        error: `Merchant "${domain}" has not been discovered yet. Call discover_merchant first.`,
        discoveredMerchants: [...this.merchants.keys()],
      };
    }

    this.activeMerchantDomain = found;
    const ctx = this.merchants.get(found)!;

    // Sync legacy state for UCP/ACP protocol handlers
    if (ctx.protocol === 'ucp') {
      this.protocol = 'ucp';
    } else if (ctx.protocol === 'acp') {
      this.protocol = 'acp';
    }

    return {
      success: true,
      activeMerchant: found,
      protocol: ctx.protocol,
      cartItems: ctx.cart.length,
    };
  }

  private toolListCapabilities() {
    const activeProtocol = this.getActiveProtocol();

    if (activeProtocol === 'adapter') {
      const ctx = this.getActiveMerchantContext();
      const discovery = ctx?.discoveryInfo as { capabilities?: string[] } | undefined;
      return {
        capabilities: (discovery?.capabilities ?? []).map(c => ({
          name: c,
          version: 'adapter',
        })),
      };
    }

    if (activeProtocol === 'acp') {
      return {
        capabilities: [
          { name: 'acp.checkout', version: '2026-01-30' },
        ],
      };
    }
    const caps = this.client.getCapabilities();
    return {
      capabilities: caps.map(c => ({
        name: c.name,
        version: c.version,
        extends: c.extends,
      })),
    };
  }

  /**
   * Protocol-agnostic merchant API call.
   * Routes to adapter, UcpClient, or direct fetch depending on active merchant.
   */
  private async fetchMerchantApi(
    path: string,
    options?: { method?: string; body?: unknown }
  ): Promise<unknown> {
    // Adapter route
    const activeAdapter = this.getActiveAdapter();
    if (activeAdapter) {
      // Route common paths through adapter methods
      if (path === '/products' || path.startsWith('/products?')) {
        const result = await activeAdapter.listProducts();
        return { products: result.products, total: result.total };
      }
      if (path.startsWith('/products/search')) {
        const qMatch = path.match(/[?&]q=([^&]*)/);
        const q = qMatch ? decodeURIComponent(qMatch[1]) : '';
        const result = await activeAdapter.searchProducts(q);
        return { products: result.products, total: result.total, query: q };
      }
      const productMatch = path.match(/^\/products\/(.+)$/);
      if (productMatch) {
        return activeAdapter.getProduct(productMatch[1]);
      }
      throw new Error(`Adapter does not support path: ${path}`);
    }

    if (this.protocol === 'acp' && this.acpBaseUrl) {
      const url = `${this.acpBaseUrl}${path}`;
      const method = options?.method ?? (options?.body ? 'POST' : 'GET');
      const fetchFn = this.options.clientOptions?.fetch ?? globalThis.fetch.bind(globalThis);
      const response = await fetchFn(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ACP API: ${method} ${path} → ${response.status}: ${body}`);
      }
      return response.json();
    }
    return this.client.callApi(path, options);
  }

  private async toolBrowseProducts(args: Record<string, unknown>) {
    const page = (args.page as number) ?? 1;
    const limit = Math.min((args.limit as number) ?? 10, 50);
    const category = args.category as string | undefined;

    try {
      // Use adapter directly if available
      const activeAdapter = this.getActiveAdapter();
      if (activeAdapter) {
        const result = await activeAdapter.listProducts({ page, limit, category });
        return {
          products: result.products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category: p.category,
            inStock: p.inStock ?? true,
          })),
          total: result.total,
          page,
          limit,
        };
      }

      const result = await this.fetchMerchantApi('/products', {
        method: 'GET',
      });
      let products = ((result as Record<string, unknown>).products ?? result) as MockProduct[];

      if (category) {
        products = products.filter(p =>
          p.category?.toLowerCase() === category.toLowerCase()
        );
      }

      const start = (page - 1) * limit;
      const paged = products.slice(start, start + limit);

      return {
        products: paged.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          category: p.category,
          inStock: p.inStock ?? true,
        })),
        total: products.length,
        page,
        limit,
      };
    } catch {
      return { products: [], total: 0, page, limit };
    }
  }

  private async toolSearchProducts(args: Record<string, unknown>) {
    const query = (args.query as string).toLowerCase();
    const limit = Math.min((args.limit as number) ?? 10, 50);

    try {
      // Use adapter directly if available
      const activeAdapter = this.getActiveAdapter();
      if (activeAdapter) {
        const result = await activeAdapter.searchProducts(query, limit);
        return {
          products: result.products.slice(0, limit).map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            inStock: p.inStock ?? true,
          })),
          total: result.total,
          query: args.query,
        };
      }

      const result = await this.fetchMerchantApi(`/products/search?q=${encodeURIComponent(query)}`);
      const products = ((result as Record<string, unknown>).products ?? result) as MockProduct[];

      return {
        products: products.slice(0, limit).map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          description: p.description,
          inStock: p.inStock ?? true,
        })),
        total: products.length,
        query: args.query,
      };
    } catch {
      // Fallback: browse all and filter client-side
      try {
        const result = await this.fetchMerchantApi('/products');
        const all = ((result as Record<string, unknown>).products ?? result) as MockProduct[];
        const filtered = all.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        );

        return {
          products: filtered.slice(0, limit).map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            inStock: p.inStock ?? true,
          })),
          total: filtered.length,
          query: args.query,
        };
      } catch {
        return { products: [], total: 0, query: args.query };
      }
    }
  }

  private async toolGetProduct(productId: string) {
    const activeAdapter = this.getActiveAdapter();
    if (activeAdapter) {
      return activeAdapter.getProduct(productId);
    }
    const result = await this.fetchMerchantApi(`/products/${productId}`);
    return result;
  }

  /**
   * Add to cart with price enrichment.
   * Fetches the real product price from the merchant to fix the $0 placeholder bug.
   */
  private async toolAddToCart(args: Record<string, unknown>) {
    const productId = args.productId as string;
    const quantity = (args.quantity as number) ?? 1;
    const cart = this.getActiveCart();

    const existing = cart.find(item => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      // Enrich cart item with real product data
      let name = productId;
      let price: MoneyAmount = { amount: '0', currency: 'USD' };

      try {
        const product = await this.toolGetProduct(productId) as MockProduct;
        if (product && product.name) {
          name = product.name;
        }
        if (product && product.price) {
          price = product.price;
        }
      } catch {
        // Product fetch failed — use placeholders
        this.emitLog('warn', `Could not fetch product ${productId} for price enrichment`);
      }

      cart.push({
        productId,
        name,
        quantity,
        price,
      });
    }

    this.setActiveCart(cart);

    return {
      success: true,
      cart: this.getCart(),
    };
  }

  private toolViewCart() {
    return this.getCart();
  }

  private toolRemoveFromCart(productId: string) {
    const cart = this.getActiveCart();
    const idx = cart.findIndex(item => item.productId === productId);
    if (idx === -1) {
      return { success: false, error: 'Item not found in cart' };
    }
    cart.splice(idx, 1);
    this.setActiveCart(cart);
    return { success: true, cart: this.getCart() };
  }

  private async toolInitiateCheckout() {
    const cart = this.getActiveCart();
    if (cart.length === 0) {
      return { error: 'Cart is empty. Add items before checking out.' };
    }

    const activeProtocol = this.getActiveProtocol();

    // Adapter checkout flow
    const activeAdapter = this.getActiveAdapter();
    if (activeAdapter && activeAdapter.createCheckout) {
      try {
        const result = await activeAdapter.createCheckout(cart);
        this.setActiveCheckoutSessionId(result.sessionId);
        return {
          protocol: 'adapter',
          sessionId: result.sessionId,
          totals: result.totals,
          shippingOptions: result.shippingOptions,
          checkoutUrl: (result as { checkoutUrl?: string }).checkoutUrl,
          requiredSteps: ['shipping', 'payment'],
        };
      } catch (err) {
        return {
          error: `Adapter checkout failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // ACP checkout flow
    if (activeProtocol === 'acp' && this.acpClient) {
      try {
        const session = await this.acpClient.createCheckout({
          line_items: cart.map(item => ({
            product_id: item.productId,
            quantity: item.quantity,
          })),
        });
        this.setActiveCheckoutSessionId(session.id);

        return {
          protocol: 'acp',
          sessionId: session.id,
          status: session.status,
          lineItems: session.line_items,
          totals: session.totals,
          paymentHandlers: session.payment_handlers,
          requiredSteps: session.status === 'not_ready_for_payment'
            ? ['shipping', 'payment']
            : ['payment'],
        };
      } catch (err) {
        return {
          error: `ACP checkout failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // UCP checkout flow
    if (!this.client.hasCapability('dev.ucp.shopping.checkout')) {
      return { error: 'Merchant does not support checkout capability.' };
    }

    try {
      const result = await this.client.callApi('/checkout', {
        method: 'POST',
        body: { items: cart },
      });
      const data = result as Record<string, unknown>;
      this.setActiveCheckoutSessionId((data.sessionId ?? data.id) as string);

      return {
        protocol: 'ucp',
        sessionId: this.getActiveCheckoutSessionId(),
        items: cart,
        subtotal: this.calculateSubtotal(cart),
        requiredSteps: ['shipping', 'payment'],
        ...(data.shipping ? { shippingOptions: data.shipping } : {}),
      };
    } catch (err) {
      return {
        error: `Checkout failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async toolSubmitShipping(address: ShippingAddress) {
    if (!this.getActiveCheckoutSessionId()) {
      return { error: 'No active checkout session. Call initiate_checkout first.' };
    }

    this.setActiveShippingAddress(address);

    // ACP: update session with shipping address
    if (this.getActiveProtocol() === 'acp' && this.acpClient) {
      try {
        const session = await this.acpClient.updateCheckout(this.getActiveCheckoutSessionId()!, {
          shipping_address: {
            name: address.name,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postal_code: address.postalCode,
            country: address.country,
          },
        });
        return {
          success: true,
          sessionId: session.id,
          status: session.status,
          totals: session.totals,
          nextStep: 'payment',
        };
      } catch (err) {
        return {
          error: `ACP shipping update failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return {
      success: true,
      sessionId: this.getActiveCheckoutSessionId(),
      shippingAddress: address,
      nextStep: 'payment',
    };
  }

  private async toolSubmitPayment(args: Record<string, unknown>) {
    const sessionId = this.getActiveCheckoutSessionId();
    if (!sessionId) {
      return { error: 'No active checkout session. Call initiate_checkout first.' };
    }

    const shippingAddress = this.getActiveShippingAddress();
    if (!shippingAddress) {
      return { error: 'Shipping address required before payment. Call submit_shipping first.' };
    }

    const paymentMethod = args.paymentMethod as string;
    const paymentToken = args.paymentToken as string | undefined;
    const cart = this.getActiveCart();
    const orders = this.getActiveOrders();

    // ACP payment flow
    if (this.getActiveProtocol() === 'acp' && this.acpClient) {
      try {
        const session = await this.acpClient.completeCheckout(sessionId, {
          payment_token: paymentToken ?? 'tok_mock_success',
          payment_handler: paymentMethod ?? 'stripe_shared_payment_token',
        });

        const orderId = `acp_${session.id}`;
        const order: MockOrder = {
          id: orderId,
          status: 'confirmed',
          items: [...cart],
          subtotal: this.calculateSubtotal(cart),
          total: this.calculateSubtotal(cart),
          shippingAddress,
          createdAt: new Date().toISOString(),
        };

        orders.set(orderId, order);
        this.setActiveCart([]);
        this.setActiveCheckoutSessionId(null);
        this.setActiveShippingAddress(null);

        return {
          success: true,
          orderId,
          status: session.status,
          protocol: 'acp',
          order,
        };
      } catch (err) {
        return {
          error: `ACP payment failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // UCP payment flow
    try {
      const result = await this.client.callApi('/checkout/complete', {
        method: 'POST',
        body: {
          sessionId,
          items: cart,
          shippingAddress,
          payment: {
            method: paymentMethod,
            token: paymentToken ?? 'tok_mock_success',
          },
        },
      });

      const data = result as Record<string, unknown>;
      const orderId = (data.orderId ?? data.id ?? `ord_${Date.now()}`) as string;

      const order: MockOrder = {
        id: orderId,
        status: 'confirmed',
        items: [...cart],
        subtotal: this.calculateSubtotal(cart),
        total: this.calculateSubtotal(cart),
        shippingAddress,
        createdAt: new Date().toISOString(),
      };

      orders.set(orderId, order);
      this.setActiveCart([]);
      this.setActiveCheckoutSessionId(null);
      this.setActiveShippingAddress(null);

      return {
        success: true,
        orderId,
        status: 'confirmed',
        order,
      };
    } catch (err) {
      return {
        error: `Payment failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private toolGetOrderStatus(orderId: string) {
    // Search across all merchant contexts
    for (const ctx of this.merchants.values()) {
      const order = ctx.orders.get(orderId);
      if (order) return { order };
    }
    // Fall back to legacy orders
    const order = this.orders.get(orderId);
    if (!order) {
      return { error: `Order not found: ${orderId}` };
    }
    return { order };
  }

  // ─── New v0.4 Tools ───

  private async toolGetProductReviews(productId: string, limit?: number) {
    const activeAdapter = this.getActiveAdapter();

    // Try adapter reviews if available
    if (activeAdapter && activeAdapter.getProductReviews) {
      try {
        return await activeAdapter.getProductReviews(productId, limit);
      } catch (err) {
        return {
          error: `Could not fetch reviews: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Try fetching from UCP/ACP merchant endpoint
    try {
      const result = await this.fetchMerchantApi(`/products/${productId}/reviews`);
      return result;
    } catch {
      return {
        productId,
        averageRating: 0,
        totalReviews: 0,
        reviews: [],
        note: 'Reviews not available for this merchant.',
      };
    }
  }

  private async toolApplyDiscountCode(code: string) {
    const sessionId = this.getActiveCheckoutSessionId();
    if (!sessionId) {
      return { error: 'No active checkout session. Initiate checkout first.' };
    }

    try {
      const result = await this.fetchMerchantApi('/checkout/discount', {
        method: 'POST',
        body: { sessionId, code },
      });
      return result;
    } catch (err) {
      return {
        error: `Could not apply discount code: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async toolComparePrices(query: string) {
    if (this.merchants.size < 2) {
      return {
        error: 'Need at least 2 discovered merchants to compare prices. Discover more merchants first.',
        discoveredMerchants: [...this.merchants.keys()],
      };
    }

    const results: Array<{
      merchant: string;
      protocol: string;
      products: Array<{ id: string; name: string; price: MoneyAmount; inStock: boolean }>;
    }> = [];

    // Save current active merchant
    const previousActive = this.activeMerchantDomain;

    for (const [domain, ctx] of this.merchants) {
      try {
        // Switch to this merchant
        this.activeMerchantDomain = domain;
        if (ctx.protocol === 'ucp') this.protocol = 'ucp';
        else if (ctx.protocol === 'acp') this.protocol = 'acp';

        const searchResult = await this.toolSearchProducts({ query, limit: 5 });
        const products = (searchResult as { products: Array<{ id: string; name: string; price: MoneyAmount; inStock: boolean }> }).products ?? [];
        results.push({
          merchant: domain,
          protocol: ctx.protocol,
          products,
        });
      } catch {
        results.push({
          merchant: domain,
          protocol: ctx.protocol,
          products: [],
        });
      }
    }

    // Restore previous active merchant
    this.activeMerchantDomain = previousActive;
    if (previousActive) {
      const prevCtx = this.merchants.get(previousActive);
      if (prevCtx?.protocol === 'ucp') this.protocol = 'ucp';
      else if (prevCtx?.protocol === 'acp') this.protocol = 'acp';
    }

    return {
      query,
      merchants: results,
      summary: `Compared "${query}" across ${results.length} merchants.`,
    };
  }

  private async toolSubscribeOrderUpdates(orderId: string) {
    if (!this.webhookUrl) {
      return {
        error: 'No webhook URL configured. Pass webhookUrl in AgentOptions to enable order update subscriptions.',
      };
    }

    // Find which merchant has this order
    let merchantDomain: string | null = null;
    for (const [domain, ctx] of this.merchants) {
      if (ctx.orders.has(orderId)) {
        merchantDomain = domain;
        break;
      }
    }
    if (!merchantDomain && this.orders.has(orderId)) {
      merchantDomain = this.activeMerchantDomain;
    }

    if (!merchantDomain) {
      return { error: `Order not found: ${orderId}` };
    }

    try {
      const result = await this.fetchMerchantApi('/webhooks/subscribe', {
        method: 'POST',
        body: {
          orderId,
          callbackUrl: this.webhookUrl,
          secret: this.webhookSecret,
        },
      });
      return {
        subscribed: true,
        orderId,
        merchantDomain,
        ...(result as Record<string, unknown>),
      };
    } catch (err) {
      return {
        error: `Failed to subscribe to order updates: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── Observability Helpers ───

  private resetMetrics(): void {
    this.runStartTime = Date.now();
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.llmCallCount = 0;
    this.toolCallCount = 0;
    this.toolCallLatency = {};
  }

  private trackLlmUsage(
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
    latencyMs: number
  ): void {
    this.llmCallCount++;
    if (usage) {
      this.totalPromptTokens += usage.promptTokens;
      this.totalCompletionTokens += usage.completionTokens;
    }
    this.emitLog('debug', 'LLM call completed', {
      latencyMs,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
    });
  }

  private trackToolCall(toolName: string, latencyMs: number): void {
    this.toolCallCount++;
    if (!this.toolCallLatency[toolName]) {
      this.toolCallLatency[toolName] = [];
    }
    this.toolCallLatency[toolName].push(latencyMs);
  }

  private buildUsageSummary(): AgentUsageSummary {
    return {
      totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      llmCalls: this.llmCallCount,
      toolCalls: this.toolCallCount,
      toolCallLatency: { ...this.toolCallLatency },
      totalLatencyMs: Date.now() - this.runStartTime,
    };
  }

  private emitLog(
    level: AgentLogEvent['level'],
    message: string,
    data?: Record<string, unknown>
  ): void {
    this.options.onLog?.({
      level,
      message,
      data,
      timestamp: Date.now(),
    });
  }

  // ─── Helpers ───

  private calculateSubtotal(cart?: CartItem[]): MoneyAmount {
    const items = cart ?? this.getActiveCart();
    let total = 0;
    for (const item of items) {
      total += parseFloat(item.price.amount) * item.quantity;
    }
    return {
      amount: total.toFixed(2),
      currency: items[0]?.price.currency ?? 'USD',
    };
  }

  private recordStep(
    partial: Omit<AgentStep, 'iteration' | 'timestamp'>
  ): AgentStep {
    const step: AgentStep = {
      ...partial,
      iteration: this.iteration,
      timestamp: Date.now(),
    };
    this.steps.push(step);
    this.options.onStep?.(step);
    return step;
  }

  private buildResult(success: boolean, answer: string): AgentResult {
    const discovery = (() => {
      // Check multi-merchant contexts first
      if (this.activeMerchantDomain) {
        const ctx = this.merchants.get(this.activeMerchantDomain);
        if (ctx?.protocol === 'adapter') {
          return {
            domain: ctx.domain,
            profile: {
              ucp: { version: 'adapter', services: {}, capabilities: [] },
            },
          };
        }
      }

      if (this.protocol === 'acp' && this.acpBaseUrl) {
        return {
          domain: this.acpBaseUrl.replace(/^https?:\/\//, ''),
          profile: {
            ucp: { version: 'acp-2026-01-30', services: {}, capabilities: [] },
          },
        };
      }
      try {
        const d = this.client.getDiscovery();
        return { domain: d.domain, profile: d.profile };
      } catch {
        return null;
      }
    })();

    // Gather orders from all merchant contexts + legacy
    const allOrders: MockOrder[] = [];
    for (const ctx of this.merchants.values()) {
      allOrders.push(...ctx.orders.values());
    }
    allOrders.push(...this.orders.values());

    const lastOrder = allOrders.pop();
    const checkout: CheckoutResult | undefined = lastOrder
      ? {
          orderId: lastOrder.id,
          status: lastOrder.status === 'confirmed' ? 'completed' : 'pending',
          items: lastOrder.items,
          total: lastOrder.total,
          paymentMethod: 'mock',
          fulfillment: {
            method: 'standard',
            estimatedDelivery: new Date(Date.now() + 5 * 86400000)
              .toISOString()
              .split('T')[0],
          },
        }
      : undefined;

    return {
      success,
      answer,
      steps: [...this.steps],
      iterations: this.iteration,
      merchant: discovery ?? undefined,
      checkout,
      usage: this.buildUsageSummary(),
    };
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[ShoppingAgent] ${message}`);
    }
  }
}
