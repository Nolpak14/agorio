# Plugin Development Guide

This guide shows you how to build plugins for the Agorio SDK. Plugins extend the agent with custom tools that the LLM can call, and optionally with lifecycle hooks that observe or intercept every tool call in the agent loop.

## Two plugin types

| Type | Use when |
|------|----------|
| `AgentPlugin` | You want to add a new tool the LLM can call |
| `EnterprisePlugin` | You also need to intercept, block, or observe every tool call the agent makes |

Both types ship in a single `@agorio/sdk` import. `EnterprisePlugin` extends `AgentPlugin` — every enterprise plugin is also a tool.

---

## AgentPlugin — custom tools

An `AgentPlugin` is the simplest possible extension: give the LLM a named function.

```ts
import type { AgentPlugin } from '@agorio/sdk';

const wishlistPlugin: AgentPlugin = {
  name: 'add_to_wishlist',
  description: 'Save a product to the user\'s wishlist for later purchase',
  parameters: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'Product ID to wishlist' },
      note:      { type: 'string', description: 'Optional personal note' },
    },
    required: ['productId'],
  },
  handler: async (args) => {
    // args is typed as Record<string, unknown>
    const productId = args.productId as string;
    const note      = args.note as string | undefined;
    await db.wishlist.insert({ productId, note, savedAt: new Date() });
    return { success: true, productId };
  },
};
```

Register it when constructing the agent:

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { GeminiAdapter } from '@agorio/sdk';

const agent = new ShoppingAgent({
  llm: new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY! }),
  plugins: [wishlistPlugin],
});

await agent.run('Find running shoes and save any you like to my wishlist');
```

### Rules

- **No name collisions** — the tool name must not match any of the 17 built-in tool names (browse_products, search_products, get_product_details, add_to_cart, remove_from_cart, view_cart, update_cart_item, clear_cart, get_shipping_options, submit_payment, track_order, get_recommendations, apply_coupon, compare_products, discover_merchant, check_merchant_capabilities, list_merchants). Agorio throws on startup if you collide.
- **No duplicate plugin names** — all plugins in one agent must have unique names.
- **Handler errors** are caught automatically and returned to the LLM as an error message; the agent loop continues.

---

## EnterprisePlugin — lifecycle hooks

`EnterprisePlugin` adds four optional hooks to `AgentPlugin`:

| Hook | When it runs | Can block? |
|------|-------------|-----------|
| `onRegister(ctx)` | When the plugin is added to the agent (sync) | Yes — throw to abort |
| `onInit(ctx)` | Once before the first iteration | No |
| `onBeforeToolCall(toolName, args, ctx)` | Before every tool call | Yes — return `{ allow: false }` |
| `onAfterToolCall(toolName, args, result, ctx)` | After every tool call | No |

`PluginContext` gives you read-only access to agent state:

```ts
interface PluginContext {
  getCart(): CartState;
  getActiveMerchant(): string | null;
  getCheckoutSessionId(): string | null;
  getMerchants(): string[];
  getSteps(): AgentStep[];
  getCurrentIteration(): number;
}
```

### PluginToolDecision — blocking and modifying

`onBeforeToolCall` must return a `PluginToolDecision`:

```ts
// Allow the call through unchanged
return { allow: true };

// Block the call — agent receives an error message with this reason
return { allow: false, reason: 'Budget exceeded' };

// Allow but rewrite arguments
return { allow: true, modifiedArgs: { quantity: 10 } };
```

---

## Walk-through example: build a wishlist plugin

This section builds a complete `@agorio/plugin-wishlist` from scratch.

### 1. Scaffold the package

```bash
mkdir plugins/wishlist && cd plugins/wishlist
npm init -y
```

`package.json`:
```json
{
  "name": "@agorio/plugin-wishlist",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": { "@agorio/sdk": "^0.5.0" },
  "license": "MIT"
}
```

`tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

### 2. Write the plugin

`src/index.ts`:
```ts
import type { EnterprisePlugin, PluginContext } from '@agorio/sdk';

export interface WishlistEntry {
  productId: string;
  addedAt: number;
  note?: string;
}

export interface WishlistConfig {
  maxItems?: number;
  onAdd?: (entry: WishlistEntry) => void;
}

export function createWishlistPlugin(config: WishlistConfig = {}): EnterprisePlugin {
  const items: WishlistEntry[] = [];
  const maxItems = config.maxItems ?? 50;

  return {
    name: 'wishlist',
    description: 'Add products to the wishlist, list saved items, or remove an item',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'list', 'remove'],
          description: 'Action to perform',
        },
        productId: {
          type: 'string',
          description: 'Product ID (required for add/remove)',
        },
        note: {
          type: 'string',
          description: 'Optional note when adding',
        },
      },
      required: ['action'],
    },

    handler(args) {
      const action = args.action as string;

      if (action === 'list') {
        return { items: [...items], count: items.length };
      }

      const productId = args.productId as string;

      if (action === 'add') {
        if (items.length >= maxItems) {
          return { error: `Wishlist is full (max ${maxItems} items)` };
        }
        if (items.some(i => i.productId === productId)) {
          return { error: 'Product already in wishlist' };
        }
        const entry: WishlistEntry = {
          productId,
          addedAt: Date.now(),
          note: args.note as string | undefined,
        };
        items.push(entry);
        config.onAdd?.(entry);
        return { success: true, productId, totalItems: items.length };
      }

      if (action === 'remove') {
        const idx = items.findIndex(i => i.productId === productId);
        if (idx === -1) return { error: 'Product not in wishlist' };
        items.splice(idx, 1);
        return { success: true, productId };
      }

      return { error: `Unknown action: ${action}` };
    },

    onBeforeToolCall(toolName, _args, _ctx) {
      // Only intercept payments — block if wishlist is empty (illustrative)
      if (toolName === 'submit_payment' && items.length === 0) {
        // Just an example; remove this if unwanted
      }
      return { allow: true };
    },

    getState() {
      return { items: [...items], count: items.length };
    },
  };
}
```

