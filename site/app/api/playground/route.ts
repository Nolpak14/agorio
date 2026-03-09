import { NextRequest } from 'next/server';

// Force Node.js runtime (required for Express/MockMerchant)
export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Singleton MockMerchant ───

let merchantReady: Promise<{ domain: string; stop: () => Promise<void> }> | null = null;

async function ensureMerchant() {
  if (!merchantReady) {
    merchantReady = (async () => {
      const { MockMerchant } = await import('@agorio/sdk');
      const merchant = new MockMerchant({ port: 0, name: 'Agorio Playground Store' });
      await merchant.start();
      return { domain: merchant.domain, stop: () => merchant.stop() };
    })();
  }
  return merchantReady;
}

// ─── Session Management ───

interface Session {
  agent: import('@agorio/sdk').ShoppingAgent;
  domain: string;
  createdAt: number;
  lastUsed: number;
  turnCount: number;
}

const sessions = new Map<string, Session>();

// Clean up sessions older than 10 minutes
const SESSION_TTL_MS = 10 * 60 * 1000;

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

// Run cleanup every 2 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupSessions, 2 * 60 * 1000);
  }
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── System Prompt ───

function buildSystemPreamble(domain: string): string {
  return [
    `You are a helpful shopping assistant in a demo playground. The merchant is at ${domain}.`,
    ``,
    `INTENT RULES — match your actions to what the user actually asked:`,
    `- "search", "find", "look for", "show me", "what do you have" → ONLY discover + search. Show results. Do NOT buy.`,
    `- "browse", "catalog", "list" → ONLY discover + browse_products. Show the catalog. Do NOT buy.`,
    `- "buy", "purchase", "order", "get me", "I want", "add to cart" → Full purchase flow: discover → search → add to cart → checkout → shipping → payment.`,
    `- "compare" → Search and show multiple options with prices. Do NOT buy unless asked.`,
    `- "track", "status", "where is my order" → Look up order status.`,
    `- General questions → Answer conversationally using your knowledge of the store.`,
    ``,
    `WHEN BUYING:`,
    `- Complete the full flow autonomously without asking for confirmation.`,
    `- Use demo shipping: name "Demo User", address "123 Commerce St, San Francisco, CA 94102, US".`,
    `- Use mock payment token "tok_mock_success".`,
    ``,
    `RESPONSE STYLE:`,
    `- Give SHORT, plain-text responses. No markdown formatting (no **, no ##, no bullet lists with -).`,
    `- Use simple line breaks to separate items when listing products.`,
    `- Be conversational and concise, like a helpful shopping assistant.`,
    `- After a purchase, confirm with product name, price, and order ID in 1-2 sentences.`,
    `- After a search, show product names, prices, and availability clearly.`,
    ``,
    `IMPORTANT: You have persistent state. Your cart, orders, and merchant connections carry over between messages.`,
    `If the user previously searched or bought something, you remember it. Reference previous actions naturally.`,
  ].join('\n');
}

function buildTask(domain: string, message: string, isFirstTurn: boolean, turnCount: number): string {
  if (isFirstTurn) {
    return `${buildSystemPreamble(domain)}\n\nUser: ${message}`;
  }

  // On follow-up turns, include a brief reminder + the new message
  return [
    `Continue as the shopping assistant. The merchant is at ${domain}.`,
    `Remember: match intent to actions (search=search only, buy=full purchase). Plain text responses, no markdown.`,
    `When buying, use demo shipping and mock payment token "tok_mock_success".`,
    `This is message #${turnCount} in our conversation. Your cart and orders from earlier messages are still active.`,
    ``,
    `User: ${message}`,
  ].join('\n');
}

// ─── Request Handling ───

interface PlaygroundRequest {
  message: string;
  sessionId?: string;
  provider: 'openai' | 'gemini' | 'claude';
  apiKey: string;
  model?: string;
}

function validateRequest(body: unknown): PlaygroundRequest {
  const b = body as Record<string, unknown>;
  if (!b.message || typeof b.message !== 'string' || (b.message as string).trim().length === 0) {
    throw new Error('Message is required');
  }
  if ((b.message as string).length > 1000) {
    throw new Error('Message must be under 1000 characters');
  }
  if (!b.provider || !['openai', 'gemini', 'claude'].includes(b.provider as string)) {
    throw new Error('Provider must be one of: openai, gemini, claude');
  }
  if (!b.apiKey || typeof b.apiKey !== 'string' || (b.apiKey as string).trim().length === 0) {
    throw new Error('API key is required');
  }
  return {
    message: (b.message as string).trim(),
    sessionId: typeof b.sessionId === 'string' ? b.sessionId : undefined,
    provider: b.provider as PlaygroundRequest['provider'],
    apiKey: (b.apiKey as string).trim(),
    model: typeof b.model === 'string' ? b.model : undefined,
  };
}

async function createLlmAdapter(
  provider: PlaygroundRequest['provider'],
  apiKey: string,
  model?: string,
): Promise<import('@agorio/sdk').LlmAdapter> {
  switch (provider) {
    case 'openai': {
      const { OpenAIAdapter } = await import('@agorio/sdk');
      return new OpenAIAdapter({ apiKey, model: model || 'gpt-4o' });
    }
    case 'gemini': {
      const { GeminiAdapter } = await import('@agorio/sdk');
      return new GeminiAdapter({ apiKey, model: model || 'gemini-2.0-flash' });
    }
    case 'claude': {
      const { ClaudeAdapter } = await import('@agorio/sdk');
      return new ClaudeAdapter({ apiKey, model: model || 'claude-sonnet-4-20250514' });
    }
  }
}

export async function POST(request: NextRequest) {
  ensureCleanup();

  let body: PlaygroundRequest;
  try {
    const raw = await request.json();
    body = validateRequest(raw);
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const merchant = await ensureMerchant();

    // Resolve or create session
    let session = body.sessionId ? sessions.get(body.sessionId) : undefined;
    let sessionId = body.sessionId || generateSessionId();
    let isFirstTurn = true;

    if (session) {
      // Existing session — reuse the agent (cart, orders, merchant state persist)
      session.lastUsed = Date.now();
      session.turnCount++;
      isFirstTurn = false;
    } else {
      // New session — create fresh agent
      const llm = await createLlmAdapter(body.provider, body.apiKey, body.model);
      const { ShoppingAgent } = await import('@agorio/sdk');
      const agent = new ShoppingAgent({
        llm,
        maxIterations: 15,
        verbose: true,
      });

      session = {
        agent,
        domain: merchant.domain,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        turnCount: 1,
      };
      sessions.set(sessionId, session);
    }

    const task = buildTask(session.domain, body.message, isFirstTurn, session.turnCount);

    // Stream agent events as SSE
    const encoder = new TextEncoder();
    const agentRef = session.agent;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID as first event so client can track it
          const sessionEvent = JSON.stringify({ type: 'session', sessionId });
          controller.enqueue(encoder.encode(`data: ${sessionEvent}\n\n`));

          for await (const event of agentRef.runStream(task)) {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          const errorEvent = JSON.stringify({
            type: 'error',
            error: (err as Error).message,
            iteration: 0,
            timestamp: Date.now(),
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Server error: ${(err as Error).message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
