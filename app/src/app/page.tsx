import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Complex, Meta } from "@/domain/types";
import { Finder } from "@/ui/Finder";

async function readDataFile<T>(name: string): Promise<T> {
  const text = await readFile(
    path.join(process.cwd(), "public", "data", name),
    "utf8",
  );
  return JSON.parse(text) as T;
}

export default async function Home() {
  const [complexes, meta] = await Promise.all([
    readDataFile<Complex[]>("complexes.json"),
    readDataFile<Meta>("meta.json"),
  ]);

  return <Finder complexes={complexes} meta={meta} />;
}
