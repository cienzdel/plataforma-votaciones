/**
 * Writes the runtime config.json of the web client from API, RECEPTION and DATA (empty: null).
 * The addresses decide where voters send their sessions, credentials and ballots, so only the
 * form that Up derives from the VM's IP is accepted: https://api.<a-b-c-d>.sslip.io and
 * https://cast.<the same>.sslip.io, both or neither. DATA must be an https address.
 */
import { writeFileSync } from "node:fs";

const value = (name: string) => process.env[name] || null;
const api = value("API");
const reception = value("RECEPTION");
const data = value("DATA");

const SSLIP = /^https:\/\/(api|cast)\.((?:(?:25[0-5]|2[0-4]\d|1?\d?\d)-){3}(?:25[0-5]|2[0-4]\d|1?\d?\d))\.sslip\.io$/;
const ip = (host: string | null, prefix: string) => {
  const m = host?.match(SSLIP);
  return m?.[1] === prefix ? m[2] : undefined;
};
const fail = (why: string) => {
  console.error(`config.ts: ${why}`);
  process.exit(1);
};
if ((api === null) !== (reception === null)) fail("API and RECEPTION must both be set or both be empty");
if (api !== null && (ip(api, "api") === undefined || ip(api, "api") !== ip(reception, "cast"))) fail("API and RECEPTION must be https://api.<ip>.sslip.io and https://cast.<same ip>.sslip.io");
if (data !== null && !/^https:\/\/[0-9A-Za-z.-]+(\/[0-9A-Za-z._~-]+)*$/.test(data)) fail("DATA must be an https address");
writeFileSync(process.argv[2]!, JSON.stringify({ api, reception, data }) + "\n");
