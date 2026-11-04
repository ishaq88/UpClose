import { useEffect, useState, type ReactElement } from 'react';
import { ApiError, type Api } from '../api/client';
import { describeError, type UiError } from '../errors';
import { ErrorNotice } from './PartCard';

const FRAME_PATH = /^\/api\/v1\/reports\/[^/]+\/frames\/[0-9a-f-]{36}$/;

/** Defense in depth: opaque sandbox, no scripts/navigation/network, and no raw image fallback.
 * With preserveFrames, approved same-origin frame routes survive as data-frame-src
 * placeholders for token-authenticated hydration; anything else is withheld. */
export function ownerDocument(html: string, preserveFrames = false): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,base,link,meta,form,audio,video,source').forEach((node) => node.remove());
  doc.querySelectorAll('img,image').forEach((node) => {
    const src = node.getAttribute('src') ?? '';
    if (preserveFrames && node.tagName === 'IMG' && FRAME_PATH.test(src)) {
      node.setAttribute('data-frame-src', src);
      node.removeAttribute('src');
      return;
    }
    const message = doc.createElement('p');
    message.textContent = 'Evidence image withheld in this owner viewer.';
    node.replaceWith(message);
  });
  doc.querySelectorAll('*').forEach((node) => {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || ['href', 'xlink:href', 'src', 'srcset', 'action', 'formaction', 'target'].includes(attr.name)) node.removeAttribute(attr.name);
    }
  });
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = `default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src ${preserveFrames ? 'data:' : "'none'"}; base-uri 'none'; form-action 'none'`;
  doc.head.prepend(policy);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

/** Replace each preserved frame placeholder with its authenticated data URL.
 * A failed frame falls back to the withheld message; it never loads the raw route. */
export async function hydrateFrames(docHtml: string, fetchFrame: (path: string) => Promise<string>): Promise<string> {
  const doc = new DOMParser().parseFromString(docHtml, 'text/html');
  for (const img of [...doc.querySelectorAll('img[data-frame-src]')]) {
    const path = img.getAttribute('data-frame-src') ?? '';
    img.removeAttribute('data-frame-src');
    try {
      img.setAttribute('src', await fetchFrame(path));
    } catch {
      const message = doc.createElement('p');
      message.textContent = 'Evidence image withheld in this owner viewer.';
      img.replaceWith(message);
    }
  }
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

export function OwnerReport({ api, slug, onUnauthorized, onRefresh }: {
  api: Api; slug: string; onUnauthorized: () => void; onRefresh: () => void;
}): ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setHtml(null);
    setError(null);
    void api.getReportHtml(slug, controller.signal)
      .then((value) => hydrateFrames(ownerDocument(value, true), (path) => api.getFrameDataUrl(path, controller.signal)))
      .then((value) => { if (!controller.signal.aborted) setHtml(value); })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setHtml(null);
        if (caught instanceof ApiError && (caught.status === 401 || caught.status === 404)) onUnauthorized();
        setError(describeError(caught));
        onRefresh();
      });
    return () => controller.abort();
  }, [api, slug, attempt, onUnauthorized, onRefresh]);
  const downloadPdf = (): void => {
    setPdfNote(null);
    const printWindow = window.open('', '_blank');
    if (!printWindow || html === null) {
      setPdfNote('Allow pop-ups, then try Download PDF again. In the print dialog choose Save as PDF.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
  return <div className="space-y-3">
    <p className="text-sm">Private report. Only operator-approved evidence photos appear. Downloaded copies cannot be recalled.</p>
    {error ? <><ErrorNotice error={error} /><button type="button" className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>Retry report</button></> : html === null ? <p role="status">Loading private report...</p> :
      <><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={downloadPdf}>Download PDF</button></div>
        {pdfNote ? <p role="status">{pdfNote}</p> : null}
        <iframe title="Your private report" sandbox="" referrerPolicy="no-referrer" srcDoc={html} className="h-[70vh] w-full border border-stone-300" /></>}
  </div>;
}
