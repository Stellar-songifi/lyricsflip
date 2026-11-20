import { DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { promises as fs } from 'fs';
import * as path from 'path';

export const swaggerConfig = new DocumentBuilder()
  .setTitle('Songify LyricFlip API')
  .setDescription('API documentation for the Songify LyricFlip backend')
  .setVersion('1.0')
  .addTag('lyricflip')
  .addTag('songs')
  .addTag('users')
  .addTag('players')
  .addTag('leaderboard')
  .addTag('indexer')
  .addTag('admin')
  .setContact(
    'Songify Support',
    'https://songify.com/support',
    'support@songify.com',
  )
  .setLicense('MIT License', 'https://opensource.org/licenses/MIT')
  .setTermsOfService('https://songify.com/terms')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
    'access-token',
  )
  .build();

export const swaggerCustomOptions: SwaggerCustomOptions = {
  swaggerOptions: { persistAuthorization: true },
  customSiteTitle: 'Songify API Docs',
};

/**
 * Builds the OpenAPI document from a bootstrapped Nest application.
 * Used both by the runtime Swagger UI setup and by the build script that
 * exports `openapi.json` for the frontend type generator.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, swaggerConfig);
}

/**
 * Writes the OpenAPI document to disk as JSON.
 * Defaults to `openapi.json` at the backend project root.
 */
export async function writeOpenApiDocument(
  app: INestApplication,
  outputPath: string = path.resolve(process.cwd(), 'openapi.json'),
): Promise<string> {
  const document = buildOpenApiDocument(app);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(document, null, 2), 'utf8');
  return outputPath;
}
