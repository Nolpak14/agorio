/**
 * Mock Merchant Fixtures
 *
 * Default product catalog and UCP profile for testing.
 */

import type { MockProduct, UcpProfile } from '../types/index.js';

export const DEFAULT_PRODUCTS: MockProduct[] = [
  {
    id: 'prod_wireless_headphones',
    name: 'ProSound Wireless Headphones',
    description: 'Premium noise-cancelling wireless headphones with 40-hour battery life, Bluetooth 5.3, and adaptive EQ.',
    price: { amount: '149.99', currency: 'USD' },
    category: 'Electronics',
    inStock: true,
    variants: [
      { id: 'var_black', name: 'Midnight Black' },
      { id: 'var_white', name: 'Arctic White' },
      { id: 'var_blue', name: 'Ocean Blue' },
    ],
  },
  {
    id: 'prod_laptop_stand',
    name: 'ErgoRise Laptop Stand',
    description: 'Adjustable aluminum laptop stand with ventilation. Fits 10-17 inch laptops. 6 height levels.',
    price: { amount: '59.99', currency: 'USD' },
    category: 'Accessories',
    inStock: true,
  },
  {
    id: 'prod_mechanical_keyboard',
    name: 'TypePro Mechanical Keyboard',
    description: 'Hot-swappable mechanical keyboard with RGB backlighting, PBT keycaps, and USB-C. Cherry MX compatible.',
    price: { amount: '89.99', currency: 'USD' },
    category: 'Electronics',
    inStock: true,
    variants: [
      { id: 'var_red', name: 'Red Switches (Linear)' },
      { id: 'var_brown', name: 'Brown Switches (Tactile)' },
      { id: 'var_blue_sw', name: 'Blue Switches (Clicky)' },
    ],
  },
  {
    id: 'prod_usb_hub',
    name: 'ConnectAll USB-C Hub',
    description: '7-in-1 USB-C hub with HDMI 4K, 3x USB-A 3.0, SD/MicroSD readers, and 100W PD pass-through.',
    price: { amount: '39.99', currency: 'USD' },
    category: 'Accessories',
    inStock: true,
  },
  {
    id: 'prod_webcam',
    name: 'ClearView 4K Webcam',
    description: '4K webcam with auto-focus, noise-cancelling dual microphones, and built-in privacy shutter.',
    price: { amount: '79.99', currency: 'USD' },
    category: 'Electronics',
    inStock: true,
  },
  {
    id: 'prod_desk_mat',
    name: 'WorkPad XL Desk Mat',
    description: 'Extra-large desk mat (35x17 inches) with anti-slip base, water-resistant surface, and stitched edges.',
    price: { amount: '29.99', currency: 'USD' },
    category: 'Accessories',
    inStock: true,
    variants: [
      { id: 'var_dark_grey', name: 'Dark Grey' },
      { id: 'var_navy', name: 'Navy Blue' },
    ],
  },
  {
    id: 'prod_monitor_light',
    name: 'GlowBar Monitor Light',
    description: 'LED monitor light bar with auto-dimming, adjustable color temperature (2700K-6500K), and no screen glare.',
    price: { amount: '44.99', currency: 'USD' },
    category: 'Lighting',
    inStock: true,
  },
  {
    id: 'prod_cable_organizer',
    name: 'TidyDesk Cable Organizer',
    description: 'Silicone cable management clips, set of 5. Adhesive-backed, holds 1-3 cables each.',
    price: { amount: '12.99', currency: 'USD' },
    category: 'Accessories',
    inStock: true,
  },
  {
    id: 'prod_bluetooth_mouse',
    name: 'SilentClick Bluetooth Mouse',
    description: 'Ergonomic wireless mouse with silent clicks, 4000 DPI sensor, and multi-device connectivity (3 devices).',
    price: { amount: '34.99', currency: 'USD' },
    category: 'Electronics',
    inStock: false,
  },
  {
    id: 'prod_phone_charger',
    name: 'FastCharge Qi Pad',
    description: '15W fast wireless charger with LED indicator. Compatible with iPhone, Samsung, and all Qi devices.',
    price: { amount: '24.99', currency: 'USD' },
    category: 'Accessories',
    inStock: true,
  },
];

/**
 * Build a UCP profile for the mock merchant.
 */
export function buildMockProfile(baseUrl: string, merchantName?: string): UcpProfile {
  return {
    ucp: {
      version: '2026-01-11',
      services: {
        'dev.ucp.shopping': {
          version: '2026-01-11',
          spec: 'https://ucp.dev/specification/overview/',
          rest: {
            schema: `${baseUrl}/ucp/schema/openapi.json`,
            endpoint: `${baseUrl}/ucp/v1`,
          },
        },
      },
      capabilities: [
        {
          name: 'dev.ucp.shopping.checkout',
          version: '2026-01-11',
          spec: 'https://ucp.dev/specification/checkout/',
          schema: 'https://ucp.dev/schemas/shopping/checkout.json',
        },
        {
          name: 'dev.ucp.shopping.order',
          version: '2026-01-11',
          spec: 'https://ucp.dev/specification/order/',
          schema: 'https://ucp.dev/schemas/shopping/order.json',
        },
        {
          name: 'dev.ucp.shopping.fulfillment',
          version: '2026-01-11',
          spec: 'https://ucp.dev/specification/fulfillment/',
          schema: 'https://ucp.dev/schemas/shopping/fulfillment.json',
          extends: 'dev.ucp.shopping.order',
        },
        {
          name: 'dev.ucp.shopping.discount',
          version: '2026-01-11',
          spec: 'https://ucp.dev/specification/discount/',
          schema: 'https://ucp.dev/schemas/shopping/discount.json',
        },
      ],
    },
    payment: {
      handlers: [
        {
          id: 'mock_payment',
          name: merchantName ? `${merchantName} Mock Payment` : 'Mock Payment',
          version: '2026-01-11',
          spec: 'https://ucp.dev/handlers/tokenization/mock/',
          config: {
            test_mode: true,
          },
        },
      ],
    },
    signing_keys: [
      {
        kty: 'EC',
        kid: 'mock-signing-key-1',
        use: 'sig',
        alg: 'ES256',
        crv: 'P-256',
        x: 'mock_x_coordinate_base64url',
        y: 'mock_y_coordinate_base64url',
      },
    ],
  };
}

/**
 * Build a minimal OpenAPI schema for the mock merchant.
 */
export function buildMockOpenApiSchema(baseUrl: string): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Mock Merchant UCP API',
      version: '1.0.0',
      description: 'UCP-compliant shopping API for testing',
    },
    servers: [{ url: `${baseUrl}/ucp/v1` }],
    paths: {
      '/products': {
        get: {
          summary: 'List all products',
          operationId: 'listProducts',
          responses: {
            '200': {
              description: 'Product list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      products: { type: 'array' },
                      total: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/products/search': {
        get: {
          summary: 'Search products',
          operationId: 'searchProducts',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
        },
      },
      '/products/{id}': {
        get: {
          summary: 'Get product by ID',
          operationId: 'getProduct',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
        },
      },
      '/checkout': {
        post: {
          summary: 'Initiate checkout',
          operationId: 'initiateCheckout',
        },
      },
      '/checkout/complete': {
        post: {
          summary: 'Complete checkout with payment',
          operationId: 'completeCheckout',
        },
      },
      '/orders/{id}': {
        get: {
          summary: 'Get order status',
          operationId: 'getOrderStatus',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
        },
      },
    },
  };
}
