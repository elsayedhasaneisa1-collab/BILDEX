export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your BUILDEX password",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#171717"><h1>Reset your password</h1><p>A password reset was requested for your BUILDEX account.</p><p><a href="${resetUrl}" style="display:inline-block;background:#ff4d1c;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">Reset password</a></p><p>This link expires in one hour and can only be used once. If you did not request it, ignore this email.</p></div>`,
      text: `Reset your BUILDEX password using this one-time link: ${resetUrl}. It expires in one hour.`,
    }),
    cache: "no-store",
  });
  return response.ok;
}
