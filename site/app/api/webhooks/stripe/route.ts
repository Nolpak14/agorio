import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { stripe } from '../../../../lib/stripe';
import { db } from '../../../../db';
import { customers } from '../../../../db/schema';

export const runtime = 'nodejs';

function generateLicenseKey(): string {
  return `agorio_pro_${randomBytes(16).toString('hex')}`;
}

function stripeCustomerId(val: string | Stripe.Customer | Stripe.DeletedCustomer | null): string {
  if (!val) throw new Error('Missing customer on Stripe object');
  return typeof val === 'string' ? val : val.id;
}

function stripeSubscriptionId(val: string | Stripe.Subscription | null | undefined): string | null {
  if (!val) return null;
  return typeof val === 'string' ? val : val.id;
}

// TODO (Resend): replace all console.log email stubs with real transactional emails

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  switch (event.type) {

    // ── New subscription ────────────────────────────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') break;

      const licenseKey = generateLicenseKey();

      await db.insert(customers).values({
        stripeCustomerId:     stripeCustomerId(session.customer),
        stripeSubscriptionId: stripeSubscriptionId(session.subscription),
        email:                session.customer_email ?? '',
        licenseKey,
        status: 'active',
        plan:   'pro',
      });

      // TODO (Resend): send welcome email to session.customer_email with licenseKey
      console.log('[stripe] new subscriber', session.customer_email, licenseKey);
      break;
    }

    // ── Recurring payment succeeded ─────────────────────────────────────────
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== 'subscription_cycle') break;

      await db
        .update(customers)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(customers.stripeCustomerId, stripeCustomerId(invoice.customer)));

      // TODO (Resend): send renewal receipt to invoice.customer_email
      console.log('[stripe] renewal paid', invoice.customer_email);
      break;
    }

    // ── Payment failed — dunning ────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;

      await db
        .update(customers)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(customers.stripeCustomerId, stripeCustomerId(invoice.customer)));

      // TODO (Resend): send dunning email #(invoice.attempt_count) to invoice.customer_email
      console.log('[stripe] payment failed attempt', invoice.attempt_count, invoice.customer_email);
      break;
    }

    // ── Subscription status changed ─────────────────────────────────────────
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const prev = event.data.previous_attributes as Partial<Stripe.Subscription>;

      if (sub.status === 'active' && prev.status && prev.status !== 'active') {
        await db
          .update(customers)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(customers.stripeSubscriptionId, sub.id));
        // TODO (Resend): send "payment recovered — you're back" email
        console.log('[stripe] subscription reactivated', sub.id);

      } else if (sub.status === 'past_due') {
        await db
          .update(customers)
          .set({ status: 'past_due', updatedAt: new Date() })
          .where(eq(customers.stripeSubscriptionId, sub.id));
        // TODO (Resend): send "update your payment method" warning
        console.log('[stripe] subscription past_due', sub.id);

      } else if (sub.status === 'unpaid') {
        await db
          .update(customers)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(eq(customers.stripeSubscriptionId, sub.id));
        console.log('[stripe] subscription unpaid — suspending', sub.id);

      } else if (sub.cancel_at_period_end === true && !prev.status) {
        // TODO (Resend): send "sorry to see you go — access continues until period end" email
        console.log('[stripe] cancellation scheduled', sub.id, 'ends', sub.cancel_at);

      } else if (sub.cancel_at_period_end === false && prev.cancel_at_period_end === true) {
        // TODO (Resend): send "welcome back — cancellation removed" email
        console.log('[stripe] cancellation reversed', sub.id);
      }
      break;
    }

    // ── Subscription fully ended ────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;

      await db
        .update(customers)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(customers.stripeSubscriptionId, sub.id));

      // TODO (Resend): send offboarding email
      console.log('[stripe] subscription cancelled', sub.id);
      break;
    }

    // ── Chargeback filed ────────────────────────────────────────────────────
    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = await stripe.charges.retrieve(typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id);

      await db
        .update(customers)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(eq(customers.stripeCustomerId, stripeCustomerId(charge.customer)));

      // TODO (Resend): alert piotr.kaplon@outlook.com with dispute.id, dispute.amount, dispute.reason
      console.error('[stripe] DISPUTE FILED', dispute.id, dispute.amount, dispute.reason);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
