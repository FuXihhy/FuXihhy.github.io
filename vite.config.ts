import { defineConfig, type UserConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readMarkdownContent, renderContentHtml } from './scripts/render-content.mjs';
import { discoverNotePages, renderNotePageHtml } from './scripts/note-pages.mjs';

// Set SITE_BASE=/repository-name/ for a GitHub project site. The workflow uses
// configure-pages' base_path, so custom domains and account sites also work.
const requestedBase = process.env.SITE_BASE ?? '/';
if (!requestedBase.startsWith('/') || requestedBase.includes('..') || /[?#\\]/.test(requestedBase)) {
  throw new Error('SITE_BASE must be a root-relative path such as / or /personal-site/.');
}
const base = requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`;
let resolvedBase = base;
const contentDirectory = fileURLToPath(new URL('./content/', import.meta.url));
const isContentFile = (file: string) => file.startsWith(contentDirectory) && /\.(md|json)$/.test(file);

export default defineConfig(async (): Promise<UserConfig> => ({
  base,
  input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
    ...Object.fromEntries((await discoverNotePages()).map(page => [page.slug, page.htmlPath])),
  },
  plugins: [{
    name: 'static-academic-content',
    configResolved(config) { resolvedBase = config.base; },
    configureServer(server) {
      server.watcher.add(contentDirectory);
    },
    handleHotUpdate({ file, server, modules, timestamp }) {
      if (!isContentFile(file)) return;
      const invalidated = new Set<(typeof modules)[number]>();
      for (const module of modules) server.moduleGraph.invalidateModule(module, invalidated, timestamp, true);
      // Markdown is read by transformIndexHtml, so it has no browser module to
      // accept an HMR update. A full reload also covers comments-only edits.
      server.ws.send({ type: 'full-reload' });
      return [];
    },
    async transformIndexHtml(html, context) {
      const settings = JSON.parse(await readFile(new URL('./content/site.json', import.meta.url), 'utf8'));
      const note = (await discoverNotePages()).find(page => page.htmlPath === context.filename);
      if (note) return renderNotePageHtml(html, settings, resolvedBase, await readFile(note.markdownPath, 'utf8'));
      const markdown = await readMarkdownContent();
      return renderContentHtml(html, settings, resolvedBase, markdown);
    },
  }],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/playwright-report/**', '**/test-results/**', '**/qa/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
}));
