import { NextRequest, NextResponse } from 'next/server';
import { stripe, ALLOWED_PRICES } from '../../../lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { priceId } = await request.json();

  if (!priceId || !ALLOWED_PRICES.has(priceId)) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
  });

  return NextResponse.json({ url: session.url });
}
