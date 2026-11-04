import { useCallback, useMemo, useState, type ReactElement } from 'react';
import type { Api, PartSummary } from '../api/client';
import { GUIDE_STEPS, guideFor } from '../capture/guide';
import { normalizeVideoType } from '../capture/media';
import { describeError, type UiError } from '../errors';
import { useSession } from '../session/useSession';
import { useSourceUpload } from '../upload/useSourceUpload';
import { SingleVideoCapture } from './SingleVideoCapture';
import { useUploads } from '../upload/useUploads';
import { ErrorNotice, PartCard, STATE_LABEL } from './PartCard';
import { Part1Slot } from './FreeVerdictCard';
import { ProgressPanel } from './ProgressPanel';

interface Props {
  api: Api;
  sessionId: string;
  /** Forget the stored session so the consent screen shows again. */
  onNewSession: () => void;
}

export function CaptureFlow({ api, sessionId, onNewSession }: Props): ReactElement {
  const { session, progress, error, unauthorized, refresh, markUnauthorized } = useSession(api, sessionId);
  const singleVideo = session?.capture_mode === 'single_video';
  const sourceUpload = useSourceUpload({ api, sessionId, enabled: singleVideo && session?.state !== 'deleting' && session?.state !== 'deleted' && !unauthorized, onChanged: refresh, onUnauthorized: markUnauthorized });
  const uploads = useUploads({ api, sessionId, onChanged: refresh, onUnauthorized: markUnauthorized });
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<UiError | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [actionErrors, setActionErrors] = useState<Record<number, UiError>>({});
  const [finishError, setFinishError] = useState<UiError | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const parts = useMemo(() => [...(session?.parts ?? [])].sort((a, b) => a.part_no - b.part_no), [session]);

  // Open the first pending step once, as soon as the server has told us which it is.
  if (!opened && parts.length > 0) {
    setOpened(true);
    setOpen(singleVideo ? null : parts.find((part) => part.state === 'pending')?.part_no ?? null);
  }

  const setPartError = useCallback((partNo: number, value: UiError | null) => {
    setActionErrors((current) => {
      const next = { ...current };
      if (value) next[partNo] = value;
      else delete next[partNo];
      return next;
    });
  }, []);

  const handleFailure = useCallback((caught: unknown, partNo: number | null): void => {
    const described = describeError(caught);
    if (described.action === 'new_session') markUnauthorized();
    if (partNo === null) setFinishError(described);
    else setPartError(partNo, described);
    refresh(); // a 409/404 means the server's view moved on; re-read it
  }, [markUnauthorized, refresh, setPartError]);

  const skip = async (part: PartSummary): Promise<void> => {
    setPartError(part.part_no, null);
    try {
      await api.skipPart(part.id);
      refresh();
    } catch (caught) {
      handleFailure(caught, part.part_no);
    }
  };

  const discardStranded = async (part: PartSummary): Promise<void> => {
    if (!part.active_upload_id) return;
    setPartError(part.part_no, null);
    try {
      await api.abortUpload(part.active_upload_id);
      refresh();
    } catch (caught) {
      handleFailure(caught, part.part_no);
    }
  };

  const finalize = async (): Promise<void> => {
    setFinishing(true);
    setFinishError(null);
    setConfirmFinish(false);
    try {
      await api.finalize(sessionId);
      refresh();
    } catch (caught) {
      handleFailure(caught, null);
    } finally {
      setFinishing(false);
    }
  };

  const capturing = session?.state === 'capturing';
  const serverUploading = parts.some((part) => part.state === 'uploading');
  const uploadActive = uploads.anyActive || serverUploading || sourceUpload.blocksFinish;
  const canFinish = capturing && !uploadActive && !finishing;
  const notFilmed = parts.filter((part) => part.state === 'pending');
  const skipped = parts.filter((part) => part.state === 'skipped');

  return (
    <div className="space-y-8">
      <section aria-labelledby="tab-heading" className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
        <h2 id="tab-heading" className="font-semibold">Keep this tab open</h2>
        <p>
          Your session is tied to this browser tab. Reloading is fine, but closing the tab may lose access to the session and its uploads, and there is no recovery from another device.
          An interrupted upload can continue only if you select the same video file again. A clip you recorded in the page cannot be recovered after a reload.
        </p>
      </section>

      {unauthorized && (
        <div role="alert" className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">Your session has expired or was lost</p>
          <p className="text-sm">
            This browser tab no longer has valid access to its session. Sessions cannot be recovered from another tab or device, and closing the tab can lose them.
            Start a new session to continue; videos from the old session cannot be reattached.
          </p>
          <button type="button" onClick={onNewSession} className="btn-primary">Start a new session</button>
        </div>
      )}
      {!unauthorized && error && !session && <ErrorNotice error={error} />}
      {!unauthorized && error && session && (
        <p role="status" className="text-sm text-amber-800">Could not refresh status just now: {error.title}. Showing the last known state.</p>
      )}

      {(session?.state === 'deleting' || session?.state === 'deleted') && <p role="status">This session has been deleted or is being deleted. <button type="button" className="btn-secondary" onClick={onNewSession}>Start a new session</button></p>}
      {deleting && <p role="status">Deleting session media...</p>}
      {!session && !error && <p role="status" className="text-stone-600">Loading your session...</p>}

      {session && !unauthorized && !deleting && session.state !== 'deleting' && session.state !== 'deleted' && (
        <>
          {singleVideo && <SingleVideoCapture upload={sourceUpload} capturing={capturing && !confirmDelete} />}
          <Part1Slot part1={parts.find((part) => part.part_no === 1)} verdict={progress?.free_verdict} />

          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="text-xl font-semibold">{singleVideo ? 'Guided follow-up clips' : 'Capture steps'}</h2>
            {singleVideo && <p className="mt-2 text-sm text-stone-600">After source preparation, add short clips for available missing areas. You can finish without filming every area; missing and unverified areas remain unassessed.</p>}
            <ol className="mt-4 space-y-4">
              {parts.map((part) => {
                const guide = guideFor(part.part_no) ?? GUIDE_STEPS[0]!;
                return (
                  <PartCard key={part.id} guide={guide} part={part} expanded={open === part.part_no}
                    onToggle={() => setOpen(open === part.part_no ? null : part.part_no)}
                    local={uploads.local[part.part_no]} record={uploads.records[part.part_no]}
                    hasFile={uploads.getFile(part.part_no) !== undefined} sessionCapturing={capturing && !confirmDelete && (!singleVideo || sourceUpload.followupsAllowed)}
                    actionError={actionErrors[part.part_no]}
                    onStart={(file, contentType) => { setPartError(part.part_no, null); void uploads.start(part.part_no, file, contentType); }}
                    onRetry={() => {
                      const file = uploads.getFile(part.part_no);
                      if (!file) return;
                      const record = uploads.records[part.part_no];
                      if (record) void uploads.resume(part.part_no, file);
                      else void uploads.start(part.part_no, file, normalizeVideoType(file) ?? 'video/mp4');
                    }}
                    onResumeWith={(file) => { void uploads.resume(part.part_no, file); }}
                    onRetake={() => { void uploads.retake(part.part_no); }}
                    onDiscardStranded={() => { void discardStranded(part); }}
                    onSkip={() => { void skip(part); }}
                    onDismissError={() => { setPartError(part.part_no, null); uploads.dismissError(part.part_no); }} />
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="finish-heading" className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
            <h2 id="finish-heading" className="text-xl font-semibold">Finish</h2>
            <ZoneSummary notFilmed={notFilmed} skipped={skipped} />
            {capturing ? (
              <>
                {uploadActive && <p className="text-sm text-amber-900" role="status">{singleVideo && sourceUpload.blocksFinish ? 'Source status is loading, an upload is unfinished, or source preparation is pending. Finish becomes available after the source settles; you can discard an unfinished upload.' : 'An upload is still in progress. Finish is available once it completes or you cancel it.'}</p>}
                {finishError && <ErrorNotice error={finishError} onDismiss={() => setFinishError(null)} />}
                {confirmFinish ? (
                  <div className="rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">
                    <p>Finish capture? This freezes your selection.{notFilmed.length > 0 ? ` ${notFilmed.length} zone${notFilmed.length === 1 ? '' : 's'} not yet filmed will be marked skipped.` : ''}</p>
                    <div className="mt-2 flex gap-3">
                      <button type="button" className="btn-primary" disabled={!canFinish} onClick={() => { void finalize(); }}>Yes, finish</button>
                      <button type="button" className="btn-secondary" onClick={() => setConfirmFinish(false)}>Keep filming</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn-primary" disabled={!canFinish} aria-describedby="finish-help" onClick={() => setConfirmFinish(true)}>
                    Finish capture
                  </button>
                )}
                <p id="finish-help" className="text-xs text-stone-600">Capture never finishes on its own. You choose when to finish.</p>
              </>
            ) : (
              <p className="text-sm text-stone-700" role="status">Capture is finished. The selection is frozen.</p>
            )}
          </section>

          <ProgressPanel api={api} progress={progress} onRefresh={refresh} onUnauthorized={markUnauthorized} />
          <section className="space-y-3 rounded-lg border border-red-300 p-4">
            <h2 className="font-semibold">Delete session media</h2>
            <p className="text-sm">This removes access immediately and queues deletion of videos and report evidence. Previously downloaded copies cannot be recalled; issued image links can remain valid for up to 60 seconds.</p>
            {deleteError && <ErrorNotice error={deleteError} />}
            {confirmDelete ? <>
              <p>Delete this session and its media? You cannot undo this.</p>
              <button type="button" className="btn-primary" onClick={() => {
                setDeleting(true); setDeleteError(null);
                void Promise.all([uploads.stopTransfers(), sourceUpload.stopTransfers()]).then(() => api.deleteMedia(sessionId)).then(onNewSession).catch((caught: unknown) => {
                  setDeleteError(describeError(caught)); setDeleting(false); setConfirmDelete(false);
                  if (describeError(caught).action === 'new_session') markUnauthorized();
                  refresh();
                });
              }}>Yes, delete session media</button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>Keep session</button>
            </> : <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(true)}>Delete session media</button>}
          </section>
        </>
      )}
    </div>
  );
}

function ZoneSummary({ notFilmed, skipped }: { notFilmed: PartSummary[]; skipped: PartSummary[] }): ReactElement {
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="font-semibold">Skipped zones: </span>
        {skipped.length === 0 ? 'none' : skipped.map((part) => guideFor(part.part_no)?.title ?? `Step ${part.part_no}`).join(', ')}
        {skipped.length > 0 && '. Skipped zones are not assessed and will appear as not assessed in the report.'}
      </p>
      {notFilmed.length > 0 && (
        <p>
          <span className="font-semibold">Not filmed yet ({STATE_LABEL.pending.toLowerCase()}): </span>
          {notFilmed.map((part) => guideFor(part.part_no)?.title ?? `Step ${part.part_no}`).join(', ')}. These become skipped if you finish now.
        </p>
      )}
    </div>
  );
}
