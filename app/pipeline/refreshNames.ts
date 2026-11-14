import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { austinCalendarDate } from '@/domain/history';
import { NAMES_SNAPSHOT_PATH, fetchApartmentNames, readNamesSnapshot, type NamesSnapshot } from './names';

/** One place per line, so a changed place is one changed line in review. */
const serialize = ({ fetchedAt, places }: NamesSnapshot) =>
  `{"fetchedAt":${JSON.stringify(fetchedAt)},"places":[\n${places.map((place) => JSON.stringify(place)).join(',\n')}\n]}\n`;

async function main() {
  const places = await fetchApartmentNames();
  const previous = await readNamesSnapshot();
  if (previous && JSON.stringify(previous.places) === JSON.stringify(places)) {
    console.log(`${places.length} places, unchanged since ${previous.fetchedAt}. Left the snapshot as it was.`);
    return;
  }
  const snapshot: NamesSnapshot = { fetchedAt: austinCalendarDate(new Date()), places };
  await mkdir(dirname(NAMES_SNAPSHOT_PATH), { recursive: true });
  // Written beside the snapshot and renamed into place, so an interrupted run cannot leave a truncated file.
  const temporary = `${NAMES_SNAPSHOT_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, serialize(snapshot));
  await rename(temporary, NAMES_SNAPSHOT_PATH);
  console.log(`Wrote ${places.length} places to ${NAMES_SNAPSHOT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
