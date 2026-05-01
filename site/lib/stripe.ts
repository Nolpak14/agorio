import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const ALLOWED_PRICES = new Set([
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL,
  process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
]);
