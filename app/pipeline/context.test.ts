import { describe, expect, it } from 'vitest';
import repeatOffenderRows from './fixtures/repeat-offenders.json';
import { loadRepeatOffenders } from './context';

function fakeFetch(rows: unknown[]) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

describe('loadRepeatOffenders', () => {
  it('keeps only Active registrations, keyed by parcel ID', async () => {
    const { impl } = fakeFetch(repeatOffenderRows);
    const { offenders } = await loadRepeatOffenders(impl);
    expect([...offenders.keys()].sort()).toEqual(['0304070701', '0312130115']);
  });

  it('reads the numbers as numbers and the name when the city gives one', async () => {
    const { impl } = fakeFetch(repeatOffenderRows);
    const { offenders } = await loadRepeatOffenders(impl);
    expect(offenders.get('0304070701')).toEqual({
      name: 'Riverside Terrace Apartments',
      units: 300,
      activeViolations: 12,
      totalViolations: 41,
      registeredAddress: '8900 N IH 35 SVRD SB',
    });
    expect(offenders.get('0312130115')?.name).toBeNull();
  });

  it('reports every row read, Suspended included', async () => {
    const { impl } = fakeFetch(repeatOffenderRows);
    expect((await loadRepeatOffenders(impl)).rowsRead).toBe(3);
  });

  it('pages in a stable order, with the row ID breaking ties between repeated parcels', async () => {
    const { impl, urls } = fakeFetch(repeatOffenderRows);
    await loadRepeatOffenders(impl);
    expect(new URL(urls[0]).searchParams.get('$order')).toBe('parcelid,:id');
  });

  it('never requests the owner field', async () => {
    const { impl, urls } = fakeFetch(repeatOffenderRows);
    await loadRepeatOffenders(impl);
    expect(decodeURIComponent(urls[0])).not.toMatch(/owner/i);
  });
});
