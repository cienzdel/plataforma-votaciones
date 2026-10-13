import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Relative base: GitHub Pages serves the site under /<repository>/.
export default defineConfig({ plugins: [preact()], base: "./", build: { target: "es2022" } });
