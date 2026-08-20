import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { buildDocsRouter } from '../src/http/docs.js';

const app = express().use(buildDocsRouter());

describe('OpenAPI documentation endpoints', () => {
  it('serves the checked-in OpenAPI YAML contract', async () => {
    const response = await dispatchGet('/openapi.yaml');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/yaml');
    expect(response.body).toContain('openapi: 3.1.0');
    expect(response.body).toContain('/api/v1/tasks/{taskId}/transitions:');
  });

  it('redirects the docs root to the Swagger UI document', async () => {
    const response = await dispatchGet('/api-docs');
    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('/api-docs/');
  });

  it('serves Swagger UI HTML backed by local assets and the raw contract', async () => {
    const response = await dispatchGet('/api-docs/');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('/api-docs/assets/swagger-ui.css');
    expect(response.body).toContain('/api-docs/swagger-init.js');
  });

  it('serves a Swagger UI initializer pointing at the raw contract', async () => {
    const response = await dispatchGet('/api-docs/swagger-init.js');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.body).toContain("url: '/openapi.yaml'");
    expect(response.body).toContain("dom_id: '#swagger-ui'");
  });
});

async function dispatchGet(path: string): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const request = new IncomingMessage(socket);
    request.method = 'GET';
    request.url = path;
    request.headers = { host: '127.0.0.1' };

    const response = new ServerResponse(request);
    const chunks: Buffer[] = [];

    response.write = ((chunk: unknown, encodingOrCallback?: BufferEncoding | (() => void)) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      if (typeof encodingOrCallback === 'function') encodingOrCallback();
      return true;
    }) as typeof response.write;

    response.end = ((
      chunk?: unknown,
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void,
    ) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      if (typeof encodingOrCallback === 'function') encodingOrCallback();
      if (callback) callback();
      response.emit('finish');
      return response;
    }) as typeof response.end;

    response.once('finish', () => {
      const headers = Object.fromEntries(
        Object.entries(response.getHeaders()).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : String(value),
        ]),
      );
      resolve({
        statusCode: response.statusCode,
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
    });

    app.handle(request, response, (error) => {
      if (error) reject(error);
    });
  });
}
