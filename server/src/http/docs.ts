import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express, { type Router } from 'express';

const require = createRequire(import.meta.url);
const swaggerAssetsPath = path.dirname(require.resolve('swagger-ui-dist/package.json'));

const docsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Task Platform API Docs</title>
    <link rel="stylesheet" href="/api-docs/assets/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api-docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api-docs/assets/swagger-ui-standalone-preset.js"></script>
    <script src="/api-docs/swagger-init.js"></script>
  </body>
</html>`;

const swaggerInit = `window.addEventListener('load', () => {
  window.ui = SwaggerUIBundle({
    url: '/openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    layout: 'StandaloneLayout'
  });
});
`;

export function buildDocsRouter(): Router {
  const router = express.Router();
  const openApiPath = resolveOpenApiPath();

  router.get(/^\/api-docs$/, (_req, res) => res.redirect(301, '/api-docs/'));
  router.get('/api-docs/', (_req, res) => {
    res.type('html').send(docsHtml);
  });
  router.get('/api-docs/swagger-init.js', (_req, res) => {
    res.type('application/javascript').send(swaggerInit);
  });
  router.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml').sendFile(openApiPath);
  });
  router.use('/api-docs/assets', express.static(swaggerAssetsPath));

  return router;
}

function resolveOpenApiPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'docs/api/openapi.yaml'),
    path.resolve(process.cwd(), '../docs/api/openapi.yaml'),
    path.resolve(moduleDir, '../../../../docs/api/openapi.yaml'),
    path.resolve(moduleDir, '../../../../../docs/api/openapi.yaml'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to locate docs/api/openapi.yaml. Checked: ${candidates.join(', ')}`);
  }
  return found;
}
