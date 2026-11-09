import { readFile, access, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { contentUrl, markdownFiles, parseMarkdown, readMarkdownContent } from './markdown-content.mjs';
import { discoverNotePages, renderNotePageHtml } from './note-pages.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const notePages = await discoverNotePages(root);
const document = parse(await readFile(resolve(root, 'index.html'), 'utf8'));
const ids = new Set();
const noteIds = new Map();
const noteTemplates = new Map();
const references = [];
const failures = [];
let externalCount = 0;
let contentLinkCount = 0;

function walk(node, pageIds = ids, source = 'index.html') {
  const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
  if (attrs.id) {
    if (pageIds.has(attrs.id)) failures.push(`${source} has duplicate id: ${attrs.id}`);
    pageIds.add(attrs.id);
  }
  for (const name of ['href', 'src']) {
    if (attrs[name] !== undefined) references.push({ tag: node.tagName, name, value: attrs[name], pageIds, source });
  }
  if (attrs.target === '_blank' && !/(^|\s)noopener(\s|$)/.test(attrs.rel ?? '')) {
    failures.push(`New-tab link missing rel="noopener": ${attrs.href}`);
  }
  for (const child of node.childNodes ?? []) walk(child, pageIds, source);
  if (node.content) walk(node.content, pageIds, source);
}

walk(document);
for (const note of notePages) {
  const html = await readFile(note.htmlPath, 'utf8');
  const pageIds = new Set();
  walk(parse(html), pageIds, `${note.route}index.html`);
  noteIds.set(note.slug, pageIds);
  noteTemplates.set(note.slug, html);
}

function routeIds(path) {
  if (path === '' || path === 'index.html') return ids;
  const note = notePages.find(note => path === note.route || path === `${note.route}index.html`);
  return note ? noteIds.get(note.slug) : undefined;
}

function checkRouteFragment(value, targets, context) {
  if (!value.includes('#')) return;
  try {
    const fragment = decodeURIComponent(value.slice(value.indexOf('#') + 1));
    if (fragment && !targets.has(fragment)) failures.push(`${context} points to a missing page anchor: ${value}`);
  } catch { failures.push(`${context} contains an invalid URL escape.`); }
}

for (const { tag, name, value: sourceValue, pageIds, source } of references) {
  const value = sourceValue.replace(/^%BASE_URL%\/?/, '/');
  if (!value.trim()) {
    failures.push(`Empty ${name} on <${tag}>`);
    continue;
  }
  if (/^(https?:)?\/\//i.test(value)) {
    try {
      new URL(value.startsWith('//') ? `https:${value}` : value);
      externalCount++;
    } catch {
      failures.push(`Malformed external URL: ${value}`);
    }
    continue;
  }
  if (/^(mailto:|tel:|data:)/i.test(value)) continue;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    failures.push(`Unsupported URL scheme: ${value}`);
    continue;
  }
  if (value.startsWith('#')) {
    let target;
    try { target = decodeURIComponent(value.slice(1)); }
    catch { failures.push(`${source} contains an invalid URL escape: ${value}`); continue; }
    if (!target || !pageIds.has(target)) failures.push(`${source} has missing internal anchor target: ${value}`);
    continue;
  }
  const local = value.split(/[?#]/, 1)[0];
  let cleanPath;
  try { cleanPath = decodeURIComponent(local.replace(/^\//, '')); }
  catch { failures.push(`${source} contains an invalid URL escape: ${value}`); continue; }
  const targets = routeIds(cleanPath);
  if (name === 'href' && targets) { checkRouteFragment(value, targets, source); continue; }
  const sourcePath = resolve(root, cleanPath);
  const rootRelative = relative(root, sourcePath);
  if (rootRelative === '..' || rootRelative.startsWith(`..${sep}`) || isAbsolute(rootRelative)) {
    failures.push(`Local asset escapes project root: ${value}`);
    continue;
  }
  const candidates = [sourcePath, resolve(root, 'public', cleanPath)];
  const exists = await Promise.all(candidates.map(path => access(path).then(() => true, () => false)));
  if (!exists.some(Boolean)) failures.push(`Missing local file for ${name}: ${value}`);
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function textField(object, key, context, { required = false } = {}) {
  const value = object[key];
  if (value === undefined && !required) return;
  if (typeof value !== 'string') failures.push(`${context}.${key} must be a string.`);
  else if (required && !value.trim()) failures.push(`${context}.${key} must not be blank.`);
}

async function publicUrl(value, context, { allowEmail = false, allowPages = true, pageIds = ids } = {}) {
  if (value === undefined || value === '') return;
  if (typeof value !== 'string') return; // The field validator reports the type.
  contentLinkCount++;
  if (value !== value.trim() || /[\u0000-\u0020\u007f\\]/.test(value)) {
    failures.push(`${context} contains whitespace, a control character or a backslash.`);
    return;
  }
  if (allowEmail && /^mailto:/i.test(value)) {
    if (!contentUrl(value, '/', ids, { allowEmail: true })) failures.push(`${context} must use a single plain email address without query parameters or encoded controls.`);
    return;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password) failures.push(`${context} must not contain URL credentials.`);
    } catch {
      failures.push(`${context} is not a valid HTTP(S) URL.`);
    }
    return;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
    failures.push(`${context} must use HTTP(S), an existing anchor, or a relative public/ file path.`);
    return;
  }
  if (value.startsWith('#')) {
    try {
      if (!pageIds.has(decodeURIComponent(value.slice(1)))) failures.push(`${context} points to a missing anchor: ${value}`);
    } catch {
      failures.push(`${context} contains an invalid URL escape.`);
    }
    return;
  }
  let localPath;
  try {
    localPath = decodeURIComponent(value.replace(/^\//, '').split(/[?#]/, 1)[0]);
  } catch {
    failures.push(`${context} contains an invalid URL escape.`);
    return;
  }
  if (!localPath || localPath.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(localPath) || localPath.split('/').includes('..')) {
    failures.push(`${context} must stay inside public/.`);
    return;
  }
  const targets = routeIds(localPath);
  if (targets) {
    if (allowPages) checkRouteFragment(value, targets, context);
    else failures.push(`${context} must refer to a public/ file, not a page.`);
    return;
  }
  const publicRoot = resolve(root, 'public');
  const localFile = resolve(publicRoot, localPath);
  const relativeFile = relative(publicRoot, localFile);
  if (!relativeFile || relativeFile === '..' || relativeFile.startsWith(`..${sep}`) || isAbsolute(relativeFile)) {
    failures.push(`${context} must point to a file inside public/.`);
    return;
  }
  try {
    const [actualRoot, actualFile, metadata] = await Promise.all([realpath(publicRoot), realpath(localFile), stat(localFile)]);
    const actualRelative = relative(actualRoot, actualFile);
    if (!metadata.isFile()) failures.push(`${context} must refer to a file, not a directory.`);
    else if (actualRelative === '..' || actualRelative.startsWith(`..${sep}`) || isAbsolute(actualRelative)) {
      failures.push(`${context} resolves outside public/ through a symlink.`);
    }
  } catch {
    failures.push(`${context} refers to a missing public/ file: ${value}`);
  }
}

async function validateContent() {
  let content;
  try {
    content = JSON.parse(await readFile(resolve(root, 'content/site.json'), 'utf8'));
  } catch (error) {
    failures.push(`Cannot read content/site.json: ${error.message}`);
    return;
  }
  if (!isObject(content)) {
    failures.push('content/site.json must contain an object.');
    return;
  }
  for (const key of ['name', 'nameLocal', 'role', 'affiliation']) {
    textField(content, key, 'content');
  }
  if (!isObject(content.companion)) {
    failures.push('content.companion must be an object.');
  } else {
    for (const key of ['image', 'label', 'description']) {
      textField(content.companion, key, 'content.companion', { required: content.companion.enabled === true });
    }
    if (typeof content.companion.enabled !== 'boolean') failures.push('content.companion.enabled must be a boolean.');
    await publicUrl(content.companion.image, 'content.companion.image', { allowPages: false });
    if (content.companion.sprite !== undefined) {
      const sprite = content.companion.sprite;
      if (!isObject(sprite)) failures.push('content.companion.sprite must be an object.');
      else {
        textField(sprite, 'image', 'content.companion.sprite', { required: true });
        await publicUrl(sprite.image, 'content.companion.sprite.image', { allowPages: false });
        for (const [key, expected] of Object.entries({ columns: 8, rows: 11 })) {
          if (sprite[key] !== expected) failures.push(`content.companion.sprite.${key} must be ${expected} for the v2 atlas layout.`);
        }
        if (!((sprite.frameWidth === 192 && sprite.frameHeight === 208) ||
          (sprite.frameWidth === 384 && sprite.frameHeight === 416))) {
          failures.push('content.companion.sprite frames must be 192 × 208 (standard) or 384 × 416 (HD 2×).');
        }
      }
    }
  }
}

await validateContent();
try {
  const markdown = await readMarkdownContent();
  for (const [key, source] of Object.entries(markdown)) {
    const urls = new Map();
    // validateLink also records rejected Markdown destinations, so an unsafe or
    // broken link cannot silently turn into plain text and pass this check.
    parseMarkdown(source, { ids, onReference: (url, info) => urls.set(url, urls.get(url) !== false && !info?.image) });
    for (const [url, allowEmail] of urls) await publicUrl(url, `content/${markdownFiles[key]} link/image`, { allowEmail, allowPages: allowEmail });
  }
} catch (error) {
  failures.push(`Cannot read or parse Markdown content: ${error.message}`);
}
for (const note of notePages) {
  try {
    const markdown = await readFile(note.markdownPath, 'utf8');
    const pageIds = noteIds.get(note.slug);
    const urls = new Map();
    parseMarkdown(markdown, { ids: pageIds, onReference: (url, info) => urls.set(url, urls.get(url) !== false && !info?.image) });
    for (const [url, allowEmail] of urls) await publicUrl(url, `content/notes/${note.slug}.md link/image`, { allowEmail, allowPages: allowEmail, pageIds });
    // The renderer also verifies the required template slots and single H1.
    renderNotePageHtml(noteTemplates.get(note.slug), {}, '/', markdown);
  } catch (error) { failures.push(`Cannot render note ${note.slug}: ${error.message}`); }
}

if (failures.length) {
  console.error(failures.map(message => `• ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Content check passed: ${ids.size} unique IDs; ${references.length} HTML references; ${externalCount} external HTML URLs; ${contentLinkCount} configured content links.`);
  console.log('External availability and runtime-generated links require separate browser/network checks.');
}
