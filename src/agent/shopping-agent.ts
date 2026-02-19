/**
 * Shopping Agent Orchestrator
 *
 * The core agent loop: plan → act (tool call) → observe (tool result) → repeat.
 *
 * This orchestrates the LLM, UCP client, and tool execution to complete
 * shopping tasks like browsing products, adding to cart, and checking out.
 */

import { UcpClient } from '../client/ucp-client.js';
import { SHOPPING_AGENT_TOOLS } from '../llm/tools.js';
import type {
  AgentOptions,
  AgentResult,
  AgentStep,
  AgentStreamEvent,
  ChatMessage,
  ToolCall,
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
  private readonly steps: AgentStep[] = [];
  private iteration = 0;

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
        SHOPPING_AGENT_TOOLS
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
          for await (const chunk of adapter.chatStream!(messages, SHOPPING_AGENT_TOOLS)) {
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
          const response = await adapter.chat(messages, SHOPPING_AGENT_TOOLS);
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

      default:
        return { error: `Unknown tool: ${toolCall.name}` };
    }
  }

  private async toolDiscoverMerchant(domain: string) {
    const discovery = await this.client.discover(domain);
    return {
      domain: discovery.domain,
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
  }

  private toolListCapabilities() {
    const caps = this.client.getCapabilities();
    return {
      capabilities: caps.map(c => ({
        name: c.name,
        version: c.version,
        extends: c.extends,
      })),
    };
  }

  private async toolBrowseProducts(args: Record<string, unknown>) {
    const page = (args.page as number) ?? 1;
    const limit = Math.min((args.limit as number) ?? 10, 50);
    const category = args.category as string | undefined;

    try {
      const result = await this.client.callApi('/products', {
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
      const result = await this.client.callApi(`/products/search?q=${encodeURIComponent(query)}`);
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
        const result = await this.client.callApi('/products');
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
    const result = await this.client.callApi(`/products/${productId}`);
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

  private toolSubmitShipping(address: ShippingAddress) {
    if (!this.checkoutSessionId) {
      return { error: 'No active checkout session. Call initiate_checkout first.' };
    }

    this.shippingAddress = address;

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
        total: this.calculateSubtotal(), // Simplified; real impl adds shipping + tax
        shippingAddress: this.shippingAddress,
        createdAt: new Date().toISOString(),
      };

      this.orders.set(orderId, order);

      // Clear cart after successful order
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
      try {
        return this.client.getDiscovery();
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
      merchant: discovery
        ? { domain: discovery.domain, profile: discovery.profile }
        : undefined,
      checkout,
    };
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[ShoppingAgent] ${message}`);
    }
  }
}
