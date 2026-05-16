# @agorio/plugin-procurement

B2B procurement tooling for [Agorio](https://www.npmjs.com/package/@agorio/sdk) AI shopping agents.

- **PO# tracking** — assign a purchase-order number to every cart, optionally gate `submit_payment` on its presence
- **Vendor management** — resolve merchant domain → vendor record (payment terms, tax category, preferred-supplier flag)
- **Expense categorization** — tag carts with one of your configured expense categories
- **Audit-friendly events** — emits a `procurement_completed` event on successful checkout so the [`@agorio/plugin-audit-trail`](https://www.npmjs.com/package/@agorio/plugin-audit-trail) picks up PO# + vendor + category for free

```bash
npm install @agorio/sdk @agorio/plugin-procurement
```

```ts
import { ShoppingAgent } from '@agorio/sdk';
import { createProcurementPlugin } from '@agorio/plugin-procurement';

const procurement = createProcurementPlugin({
  vendors: [
    { id: 'acme', name: 'Acme Office Supplies', domain: 'acme.com', paymentTerms: 'NET-30', taxCategory: 'office', preferred: true },
    { id: 'staples', name: 'Staples', domain: 'staples.com', paymentTerms: 'NET-15', taxCategory: 'office' },
  ],
  expenseCategories: ['office-supplies', 'it-equipment', 'furniture'],
  poNumberPrefix: 'PO-2026',
  poNumberStrategy: 'sequential',
  requirePoOnCheckout: true,
});

const agent = new ShoppingAgent({ llm, plugins: [procurement] });
```

## Configuration

| Key                    | Type                                   | Description |
| ---------------------- | -------------------------------------- | --- |
| `vendors`              | `VendorConfig[]`                       | Known vendors, indexed by domain. |
| `expenseCategories`    | `string[]`                             | Allowed values for `categorize_expense`. |
| `poNumberPrefix`       | `string`                               | Optional prefix on generated PO numbers (default `'PO'`). |
| `poNumberStrategy`     | `'sequential' \| 'uuid' \| () => string` | How to generate PO numbers (default `'sequential'`). |
| `requirePoOnCheckout`  | `boolean`                              | Block `submit_payment` if the current cart has no PO# (default `false`). |

## Tools exposed to the LLM

- `assign_po_number` — `{ }` → `{ poNumber }`
- `lookup_vendor` — `{ domain }` → `{ vendor }` (or `{ error }`)
- `categorize_expense` — `{ category }` → `{ assigned: true, category }`

## License

MIT — same as the rest of Agorio's plugins.
