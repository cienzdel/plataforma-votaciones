/**
 * Stands in for GitHub Pages in the browser tests: serves the folder the API publishes to, with
 * `Access-Control-Allow-Origin: *` as Pages does, so that the client checks what was published.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const root = join(process.env.PV_E2E_DIR!, "data");
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^[/\\]+/, "");
  // The root answers 200 so that Playwright sees the server as ready.
  const body = path === "" || path === "." ? "{}" : path.startsWith("..") ? null : await readFile(join(root, path)).catch(() => null);
  res.writeHead(body === null ? 404 : 200, { "access-control-allow-origin": "*", "content-type": "application/json" });
  res.end(body ?? "");
}).listen(4174);
