import type { Complex, Meta } from "@/domain/types";
import { Finder } from "@/ui/Finder";
import { readDataFile } from "./dataFiles";

export default async function Home() {
  const [complexes, meta] = await Promise.all([
    readDataFile<Complex[]>("complexes.json"),
    readDataFile<Meta>("meta.json"),
  ]);

  return <Finder complexes={complexes} meta={meta} />;
}
