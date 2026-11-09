import { readFile } from 'node:fs/promises';
import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';
import { defaultTreeAdapter as tree, parseFragment } from 'parse5';

export const markdownFiles = Object.freeze({
  about: 'about.md', research: 'research.md', notes: 'notes.md',
  studentSeminar: 'student-seminar.md', miscellany: 'miscellany.md',
});

export async function readMarkdownContent() {
  return Object.fromEntries(await Promise.all(Object.entries(markdownFiles).map(async ([key, file]) =>
    [key, await readFile(new URL(`../content/${file}`, import.meta.url), 'utf8')])));
}

export function contentUrl(value, base = '/', ids = new Set(), { allowEmail = false } = {}) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.username || parsed.password ? null : parsed.href;
    } catch { return null; }
  }
  if (allowEmail && /^mailto:/i.test(url)) {
    const address = url.slice(7);
    return /^[^\s@<>?#&,:;%]+@[^\s@<>?#&,:;%]+\.[^\s@<>?#&,:;%]+$/.test(address) ? `mailto:${address}` : null;
  }
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(url)) return null;
  if (url.startsWith('#')) {
    try { return ids.has(decodeURIComponent(url.slice(1))) ? url : null; }
    catch { return null; }
  }
  const path = url.replace(/^\//, '');
  try {
    const decoded = decodeURIComponent(path.split(/[?#]/, 1)[0]);
    if (!decoded || /[\u0000-\u0020\u007f\\]/.test(decoded) || decoded.startsWith('/') || decoded.split('/').includes('..')) return null;
  } catch { return null; }
  return `${base}${path}`;
}

// Ignore author comments in Markdown grammar, not by stripping source strings:
// fenced/indented code and backtick examples therefore keep their exact text.
function authorComments(md) {
  md.block.ruler.before('html_block', 'author_comment', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4 || !state.src.startsWith('<!--', start)) return false;
    const end = state.src.indexOf('-->', start + 4);
    if (end < 0) return false;
    let lastLine = startLine;
    while (lastLine < endLine && state.eMarks[lastLine] < end + 3) lastLine++;
    if (lastLine >= endLine || state.src.slice(end + 3, state.eMarks[lastLine]).trim()) return false;
    if (!silent) state.line = lastLine + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.inline.ruler.before('html_inline', 'author_comment', (state) => {
    if (!state.src.startsWith('<!--', state.pos)) return false;
    const end = state.src.indexOf('-->', state.pos + 4);
    if (end < 0) return false;
    state.pos = end + 3;
    return true;
  });
  md.core.ruler.after('inline', 'empty_comment_paragraph', (state) => {
    state.tokens = state.tokens.filter((token, index, tokens) => {
      const start = token.type === 'paragraph_open' ? index : token.type === 'inline' ? index - 1 : token.type === 'paragraph_close' ? index - 2 : -1;
      if (start < 0 || tokens[start]?.type !== 'paragraph_open' || tokens[start + 1]?.type !== 'inline' || tokens[start + 2]?.type !== 'paragraph_close') return true;
      return !tokens[start + 1].children.every(child => child.type === 'softbreak' || child.type === 'text' && !child.content.trim());
    });
  });
}

function displayMath(html) {
  // Keep a long equation scrollable by keyboard even when JavaScript is off.
  return `<div class="math-display" tabindex="0" role="group" aria-label="Display equation">${html}</div>\n`;
}

function mathematics(md) {
  md.use(katex, {
    delimiters: 'all',
    mathFence: false,
    allowInlineWithSpace: false,
    output: 'htmlAndMathml',
    trust: false,
    throwOnError: false,
    errorColor: '#9b2c2c',
    maxExpand: 1000,
    maxSize: 20,
    // HTML extensions are never accepted; Unicode and ordinary TeX warnings
    // may still render without flooding a static build with console output.
    logger: code => code === 'htmlExtension' ? 'error' : 'ignore',
    transformer: (html, display) => display ? displayMath(html) : html,
  });
  for (const type of ['math_inline', 'math_block']) {
    const render = md.renderer.rules[type];
    md.renderer.rules[type] = (tokens, index, ...args) => {
      const source = tokens[index].content;
      try {
        // Bound pathological input in addition to KaTeX's macro/size limits.
        if (source.length > 20000) throw new Error('Formula is too long.');
        return render(tokens, index, ...args);
      } catch {
        // An unsupported or excessively nested formula must not break the page.
        // Exception messages can contain source HTML, so use a constant title.
        const fallback = `<span class="katex-error" title="Invalid or unsupported mathematics">${md.utils.escapeHtml(source)}</span>`;
        return type === 'math_block' ? displayMath(fallback) : fallback;
      }
    };
  }
}

export function parseMarkdown(source, { base = '/', ids = new Set(), onReference } = {}) {
  const md = new MarkdownIt({ html: false, typographer: false, linkify: false, breaks: false });
  md.use(authorComments);
  md.use(mathematics);
  md.validateLink = value => {
    onReference?.(value);
    return contentUrl(value, base, ids, { allowEmail: true }) !== null;
  };
  const tokens = md.parse(typeof source === 'string' ? source : '', {});
  function rewrite(items) {
    for (const token of items) {
      for (const attribute of ['href', 'src']) {
        const value = token.attrGet(attribute);
        if (value === null) continue;
        const image = token.type === 'image';
        if (image) onReference?.(value, { image: true });
        const resolved = contentUrl(value, base, ids, { allowEmail: !image });
        if (resolved === null) {
          token.type = 'text'; token.tag = ''; token.attrs = null; token.children = null;
          break;
        }
        token.attrSet(attribute, resolved);
      }
      if (token.children) rewrite(token.children);
    }
  }
  rewrite(tokens);
  // HTML comes only from markdown-it's html:false renderer and untrusted-mode
  // KaTeX. Author HTML is escaped; neither parser ships to the browser.
  return parseFragment(md.renderer.render(tokens, md.options, {})).childNodes
    .filter(node => node.nodeName !== '#text' || node.value.trim());
}

const namespace = 'http://www.w3.org/1999/xhtml';
export function element(tag, attrs = {}, children = []) {
  const node = tree.createElement(tag, namespace, Object.entries(attrs).map(([name, value]) => ({ name, value })));
  for (const child of children) { tree.detachNode(child); tree.appendChild(node, child); }
  return node;
}

function addClass(node, name) {
  const classes = node.attrs.find(attribute => attribute.name === 'class');
  if (classes) classes.value += ` ${name}`;
  else node.attrs.push({ name: 'class', value: name });
}

function soleEmphasis(node) {
  if (node?.tagName !== 'p') return null;
  const children = node.childNodes.filter(child => child.nodeName !== '#text' || child.value.trim());
  return children.length === 1 && children[0].tagName === 'em' ? children[0] : null;
}

function unwrapEmphasis(paragraph, emphasis) {
  const children = [...emphasis.childNodes];
  for (const child of [...paragraph.childNodes]) tree.detachNode(child);
  for (const child of children) { tree.detachNode(child); tree.appendChild(paragraph, child); }
}

function entries(nodes, placeholders) {
  const output = [];
  let list;
  for (let index = 0; index < nodes.length;) {
    const heading = nodes[index];
    if (heading.tagName !== 'h3') {
      const emphasis = placeholders && soleEmphasis(heading);
      if (emphasis) { unwrapEmphasis(heading, emphasis); addClass(heading, 'empty'); }
      output.push(heading); list = undefined; index++;
      continue;
    }
    if (!list) { list = element('ul', { class: 'entry-list', role: 'list' }); output.push(list); }
    const row = element('li');
    tree.appendChild(list, row);
    tree.appendChild(row, element('h4', { class: 'entry-title' }, [...heading.childNodes]));
    let end = index + 1;
    while (end < nodes.length && nodes[end].tagName !== 'h3') end++;
    const body = nodes.slice(index + 1, end);
    const metadata = soleEmphasis(body[0]);
    if (metadata) {
      const paragraph = body.shift();
      unwrapEmphasis(paragraph, metadata); addClass(paragraph, 'entry-meta');
      tree.detachNode(paragraph); tree.appendChild(row, paragraph);
    }
    if (body.length === 1 && body[0].tagName === 'p') {
      addClass(body[0], 'entry-description'); tree.detachNode(body[0]); tree.appendChild(row, body[0]);
    } else if (body.length) tree.appendChild(row, element('div', { class: 'entry-description' }, body));
    index = end;
  }
  return output;
}

export function formatMarkdown(nodes) {
  const output = [];
  for (let index = 0; index < nodes.length;) {
    const subheading = nodes[index].tagName === 'h2' ? nodes[index] : null;
    const start = subheading ? index + 1 : index;
    let end = start;
    while (end < nodes.length && nodes[end].tagName !== 'h2') end++;
    const content = entries(nodes.slice(start, end), Boolean(subheading));
    if (subheading) output.push(element('div', { class: 'sub' }, [element('h3', {}, [...subheading.childNodes]), ...content]));
    else output.push(...content);
    index = end;
  }
  return output;
}

export function splitEntryIntro(nodes) {
  const first = nodes.findIndex(node => node.tagName === 'h3');
  return first < 0 ? { intro: formatMarkdown(nodes), entries: [] }
    : { intro: formatMarkdown(nodes.slice(0, first)), entries: formatMarkdown(nodes.slice(first)) };
}

export function plainText(nodes) {
  const blocks = new Set(['p', 'div', 'li', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th']);
  const annotation = node => {
    if (node.tagName === 'annotation' && node.attrs.some(attribute => attribute.name === 'encoding' && attribute.value === 'application/x-tex')) return node;
    for (const child of node.childNodes ?? []) {
      const found = annotation(child);
      if (found) return found;
    }
    return null;
  };
  const text = node => {
    if (node.nodeName === '#text') return node.value;
    if (node.tagName === 'br') return ' ';
    if (node.tagName === 'img') return node.attrs.find(attribute => attribute.name === 'alt')?.value ?? '';
    if (node.attrs?.some(attribute => attribute.name === 'class' && attribute.value.split(/\s+/).includes('katex'))) {
      // htmlAndMathml contains the same expression in visual HTML, MathML and
      // a TeX annotation. Preserve the original expression exactly once for
      // document titles and summaries, rather than concatenating all three.
      const source = annotation(node);
      if (source) return text(source);
    }
    return (node.childNodes ?? []).map(text).join('') + (blocks.has(node.tagName) ? ' ' : '');
  };
  return nodes.map(text).join(' ').replace(/\s+/g, ' ').trim();
}
