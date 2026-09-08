import { describe, expect, it } from 'vitest';
import { readResponse } from './client-response';

describe('admin response reader', () => {
  it('preserves validation details and the request ID', async () => {
    const body = { error: '입력 오류', requestId: 'req1', details: { fieldErrors: { name: ['필수'] } } };
    expect(await readResponse(Response.json(body, { status: 400 }))).toEqual(body);
  });
  it.each([null, [], 42])('handles invalid JSON root %j', async (body) => {
    expect(await readResponse(Response.json(body))).toMatchObject({ code: 'invalid_json_response' });
  });
  it('does not show raw proxy HTML and handles payload limits', async () => {
    const html = new Response('<html>proxy internals</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
    expect(await readResponse(html)).toMatchObject({ code: 'non_json_response' });
    expect(await readResponse(new Response('', { status: 413 }))).toMatchObject({ code: 'payload_too_large' });
  });
});
