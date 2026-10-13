/** Size budget of the web client (PLAN/PLAN.md §10): at most 200 KB, uncompressed, for everything served. */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUDGET = 200 * 1024;
const dist = new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist);
const total = files.reduce((n, f) => n + statSync(f).size, 0);
for (const f of files) console.log(`${String(statSync(f).size).padStart(8)}  ${f.slice(dist.length)}`);
console.log(`total ${total} bytes, budget ${BUDGET}`);
if (total > BUDGET) {
  console.error("size budget exceeded");
  process.exit(1);
}
