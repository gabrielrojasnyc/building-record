import { readFile } from "node:fs/promises";
import path from "node:path";

/** Reads a file the pipeline wrote to `public/data`, on the server at build time. The browser fetches the same files from `/data`. */
export async function readDataFile<T>(name: string): Promise<T> {
  const text = await readFile(
    path.join(process.cwd(), "public", "data", name),
    "utf8",
  );
  return JSON.parse(text) as T;
}
