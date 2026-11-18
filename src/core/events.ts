import {asc, desc, gt} from 'drizzle-orm';
import {getDb, schema} from './db/client';

/**
 * The append-only event log. Any process (the server, the CLI, the job worker) writes here; the server tails it
 * and streams it to the UI over SSE, so processes need no channel between them.
 */

const {events} = schema;

export function emitEvent(studyId: number | null, type: string, payload: Record<string, unknown> = {}): void {
  getDb().insert(events).values({studyId, type, payload, createdAt: new Date()}).run();
}

export function eventsAfter(lastId: number, limit = 200) {
  return getDb().select().from(events).where(gt(events.id, lastId)).orderBy(asc(events.id)).limit(limit).all();
}

export function lastEventId(): number {
  const row = getDb().select({id: events.id}).from(events).orderBy(desc(events.id)).limit(1).get();
  return row?.id ?? 0;
}
