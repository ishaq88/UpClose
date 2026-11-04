import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { createApi } from './api/client';
import { CheckoutReturn } from './components/CheckoutReturn';
import { CaptureFlow } from './components/CaptureFlow';
import { ConsentForm } from './components/ConsentForm';
import { clearSession, loadSession, saveSession, type StoredSession } from './session/storage';

/** Path-based switch; no router dependency. `pathname` is injectable for tests. */
export interface AppProps {
  pathname?: string;
}

export function App({ pathname }: AppProps = {}): ReactElement {
  const path = pathname ?? window.location.pathname;
  const onReturnPage = path === '/checkout/return' || path === '/checkout/return/';
  const [stored, setStored] = useState<StoredSession | null>(loadSession);
  const tokenRef = useRef<string | null>(stored?.token ?? null);
  const api = useMemo(() => createApi({ getToken: () => tokenRef.current }), []);

  const onCreated = useCallback((session: StoredSession) => {
    tokenRef.current = session.token;
    saveSession(session);
    setStored(session);
  }, []);

  const onNewSession = useCallback(() => {
    clearSession();
    tokenRef.current = null;
    setStored(null);
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <span className="text-xl font-bold tracking-tight">UpClose<span className="text-teal-700">.</span></span>
        <span className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium uppercase tracking-widest">Prototype</span>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        <h1 className="mb-6 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">A closer look before your next car.</h1>
        {onReturnPage
          ? <CheckoutReturn />
          : stored
          ? <CaptureFlow key={stored.sessionId} api={api} sessionId={stored.sessionId} onNewSession={onNewSession} />
          : <ConsentForm api={api} onCreated={onCreated} />}
        <p className="mt-10 text-sm leading-relaxed text-stone-500">
          Condition screening is intended to support a buying decision. It does not replace an in-person inspection by a qualified mechanic.
        </p>
      </main>
    </div>
  );
}
