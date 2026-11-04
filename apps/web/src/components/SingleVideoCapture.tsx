import { useEffect, useState, type ReactElement } from 'react';
import { GUIDE_STEPS } from '../capture/guide';
import { formatBytes, normalizeVideoType } from '../capture/media';
import { readVideoMetadata } from '../capture/quality';
import { parseVideoRanges, type RangeDraft } from '../capture/videoRanges';
import { MAX_CLIP_BYTES } from '../config';
import type { SourceUploadController } from '../upload/useSourceUpload';
import { CameraRecorder } from './CameraRecorder';
import { ErrorNotice } from './PartCard';

export function SingleVideoCapture({ upload, capturing }: { upload: SourceUploadController; capturing: boolean }): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [ranges, setRanges] = useState<RangeDraft[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const { source, busy, record, progress } = upload;
  const type = file ? normalizeVideoType(file) : null;
  const accepted = source?.state === 'accepted';
  const unfinished = source?.state === 'open' || source?.state === 'completing' || record !== null;

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
    setPreview(url);
    let active = true;
    void readVideoMetadata(file).then((meta) => { if (active && meta.durationSeconds !== null) setDuration(meta.durationSeconds); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);

  const select = (value: File, seconds: number | null = null) => { setFile(value); setDuration(seconds); setValidation(null); };
  const send = () => {
    if (!file || !type) return;
    try {
      if (file.size === 0 || file.size > MAX_CLIP_BYTES) throw new Error('Choose a nonempty video up to 200 MiB.');
      if (duration !== null && duration > 180) throw new Error('This video exceeds the 180-second limit. Choose a shorter clip.');
      const segments = record ? [] : parseVideoRanges(ranges, duration);
      setValidation(null);
      void upload.upload(file, type, segments);
    } catch (caught) { setValidation(caught instanceof Error ? caught.message : 'Check the marked sections.'); }
  };

  return <section aria-labelledby="single-video-heading" className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
    <h2 id="single-video-heading" className="text-xl font-semibold">One video</h2>
    <p className="text-sm text-stone-700">Record a continuous walkaround or upload a partial clip. MP4, MOV or WebM, up to 180 seconds and 200 MiB. A 30–60 second clip is welcome.</p>
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Automatic area recognition and real AI damage analysis are not connected. Findings are synthetic test data. Unmapped areas remain unassessed; no missing area is treated as damage-free.</p>
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Optional filming guide</summary>
      <p className="mt-2">Move slowly in good light, show wide views then details, and avoid people, plates and documents. You can follow this guide in one continuous recording or show just the areas available to you.</p>
      <ul className="mt-2 list-disc space-y-2 pl-5">{GUIDE_STEPS.map((guide) => <li key={guide.partNo}><strong>{guide.title}: </strong>{guide.goal}{guide.partNo === 7 && ' Stay standing outside the car. Do not crawl, kneel under, lie down, or reach beneath the vehicle.'}</li>)}</ul>
    </details>
    {upload.error && <ErrorNotice error={upload.error} />}
    {validation && <p role="alert" className="text-sm text-red-800">{validation}</p>}
    {source === undefined && <p role="status">Checking source video status…</p>}
    {accepted && <>
      <p role="status">Video accepted. {source.processing_state === 'ready' ? 'Source preparation complete.' : source.processing_state === 'failed' ? 'Source preparation failed.' : 'Preparing source video…'}</p>
      {source.processing_state === 'failed' && <p className="text-sm text-red-800">This source could not be prepared. Its missing areas are not assessed. Add guided follow-up clips below or finish with missing coverage. Use a new session to replace the source.</p>}
      {source.processing_state === 'ready' && <p className="text-sm">The video is stored, but this does not verify coverage. Marked ranges are user-declared hints only. Add a guided clip for any available missing area below, or Finish with missing coverage.</p>}
      <p className="text-xs text-stone-600">An accepted source and its marked sections cannot be replaced in this session.</p>
    </>}
    {busy && <div role="status" className="space-y-2"><p>{progress?.phase === 'completing' ? 'Confirming video upload with the server…' : 'Uploading source video…'}</p><progress aria-label="Source upload progress" className="w-full" max={progress?.totalBytes ?? 1} value={progress?.uploadedBytes ?? 0} /></div>}
    {capturing && !accepted && source !== undefined && !busy && <>
      {unfinished && <p className="rounded-lg bg-amber-50 p-3 text-sm">An unfinished source upload exists. {record ? 'Select the same video to resume only missing pieces. Browser recordings are lost after reload.' : 'This tab has no resume details. Discard the unfinished upload before starting again.'}</p>}
      {(!unfinished || record) && <>
        {!unfinished && !file && <CameraRecorder partNo={0} maxSeconds={180} onRecorded={(value, seconds) => select(value, seconds)} />}
        <div className="flex flex-wrap gap-3">
          {!unfinished && <label className="btn-secondary cursor-pointer">Record one video with phone camera<input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(event) => { const value = event.target.files?.[0]; event.target.value = ''; if (value) select(value); }} /></label>}
          <label className="btn-secondary cursor-pointer">{unfinished ? 'Select the same source video to resume' : 'Choose one video from this device'}<input type="file" accept="video/*" className="sr-only" onChange={(event) => { const value = event.target.files?.[0]; event.target.value = ''; if (value) select(value); }} /></label>
        </div>
        {file && <div className="space-y-3">
          {preview && <video aria-label="Preview of your source video" src={preview} controls muted playsInline className="aspect-video w-full rounded-lg bg-stone-900" />}
          <p className="text-sm">{formatBytes(file.size)}{duration !== null ? ` · ${duration.toFixed(1)} seconds` : ' · Duration will be checked by the server'}</p>
          {!type && <p role="alert">Choose an MP4, MOV or WebM video.</p>}
          {file.size > MAX_CLIP_BYTES && <p role="alert">This video exceeds the 200 MiB limit.</p>}
          {duration !== null && duration > 180 && <p role="alert">This video exceeds the 180-second limit.</p>}
          {!unfinished && <fieldset className="space-y-3 rounded-lg border border-stone-300 p-3">
            <legend className="font-semibold">Mark areas (optional)</legend>
            <p className="text-sm">You can upload without marking anything. These are your hints, not verified coverage. Use seconds from the start of the video; one section per area, at most 60 seconds each, without overlaps.</p>
            {ranges.map((range, index) => <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="text-sm">Area {index + 1}<select className="mt-1 block w-full rounded border p-2" value={range.partNo} onChange={(event) => setRanges((items) => items.map((item, i) => i === index ? { ...item, partNo: Number(event.target.value) } : item))}>{GUIDE_STEPS.map((guide) => <option key={guide.partNo} value={guide.partNo}>{guide.title}</option>)}</select></label>
              <label className="text-sm">Start seconds {index + 1}<input className="mt-1 block w-full rounded border p-2" type="number" min="0" max="180" step="0.001" value={range.start} onChange={(event) => setRanges((items) => items.map((item, i) => i === index ? { ...item, start: event.target.value } : item))} /></label>
              <label className="text-sm">End seconds {index + 1}<input className="mt-1 block w-full rounded border p-2" type="number" min="0" max="180" step="0.001" value={range.end} onChange={(event) => setRanges((items) => items.map((item, i) => i === index ? { ...item, end: event.target.value } : item))} /></label>
              <button type="button" className="btn-secondary self-end" aria-label={`Remove section ${index + 1}`} onClick={() => setRanges((items) => items.filter((_, i) => i !== index))}>Remove</button>
            </div>)}
            <button type="button" className="btn-secondary" disabled={ranges.length >= 8} onClick={() => setRanges((items) => [...items, { partNo: GUIDE_STEPS.find((guide) => !items.some((item) => item.partNo === guide.partNo))?.partNo ?? 1, start: '', end: '' }])}>Add a marked section</button>
          </fieldset>}
          <button type="button" className="btn-primary" disabled={!type || file.size === 0 || file.size > MAX_CLIP_BYTES || (duration !== null && duration > 180)} onClick={send}>{record ? 'Resume source upload' : 'Upload this video'}</button>
        </div>}
      </>}
    </>}
    {capturing && !accepted && (unfinished || busy) && <button type="button" className="btn-secondary" onClick={() => { void upload.abort(); }}>Discard unfinished source upload</button>}
  </section>;
}
