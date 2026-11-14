import { describe, expect, it } from 'vitest';
import addressRows from './fixtures/addresses.json';
import parcelRows from './fixtures/parcels.json';
import {
  buildAddressResolver,
  chooseAddress,
  loadAddressPoints,
  type AddressPoint,
} from './addresses';
import { loadApartmentParcels, type Parcel } from './parcels';

// A square parcel with its south-west corner at (-97.0, 30.0), about 100 m on a side.
const SIZE = 0.001;
const parcel: Parcel = {
  id: '0304070701',
  polygon: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-97.0, 30.0],
          [-96.999, 30.0],
          [-96.999, 30.001],
          [-97.0, 30.001],
          [-97.0, 30.0],
        ],
      ],
    ],
  },
  lon: -96.9995,
  lat: 30.0005,
  squareFeet: 108_900,
  acres: 2.5,
  bbox: [-97.0, 30.0, -96.999, 30.001],
};

const street = (number: number) => `${number} BURTON DR`;
const inside = (number: number): AddressPoint => ({
  label: street(number),
  number,
  lon: -96.9995,
  lat: 30.0005,
});
const outside = (number: number): AddressPoint => ({
  label: street(number),
  number,
  lon: -96.9995,
  lat: 30.0 - SIZE / 2,
});
/** Offset south of the parcel's centroid by a number of metres. */
const metresSouthOfCentroid = (number: number, metres: number): AddressPoint => ({
  label: street(number),
  number,
  lon: parcel.lon,
  lat: parcel.lat - metres / 111_195,
});
const farAway = (): AddressPoint => ({ label: '9 FAR ST', number: 9, lon: -96.99, lat: 30.01 });

