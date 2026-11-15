import type {FastifyInstance} from 'fastify';
import type {ServerResponse} from 'node:http';
import {eventsAfter, lastEventId} from '../core/bridge/core';

/**
 * Event streaming to the UI (SSE). The server follows the events table in SQLite instead of a channel between processes:
 * an event written by any process (a Claude session's CLI, the MCP server, the collection worker) reaches the UI in under a second.
 */

const POLL_MS = 600;
const HEARTBEAT_MS = 20_000;

const clients = new Set<ServerResponse>();
let cursor = 0;
let poller: NodeJS.Timeout | undefined;
let heartbeat: NodeJS.Timeout | undefined;

function send(res: ServerResponse, chunk: string): void {
  if (!res.writableEnded) res.write(chunk);
}

function tick(): void {
  let rows;
  try {
    rows = eventsAfter(cursor);
  } catch {
    return; // The database is busy for a moment: we try again on the next cycle.
  }
  for (const row of rows) {
    cursor = row.id;
    const data = JSON.stringify({id: row.id, studyId: row.studyId, type: row.type, payload: row.payload, at: row.createdAt});
    for (const res of clients) send(res, `id: ${row.id}\nevent: rasd\ndata: ${data}\n\n`);
  }
}

function start(): void {
  if (poller) return;
  cursor = lastEventId();
  poller = setInterval(tick, POLL_MS);
  heartbeat = setInterval(() => {
    for (const res of clients) send(res, ': ping\n\n');
  }, HEARTBEAT_MS);
}

function stop(): void {
  if (clients.size > 0) return;
  clearInterval(poller);
  clearInterval(heartbeat);
  poller = undefined;
  heartbeat = undefined;
}

export function attachEventStream(app: FastifyInstance): void {
  app.get('/api/events', (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    send(res, 'retry: 2000\n\n');
    clients.add(res);
    start();
    request.raw.on('close', () => {
      clients.delete(res);
      stop();
    });
  });

  app.addHook('onClose', async () => {
    for (const res of clients) res.end();
    clients.clear();
    stop();
  });
}
