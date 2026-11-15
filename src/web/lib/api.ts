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

/** A simple fetch with manual reload; enough for a local single-user app. */
export function useResource<T>(url: string): Resource<T> {
  const [state, setState] = useState<{data?: T; error?: ApiError; isLoading: boolean}>({isLoading: true});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(n => n + 1), []);

  useEffect(() => {
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
 * Subscribes to the event stream (SSE). The browser reconnects automatically when the connection drops.
 * Returns the connection state so the UI can show "live updates" truthfully.
 */
export function useEventStream(onEvent: (event: RasdEvent) => void): boolean {
  const [isConnected, setIsConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onopen = () => setIsConnected(true);
    source.onerror = () => setIsConnected(false);
    source.addEventListener('rasd', message => {
      try {
        handler.current(JSON.parse((message as MessageEvent<string>).data) as RasdEvent);
      } catch {
        // Corrupt event: ignore it and do not stop the stream.
      }
    });
    return () => source.close();
  }, []);

  return isConnected;
}