function fakeFetch(rows: unknown[]) {
  const urls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

describe('chooseAddress', () => {
  it('picks the lowest-numbered address point inside the polygon', () => {
    expect(chooseAddress(parcel, [inside(1708), inside(1700), outside(12)])).toEqual({ label: '1700 Burton Dr', source: 'inside' });
  });

  it('names the parcel by ID near the nearest point within 150 m when none is inside', () => {
    const near = metresSouthOfCentroid(2200, 120);
    const nearer = metresSouthOfCentroid(2100, 80);
    expect(chooseAddress(parcel, [near, nearer, farAway()])).toEqual({
      label: 'Parcel 0304070701, near 2100 Burton Dr',
      source: 'nearby',
    });
  });

  it('measures the 150 m limit from the parcel centroid', () => {
    expect(chooseAddress(parcel, [metresSouthOfCentroid(5, 149)])).toEqual({ label: 'Parcel 0304070701, near 5 Burton Dr', source: 'nearby' });
    expect(chooseAddress(parcel, [metresSouthOfCentroid(5, 151)])).toEqual({ label: 'Parcel 0304070701', source: 'none' });
  });

  it('labels the parcel by ID when nothing is within 150 m', () => {
    expect(chooseAddress(parcel, [farAway()])).toEqual({ label: 'Parcel 0304070701', source: 'none' });
  });

  it('labels the parcel by ID when there are no points at all', () => {
    expect(chooseAddress(parcel, [])).toEqual({ label: 'Parcel 0304070701', source: 'none' });
  });

  it('breaks a tie on house number by label, whatever order the points arrive in', () => {
    const a: AddressPoint = { ...inside(100), label: '100 ALPHA ST' };
    const b: AddressPoint = { ...inside(100), label: '100 BRAVO ST' };
    expect(chooseAddress(parcel, [b, a]).label).toBe('100 Alpha St');
    expect(chooseAddress(parcel, [a, b]).label).toBe('100 Alpha St');
  });

  it('prefers a whole address to a fractional one with the same house number', () => {
    const half: AddressPoint = { ...inside(310), label: '310 1/2 COMAL ST' };
    const whole: AddressPoint = { ...inside(310), label: '310 COMAL ST' };
    expect(chooseAddress(parcel, [half, whole]).label).toBe('310 Comal St');
    expect(chooseAddress(parcel, [whole, half]).label).toBe('310 Comal St');
  });

  it('prefers any whole address inside the parcel to a lower-numbered fractional one', () => {
    const lowHalf: AddressPoint = { ...inside(300), label: '300 1/2 COMAL ST' };
    expect(chooseAddress(parcel, [lowHalf, inside(1700)]).label).toBe('1700 Burton Dr');
  });

  it('takes a fractional address when it is the only kind inside the parcel', () => {
    const half: AddressPoint = { ...inside(310), label: '310 1/2 COMAL ST' };
    const quarter: AddressPoint = { ...inside(308), label: '308 1/4 COMAL ST' };
    expect(chooseAddress(parcel, [half, quarter])).toEqual({ label: '308 1/4 Comal St', source: 'inside' });
  });

  it('ignores points whose house number is not numeric', () => {
    const unnumbered: AddressPoint = { label: '12A BURTON DR', number: Number.NaN, lon: -96.9995, lat: 30.0005 };
    expect(chooseAddress(parcel, [unnumbered, inside(1700)]).label).toBe('1700 Burton Dr');
    expect(chooseAddress(parcel, [unnumbered]).label).toBe('Parcel 0304070701');
  });

  it('does not treat a point in a hole of the polygon as inside', () => {
    const withCourtyard: Parcel = {
      ...parcel,
      polygon: {
        type: 'MultiPolygon',
        coordinates: [
          [
            parcel.polygon.coordinates[0][0],
            [
              [-96.9997, 30.0003],
              [-96.9993, 30.0003],
              [-96.9993, 30.0007],
              [-96.9997, 30.0007],
              [-96.9997, 30.0003],
            ],
          ],
        ],
      },
    };
    const inCourtyard = inside(1);
    const onTheRing: AddressPoint = { ...inside(2), lon: -96.99985, lat: 30.0005 };
    expect(chooseAddress(withCourtyard, [inCourtyard, onTheRing]).label).toBe('2 Burton Dr');
  });

  describe('on real city data', () => {
    const points = loadFixturePoints();

    it('names the Royal Crest complex by its lowest street number, wherever that street is', async () => {
      const burton = await fixtureParcel('0304070701');
      expect(chooseAddress(burton, await points)).toEqual({ label: '1515 Royal Crest Dr', source: 'inside' });
    });

    it('keeps the city spelling of a service road address', async () => {
      const interstate = await fixtureParcel('0234111501');
      expect(chooseAddress(interstate, await points).label).toBe('8900 N IH 35 SVRD SB');
    });
  });
});

describe('buildAddressResolver', () => {
  it('agrees with chooseAddress on every real fixture parcel', async () => {
    const { parcels } = await loadApartmentParcels(fakeFetch(parcelRows).impl);
    const points = await loadFixturePoints();
    const resolve = buildAddressResolver(points);

    for (const each of parcels) {
      expect(resolve(each)).toEqual(chooseAddress(each, points));
    }
  });

  it('finds the nearest point across a grid cell boundary', () => {
    // 0.002 degree cells: the parcel centroid sits just inside one cell and the point just outside it.
    const edge: Parcel = { ...parcel, lon: -96.9995, lat: 30.00199, bbox: [-96.9996, 30.00198, -96.9994, 30.002] };
    const across: AddressPoint = { label: '7 EDGE ST', number: 7, lon: -96.9995, lat: 30.0022 };
    expect(buildAddressResolver([across])(edge)).toEqual({ label: 'Parcel 0304070701, near 7 Edge St', source: 'nearby' });
  });

  it('labels a parcel by ID when no indexed point is near', () => {
    expect(buildAddressResolver([farAway()])(parcel)).toEqual({ label: 'Parcel 0304070701', source: 'none' });
  });
});

describe('loadAddressPoints', () => {
  it('asks the address dataset for primary points and only the columns it reads', async () => {
    const { impl, urls } = fakeFetch([]);
    await loadAddressPoints(impl);

    const url = new URL(urls[0]);
    expect(url.pathname).toBe('/resource/9s7j-tygf.json');
    expect(url.searchParams.get('$where')).toBe("address_type = '1'");
    expect(url.searchParams.get('$select')).toBe('full_street_name,address,the_geom');
  });

  it('turns city rows into points with a numeric house number', async () => {
    const points = await loadAddressPoints(
      fakeFetch([
        { full_street_name: '13060 ZEN GARDENS WAY', address: '13060', the_geom: { type: 'Point', coordinates: [-97.6, 30.4] } },
        { full_street_name: '12A BURTON DR', address: '12A', the_geom: { type: 'Point', coordinates: [-97.7, 30.2] } },
      ]).impl,
    );

    expect(points[0]).toEqual({ label: '13060 ZEN GARDENS WAY', number: 13060, lon: -97.6, lat: 30.4 });
    expect(points[1].number).toBeNaN();
  });

  it('drops rows missing a location or a street name', async () => {
    const points = await loadAddressPoints(
      fakeFetch([
        { full_street_name: '1 NOWHERE ST', address: '1' },
        { address: '2', the_geom: { type: 'Point', coordinates: [-97.7, 30.2] } },
      ]).impl,
    );

    expect(points).toEqual([]);
  });
});

async function fixtureParcel(id: string): Promise<Parcel> {
  const { parcels } = await loadApartmentParcels(fakeFetch(parcelRows).impl);
  const found = parcels.find((each) => each.id === id);
  if (!found) throw new Error(`Fixture parcel ${id} is missing`);
  return found;
}

function loadFixturePoints(): Promise<AddressPoint[]> {
  return loadAddressPoints(fakeFetch(addressRows).impl);
}
