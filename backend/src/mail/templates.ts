export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const layout = (body: string) => `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:560px;margin:auto;padding:24px">
${body}
<p style="color:#777;font-size:12px;margin-top:32px">LyricsFlip</p>
</body></html>`;

export const templates = {
  passwordReset(params: { resetUrl: string; ttlMinutes: number }): RenderedEmail {
    const url = escapeHtml(params.resetUrl);
    return {
      subject: 'Reset your LyricsFlip password',
      text:
        `Someone asked to reset the password for your LyricsFlip account.\n\n` +
        `Open this link to choose a new password (valid for ${params.ttlMinutes} minutes, one use only):\n` +
        `${params.resetUrl}\n\n` +
        `If you didn't ask for this, you can ignore this email.`,
      html: layout(
        `<h2>Reset your password</h2>
<p>Someone asked to reset the password for your LyricsFlip account.</p>
<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#6b21a8;color:#fff;border-radius:6px;text-decoration:none">Choose a new password</a></p>
<p>This link works once and expires in ${params.ttlMinutes} minutes.</p>
<p>If you didn't ask for this, you can ignore this email.</p>`,
      ),
    };
  },

  notification(params: { title: string; message: string }): RenderedEmail {
    return {
      subject: params.title,
      text: params.message,
      html: layout(`<h2>${escapeHtml(params.title)}</h2><p>${escapeHtml(params.message)}</p>`),
    };
  },
};

export type TemplateName = keyof typeof templates;
export type TemplateParams<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
