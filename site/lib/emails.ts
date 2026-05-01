import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Agorio <admin@agorio.dev>';
const ADMIN = 'piotr.kaplon@outlook.com';
const DASHBOARD_URL = 'https://agorio.dev/dashboard';
const BILLING_URL = 'https://agorio.dev/dashboard';

function html(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#050510;padding:24px 32px;">
      <span style="color:#00f0ff;font-family:monospace;font-size:20px;font-weight:700;">ag</span><span style="color:#e8eaed;font-family:monospace;font-size:20px;font-weight:700;">orio</span>
    </div>
    <div style="padding:32px;color:#111827;line-height:1.6;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">${title}</h2>
      ${body}
    </div>
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
      Agorio &middot; <a href="https://agorio.dev" style="color:#6b7280;">agorio.dev</a>
    </div>
  </div>
</body>
</html>`;
}

export async function sendWelcomeEmail(to: string, licenseKey: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Your Agorio Pro license key',
    html: html('Welcome to Agorio Pro 🎉', `
      <p>Thanks for subscribing! Here's your license key:</p>
      <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:16px;font-family:monospace;font-size:13px;word-break:break-all;color:#111827;">
        ${licenseKey}
      </div>
      <p style="margin-top:16px;">Add it to your project's environment variables:</p>
      <pre style="background:#1e293b;color:#e2e8f0;border-radius:6px;padding:16px;font-size:13px;overflow-x:auto;">AGORIO_LICENSE_KEY=${licenseKey}</pre>
      <p style="margin-top:20px;">
        <a href="${DASHBOARD_URL}" style="background:#00f0ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View Dashboard →</a>
      </p>
    `),
  });
}

export async function sendRenewalEmail(to: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Agorio Pro renewed',
    html: html('Subscription renewed', `
      <p>Your Agorio Pro subscription has been renewed successfully. Your license key remains the same — no action needed.</p>
      <p><a href="${DASHBOARD_URL}" style="color:#0891b2;">View Dashboard →</a></p>
    `),
  });
}

export async function sendDunningEmail(to: string, attempt: number) {
  const isLast = attempt >= 3;
  return resend.emails.send({
    from: FROM,
    to,
    subject: isLast
      ? 'Final notice: update your payment method'
      : 'Payment failed — please update your payment method',
    html: html(
      isLast ? 'Final payment notice' : 'Payment failed',
      `
      <p>${isLast
        ? 'This is our final notice. Your Agorio Pro subscription will be suspended unless you update your payment method immediately.'
        : `We couldn't process your payment (attempt ${attempt} of 3). Please update your payment method to keep your license active.`
      }</p>
      <p style="margin-top:20px;">
        <a href="${BILLING_URL}" style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Update Payment Method →</a>
      </p>
    `
    ),
  });
}

export async function sendPaymentRecoveredEmail(to: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "You're back on Agorio Pro",
    html: html("You're back!", `
      <p>Your payment was processed successfully. Your Agorio Pro license is active again — no further action needed.</p>
      <p><a href="${DASHBOARD_URL}" style="color:#0891b2;">View Dashboard →</a></p>
    `),
  });
}

export async function sendCancellationScheduledEmail(to: string, endsAt: number | null) {
  const endDate = endsAt
    ? new Date(endsAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'the end of your billing period';
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Your Agorio Pro subscription is scheduled to cancel',
    html: html('Cancellation scheduled', `
      <p>Your subscription is set to cancel. You'll retain full access until <strong>${endDate}</strong>.</p>
      <p>Changed your mind? You can reactivate at any time from your billing portal.</p>
      <p style="margin-top:20px;">
        <a href="${BILLING_URL}" style="color:#0891b2;">Manage Subscription →</a>
      </p>
    `),
  });
}

export async function sendCancellationReversedEmail(to: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Cancellation removed — you're staying",
    html: html("You're staying!", `
      <p>Your scheduled cancellation has been removed. Your Agorio Pro subscription will continue to renew as normal.</p>
      <p><a href="${DASHBOARD_URL}" style="color:#0891b2;">View Dashboard →</a></p>
    `),
  });
}

export async function sendOffboardingEmail(to: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Agorio Pro subscription ended',
    html: html('Subscription ended', `
      <p>Your Agorio Pro subscription has ended. Your license key is no longer active.</p>
      <p>If you ever want to come back, you can resubscribe at any time.</p>
      <p style="margin-top:20px;">
        <a href="https://agorio.dev/pricing" style="color:#0891b2;">View Plans →</a>
      </p>
      <p style="margin-top:16px;color:#6b7280;font-size:14px;">Thanks for being a customer — we appreciate it.</p>
    `),
  });
}

export async function sendDisputeAlertEmail(disputeId: string, amount: number, reason: string) {
  return resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `DISPUTE FILED — ${disputeId}`,
    html: html('Chargeback filed', `
      <p style="color:#dc2626;font-weight:600;">A chargeback has been filed against your Stripe account.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Dispute ID</td><td style="padding:8px 0;font-family:monospace;">${disputeId}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Amount</td><td style="padding:8px 0;">$${(amount / 100).toFixed(2)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Reason</td><td style="padding:8px 0;">${reason}</td></tr>
      </table>
      <p style="margin-top:20px;">
        <a href="https://dashboard.stripe.com/disputes/${disputeId}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Respond in Stripe →</a>
      </p>
    `),
  });
}
