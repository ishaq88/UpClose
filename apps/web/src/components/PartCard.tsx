import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from 'react';
import type { PartState, PartSummary } from '../api/client';
import { formatBytes, normalizeVideoType } from '../capture/media';
import { qualityHints, readVideoMetadata, type QualityHint } from '../capture/quality';
import type { GuideStep } from '../capture/guide';
import { MAX_CLIP_BYTES, MAX_RECORDING_SECONDS } from '../config';
import type { UiError } from '../errors';
import type { LocalUpload } from '../upload/useUploads';
import type { UploadContentType, UploadRecord } from '../upload/multipart';
import { describeReason } from '../progress/reasons';
import { CameraRecorder } from './CameraRecorder';
import { GuideDiagram } from './GuideDiagram';

/** Plain-language server states. Nothing here is a client-invented status. */
export const STATE_LABEL: Record<PartState, string> = {
  pending: 'Not filmed yet',
  uploading: 'Uploading',
  uploaded: 'Uploaded, waiting for processing',
  processing: 'Processing',
  processed: 'Processed',
  failed: 'Failed',
  skipped: 'Skipped',
};

interface Draft {
  file: File;
  contentType: UploadContentType | null;
  hints: QualityHint[] | null;
  tooLarge: boolean;
  previewUrl: string | null;
}

export interface PartCardProps {
  guide: GuideStep;
  part: PartSummary;
  expanded: boolean;
  onToggle: () => void;
  local: LocalUpload | undefined;
  record: UploadRecord | undefined;
  /** An in-memory copy of the file exists in this tab (so "Try again" needs no reselection). */
  hasFile: boolean;
  sessionCapturing: boolean;
  actionError: UiError | undefined;
  onStart: (file: File, contentType: UploadContentType) => void;
  onRetry: () => void;
  onResumeWith: (file: File) => void;
  onRetake: () => void;
  /** Abort an attempt this tab has no record of, using the server-reported active upload id. */
  onDiscardStranded: () => void;
  onSkip: () => void;
  onDismissError: () => void;
}

