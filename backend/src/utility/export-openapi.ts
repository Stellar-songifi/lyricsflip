/**
 * CLI script: exports the NestJS OpenAPI document to backend/openapi.json.
 *
 * Run from the backend/ directory:
 *   npm run openapi:export
 *
 * The output path is always <backend-root>/openapi.json so that:
 *  - The backend CI `openapi` job can verify it is committed and up to date.
 *  - The frontend can read it via ../backend/openapi.json and generate
 *    src/services/generated/api.ts with `npm run generate:api`.
 *
 * If the spec changes without regenerating, running `npm run openapi:check`
 * (or the equivalent frontend CI step) will fail with a git diff and these
 * instructions:
 *
 *   cd backend
 *   npm run openapi:export
 *   npm run openapi:generate
 *   # then commit backend/openapi.json and frontend/src/services/generated/api.ts
 */
import 'tsconfig-paths/register';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp } from '../config/app-setup';
import { buildOpenApiDocument } from './Swagger';
import { promises as fs } from 'fs';

async function main() {
  // Suppress noisy NestJS boot logs during the export run.
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();

  // Always write to <backend-root>/openapi.json.
  // process.cwd() is the backend/ directory when invoked via `npm run`.
  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  const document = buildOpenApiDocument(app);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(document, null, 2), 'utf8');

  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${outputPath}`);

  // Force exit: some providers (ioredis, scheduled tasks) keep the event
  // loop alive even after app.close().  The spec has been written so a
  // clean exit is safe here.
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to export OpenAPI spec:', err);
  process.exit(1);
});
