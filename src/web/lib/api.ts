import {useCallback, useEffect, useRef, useState} from 'react';
import type {FindingRow, StudyRow} from '../../core/db/schema';

/** Types of the local server's responses (Date columns arrive as ISO strings after JSON). */
type Json<T> = {[K in keyof T]: T[K] extends Date ? string : T[K]};
export type Study = Json<StudyRow>;
export type Finding = Json<FindingRow>;
export type StudyListItem = Study & {findingCount: number};
export interface EvidenceItem {
  kind: string;
  label: string;
  url: string | null;
  media: string[];
}
export interface StudyDetail {
  study: Study;
  findings: Finding[];
  evidence: Record<string, EvidenceItem>;
  packageStats: {items: number; images: number} | null;
}

export class ApiError extends Error {
  constructor(
    readonly kind: 'network' | 'not_found' | 'server',
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {signal, headers: {Accept: 'application/json'}});
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('network', 'network');
  }
  if (response.status === 404) throw new ApiError('not_found', 'not_found');
  if (!response.ok) throw new ApiError(response.status >= 502 ? 'network' : 'server', `http_${response.status}`);
  return (await response.json()) as T;
}

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | undefined;
  isLoading: boolean;
  reload: () => void;
}

/** A simple fetch with manual reload; enough for a local single-user app. A null url fetches nothing. */
export function useResource<T>(url: string | null): Resource<T> {
  const [state, setState] = useState<{data?: T; error?: ApiError; isLoading: boolean}>({isLoading: url !== null});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(n => n + 1), []);

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    fetchJson<T>(url, controller.signal)
      .then(data => setState({data, isLoading: false}))
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return;
        setState(prev => ({
          data: prev.data,
          error: error instanceof ApiError ? error : new ApiError('server', 'unknown'),
          isLoading: false,
        }));
      });
    return () => controller.abort();
  }, [url, tick]);

  return {data: state.data, error: state.error, isLoading: state.isLoading, reload};
}

export interface RasdEvent {
  id: number;
  studyId: number | null;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * One shared connection to the event stream (SSE) for the whole page; every hook subscribes to it.
 * The browser reconnects automatically when the connection drops.
 */
const listeners = new Set<(event: RasdEvent) => void>();
const connectionListeners = new Set<(connected: boolean) => void>();
let source: EventSource | undefined;
let connected = false;

function setConnected(value: boolean): void {
  connected = value;
  for (const listener of connectionListeners) listener(value);
}

function subscribe(onEvent: (event: RasdEvent) => void, onConnection: (connected: boolean) => void): () => void {
  listeners.add(onEvent);
  connectionListeners.add(onConnection);
  if (!source) {
    source = new EventSource('/api/events');
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('rasd', message => {
      let event: RasdEvent;
      try {
        event = JSON.parse((message as MessageEvent<string>).data) as RasdEvent;
      } catch {
        return; // corrupt event: ignore it and keep the stream
      }
      for (const listener of listeners) listener(event);
    });
  }
  onConnection(connected);
  return () => {
    listeners.delete(onEvent);
    connectionListeners.delete(onConnection);
    if (listeners.size === 0) {
      source?.close();
      source = undefined;
      setConnected(false);
    }
  };
}

/** Calls `onEvent` for every event; returns whether the stream is connected, so the UI can say "live" truthfully. */
export function useEventStream(onEvent: (event: RasdEvent) => void): boolean {
  const [isConnected, setIsConnected] = useState(connected);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => subscribe(event => handler.current(event), setIsConnected), []);

  return isConnected;
}

// ── Phase 1 types (type-only imports from the server code: nothing of it is bundled) ──
export type {ProfileView, ProfileAccount} from '../../core/business';
export type {JobView} from '../../core/jobs/queue';
export type {SessionView} from '../../core/sessions';
export type {BridgeStatus, Settings} from '../../core/settings';

export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

export type SendResult<T> =
  | {ok: true; data: T}
  | {ok: false; message: string; issues: FieldIssue[]; status: number};

/**
 * Sends a change to the local server. Never throws: a failure comes back with the server's Arabic message
 * (or a network message) and, for forms, the field issues.
 */
export async function sendJson<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<SendResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? {Accept: 'application/json'} : {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return {ok: false, message: '', issues: [], status: 0};
  }
  if (response.status === 204) return {ok: true, data: undefined as T};
  const payload = (await response.json().catch(() => ({}))) as {message?: string; issues?: FieldIssue[]};
  if (!response.ok) return {ok: false, message: payload.message ?? '', issues: payload.issues ?? [], status: response.status};
  return {ok: true, data: payload as T};
}

/** The message of the issue at exactly this path, if any (for a field's error status). */
export function issueAt(issues: FieldIssue[], ...path: (string | number)[]): string | undefined {
  return issues.find(i => i.path.length === path.length && i.path.every((p, n) => p === path[n]))?.message;
}
