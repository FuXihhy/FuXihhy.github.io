import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultTreeAdapter as tree, parse, serialize } from 'parse5';
import { element, parseMarkdown, plainText } from './markdown-content.mjs';

const projectDirectory = fileURLToPath(new URL('..', import.meta.url));

export async function discoverNotePages(root = projectDirectory) {
  let directories;
  try { directories = await readdir(resolve(root, 'notes'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const pages = [];
  for (const directory of directories) {
    if (!directory.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directory.name)) continue;
    const htmlPath = resolve(root, 'notes', directory.name, 'index.html');
    try { if (!(await stat(htmlPath)).isFile()) continue; }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    pages.push({
      slug: directory.name, route: `notes/${directory.name}/`, htmlPath,
      markdownPath: resolve(root, 'content', 'notes', `${directory.name}.md`),
    });
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const significantChildren = node => (node.childNodes ?? []).filter(child => child.nodeName !== '#text' || child.value.trim());

function replace(target, children) {
  for (const child of [...target.childNodes]) tree.detachNode(child);
  for (const child of children) { tree.detachNode(child); tree.appendChild(target, child); }
}

function textElement(tag, text, attrs = {}) {
  const node = element(tag, attrs);
  tree.insertText(node, text);
  return node;
}

function expandDocuments(nodes, base) {
  const output = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const children = significantChildren(node);
    const link = node.tagName === 'p' && children.length === 1 && children[0].tagName === 'a' ? children[0] : null;
    const href = link && attribute(link, 'href');
    const localPdf = href?.startsWith(base) && /\.pdf$/i.test(decodeURIComponent(href.split(/[?#]/, 1)[0]));
    if (!localPdf) { output.push(node); continue; }
    const label = plainText([link]);
    const actions = element('div', { class: 'document-actions' }, [
      link,
      textElement('a', 'Download', { href, download: '' }),
      textElement('button', 'Read in page', {
        type: 'button', hidden: '', 'aria-expanded': 'false',
        'data-pdf-src': href, 'data-pdf-title': label,
      }),
    ]);
    const block = element('div', { class: 'note-pdf-block' }, [actions]);
    const next = nodes[index + 1];
    const thumbnail = significantChildren(next ?? {});
    if (next?.tagName === 'p' && thumbnail.length === 1 && thumbnail[0].tagName === 'img') {
      next.attrs.push({ name: 'class', value: 'document-thumbnail' });
      tree.detachNode(next); tree.appendChild(block, next); index++;
    }
    output.push(block);
  }
  return output;
}

export function renderNotePageHtml(html, settings, base = '/', markdown = '') {
  if (!base.startsWith('/') || base.startsWith('//') || /[?#\\]|\.\./.test(base)) {
    throw new Error('The note page base must be a root-relative site path.');
  }
  const siteBase = base.endsWith('/') ? base : `${base}/`;
  const document = parse(html.replaceAll('%BASE_URL%', siteBase));
  const ids = new Map();
  let documentTitle;
  let description;
  function walk(node) {
    const id = attribute(node, 'id');
    if (id) ids.set(id, node);
    if (node.tagName === 'title') documentTitle = node;
    if (node.tagName === 'meta' && attribute(node, 'name') === 'description') description = node;
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(document);
  for (const id of ['note-title', 'note-content', 'note-site-name']) {
    if (!ids.has(id)) throw new Error(`Note page template is missing #${id}.`);
  }
  const nodes = parseMarkdown(markdown, { base: siteBase, ids });
  const headings = [];
  function findTitles(node) {
    if (node.tagName === 'h1') headings.push(node);
    for (const child of node.childNodes ?? []) findTitles(child);
  }
  nodes.forEach(findTitles);
  if (headings.length !== 1 || !nodes.includes(headings[0]) || !plainText(headings)) {
    throw new Error('Note Markdown must contain one nonempty top-level # title.');
  }
  const heading = headings[0];
  const title = plainText([heading]);
  const body = nodes.filter(node => node !== heading);
  const summary = plainText(body.filter(node => node.tagName === 'p').slice(0, 1)) || title;
  replace(ids.get('note-title'), [...heading.childNodes]);
  replace(ids.get('note-content'), expandDocuments(body, siteBase));
  const author = typeof settings.name === 'string' ? settings.name : '';
  replace(ids.get('note-site-name'), []); tree.insertText(ids.get('note-site-name'), author);
  if (documentTitle) {
    replace(documentTitle, []); tree.insertText(documentTitle, author ? `${title} · ${author}` : title);
  }
  if (description) {
    const item = description.attrs.find(item => item.name === 'content');
    if (item) item.value = summary;
    else description.attrs.push({ name: 'content', value: summary });
  }
  return serialize(document);
}
