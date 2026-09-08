import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayDataKrPaymentProvider, payDataKrAmount, verifyPayDataKrLookup } from '../src/paydatakr';

const provider = new PayDataKrPaymentProvider({
  publicKey: 'test-public', payKey: 'test-secret',
  checkoutUrl: 'https://example.test/checkout', apiBaseUrl: 'https://example.test',
});
const expected = { trackId: 'ORDER1', transactionId: 'TRX1', amount: 1004 };
const successful = { result: { resultCd: '0000' }, pay: { ...expected } };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('payment trust boundary', () => {
  it.each([1004.9, '1004.9', -1, 0, '', null, true, {}, [], '1e3', Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid amount %j', (amount) => {
    expect(payDataKrAmount(amount)).toBeUndefined();
  });
  it('requires all authoritative transaction fields, not just a success code', () => {
    expect(() => verifyPayDataKrLookup(successful, expected)).not.toThrow();
    expect(() => verifyPayDataKrLookup({ result: { resultCd: '0000' } }, expected)).toThrow();
    for (const wrong of [{ trackId: 'OTHER' }, { transactionId: 'OTHER' }, { amount: 1 }]) {
      expect(() => verifyPayDataKrLookup({ ...successful, pay: { ...expected, ...wrong } }, expected)).toThrow();
    }
    expect(() => verifyPayDataKrLookup({ result: { resultCd: '0000' }, metadata: expected }, expected)).toThrow();
  });
  it.each([null, [], 'text', { result: null }, {}])('rejects malformed API response %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(provider.lookup('TRX1')).rejects.toMatchObject({ code: 'E010' });
  });
  it('rejects HTTP failure even if body claims success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(successful, { status: 500 })));
    await expect(provider.lookup('TRX1')).rejects.toMatchObject({ code: 'HTTP_500' });
  });
  it('keeps timeout active during response body reading', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => Promise.resolve({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    })));
    const checked = expect(provider.lookup('TRX1', { timeoutMs: 20 })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(30);
    await checked;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('sends the refund amount and original transaction identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ result: { resultCd: '0000' } }));
    vi.stubGlobal('fetch', fetchMock);
    await provider.refund({ trackId: 'REF1', amount: 1004, rootTrxId: 'TRX1', rootTrackId: 'ORDER1', rootTrxDay: '20260908' });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      refund: { trxType: 'ONTR', amount: 1004, rootTrxId: 'TRX1', rootTrackId: 'ORDER1' },
    });
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' });
    await expect(provider.refund({ trackId: 'REF2', amount: 1004.9, rootTrxId: 'TRX1', rootTrackId: 'ORDER1', rootTrxDay: '20260908' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