### 3. Write tests

`tests/wishlist.test.ts` (at repo root, next to other tests):
```ts
import { describe, it, expect } from 'vitest';
import { createWishlistPlugin } from '../plugins/wishlist/src/index.js';

describe('wishlist plugin', () => {
  it('adds items to the wishlist', () => {
    const plugin = createWishlistPlugin();
    const result = plugin.handler({ action: 'add', productId: 'prod_001' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.totalItems).toBe(1);
  });

  it('lists items', () => {
    const plugin = createWishlistPlugin();
    plugin.handler({ action: 'add', productId: 'prod_001' });
    plugin.handler({ action: 'add', productId: 'prod_002' });
    const result = plugin.handler({ action: 'list' }) as Record<string, unknown>;
    expect((result.items as unknown[]).length).toBe(2);
  });

  it('blocks duplicates', () => {
    const plugin = createWishlistPlugin();
    plugin.handler({ action: 'add', productId: 'prod_001' });
    const result = plugin.handler({ action: 'add', productId: 'prod_001' }) as Record<string, unknown>;
    expect(result.error).toContain('already');
  });

  it('removes items', () => {
    const plugin = createWishlistPlugin();
    plugin.handler({ action: 'add', productId: 'prod_001' });
    plugin.handler({ action: 'remove', productId: 'prod_001' });
    const result = plugin.handler({ action: 'list' }) as Record<string, unknown>;
    expect((result.items as unknown[]).length).toBe(0);
  });

  it('enforces maxItems', () => {
    const plugin = createWishlistPlugin({ maxItems: 2 });
    plugin.handler({ action: 'add', productId: 'p1' });
    plugin.handler({ action: 'add', productId: 'p2' });
    const result = plugin.handler({ action: 'add', productId: 'p3' }) as Record<string, unknown>;
    expect(result.error).toContain('full');
  });

  it('fires onAdd callback', () => {
    const log: string[] = [];
    const plugin = createWishlistPlugin({ onAdd: (e) => log.push(e.productId) });
    plugin.handler({ action: 'add', productId: 'prod_abc' });
    expect(log).toEqual(['prod_abc']);
  });
});
```

### 4. Use the plugin

```ts
import { ShoppingAgent, ClaudeAdapter } from '@agorio/sdk';
import { createWishlistPlugin } from '@agorio/plugin-wishlist';

const wishlist = createWishlistPlugin({
  maxItems: 20,
  onAdd: (e) => console.log('Added to wishlist:', e.productId),
});

const agent = new ShoppingAgent({
  llm: new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  plugins: [wishlist],
});

await agent.run('Browse shoes on example.myshopify.com and save anything under $100 to my wishlist');

console.log('Wishlist state:', wishlist.getState?.());
```

### 5. Publish to npm

```bash
cd plugins/wishlist
npm run build
npm publish --access public
```

Follow the `@agorio/plugin-*` naming convention so your plugin shows up when users search npm for agorio plugins.

---

## Using multiple plugins together

Plugins compose — pass an array to `ShoppingAgent`:

```ts
import { createSpendingControlsPlugin } from '@agorio/plugin-spending-controls';
import { createAuditTrailPlugin }        from '@agorio/plugin-audit-trail';
import { createWishlistPlugin }          from '@agorio/plugin-wishlist';

const agent = new ShoppingAgent({
  llm,
  plugins: [
    createSpendingControlsPlugin({ perTransactionLimit: 500 }),
    createAuditTrailPlugin({ output: 'console' }),
    createWishlistPlugin({ maxItems: 25 }),
  ],
});
```

`onBeforeToolCall` hooks run in **registration order**. If any hook returns `{ allow: false }`, subsequent hooks for that call are skipped.

---

## Reference implementations

The 6 governance plugins in `plugins/` are MIT-licensed and fully documented:

- [`plugins/spending-controls`](../plugins/spending-controls) — budget enforcement
- [`plugins/approval-workflow`](../plugins/approval-workflow) — human-in-the-loop checkout gates (implements `hydrate()` for v0.7 session resume)
- [`plugins/audit-trail`](../plugins/audit-trail) — structured logging with redaction
- [`plugins/agent-identity`](../plugins/agent-identity) — org identity attachment
- [`plugins/policy-engine`](../plugins/policy-engine) — JSON-based rule evaluator
- [`plugins/procurement`](../plugins/procurement) — B2B PO# tracking, vendor lookup, expense categorization (v0.7)

Use them as copy-paste starting points for your own plugins.

---

## Submitting to the plugin registry

There is no formal registry yet (planned for v1.0). In the meantime:

1. Publish to npm as `@your-scope/agorio-plugin-<name>` or `@agorio/plugin-<name>` (if you're the org owner)
2. Open an issue on [Nolpak14/agorio](https://github.com/Nolpak14/agorio/issues) with the label `plugin` and a link to your package
3. We'll add it to the README's community plugins list
