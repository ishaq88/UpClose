// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { CONSENT_VERSION } from './config';
import { FakeBackend } from './testing/fakeBackend';

let backend: FakeBackend;

beforeEach(() => {
  sessionStorage.clear();
  backend = new FakeBackend();
  vi.stubGlobal('fetch', backend.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function seedSession(): void {
  sessionStorage.setItem('upclose.session.v1', JSON.stringify({ sessionId: backend.sessionId, token: backend.token }));
}

function video(bytes: number, pattern = 1, name = 'clip.mp4'): File {
  const data = new Uint8Array(bytes).map((_, i) => (i * pattern + 3) & 255);
  return new File([data], name, { type: 'video/mp4' });
}

async function pickAndUpload(partNo: number, file: File): Promise<void> {
  const card = (await screen.findByRole('heading', { name: new RegExp(`Step ${partNo} of 8`) })).closest('li')!;
  const input = within(card).getByLabelText(/Choose a video from this device/);
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(await within(card).findByRole('button', { name: 'Upload this clip' }));
}

describe('consent and session creation', () => {
  it('requires consent before a session can be created and sends nothing until then', async () => {
    render(<App />);
    const start = screen.getByRole('button', { name: 'Start session' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(start);
    expect(backend.calls).toHaveLength(0);
    expect(screen.getByText(/closing it may lose access to the session/i)).toBeTruthy();
  });

  it('creates the session with the configured consent version and keeps the token out of the DOM and URLs', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Seller listing text/), { target: { value: 'Clean 2014 hatchback' } });
    fireEvent.click(screen.getByLabelText('I understand and agree.'));
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    await screen.findByRole('heading', { name: 'Capture steps' });

    const create = backend.callsTo('POST', '/sessions').find((call) => call.url.endsWith('/sessions'))!;
    expect(create.body).toEqual({ purpose: 'buyer', consent_version: CONSENT_VERSION, consent: true, listing_text: 'Clean 2014 hatchback' });
    expect(create.headers.Authorization).toBeUndefined();

    expect(JSON.parse(sessionStorage.getItem('upclose.session.v1')!)).toEqual({ sessionId: backend.sessionId, token: backend.token });
    expect(document.body.innerHTML).not.toContain(backend.token);
    expect(location.href).not.toContain(backend.token);
    for (const call of backend.calls) expect(call.url).not.toContain(backend.token);
    // The token is only ever sent as a bearer header, never to the storage host.
    const later = backend.calls.filter((call) => call.url.includes(backend.sessionId));
    expect(later.length).toBeGreaterThan(0);
    for (const call of later) expect(call.headers.Authorization).toBe(`Bearer ${backend.token}`);
  });

  it('shows a rate-limit message when session creation is refused', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'RATE_LIMITED', detail: '' }), { status: 429, headers: { 'Retry-After': '120' } }));
    render(<App />);
    fireEvent.click(screen.getByLabelText('I understand and agree.'));
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect((await screen.findByRole('alert')).textContent).toContain('120 seconds');
  });
});

describe('guide steps', () => {
  it('shows eight canonical steps with server states and underbody safety wording', async () => {
    seedSession();
    render(<App />);
    await screen.findByRole('heading', { name: 'Capture steps' });
    for (let n = 1; n <= 8; n += 1) expect(screen.getByRole('heading', { name: new RegExp(`Step ${n} of 8`) })).toBeTruthy();
    expect(screen.getAllByText('Not filmed yet')).toHaveLength(8);
    fireEvent.click(within(screen.getByRole('heading', { name: /Step 7 of 8/ }).closest('li')!).getByRole('button', { name: 'Show guide' }));
    expect(screen.getByText(/Stay standing and keep your whole body outside the car/)).toBeTruthy();
    expect(screen.getByText(/Do not crawl, kneel under, lie down, or reach beneath the vehicle/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /never go under the car/ })).toBeTruthy();
  });

  it('offers part-specific file fallbacks that accept video and can open the phone camera', async () => {
    seedSession();
    render(<App />);
    const card = (await screen.findByRole('heading', { name: /Step 1 of 8/ })).closest('li')!;
    const camera = within(card).getByLabelText(/Record with phone camera app/) as HTMLInputElement;
    const choose = within(card).getByLabelText(/Choose a video from this device/) as HTMLInputElement;
    expect(camera.accept).toBe('video/*');
    expect(camera.getAttribute('capture')).toBe('environment');
    expect(choose.accept).toBe('video/*');
    expect(choose.hasAttribute('capture')).toBe(false);
    // jsdom has no camera: the in-page recorder explains and the file inputs remain.
    expect(within(card).getByText(/cannot record video inside the page|secure \(HTTPS\)/)).toBeTruthy();
  });
});

