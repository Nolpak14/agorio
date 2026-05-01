import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { stripe } from '../../../../lib/stripe';
import { db } from '../../../../db';
import { customers } from '../../../../db/schema';
import {
  sendWelcomeEmail,
  sendRenewalEmail,
  sendDunningEmail,
  sendPaymentRecoveredEmail,
  sendCancellationScheduledEmail,
  sendCancellationReversedEmail,
  sendOffboardingEmail,
  sendDisputeAlertEmail,
} from '../../../../lib/emails';

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

async function emailForSubscription(subscriptionId: string): Promise<string | null> {
  const rows = await db
    .select({ email: customers.email })
    .from(customers)
    .where(eq(customers.stripeSubscriptionId, subscriptionId))
    .limit(1);
  return rows[0]?.email ?? null;
}

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

      if (session.customer_email) {
        void sendWelcomeEmail(session.customer_email, licenseKey)
          .catch(err => console.error('[resend] welcome email failed:', err));
      }
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

      if (invoice.customer_email) {
        void sendRenewalEmail(invoice.customer_email)
          .catch(err => console.error('[resend] renewal email failed:', err));
      }
      break;
    }

    // ── Payment failed — dunning ────────────────────────────────────────────
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;

      await db
        .update(customers)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(customers.stripeCustomerId, stripeCustomerId(invoice.customer)));

      if (invoice.customer_email) {
        void sendDunningEmail(invoice.customer_email, invoice.attempt_count ?? 1)
          .catch(err => console.error('[resend] dunning email failed:', err));
      }
      break;
    }

    // ── Subscription status changed ─────────────────────────────────────────
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const prev = event.data.previous_attributes as Partial<Stripe.Subscription>;
      const email = await emailForSubscription(sub.id);

      if (sub.status === 'active' && prev.status && prev.status !== 'active') {
        await db
          .update(customers)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(customers.stripeSubscriptionId, sub.id));
        if (email) {
          void sendPaymentRecoveredEmail(email)
            .catch(err => console.error('[resend] payment-recovered email failed:', err));
        }

      } else if (sub.status === 'past_due') {
        await db
          .update(customers)
          .set({ status: 'past_due', updatedAt: new Date() })
          .where(eq(customers.stripeSubscriptionId, sub.id));

      } else if (sub.status === 'unpaid') {
        await db
          .update(customers)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(eq(customers.stripeSubscriptionId, sub.id));

      } else if (sub.cancel_at_period_end === true && !prev.status) {
        if (email) {
          void sendCancellationScheduledEmail(email, sub.cancel_at)
            .catch(err => console.error('[resend] cancellation-scheduled email failed:', err));
        }

      } else if (sub.cancel_at_period_end === false && prev.cancel_at_period_end === true) {
        if (email) {
          void sendCancellationReversedEmail(email)
            .catch(err => console.error('[resend] cancellation-reversed email failed:', err));
        }
      }
      break;
    }

    // ── Subscription fully ended ────────────────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const email = await emailForSubscription(sub.id);

      await db
        .update(customers)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(customers.stripeSubscriptionId, sub.id));

      if (email) {
        void sendOffboardingEmail(email)
          .catch(err => console.error('[resend] offboarding email failed:', err));
      }
      break;
    }

    // ── Chargeback filed ────────────────────────────────────────────────────
    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = await stripe.charges.retrieve(
        typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
      );

      await db
        .update(customers)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(eq(customers.stripeCustomerId, stripeCustomerId(charge.customer)));

      void sendDisputeAlertEmail(dispute.id, dispute.amount, dispute.reason)
        .catch(err => console.error('[resend] dispute alert email failed:', err));
      break;
    }
  }

  return NextResponse.json({ received: true });
}
