import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { sessionId } = await request.json();

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: checkoutSession.customer as string,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
