/** Writes the runtime config.json of the web client from API, RECEPTION and DATA (empty: null). */
import { writeFileSync } from "node:fs";

const value = (name: string) => process.env[name] || null;
writeFileSync(process.argv[2]!, JSON.stringify({ api: value("API"), reception: value("RECEPTION"), data: value("DATA") }) + "\n");
