import { OwnerReport } from './OwnerReport';
import { useState, type ReactElement } from 'react';
import { ApiError, type Api, type ProgressResponse } from '../api/client';
import { describeError, type UiError } from '../errors';
import { zoneTitle } from '../progress/labels';
import { describeReason } from '../progress/reasons';
import { ErrorNotice, STATE_LABEL, chipClass } from './PartCard';

export interface ProgressPanelProps {
  api: Api;
  /** Latest owner progress from the single poll, or null before the first read. */
  progress: ProgressResponse | null;
  /** Re-read server state now (backs off internally if the service is limiting requests). */
  onRefresh: () => void;
  onUnauthorized: () => void;
  /** Injectable for tests; defaults to a full-page navigation. */
  navigate?: (url: string) => void;
}

/** Only an https URL (or http on localhost, for local development) is ever navigated to. */
export function isSafeCheckoutUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

function defaultNavigate(url: string): void {
  window.location.assign(url);
}

/** Server-reported processing state and authenticated owner report access. */
export function ProgressPanel({ api, progress, onRefresh, onUnauthorized, navigate = defaultNavigate }: ProgressPanelProps): ReactElement {
  return (
    <section aria-labelledby="progress-heading" className="space-y-5 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <h2 id="progress-heading" className="text-xl font-semibold">Processing and report</h2>
      <ZoneStatus progress={progress} />
      <ReportStatus api={api} progress={progress} onRefresh={onRefresh} onUnauthorized={onUnauthorized} navigate={navigate} />
    </section>
  );
}

function ZoneStatus({ progress }: { progress: ProgressResponse | null }): ReactElement {
  if (!progress) return <p role="status" className="text-sm text-stone-700">Processing status has not been loaded yet. A missing status is not a clean result.</p>;
  return (
    <ul className="space-y-2" aria-label="Processing status by zone">
      {progress.parts.map((part) => (
        <li key={part.id} className="text-sm" data-testid={`progress-part-${part.part_no}`}>
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${chipClass(part.state)}`}>
            {zoneTitle(part.zone)}: {STATE_LABEL[part.state]}
          </span>
          {part.state === 'failed' && <p className="mt-1 text-red-800" data-testid={`progress-reason-${part.part_no}`}>{describeReason(part.reason)}</p>}
        </li>
      ))}
    </ul>
  );
}

interface ReportStatusProps extends Pick<ProgressPanelProps, 'api' | 'onRefresh' | 'onUnauthorized'> {
  progress: ProgressResponse | null;
  navigate: (url: string) => void;
}

function ReportStatus({ api, progress, onRefresh, onUnauthorized, navigate }: ReportStatusProps): ReactElement {
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  if (!progress) return <p className="text-sm text-stone-700">The report state is not known yet.</p>;
  if (progress.state === 'capturing') return <p className="text-sm text-stone-700">Your report is created when you finish capture. Nothing is built until you choose Finish.</p>;
  const report = progress.report;
  if (report === null) return <p role="status" className="text-sm text-stone-700">Capture is finished. Your report is being prepared; this page keeps checking.</p>;
  if (report.state === 'building') return <p role="status" className="text-sm text-stone-700">Your report is being built. Zones are still processing in the background; this page keeps checking.</p>;
  if (report.state === 'failed') {
    return (
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        The report could not be built, so there is nothing to open or unlock. Zones listed as failed or skipped were not assessed, which is not a clean result.
      </p>
    );
  }

  const unlock = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createCheckout(report.slug);
      if (result.unlocked) {
        // Demo stand-in (DEMO_FREE_UNLOCK): server already granted the entitlement.
        setViewing(true);
        onRefresh();
        return;
      }
      const checkoutUrl = result.checkout_url ?? '';
      if (!isSafeCheckoutUrl(checkoutUrl)) {
        setError({ title: 'Checkout could not be opened', message: 'The service returned an address that cannot be opened safely. Nothing was charged. Try again later.' });
        return;
      }
      navigate(checkoutUrl);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.code === 'TOKEN_INVALID')) onUnauthorized();
      setError(describeError(caught));
      onRefresh(); // a 409 means the server's view of the report moved on
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-stone-800">Your report is ready.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={() => { setViewing(false); onRefresh(); }}>Refresh report status</button>
        <button type="button" className="btn-secondary" onClick={() => setViewing(!viewing)}>{viewing ? 'Close report' : report.unlocked ? 'Open your full report' : 'Open your free report'}</button>
        {!report.unlocked && <button type="button" className="btn-primary" disabled={busy} onClick={() => { void unlock(); }}>
          {busy ? 'Opening checkout...' : 'Unlock full report'}
        </button>}
        {report.unlocked && <p>Full report unlocked.</p>}
      </div>
      {viewing && <OwnerReport key={`${report.slug}:${report.unlocked}`} api={api} slug={report.slug} onUnauthorized={onUnauthorized} onRefresh={onRefresh} />}
      {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
      <p className="text-xs leading-relaxed text-stone-600">
        Payment is handled by our payment provider. Returning from checkout does not unlock anything by itself; the report unlocks only after the server verifies the payment.
      </p>
    </div>
  );
}
