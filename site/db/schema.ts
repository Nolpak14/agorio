import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id:                     serial('id').primaryKey(),
  stripeCustomerId:       text('stripe_customer_id').unique().notNull(),
  stripeSubscriptionId:   text('stripe_subscription_id').unique(),
  email:                  text('email').notNull(),
  licenseKey:             text('license_key').unique().notNull(),
  status:                 text('status', { enum: ['active', 'past_due', 'suspended', 'cancelled'] })
                            .notNull().default('active'),
  plan:                   text('plan', { enum: ['pro', 'enterprise'] })
                            .notNull().default('pro'),
  createdAt:              timestamp('created_at').defaultNow().notNull(),
  updatedAt:              timestamp('updated_at').defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
