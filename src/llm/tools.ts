/**
 * UCP Shopping Agent Tool Definitions
 *
 * These are the tools (functions) available to the LLM during
 * the agent loop. Each maps to a UCP operation.
 */

import type { ToolDefinition } from '../types/index.js';

/**
 * All tools available to the shopping agent.
 * These get passed to the LLM as function calling declarations.
 */
export const SHOPPING_AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'discover_merchant',
    description:
      'Discover a UCP-enabled merchant by domain. Fetches the merchant\'s UCP profile from /.well-known/ucp and returns their capabilities, services, and payment configuration. This should be called first before any other operations.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The merchant domain to discover (e.g., "shop.example.com")',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'list_capabilities',
    description:
      'List all UCP capabilities the discovered merchant supports. Shows what the merchant can do (checkout, orders, fulfillment, discounts, etc.).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browse_products',
    description:
      'Browse the merchant\'s product catalog. Returns a paginated list of products with names, prices, and availability.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          description: 'Page number (default: 1)',
        },
        limit: {
          type: 'integer',
          description: 'Products per page (default: 10, max: 50)',
        },
        category: {
          type: 'string',
          description: 'Filter by product category',
        },
      },
    },
  },
  {
    name: 'search_products',
    description:
      'Search for products by keyword. Returns matching products sorted by relevance.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "wireless headphones")',
        },
        limit: {
          type: 'integer',
          description: 'Maximum results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description:
      'Get detailed information about a specific product by ID. Includes full description, variants, pricing, and availability.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to look up',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'add_to_cart',
    description:
      'Add a product to the shopping cart. Specify quantity and optional variant.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to add',
        },
        quantity: {
          type: 'integer',
          description: 'Quantity to add (default: 1)',
        },
        variantId: {
          type: 'string',
          description: 'Optional variant ID (e.g., size or color)',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'view_cart',
    description:
      'View the current shopping cart contents, including items, quantities, and subtotal.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'remove_from_cart',
    description:
      'Remove an item from the shopping cart by product ID.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to remove',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'initiate_checkout',
    description:
      'Start the checkout process with the current cart. Returns checkout session details and required information (shipping, payment).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'submit_shipping',
    description:
      'Submit shipping address for the checkout.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Recipient full name',
        },
        line1: {
          type: 'string',
          description: 'Address line 1',
        },
        line2: {
          type: 'string',
          description: 'Address line 2 (optional)',
        },
        city: {
          type: 'string',
          description: 'City',
        },
        state: {
          type: 'string',
          description: 'State or province',
        },
        postalCode: {
          type: 'string',
          description: 'Postal/ZIP code',
        },
        country: {
          type: 'string',
          description: 'Country code (e.g., "US")',
        },
      },
      required: ['name', 'line1', 'city', 'state', 'postalCode', 'country'],
    },
  },
  {
    name: 'submit_payment',
    description:
      'Submit payment to complete the order. In test/mock mode this simulates payment. Returns order confirmation with order ID.',
    parameters: {
      type: 'object',
      properties: {
        paymentMethod: {
          type: 'string',
          description: 'Payment method identifier (e.g., "stripe", "mock_card")',
        },
        paymentToken: {
          type: 'string',
          description: 'Payment token from payment provider (use "tok_mock_success" for testing)',
        },
      },
      required: ['paymentMethod'],
    },
  },
  {
    name: 'get_order_status',
    description:
      'Check the status of an existing order by order ID.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The order ID to check',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'switch_merchant',
    description:
      'Switch the active merchant context to a previously discovered merchant. Use this when comparing products across multiple merchants. The active merchant determines which cart, checkout, and product catalog you interact with.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain of a previously discovered merchant to switch to',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'get_product_reviews',
    description:
      'Get customer reviews for a product. Returns average rating, total review count, and individual reviews.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to get reviews for',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of reviews to return (default: 5)',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'apply_discount_code',
    description:
      'Apply a discount or coupon code to the current checkout session. Must have an active checkout first.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The discount or coupon code to apply',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compare_prices',
    description:
      'Compare product prices across all discovered merchants. Requires at least 2 merchants to be discovered first. Searches for the given query on each merchant and returns a comparison table.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Product search query to compare across merchants (e.g., "wireless headphones")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'subscribe_order_updates',
    description:
      'Subscribe to webhook notifications for an order. When the order status changes (e.g., shipped, delivered), the webhook server will receive a notification. Requires a webhook server to be configured.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The order ID to subscribe to updates for',
        },
      },
      required: ['orderId'],
    },
  },
];
