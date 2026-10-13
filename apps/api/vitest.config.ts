import { defineConfig } from "vitest/config";

// RSA-3072 key generation and the Python verifier make some tests slower than the default 5 s.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 30_000 } });