export function PartCard(props: PartCardProps): ReactElement {
  const { guide, part, expanded, onToggle, local } = props;
  const headingId = `part-${part.part_no}-heading`;
  const bodyId = `part-${part.part_no}-body`;
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={headingId} className="text-base font-semibold">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-sm text-white" aria-hidden="true">{part.part_no}</span>
          Step {part.part_no} of 8: {guide.title}
        </h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chipClass(part.state)}`} data-testid={`state-${part.part_no}`}>
          {local && local.phase !== 'failed' ? 'Uploading from this tab' : STATE_LABEL[part.state]}
        </span>
      </div>
      {part.state === 'failed' && part.reason && (
        <p className="mt-2 text-sm text-red-800">{describeReason(part.reason)}</p>
      )}
      {part.state === 'skipped' && <p className="mt-2 text-sm text-stone-600">This zone was skipped and will not be assessed. Its report coverage will say so.</p>}
      <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle} className="btn-secondary mt-3">
        {expanded ? 'Hide guide' : 'Show guide'}
      </button>
      <div id={bodyId} hidden={!expanded} className="mt-4">
        {expanded && <GuideBlock guide={guide} />}
      </div>
      {(expanded || local !== undefined || part.state === 'uploading') && (
        <div className="mt-4"><Actions {...props} /></div>
      )}
    </li>
  );
}

export function chipClass(state: PartState): string {
  switch (state) {
    case 'processed': return 'bg-teal-100 text-teal-900';
    case 'failed': return 'bg-red-100 text-red-900';
    case 'skipped': return 'bg-stone-200 text-stone-800';
    case 'uploading': return 'bg-sky-100 text-sky-900';
    case 'pending': return 'bg-stone-100 text-stone-800';
    default: return 'bg-amber-100 text-amber-900';
  }
}

function GuideBlock({ guide }: { guide: GuideStep }): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
      <GuideDiagram partNo={guide.partNo} />
      <div>
        <p className="font-medium">{guide.goal}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-700">
          {guide.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <p className="mt-2 text-sm text-stone-600">Suggested pace: about {guide.targetSeconds} seconds.</p>
        {guide.prototypeNote && <p className="mt-2 text-sm text-stone-600">{guide.prototypeNote}</p>}
      </div>
    </div>
  );
}

function Actions(props: PartCardProps): ReactElement | null {
  const { part, local, record, sessionCapturing } = props;
  if (!sessionCapturing && part.state === 'pending') return null;
  const busy = local !== undefined && local.phase !== 'failed';
  return (
    <div className="space-y-3">
      {props.actionError && <ErrorNotice error={props.actionError} onDismiss={props.onDismissError} />}
      {local?.phase === 'failed' && local.error && <ErrorNotice error={local.error} onDismiss={props.onDismissError} />}
      {busy && <UploadProgress local={local} onCancel={props.onRetake} />}
      {local?.phase === 'failed' && <FailedControls {...props} />}
      {!local && part.state === 'pending' && props.expanded && <CaptureControls {...props} />}
      {!local && part.state === 'uploading' && <InterruptedControls {...props} record={record} />}
      {!local && (part.state === 'uploaded' || part.state === 'processing' || part.state === 'processed') && (
        <p className="text-sm text-stone-600">Your video was accepted. Replacing an accepted clip is not supported in this session; use a new session to start over.</p>
      )}
    </div>
  );
}

export function ErrorNotice({ error, onDismiss }: { error: UiError; onDismiss?: () => void }): ReactElement {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-semibold">{error.title}</p>
      <p className="mt-1">{error.message}</p>
      {onDismiss && error.action !== 'new_session' && <button type="button" onClick={onDismiss} className="mt-2 underline">Dismiss</button>}
    </div>
  );
}

function UploadProgress({ local, onCancel }: { local: LocalUpload; onCancel: () => void }): ReactElement {
  const progress = local.progress;
  const percent = progress && progress.totalBytes > 0 ? Math.round((progress.uploadedBytes / progress.totalBytes) * 100) : 0;
  const label = local.phase === 'completing' ? 'Finishing upload...' : local.phase === 'preparing' ? 'Preparing upload...' : `Uploading... ${percent}%`;
  return (
    <div className="space-y-2" role="status">
      <label className="block text-sm font-medium">
        {label}
        <progress className="mt-1 block h-3 w-full" max={100} value={percent} aria-label="Upload progress" />
      </label>
      <p className="text-xs text-stone-600">Keep this tab open until the upload finishes.</p>
      <button type="button" onClick={onCancel} className="btn-secondary">Cancel and retake</button>
    </div>
  );
}

function FailedControls(props: PartCardProps): ReactElement {
  const { record, hasFile } = props;
  return (
    <div className="space-y-2">
      {hasFile ? (
        <button type="button" onClick={props.onRetry} className="btn-primary">Try again</button>
      ) : record ? (
        <ReselectFile label="Select the same video to continue" onFile={props.onResumeWith} />
      ) : null}
      <div><button type="button" onClick={props.onRetake} className="btn-secondary">Start this zone over</button></div>
    </div>
  );
}

function InterruptedControls({ record, ...props }: PartCardProps): ReactElement {
  if (!record) {
    return (
      <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <p>
          This zone has an upload in progress that this tab has no details for (for example the browser lost its saved state), so it cannot be continued here.
          Discard it to free this zone, then film or choose the video again.
        </p>
        {props.part.active_upload_id
          ? <button type="button" onClick={props.onDiscardStranded} className="btn-secondary">Discard stranded upload</button>
          : <p>The service did not report an upload to discard; unfinished uploads are closed automatically after 24 hours.</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <p>
        An upload for this zone was interrupted ({formatBytes(record.size)}{record.fileName ? `, ${record.fileName}` : ''}). To continue, select the same video file again; only missing pieces are sent. A clip recorded in the browser cannot be recovered after a reload, so use Start this zone over.
      </p>
      <ReselectFile label="Select the same video to continue" onFile={props.onResumeWith} />
      <div><button type="button" onClick={props.onRetake} className="btn-secondary">Start this zone over</button></div>
    </div>
  );
}

function ReselectFile({ label, onFile }: { label: string; onFile: (file: File) => void }): ReactElement {
  return (
    <label className="btn-secondary cursor-pointer">
      {label}
      <input type="file" accept="video/*" className="sr-only" onChange={(event) => pickFile(event, onFile)} />
    </label>
  );
}

function pickFile(event: ChangeEvent<HTMLInputElement>, onFile: (file: File) => void): void {
  const file = event.target.files?.[0];
  event.target.value = ''; // allow choosing the same file again
  if (file) onFile(file);
}

function CaptureControls(props: PartCardProps): ReactElement {
  const { part, guide } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);

  const accept = (file: File, recordedSeconds: number | null): void => {
    const tooLarge = file.size > MAX_CLIP_BYTES;
    const contentType = normalizeVideoType(file);
    const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
    setDraft({ file, contentType, hints: null, tooLarge, previewUrl });
    void readVideoMetadata(file).then((meta) => {
      setDraft((current) => (current?.file === file ? { ...current, hints: qualityHints(meta, recordedSeconds) } : current));
    });
  };

  const discard = (): void => {
    setDraft((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  };

  useEffect(() => () => { if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl); }, [draft?.previewUrl]);

  const canUpload = useMemo(() => draft !== null && draft.contentType !== null && !draft.tooLarge, [draft]);

  if (draft) {
    return (
      <div className="space-y-3 rounded-lg border border-stone-200 p-3">
        <p className="text-sm font-medium">Review your clip for {guide.title}</p>
        {draft.previewUrl && <video src={draft.previewUrl} controls muted playsInline className="aspect-video w-full rounded-lg bg-stone-900" aria-label="Preview of your clip" />}
        <p className="text-sm text-stone-600">{formatBytes(draft.file.size)}</p>
        {draft.tooLarge && <p role="alert" className="text-sm text-red-800">This clip is larger than {MAX_CLIP_BYTES / (1024 * 1024)} MiB, which is the limit for one clip. Retake a shorter one.</p>}
        {draft.contentType === null && <p role="alert" className="text-sm text-red-800">This file type is not supported. Use an MP4, MOV or WebM video.</p>}
        <HintList hints={draft.hints} />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={!canUpload}
            onClick={() => { if (draft.contentType) { props.onStart(draft.file, draft.contentType); discard(); } }}>
            Upload this clip
          </button>
          <button type="button" className="btn-secondary" onClick={discard}>Retake</button>
        </div>
        <p className="text-xs text-stone-600">Quality hints are advice only. You can keep any clip; weak footage may be marked as not fully assessed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CameraRecorder partNo={part.part_no} maxSeconds={MAX_RECORDING_SECONDS} onRecorded={(file, seconds) => accept(file, seconds)} />
      <div className="flex flex-wrap gap-3">
        <label className="btn-secondary cursor-pointer">
          Record with phone camera app
          <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(event) => pickFile(event, (file) => accept(file, null))} />
        </label>
        <label className="btn-secondary cursor-pointer">
          Choose a video from this device
          <input type="file" accept="video/*" className="sr-only" onChange={(event) => pickFile(event, (file) => accept(file, null))} />
        </label>
      </div>
      {confirmSkip ? (
        <div className="rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">
          <p>Skip {guide.title}? Skipping cannot be undone in this session, and the report will show this zone as not assessed.</p>
          <div className="mt-2 flex gap-3">
            <button type="button" className="btn-primary" onClick={() => { setConfirmSkip(false); props.onSkip(); }}>Yes, skip {guide.title}</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmSkip(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setConfirmSkip(true)}>Skip this zone</button>
      )}
    </div>
  );
}

function HintList({ hints }: { hints: QualityHint[] | null }): ReactElement {
  if (hints === null) return <p className="text-sm text-stone-600" role="status">Checking video details...</p>;
  if (hints.length === 0) return <p className="text-sm text-stone-600">No obvious length or size problems. Blur and lighting are checked after upload.</p>;
  return (
    <ul className="space-y-1" aria-label="Quality hints">
      {hints.map((hint) => (
        <li key={hint.id} className={`rounded-lg p-2 text-sm ${hint.severity === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-stone-700'}`}>{hint.message}</li>
      ))}
    </ul>
  );
}
