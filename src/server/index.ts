import {buildServer} from './app';

/**
 * Rasd's local server. Listens on 127.0.0.1 only — nothing leaves the machine.
 * In development it serves the API only (the UI comes from Vite); with --prod it serves dist/web as well.
 */

const PORT = Number(process.env.RASD_PORT ?? 4310);
const HOST = '127.0.0.1';
const isProd = process.argv.includes('--prod');

const {app, worker} = await buildServer({prod: isProd});
await app.listen({port: PORT, host: HOST});
worker.start();
if (isProd) console.log(`رَصد يعمل على http://${HOST}:${PORT}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
