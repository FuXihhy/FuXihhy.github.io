import { defaultTreeAdapter as tree, parse, serialize } from 'parse5';
import { formatMarkdown, parseMarkdown, plainText, splitEntryIntro } from './markdown-content.mjs';
export { readMarkdownContent } from './markdown-content.mjs';

const strings = value => typeof value === 'string' ? value : '';

// One build-time renderer serves production and Vite preview. Browser code only
// handles navigation and the companion; it never parses or rewrites prose.
export function renderContentHtml(html, settings, base = '/', markdownDocs = {}) {
  if (!base.startsWith('/') || base.startsWith('//') || /[?#\\]|\.\./.test(base)) {
    throw new Error('The static content base must be a root-relative site path.');
  }
  const siteBase = base.endsWith('/') ? base : `${base}/`;
  const document = parse(html);
  const ids = new Map();
  let title;
  let description;
  function walk(node) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    if (attrs.id) ids.set(attrs.id, node);
    if (node.tagName === 'title') title = node;
    if (node.tagName === 'meta' && attrs.name === 'description') description = node;
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(document);

  function replace(target, nodes) {
    for (const child of [...target.childNodes]) tree.detachNode(child);
    for (const node of nodes) { tree.detachNode(node); tree.appendChild(target, node); }
  }
  function fill(id, value) {
    const target = ids.get(id);
    if (!target || !strings(value).trim()) return;
    replace(target, []); tree.insertText(target, value);
    const classes = target.attrs.find(attribute => attribute.name === 'class');
    if (classes) classes.value = classes.value.split(/\s+/).filter(name => name !== 'empty').join(' ');
  }
  function content(id, nodes) {
    const target = ids.get(id);
    if (!target) return;
    replace(target, nodes);
    const classes = target.attrs.find(attribute => attribute.name === 'class');
    if (classes) classes.value = classes.value.split(/\s+/).filter(name => name !== 'empty').join(' ');
  }
  const markdown = key => parseMarkdown(markdownDocs[key], { base: siteBase, ids });
  const about = markdown('about');
  const aboutDescription = plainText(about);
  fill('person-name', settings.name);
  fill('person-local-name', settings.nameLocal);
  fill('person-role', [settings.role, settings.affiliation].filter(Boolean).join(' · '));
  content('about-copy', formatMarkdown(about));
  content('research-copy', formatMarkdown(markdown('research')));
  content('miscellany-copy', formatMarkdown(markdown('miscellany')));
  for (const [key, introId, listId] of [
    ['notes', 'notes-intro', 'notes-list'],
    ['studentSeminar', 'student-seminar-intro', 'student-seminars-list'],
  ]) {
    const section = splitEntryIntro(markdown(key));
    content(introId, section.intro);
    content(listId, section.entries);
  }
  if (strings(settings.name).trim() && title) {
    replace(title, []); tree.insertText(title, `${settings.name} · Academic homepage`);
  }
  if (aboutDescription && description) {
    const attribute = description.attrs.find(attribute => attribute.name === 'content');
    if (attribute) attribute.value = aboutDescription;
    else description.attrs.push({ name: 'content', value: aboutDescription });
  }

  return serialize(document);
}
