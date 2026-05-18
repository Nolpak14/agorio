# Adapters registry

Merchant adapters available for `@agorio/sdk`. Open a PR following the
[adapter SDK guide](./guides/adapter-sdk.md) to list your own.

## Core (shipped with the SDK)

| Adapter      | Source                          | Auth                            | Capabilities |
| ------------ | ------------------------------- | ------------------------------- | ------------ |
| Shopify      | `src/adapters/shopify.ts`       | Storefront API token            | list, search, get, checkout.create, checkout.complete (UCP auto-detect) |
| WooCommerce  | `src/adapters/woocommerce.ts`   | Consumer key + secret (Basic)   | list, search, get, checkout.create, checkout.complete |
| BigCommerce  | `src/adapters/bigcommerce.ts`   | X-Auth-Token                    | list, search, get, checkout.create, checkout.complete, orders.track |

## Community

_Empty — be the first._
