import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Agorio <admin@agorio.dev>';
const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL ?? 'https://cloud.agorio.dev';

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
      Agorio Cloud &middot; <a href="https://agorio.dev" style="color:#6b7280;">agorio.dev</a>
    </div>
  </div>
</body>
</html>`;
}

export async function sendInviteEmail(params: {
  to:           string;
  inviterEmail: string;
  orgName:      string;
  role:         string;
}) {
  const { to, inviterEmail, orgName, role } = params;
  const signInUrl = `${CLOUD_URL}/auth/sign-in?email=${encodeURIComponent(to)}`;

  return resend.emails.send({
    from: FROM,
    to,
    subject: `You've been invited to ${orgName} on Agorio Cloud`,
    html: html('Team invitation', `
      <p><strong>${inviterEmail}</strong> invited you to join <strong>${orgName}</strong> on Agorio Cloud as <strong>${role}</strong>.</p>
      <p>Sign in with this email address to accept:</p>
      <p style="margin-top:20px;">
        <a href="${signInUrl}" style="background:#00f0ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in to Agorio Cloud →</a>
      </p>
      <p style="margin-top:16px;color:#6b7280;font-size:14px;">If you weren't expecting this, you can safely ignore the email — no account is created until you sign in.</p>
    `),
  });
}
