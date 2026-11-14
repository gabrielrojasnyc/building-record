import { describe, expect, it } from 'vitest';
import type { Outline } from '@/domain/types';
import { chooseName, fetchApartmentNames, looksLikeLegalEntity, type NamedPlace } from './names';

/** A 0.01 degree block. */
const outline: Outline = [
  [
    [
      [-97.75, 30.3],
      [-97.74, 30.3],
      [-97.74, 30.31],
      [-97.75, 30.31],
      [-97.75, 30.3],
    ],
  ],
];
const inside = { lon: -97.745, lat: 30.305 };
const alsoInside = { lon: -97.742, lat: 30.307 };
const outside = { lon: -97.7, lat: 30.305 };

const place = (name: string, at: { lon: number; lat: number }): NamedPlace => ({ name, ...at });

describe('chooseName', () => {
  it('names a complex when exactly one distinct apartment name lies inside it', () => {
    expect(
      chooseName(outline, [place('Lantana Trace', inside), place('Lantana Trace', alsoInside), place('Elsewhere', outside)], null),
    ).toEqual({ text: 'Lantana Trace', source: 'openstreetmap' });
  });

  it('shows no name when two different names lie inside', () => {
    expect(chooseName(outline, [place('North Phase', inside), place('South Phase', alsoInside)], 'City Name')).toBeNull();
  });

  it('prefers the OpenStreetMap name over a city name', () => {
    expect(chooseName(outline, [place('Lantana Trace', inside)], 'Mia Riverside')).toEqual({
      text: 'Lantana Trace',
      source: 'openstreetmap',
    });
  });

  it('falls back to the city name when OpenStreetMap has none inside', () => {
    expect(chooseName(outline, [place('Elsewhere', outside)], 'Mia Riverside')).toEqual({ text: 'Mia Riverside', source: 'city' });
    expect(chooseName(outline, [], 'Mia Riverside')).toEqual({ text: 'Mia Riverside', source: 'city' });
  });

  it('has no name when there is neither', () => {
    expect(chooseName(outline, [], null)).toBeNull();
    expect(chooseName(outline, [], '   ')).toBeNull();
  });

  it('does not use a city name that is a legal entity', () => {
    expect(chooseName(outline, [], '1830 W Rundberg Db Llc')).toBeNull();
    expect(looksLikeLegalEntity('Burton Holdings LP')).toBe(true);
    expect(looksLikeLegalEntity('The Social')).toBe(false);
  });
});

describe('looksLikeLegalEntity', () => {
  it.each(['Oak Creek LLC', 'oak creek llc', 'Riverside Partners', 'Lakeview Properties', 'The Smith Family Trust', 'Acme Inc', '500 Congress'])(
    'reads %s as a legal entity',
    (name) => expect(looksLikeLegalEntity(name)).toBe(true),
  );

  it.each(['Mia Riverside', 'Parkview Apartments', 'Trustworthy Flats', 'Helpline Court'])(
    'does not read %s as one, because a keyword must be a whole word',
    (name) => expect(looksLikeLegalEntity(name)).toBe(false),
  );
});

describe('fetchApartmentNames', () => {
  const element = (name: string | undefined, lon = -97.7, lat = 30.3, center = true) => ({
    type: 'way',
    id: 1,
    ...(center ? { center: { lat, lon } } : {}),
    tags: name === undefined ? {} : { name },
  });

  it('sends the required headers to Overpass and keeps only plausible names', async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      request = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          elements: [
            element('  Lantana Trace  ', -97.7123456789, 30.31),
            element('Ab'),
            element('x'.repeat(61)),
            element('x'.repeat(60), -97.6),
            element('1830 Rundberg'),
            element(undefined),
            element('No Center Court', 0, 0, false),
            element('Array Apartments', -97.65),
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const places = await fetchApartmentNames(fetchImpl);

    expect(request?.url).toBe('https://overpass-api.de/api/interpreter');
    expect(request?.init.method).toBe('POST');
    expect(request?.init.headers).toMatchObject({
      'User-Agent': 'austin-building-record (names snapshot)',
      Accept: 'application/json',
    });
    const query = decodeURIComponent(String(request?.init.body)).replaceAll('+', ' ');
    expect(query).toContain('(30.05,-98.05,30.55,-97.5');
    expect(query).toMatch(/building.*apartments/);
    expect(query).toMatch(/landuse.*residential/);
    expect(query).toMatch(/residential.*apartments/);
    expect(query).toContain('out center tags');

    expect(places).toEqual([
      { name: 'Array Apartments', lon: -97.65, lat: 30.3 },
      { name: 'Lantana Trace', lon: -97.712346, lat: 30.31 },
      { name: 'x'.repeat(60), lon: -97.6, lat: 30.3 },
    ]);
  });

  it('sorts by name then longitude so an unchanged pull gives an unchanged file', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ elements: [element('Beta Flats', -97.6), element('Alpha Flats', -97.5), element('Alpha Flats', -97.8)] }), {
        status: 200,
      })) as typeof fetch;
    expect((await fetchApartmentNames(fetchImpl)).map(({ name, lon }) => [name, lon])).toEqual([
      ['Alpha Flats', -97.8],
      ['Alpha Flats', -97.5],
      ['Beta Flats', -97.6],
    ]);
  });

  it('throws when Overpass does not answer 200', async () => {
    const fetchImpl = (async () => new Response('busy', { status: 429 })) as typeof fetch;
    await expect(fetchApartmentNames(fetchImpl)).rejects.toThrow(/429/);
  });
});
