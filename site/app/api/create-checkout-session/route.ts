import { NextRequest, NextResponse } from 'next/server';
import { stripe, ALLOWED_PRICES } from '../../../lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { priceId } = await request.json();

    if (!priceId || !ALLOWED_PRICES.has(priceId)) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      console.error('[checkout] NEXT_PUBLIC_BASE_URL is not set');
      return NextResponse.json({ error: 'Server misconfigured: missing base URL' }, { status: 500 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[checkout] STRIPE_SECRET_KEY is not set');
      return NextResponse.json({ error: 'Server misconfigured: missing Stripe key' }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[checkout] stripe.checkout.sessions.create failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
