/**
 * Shopping Agent Orchestrator
 *
 * The core agent loop: plan → act (tool call) → observe (tool result) → repeat.
 *
 * This orchestrates the LLM, UCP client, and tool execution to complete
 * shopping tasks like browsing products, adding to cart, and checking out.
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

  // Protocol state
  private protocol: 'ucp' | 'acp' | null = null;
  private acpBaseUrl: string | null = null;

  // Shopping state
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
    const messages: ChatMessage[] = [
      { role: 'user', content: task },
    ];

    this.iteration = 0;

    while (this.iteration < this.options.maxIterations) {
      this.iteration++;

      // Ask the LLM what to do next
      const llmResponse = await this.options.llm.chat(
        messages,
        this.allTools
      );

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

        let result: unknown;
        try {
          result = await this.executeTool(toolCall);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        this.recordStep({
          type: 'tool_result',
          toolName: toolCall.name,
          toolOutput: result,
        });
        this.log(`[Result] ${JSON.stringify(result).slice(0, 200)}`);

        // Add tool result to message history
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.name,
        });
      }
    }

    // Max iterations reached
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
    const messages: ChatMessage[] = [
      { role: 'user', content: task },
    ];

    this.iteration = 0;
    const adapter = this.options.llm;
    const supportsStreaming = typeof adapter.chatStream === 'function';

    try {
      while (this.iteration < this.options.maxIterations) {
        this.iteration++;

        let textContent = '';
        let toolCalls: ToolCall[] = [];

        if (supportsStreaming) {
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
                break;
            }
          }
        } else {
          const response = await adapter.chat(messages, this.allTools);
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

          let result: unknown;
          try {
            result = await this.executeTool(toolCall);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) };
          }

          this.recordStep({
            type: 'tool_result',
            toolName: toolCall.name,
            toolOutput: result,
          });
          this.log(`[Result] ${JSON.stringify(result).slice(0, 200)}`);

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
      const result = this.buildResult(
        false,
        `Agent reached maximum iterations (${this.options.maxIterations}) without completing the task.`
      );
      yield { type: 'done', result, iteration: this.iteration, timestamp: Date.now() };
    } catch (err) {
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
   * Get the current cart state.
   */
  getCart(): CartState {
    return {
      items: [...this.cart],
      subtotal: this.calculateSubtotal(),
      itemCount: this.cart.reduce((sum, item) => sum + item.quantity, 0),
    };
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
    // Try UCP discovery first
    try {
      const discovery = await this.client.discover(domain);
      this.protocol = 'ucp';
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

  private toolListCapabilities() {
    if (this.protocol === 'acp') {
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
   * Routes to UcpClient.callApi() for UCP or direct fetch for ACP.
   */
  private async fetchMerchantApi(
    path: string,
    options?: { method?: string; body?: unknown }
  ): Promise<unknown> {
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
    const result = await this.fetchMerchantApi(`/products/${productId}`);
    return result;
  }

  private toolAddToCart(args: Record<string, unknown>) {
    const productId = args.productId as string;
    const quantity = (args.quantity as number) ?? 1;

    const existing = this.cart.find(item => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.cart.push({
        productId,
        name: productId, // Will be enriched if we have product data
        quantity,
        price: { amount: '0', currency: 'USD' }, // Placeholder
      });
    }

    return {
      success: true,
      cart: this.getCart(),
    };
  }

  private toolViewCart() {
    return this.getCart();
  }

  private toolRemoveFromCart(productId: string) {
    const idx = this.cart.findIndex(item => item.productId === productId);
    if (idx === -1) {
      return { success: false, error: 'Item not found in cart' };
    }
    this.cart.splice(idx, 1);
    return { success: true, cart: this.getCart() };
  }

  private async toolInitiateCheckout() {
    if (this.cart.length === 0) {
      return { error: 'Cart is empty. Add items before checking out.' };
    }

    // ACP checkout flow
    if (this.protocol === 'acp' && this.acpClient) {
      try {
        const session = await this.acpClient.createCheckout({
          line_items: this.cart.map(item => ({
            product_id: item.productId,
            quantity: item.quantity,
          })),
        });
        this.checkoutSessionId = session.id;

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
        body: { items: this.cart },
      });
      const data = result as Record<string, unknown>;
      this.checkoutSessionId = (data.sessionId ?? data.id) as string;

      return {
        protocol: 'ucp',
        sessionId: this.checkoutSessionId,
        items: this.cart,
        subtotal: this.calculateSubtotal(),
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
    if (!this.checkoutSessionId) {
      return { error: 'No active checkout session. Call initiate_checkout first.' };
    }

    this.shippingAddress = address;

    // ACP: update session with shipping address
    if (this.protocol === 'acp' && this.acpClient) {
      try {
        const session = await this.acpClient.updateCheckout(this.checkoutSessionId, {
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
      sessionId: this.checkoutSessionId,
      shippingAddress: address,
      nextStep: 'payment',
    };
  }

  private async toolSubmitPayment(args: Record<string, unknown>) {
    if (!this.checkoutSessionId) {
      return { error: 'No active checkout session. Call initiate_checkout first.' };
    }

    if (!this.shippingAddress) {
      return { error: 'Shipping address required before payment. Call submit_shipping first.' };
    }

    const paymentMethod = args.paymentMethod as string;
    const paymentToken = args.paymentToken as string | undefined;

    // ACP payment flow
    if (this.protocol === 'acp' && this.acpClient) {
      try {
        const session = await this.acpClient.completeCheckout(this.checkoutSessionId, {
          payment_token: paymentToken ?? 'tok_mock_success',
          payment_handler: paymentMethod ?? 'stripe_shared_payment_token',
        });

        const orderId = `acp_${session.id}`;
        const order: MockOrder = {
          id: orderId,
          status: 'confirmed',
          items: [...this.cart],
          subtotal: this.calculateSubtotal(),
          total: this.calculateSubtotal(),
          shippingAddress: this.shippingAddress,
          createdAt: new Date().toISOString(),
        };

        this.orders.set(orderId, order);
        this.cart = [];
        this.checkoutSessionId = null;
        this.shippingAddress = null;

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
          sessionId: this.checkoutSessionId,
          items: this.cart,
          shippingAddress: this.shippingAddress,
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
        items: [...this.cart],
        subtotal: this.calculateSubtotal(),
        total: this.calculateSubtotal(),
        shippingAddress: this.shippingAddress,
        createdAt: new Date().toISOString(),
      };

      this.orders.set(orderId, order);
      this.cart = [];
      this.checkoutSessionId = null;
      this.shippingAddress = null;

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
    const order = this.orders.get(orderId);
    if (!order) {
      return { error: `Order not found: ${orderId}` };
    }
    return { order };
  }

  // ─── Helpers ───

  private calculateSubtotal(): MoneyAmount {
    let total = 0;
    for (const item of this.cart) {
      total += parseFloat(item.price.amount) * item.quantity;
    }
    return {
      amount: total.toFixed(2),
      currency: this.cart[0]?.price.currency ?? 'USD',
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
      if (this.protocol === 'acp' && this.acpBaseUrl) {
        // For ACP, create a minimal profile representation
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

    const lastOrder = [...this.orders.values()].pop();
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
    };
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[ShoppingAgent] ${message}`);
    }
  }
}
