import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the whole app into ONE self-contained dist/index.html
export default defineConfig({ base: "./", plugins: [react(), viteSingleFile()] });
