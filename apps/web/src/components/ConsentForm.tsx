import { useState, type FormEvent, type ReactElement } from 'react';
import type { Api, CaptureMode } from '../api/client';
import { CONSENT_VERSION, MAX_LISTING_CHARS } from '../config';
import { describeError, type UiError } from '../errors';
import { ErrorNotice } from './PartCard';

interface Props {
  api: Api;
  onCreated: (session: { sessionId: string; token: string }) => void;
}

export function ConsentForm({ api, onCreated }: Props): ReactElement {
  const [captureMode, setCaptureMode] = useState<CaptureMode>('guided');
  const [consent, setConsent] = useState(false);
  const [listing, setListing] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSession(CONSENT_VERSION, listing.trim() === '' ? null : listing, captureMode);
      onCreated({ sessionId: created.session_id, token: created.session_token });
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="start-heading" className="max-w-2xl space-y-6">
      <div>
        <h2 id="start-heading" className="text-2xl font-semibold tracking-tight">Start a capture session</h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Choose guided clips or one continuous video. Partial footage is welcome; areas not shown or not identifiable remain unassessed.
        </p>
      </div>
      <form onSubmit={(event) => { void submit(event); }} className="space-y-5" noValidate>
        <fieldset className="space-y-3 rounded-lg border border-stone-300 bg-white p-4">
          <legend className="px-1 font-semibold">How would you like to capture?</legend>
          <label className="flex items-start gap-3"><input type="radio" name="capture-mode" value="guided" checked={captureMode === 'guided'} onChange={() => setCaptureMode('guided')} /><span><strong>Guided clips</strong><br />Short clips for individual areas. Skip any area.</span></label>
          <label className="flex items-start gap-3"><input type="radio" name="capture-mode" value="single_video" checked={captureMode === 'single_video'} onChange={() => setCaptureMode('single_video')} /><span><strong>One video</strong><br />Record or upload a walkaround or partial video, up to 3 minutes.</span></label>
          <p className="text-sm text-stone-600">Real AI analysis and automatic area recognition are not connected. Current findings are synthetic test data, not an assessment of your car.</p>
        </fieldset>
        <div>
          <label htmlFor="listing" className="block text-sm font-medium">Seller listing text (optional)</label>
          <textarea id="listing" value={listing} onChange={(event) => setListing(event.target.value)} maxLength={MAX_LISTING_CHARS} rows={4}
            className="mt-1 w-full rounded-lg border border-stone-400 p-3 text-base" aria-describedby="listing-help" />
          <p id="listing-help" className="mt-1 text-xs text-stone-600">Plain text only, up to {MAX_LISTING_CHARS.toLocaleString()} characters. Avoid personal details.</p>
        </div>
        <fieldset className="rounded-lg border border-stone-300 bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Consent</legend>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
            <li>Videos I record or select are uploaded to this prototype for processing. Current findings are synthetic test data.</li>
            <li>I have permission to record or upload this footage and will avoid filming people, number plates and private documents.</li>
            <li>Results are a screening aid only. They do not replace an inspection by a qualified mechanic.</li>
            <li>I can request deletion from this session. Closing the tab may lose my access to those controls.</li>
          </ul>
          <div className="mt-3 flex items-start gap-3">
            <input id="consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5" />
            <label htmlFor="consent" className="text-sm font-medium">I understand and agree.</label>
          </div>
        </fieldset>
        <div className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          Your session lives in this browser tab only. Reloading this tab is fine, but closing it may lose access to the session and its uploads. There is no recovery from another device.
        </div>
        {error && <ErrorNotice error={error} />}
        <button type="submit" disabled={!consent || busy} className="btn-primary" aria-describedby="consent-hint">
          {busy ? 'Starting...' : 'Start session'}
        </button>
        <p id="consent-hint" className="text-xs text-stone-600">{consent ? '' : 'Agree above to enable the button.'}</p>
      </form>
    </section>
  );
}
