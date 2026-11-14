import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildData } from './build';

const OUT_DIR = 'public/data';
const ifMissing = process.argv.includes('--if-missing');

async function main() {
  if (ifMissing && process.env.REFRESH_DATA !== '1' && existsSync(join(OUT_DIR, 'meta.json'))) {
    console.log(`${OUT_DIR}/meta.json exists, skipping the data pull. Set REFRESH_DATA=1 to refresh.`);
    return;
  }
  const started = Date.now();
  const meta = await buildData(OUT_DIR, new Date());
  console.log(`Wrote ${meta.complexCount} complexes to ${OUT_DIR} in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(JSON.stringify(meta));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
