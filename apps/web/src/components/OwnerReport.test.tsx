// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, type ProgressResponse } from '../api/client';
import { OwnerReport, hydrateFrames, ownerDocument } from './OwnerReport';
import { ProgressPanel } from './ProgressPanel';
import { App } from '../App';
import { FakeBackend } from '../testing/fakeBackend';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });
const noop = (): void => {};
const html = (text: string): Response => new Response(`<html><head><style>body{color:black}</style></head><body>${text}</body></html>`, { headers: { 'Content-Type': 'text/html' } });

describe('private owner report', () => {
  it('fetches HTML with bearer only in the header and no cache or cookies', async () => {
    const fetcher = vi.fn(async () => html('<p>Scoped finding</p>'));
    const api = createApi({ getToken: () => 'private-token', fetchImpl: fetcher, baseUrl: '/api/v1' });
    render(<OwnerReport api={api} slug="owner-slug" onUnauthorized={noop} onRefresh={noop} />);
    const frame = await screen.findByTitle('Your private report');
    expect(fetcher).toHaveBeenCalledWith('/r/owner-slug', expect.objectContaining({
      headers: { Accept: 'text/html', Authorization: 'Bearer private-token' }, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
    }));
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('Scoped finding');
    expect(document.documentElement.outerHTML).not.toContain('private-token');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('blocks executable markup, navigation and every original image', () => {
    const document = ownerDocument(`<script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://bad.test"><base href="https://bad.test"><iframe src="https://bad.test"></iframe><img src="/api/v1/reports/s/frames/f"><a href="https://bad.test" onclick="alert(1)">Link</a><svg><image href="raw"></image></svg>`);
    expect(document).not.toMatch(/<script|<iframe|<img|<image|onclick|href=|http-equiv="refresh"/i);
    expect(document).toContain("default-src 'none'");
    expect(document).toContain('Evidence image withheld');
  });

  it.each([401, 404])('recovers from unavailable owner access (%s)', async (status) => {
    const api = createApi({ getToken: () => 'token', fetchImpl: async () => new Response('{}', { status }) });
    const unauthorized = vi.fn();
    render(<OwnerReport api={api} slug="s" onUnauthorized={unauthorized} onRefresh={noop} />);
    await waitFor(() => expect(unauthorized).toHaveBeenCalled());
    expect(screen.queryByTitle('Your private report')).toBeNull();
  });

  it('clears paid document immediately on scope change and refetches the free document', async () => {
    let paid = true;
    let release: ((value: Response) => void) | undefined;
    const fetcher = vi.fn(async () => paid ? html('Paid private finding') : new Promise<Response>((resolve) => { release = resolve; }));
    const api = createApi({ getToken: () => 'token', fetchImpl: fetcher });
    const progress: ProgressResponse = { state: 'finalized', parts: [], free_verdict: null, report: { slug: 's', state: 'ready', unlocked: true } };
    const props = { api, onUnauthorized: noop, onRefresh: noop };
    const { rerender } = render(<ProgressPanel {...props} progress={progress} />);
    expect(screen.queryByRole('button', { name: 'Unlock full report' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open your full report' }));
    expect((await screen.findByTitle('Your private report')).getAttribute('srcdoc')).toContain('Paid private finding');
    paid = false;
    rerender(<ProgressPanel {...props} progress={{ ...progress, report: { ...progress.report!, unlocked: false } }} />);
    expect(screen.queryByTitle('Your private report')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock full report' })).toBeTruthy();
    await waitFor(() => expect(release).toBeDefined());
    release!(html('Free report only'));
    expect((await screen.findByTitle('Your private report')).getAttribute('srcdoc')).not.toContain('Paid private finding');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('approved evidence frames', () => {
  it('preserves only same-origin frame routes for hydration', () => {
    const doc = ownerDocument('<img src="/api/v1/reports/s/frames/123e4567-e89b-42d3-a456-426614174000"><img src="https://bad.test/x.png">', true);
    expect(doc).toContain('data-frame-src="/api/v1/reports/s/frames/123e4567-e89b-42d3-a456-426614174000"');
    expect(doc).not.toContain('bad.test');
    expect(doc).toContain('img-src data:');
    expect(doc).toContain('Evidence image withheld');
  });

  it('hydrates frames to data URLs and withholds failures', async () => {
    const doc = ownerDocument('<img src="/api/v1/reports/s/frames/123e4567-e89b-42d3-a456-426614174000">', true);
    const ok = await hydrateFrames(doc, async () => 'data:image/png;base64,AAAA');
    expect(ok).toContain('src="data:image/png;base64,AAAA"');
    const failed = await hydrateFrames(doc, async () => { throw new Error('denied'); });
    expect(failed).not.toContain('data-frame-src');
    expect(failed).toContain('Evidence image withheld');
  });
});

describe('owner media deletion', () => {
  function setup(): FakeBackend {
    const backend = new FakeBackend();
    sessionStorage.setItem('upclose.session.v1', JSON.stringify({ sessionId: backend.sessionId, token: backend.token }));
    vi.stubGlobal('fetch', backend.fetch);
    return backend;
  }
  it('requires explicit confirmation, posts bearer and empty object, then forgets ownership', async () => {
    const backend = setup();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete session media' }));
    expect(backend.callsTo('POST', '/delete-media')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Keep session' }));
    expect(screen.queryByRole('button', { name: 'Yes, delete session media' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete session media' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete session media' }));
    await screen.findByRole('button', { name: 'Start session' });
    expect(backend.callsTo('POST', '/delete-media')).toEqual([expect.objectContaining({ body: {}, headers: expect.objectContaining({ Authorization: `Bearer ${backend.token}` }) })]);
    expect(sessionStorage.getItem('upclose.session.v1')).toBeNull();
    expect(document.body.innerHTML).not.toContain(backend.token);
  });
  it('aborts an active transfer before requesting media deletion', async () => {
    const backend = setup();
    backend.holdPuts = true;
    render(<App />);
    const input = await screen.findByLabelText(/Choose a video from this device/);
    const file = new File([new Uint8Array(32)], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload this clip' }));
    await waitFor(() => expect(backend.calls.some((call) => call.url.startsWith('https://storage.test/'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Delete session media' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete session media' }));
    await screen.findByRole('button', { name: 'Start session' });
    expect(backend.callsTo('POST', '/delete-media')).toHaveLength(1);
    expect(backend.callsTo('POST', '/complete')).toHaveLength(0);
  });
  it('keeps ownership and allows retry when the deletion request fails', async () => {
    const backend = setup();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => url.endsWith('/delete-media') ? new Response('{}', { status: 503 }) : backend.fetch(url, init));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete session media' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete session media' }));
    await screen.findByRole('button', { name: 'Delete session media' });
    expect(screen.getByText('The service had a problem')).toBeTruthy();
    expect(sessionStorage.getItem('upclose.session.v1')).not.toBeNull();
  });
});