describe('skip and finish', () => {
  it('skips a zone only after confirmation and shows it as skipped from server state', async () => {
    seedSession();
    render(<App />);
    const card = (await screen.findByRole('heading', { name: /Step 1 of 8/ })).closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Skip this zone' }));
    expect(backend.callsTo('POST', '/skip')).toHaveLength(0);
    fireEvent.click(within(card).getByRole('button', { name: /Yes, skip Driver side/ }));
    await waitFor(() => expect(within(card).getByTestId('state-1').textContent).toBe('Skipped'));
    expect(backend.callsTo('POST', '/skip')).toHaveLength(1);
    expect(screen.getByText(/Skipped zones:/).parentElement!.textContent).toContain('Driver side');
  });

  it('disables Finish while the server reports an upload in progress', async () => {
    backend.parts[1].state = 'uploading';
    seedSession();
    render(<App />);
    await screen.findByRole('heading', { name: 'Capture steps' });
    expect((screen.getByRole('button', { name: 'Finish capture' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/An upload is still in progress/)).toBeTruthy();
  });

  it('disables Finish during a local upload, and re-enables it after a retake releases the part', async () => {
    backend.holdPuts = true;
    seedSession();
    render(<App />);
    await pickAndUpload(1, video(2000));
    await screen.findByRole('button', { name: 'Cancel and retake' });
    expect((screen.getByRole('button', { name: 'Finish capture' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and retake' }));
    await waitFor(() => expect(backend.callsTo('DELETE', '/uploads/')).toHaveLength(1));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Finish capture' }) as HTMLButtonElement).disabled).toBe(false));
    expect(backend.parts[0].state).toBe('pending');
  });

  it('uploads a small synthetic file through the real client and shows the server-reported state', async () => {
    seedSession();
    render(<App />);
    await pickAndUpload(1, video(5000));
    await waitFor(() => expect(screen.getByTestId('state-1').textContent).toBe('Uploaded, waiting for processing'));
    expect(backend.callsTo('POST', '/complete')).toHaveLength(1);
    expect(screen.getByText(/Replacing an accepted clip is not supported/)).toBeTruthy();
  });

  it('finishes only on an explicit confirmed action and then lists skipped zones', async () => {
    seedSession();
    render(<App />);
    await screen.findByRole('heading', { name: 'Capture steps' });
    expect(backend.callsTo('POST', '/finalize')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Finish capture' }));
    expect(backend.callsTo('POST', '/finalize')).toHaveLength(0);
    expect(screen.getByText(/8 zones not yet filmed will be marked skipped/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, finish' }));
    await screen.findByText(/Capture is finished/);
    expect(backend.callsTo('POST', '/finalize')).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByText('Skipped')).toHaveLength(8));
    await screen.findByText(/Your report is being built/);
    expect(backend.callsTo('GET', '/progress').length).toBeGreaterThan(0);
  });
});

describe('resume after reload', () => {
  it('requires the same file, rejects a different one, and continues with the right one', async () => {
    backend.holdPuts = true;
    seedSession();
    const first = render(<App />);
    await pickAndUpload(1, video(3000, 1));
    await screen.findByRole('button', { name: 'Cancel and retake' });
    await waitFor(() => expect(backend.calls.some((call) => call.method === 'PUT')).toBe(true));
    // "Reload": the tab goes away mid-upload; sessionStorage keeps the non-secret upload record.
    first.unmount();
    backend.holdPuts = false;

    render(<App />);
    const card = (await screen.findByRole('heading', { name: /Step 1 of 8/ })).closest('li')!;
    await within(card).findByText(/An upload for this zone was interrupted/);
    expect((screen.getByRole('button', { name: 'Finish capture' }) as HTMLButtonElement).disabled).toBe(true);

    const input = within(card).getByLabelText('Select the same video to continue');
    fireEvent.change(input, { target: { files: [video(3001, 1)] } });
    await within(card).findByText('That is not the same video');
    expect(backend.callsTo('POST', '/complete')).toHaveLength(0);

    fireEvent.change(within(card).getByLabelText('Select the same video to continue'), { target: { files: [video(3000, 7)] } });
    await waitFor(() => expect(within(card).getByText('That is not the same video')).toBeTruthy());

    fireEvent.click(within(card).getByRole('button', { name: 'Dismiss' }));
    fireEvent.change(within(card).getByLabelText('Select the same video to continue'), { target: { files: [video(3000, 1)] } });
    await waitFor(() => expect(screen.getByTestId('state-1').textContent).toBe('Uploaded, waiting for processing'));
  });
});

describe('stranded upload', () => {
  it('offers to discard an upload the tab has no record of, using active_upload_id', async () => {
    const uploadId = '22222222-2222-4222-8222-0000000000aa';
    backend.parts[0].state = 'uploading';
    backend.parts[0].active_upload_id = uploadId;
    backend.uploads.set(uploadId, { id: uploadId, partId: backend.parts[0].id, partNo: 1, size: 10, state: 'open', pieces: new Map() });
    seedSession(); // no upload record in sessionStorage
    render(<App />);
    const card = (await screen.findByRole('heading', { name: /Step 1 of 8/ })).closest('li')!;
    await within(card).findByText(/no details for/);
    expect((screen.getByRole('button', { name: 'Finish capture' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(card).getByRole('button', { name: 'Discard stranded upload' }));
    await waitFor(() => expect(within(card).getByTestId('state-1').textContent).toBe('Not filmed yet'));
    expect(backend.callsTo('DELETE', `/uploads/${uploadId}`)).toHaveLength(1);
    expect(backend.parts[0].active_upload_id).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Finish capture' }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('error handling', () => {
  it('explains an expired or lost session and offers a new one', async () => {
    seedSession();
    backend.unauthorized = true;
    render(<App />);
    const alert = await screen.findByText('Your session has expired or was lost');
    expect(alert.closest('[role="alert"]')!.textContent).toContain('cannot be recovered from another tab or device');
    fireEvent.click(screen.getByRole('button', { name: 'Start a new session' }));
    expect(((await screen.findByRole('button', { name: 'Start session' })) as HTMLButtonElement).disabled).toBe(true);
    expect(sessionStorage.getItem('upclose.session.v1')).toBeNull();
  });

  it('explains a 409 by refreshing instead of showing a stale state', async () => {
    seedSession();
    render(<App />);
    const card = (await screen.findByRole('heading', { name: /Step 1 of 8/ })).closest('li')!;
    backend.parts[0].state = 'skipped'; // changed elsewhere; the page has not polled yet
    fireEvent.click(within(card).getByRole('button', { name: 'Skip this zone' }));
    fireEvent.click(within(card).getByRole('button', { name: /Yes, skip Driver side/ }));
    await waitFor(() => expect(within(card).getByTestId('state-1').textContent).toBe('Skipped'));
  });

  it('explains 413 for an oversized declared clip', async () => {
    seedSession();
    render(<App />);
    // The size check happens client-side first; a tiny file with a forced server 413 exercises the message.
    const original = backend.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/parts') && init?.method === 'POST') return new Response(JSON.stringify({ code: 'UPLOAD_TOO_LARGE', detail: '' }), { status: 413 });
      return original(url, init);
    });
    await pickAndUpload(1, video(2000));
    expect((await screen.findByText('That video is too large')).closest('[role="alert"]')).toBeTruthy();
  });

  it('shows a plain 429 message with the wait time', async () => {
    seedSession();
    render(<App />);
    const original = backend.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/finalize')) return new Response(JSON.stringify({ code: 'RATE_LIMITED', detail: '' }), { status: 429, headers: { 'Retry-After': '9' } });
      return original(url, init);
    });
    await screen.findByRole('heading', { name: 'Capture steps' });
    fireEvent.click(screen.getByRole('button', { name: 'Finish capture' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, finish' })); });
    expect((await screen.findByText('Too many requests')).closest('[role="alert"]')!.textContent).toContain('9 seconds');
  });

  it('shows a 404 as not found without exposing server details', async () => {
    seedSession();
    render(<App />);
    const original = backend.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('/skip')) return new Response(JSON.stringify({ code: 'NOT_FOUND', detail: 'secret internals' }), { status: 404 });
      return original(url, init);
    });
    const card = (await screen.findByRole('heading', { name: /Step 1 of 8/ })).closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Skip this zone' }));
    fireEvent.click(within(card).getByRole('button', { name: /Yes, skip Driver side/ }));
    const notice = await within(card).findByText('Not found');
    expect(notice.closest('[role="alert"]')!.textContent).not.toContain('secret internals');
  });
});
