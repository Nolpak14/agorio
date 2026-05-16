# Shopify dev-store setup (full-demo mode)

The procurement example's `--full` mode runs the chain against a real Shopify [development store](https://shopify.dev/docs/api/development-stores) with B2B enabled. One-time setup:

## 1. Create the dev store

1. Sign in to [Shopify Partners](https://partners.shopify.com).
2. Apps & sales channels → Stores → "Add store" → "Development store".
3. Store name: `agorio-procurement-demo` (or whatever; export as `AGORIO_SHOPIFY_STORE`).
4. Purpose: "Build a new store for a client".
5. Once created, **disable password protection** (Online Store → Preferences → Password Page → off).

## 2. Enable B2B

1. Shopify admin → Settings → Customers → "Enable B2B".
2. Create a company: "Acme Corp".
3. Add a customer to the company with a Storefront-visible email.

## 3. Seed products

Add three products from the admin (Products → Add product):

| Title | Price | SKU |
| --- | --- | --- |
| Ergonomic Office Chair | $349.00 | chair-001 |
| Standing Desk | $599.00 | desk-001 |
| 27" 4K Monitor | $429.00 | monitor-001 |

For each, set Inventory → Track quantity → 100, and **publish to the B2B sales channel**.

## 4. Generate a Storefront access token

1. Settings → Apps and sales channels → Develop apps.
2. Create app → name "Agorio Procurement Agent".
3. Configure Storefront API scopes:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_checkouts`
   - `unauthenticated_write_checkouts`
4. Install the app, copy the **Storefront API access token** (starts with `shpat_…`).
5. Export it as `AGORIO_SHOPIFY_TOKEN`.

## 5. Run the demo

```bash
export AGORIO_SHOPIFY_STORE=agorio-procurement-demo
export AGORIO_SHOPIFY_TOKEN=shpat_xxxxxxxx
npx tsx examples/procurement/index.ts --full
```

The Storefront token is read-only for catalog and write-only for checkout — it cannot manage products, customers, or settings. Safe to commit to a `.env.example` in your fork.

## Troubleshooting

- **403 on `compare_prices`** — token doesn't have `unauthenticated_read_product_listings`. Reinstall the app with the correct scopes.
- **Empty catalog** — products were not published to the B2B channel. Edit each product → Sales channels → check "B2B".
- **Rate limited (`compare_prices` hangs)** — Storefront API throttles at 2 req/s. The example wires a `TokenBucket({ capacity: 2, refillPerSec: 2 })` for `*.myshopify.com` to avoid this; if you cloned an older version, upgrade.
