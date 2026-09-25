import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || undefined,
  pass: process.env.SMTP_PASS || undefined,
  from: process.env.MAIL_FROM ?? 'LyricsFlip <no-reply@lyricsflip.local>',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
}));
