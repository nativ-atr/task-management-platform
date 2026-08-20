import { createServer } from 'node:http';
import { createApp } from './app.js';
import { compose } from './composition-root.js';
import { loadEnv } from './config/env.js';
import { AppDataSource } from './infrastructure/data-source.js';

const env = loadEnv();
await AppDataSource.initialize();
const service = compose(AppDataSource, env);
const app = createApp(service, AppDataSource, env);
const server = createServer(app);

server.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: 'info', message: 'server_started', port: env.PORT }));
});

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: 'info', message: 'shutdown_started', signal }));
  server.close(async () => {
    await AppDataSource.destroy();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
