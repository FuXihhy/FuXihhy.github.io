import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { renderContentHtml } from './render-content.mjs';
import { renderNotePageHtml } from './note-pages.mjs';
import { parseMarkdown, plainText } from './markdown-content.mjs';

const bodyIds = ['about-copy', 'research-copy', 'notes-intro', 'notes-list',
  'student-seminar-intro', 'student-seminars-list', 'miscellany-copy'];
const fixture = `<!doctype html><html lang="en"><head><title>Preview</title><meta name="description" content="Default description"></head><body>
<nav><a href="#research">Research</a></nav><main id="research">
<h1 id="person-name" class="empty retain-class">Name placeholder</h1><p id="person-local-name"></p><p id="person-role"></p>
${bodyIds.map(id => `<div id="${id}" class="empty retain-class">Old content</div>`).join('\n')}
</main><footer>Keep this layout</footer></body></html>`;

function inspect(html) {
  const document = parse(html);
  const nodes = [];
  function walk(node) {
    nodes.push(node);
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(document);
  const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
  const byId = id => nodes.find(node => attr(node, 'id') === id);
  const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
  const normalized = node => text(node).replace(/\s+/g, ' ').trim();
  const descendants = node => {
    const result = [];
    for (const child of node.childNodes ?? []) result.push(child, ...descendants(child));
    return result;
  };
  const withClass = (node, name) => descendants(node).filter(child => (attr(child, 'class') ?? '').split(/\s+/).includes(name));
  return { nodes, attr, byId, text, normalized, descendants, withClass };
}

test('empty or commented Markdown clears body containers without inventing placeholder content', () => {
  const result = inspect(renderContentHtml(fixture, {}, '/', {
    research: '<!-- This former research introduction is deliberately hidden. -->',
    studentSeminar: ' \n\n<!-- Keep a private editing note here. -->\n',
  }));
  for (const id of bodyIds) {
    assert.equal(result.normalized(result.byId(id)), '', id);
    assert.equal(result.attr(result.byId(id), 'class'), 'retain-class', id);
  }
  assert.equal(result.normalized(result.byId('person-name')), 'Name placeholder');
  assert.equal(result.normalized(result.nodes.find(node => node.tagName === 'footer')), 'Keep this layout');
  assert.equal(result.normalized(result.nodes.find(node => node.tagName === 'title')), 'Preview');
});

test('Markdown prose, introductions, entries and optional dates are readable in static HTML', () => {
  const html = renderContentHtml(fixture, {
    name: 'Example Person', nameLocal: '示例姓名', role: 'Example role', affiliation: 'Example affiliation',
  }, '/academic/', {
    about: 'An **example** introduction.\n\nA second paragraph\ncontinues here.\n\n- **Contact me:**\n\n  [person@example.org](mailto:person@example.org)\n\n  [Example profile](https://example.org/profile)',
    research: 'Current research.\n\n## Papers & preprints\n\n### [A paper](files/paper.pdf)\n\n*2026*\n\nA short summary.',
    notes: 'Some working notes.\n\n### [Example notes](files/notes.pdf)\n\nA short description.',
    studentSeminar: 'An informal student seminar.\n\nAnother introduction paragraph.\n\n### [First seminar](https://example.org/talk)\n\n*Sep 13, 2026*\n\nFirst explanation.\n\nAnother paragraph with an [extra link](files/extra.pdf).\n\n- A first point\n- A second point\n\n### Undated seminar\n\nA description without a date.',
    miscellany: 'An introduction before the projects.\n\n## Projects\n\n_To be added._',
  });
  const result = inspect(html);
  for (const id of bodyIds) assert.equal(result.attr(result.byId(id), 'class'), 'retain-class', id);
  assert.equal(result.normalized(result.byId('person-name')), 'Example Person');
  assert.equal(result.normalized(result.byId('person-local-name')), '示例姓名');
  assert.equal(result.normalized(result.byId('person-role')), 'Example role · Example affiliation');
  const paragraphs = id => result.byId(id).childNodes.filter(node => node.tagName === 'p').map(result.normalized);
  assert.deepEqual(paragraphs('about-copy'), ['An example introduction.', 'A second paragraph continues here.']);
  assert.equal(result.normalized(result.byId('notes-intro')), 'Some working notes.');
  assert.deepEqual(paragraphs('student-seminar-intro'), ['An informal student seminar.', 'Another introduction paragraph.']);
  assert.deepEqual(result.withClass(result.byId('student-seminars-list'), 'entry-title').map(result.normalized), ['First seminar', 'Undated seminar']);
  assert.deepEqual(result.withClass(result.byId('student-seminars-list'), 'entry-meta').map(result.normalized), ['Sep 13, 2026']);
  assert.match(result.normalized(result.byId('student-seminars-list')), /First explanation.*Another paragraph with an extra link.*A first point.*A second point.*Undated seminar/);
  assert.ok(result.descendants(result.byId('research-copy')).some(node => node.tagName === 'h3' && result.normalized(node) === 'Papers & preprints'));
  assert.deepEqual(result.descendants(result.byId('miscellany-copy')).filter(node => node.tagName === 'p').map(result.normalized), ['An introduction before the projects.', 'To be added.']);
  assert.ok(result.descendants(result.byId('miscellany-copy')).some(node => node.tagName === 'h3' && result.normalized(node) === 'Projects'));
  assert.equal(result.withClass(result.byId('miscellany-copy'), 'entry-meta').length, 0);
  const hrefs = result.nodes.filter(node => node.tagName === 'a').map(node => result.attr(node, 'href'));
  for (const href of ['/academic/files/paper.pdf', '/academic/files/notes.pdf', '/academic/files/extra.pdf', 'https://example.org/talk', 'mailto:person@example.org']) assert.ok(hrefs.includes(href), href);
  assert.equal(result.normalized(result.nodes.find(node => node.tagName === 'title')), 'Example Person · Academic homepage');
  const description = result.attr(result.nodes.find(node => node.tagName === 'meta'), 'content');
  assert.match(description, /An example introduction\./);
  assert.doesNotMatch(description, /\*\*|<!--/);
});

test('only the first standalone emphasis paragraph is entry metadata, without date rewriting', () => {
  const result = inspect(renderContentHtml(fixture, {}, '/', {
    studentSeminar: '### Dated entry\n\n*Uploaded Nov 8, 2026 · Chinese*\n\nAn explanation.\n\n*An emphasized remark, not another date.*\n\n### Undated entry\n\nOrdinary opening description.\n\n*Another emphasized remark.*',
  }));
  assert.deepEqual(result.withClass(result.byId('student-seminars-list'), 'entry-meta').map(result.normalized), ['Uploaded Nov 8, 2026 · Chinese']);
  assert.match(result.normalized(result.byId('student-seminars-list')), /An emphasized remark, not another date/);
  assert.match(result.normalized(result.byId('student-seminars-list')), /Another emphasized remark/);
});

test('raw HTML cannot create executable nodes and identity stays escaped', () => {
  const payload = '<script>alert("x")</script> & <img src=x onerror=alert(1)>';
  const html = renderContentHtml(fixture, { name: '</title><script>alert(1)</script>' }, '/', {
    about: payload,
    notes: '### <img src=x onerror=alert(1)>\n\n' + payload,
    studentSeminar: '<iframe src="https://outside.example/"></iframe>\n\n### Ordinary heading\n\nSafe content.',
  });
  const result = inspect(html);
  assert.equal(result.nodes.filter(node => ['script', 'img', 'iframe'].includes(node.tagName)).length, 0);
  assert.equal(result.normalized(result.byId('person-name')), '</title><script>alert(1)</script>');
  assert.match(result.normalized(result.byId('about-copy')), /<script>alert\("x"\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('editing comments are omitted while literal comments in code remain readable', () => {
  const html = renderContentHtml(fixture, {}, '/', {
    about: '<!-- PRIVATE BLOCK NOTE -->\nVisible text <!-- PRIVATE INLINE NOTE --> continues.\n\n`<!-- inline code sample -->`\n\n```html\n<!-- fenced code sample -->\n```',
    research: '<!--\nPRIVATE RESEARCH BACKUP\n-->',
  });
  const result = inspect(html);
  assert.doesNotMatch(html, /PRIVATE/);
  assert.match(result.normalized(result.byId('about-copy')), /Visible text\s+continues/);
  assert.match(result.normalized(result.byId('about-copy')), /<!-- inline code sample -->/);
  assert.match(result.normalized(result.byId('about-copy')), /<!-- fenced code sample -->/);
  assert.equal(result.normalized(result.byId('research-copy')), '');
});

test('Markdown links honor the resolved site base and valid existing anchors', () => {
  const result = inspect(renderContentHtml(fixture, {}, '/nested/project/', {
    about: '[File](files/note.pdf?download=1#page=2) [Root file](/files/reference.pdf) [Research](#research) [Web](https://example.org/paper) [Email](mailto:person@example.org) [Profile file](/files/profile.pdf)\n\n![Diagram](assets/diagram.png)',
  }));
  const urls = result.nodes.filter(node => node.tagName === 'a').map(node => result.attr(node, 'href'));
  assert.deepEqual(urls, ['#research', '/nested/project/files/note.pdf?download=1#page=2', '/nested/project/files/reference.pdf', '#research', 'https://example.org/paper', 'mailto:person@example.org', '/nested/project/files/profile.pdf']);
  const image = result.nodes.find(node => node.tagName === 'img');
  assert.equal(result.attr(image, 'src'), '/nested/project/assets/diagram.png');
  assert.equal(result.attr(image, 'alt'), 'Diagram');
});

test('unsafe URL schemes, encoded traversal and missing anchors never become active links', () => {
  const urls = ['javascript:alert(1)', 'data:text/html,test', '//outside.example/file', '../private.pdf', '..?view=1',
    '%2e%2e/private.pdf', '%2e%2e%2fprivate.pdf', '..%5cprivate.pdf', 'files/%00file.pdf', '%2ffiles/a.pdf',
    '#missing', 'https://user:password@example.org/', 'mailto:person@example.org?subject=test',
    'mailto:person@example.org%0d%0aBcc:other@example.org', 'mailto:person@example.org,other@example.org'];
  const result = inspect(renderContentHtml(fixture, {}, '/project/', { about: urls.map((url, index) => `[Invalid ${index}](<${url}>)\n\n![Invalid image ${index}](<${url}>)`).join('\n\n') + '\n\n![Mail image](mailto:person@example.org)\n\n![Embedded image](data:image/png;base64,AAAA)' }));
  assert.equal(result.nodes.filter(node => node.tagName === 'a').length, 1);
  assert.equal(result.nodes.filter(node => node.tagName === 'img').length, 0);
  assert.match(result.normalized(result.byId('about-copy')), /Invalid 0/);
});

test('About Markdown owns the editable contact heading and links without a JSON fallback', () => {
  const legacySettings = { email: 'old@example.org', links: [{ label: 'Old profile', url: 'https://example.org/old' }] };
  const result = inspect(renderContentHtml(fixture, legacySettings, '/', {
    about: 'Introduction.\n\n- **Get in touch:**\n\n  [New email](mailto:new@example.org)\n\n  [New profile](https://example.org/new)',
  }));
  const about = result.byId('about-copy');
  assert.equal(result.normalized(about), 'Introduction. Get in touch: New email New profile');
  const links = result.descendants(about).filter(node => node.tagName === 'a');
  assert.deepEqual(links.map(node => result.attr(node, 'href')), ['mailto:new@example.org', 'https://example.org/new']);
  assert.equal(result.descendants(about).filter(node => node.tagName === 'strong').length, 1);
  const removed = inspect(renderContentHtml(fixture, legacySettings, '/', { about: 'Introduction.' }));
  assert.equal(removed.normalized(removed.byId('about-copy')), 'Introduction.');
  assert.equal(removed.nodes.filter(node => node.tagName === 'a').length, 1);
});

test('invalid site bases are rejected', () => {
  for (const base of ['https://example.org/', '//example.org/', '/../', '/repo?query', '/repo\\file']) {
    assert.throws(() => renderContentHtml(fixture, {}, base), /root-relative/);
  }
});

const noteFixture = `<!doctype html><html lang="en"><head><title>Note preview</title><meta name="description" content="Preview"></head>
<body><a id="note-site-name" href="%BASE_URL%">Author</a><a href="%BASE_URL%#notes">Back to Notes</a>
<main><h1 id="note-title">Note</h1><div id="note-content"></div></main></body></html>`;

test('note pages retain native headings and produce PDF actions with adjacent thumbnails without loading PDF frames', () => {
  for (const base of ['/', '/nested/project/']) {
    const result = inspect(renderNotePageHtml(noteFixture, { name: 'Example Author' }, base,
      '# Homological **Algebra**\n\nTwo versions of these notes.\n\n## Handwritten\n\n### Details\n\n[Open handwritten PDF](files/notes/handwritten.pdf)\n\n![First handwritten page](files/notes/handwritten.webp)\n\n## Typeset\n\n[Open LaTeX PDF](/files/notes/typeset.pdf)\n\n![First typeset page](/files/notes/typeset.webp)'));
    assert.equal(result.normalized(result.byId('note-title')), 'Homological Algebra');
    assert.equal(result.normalized(result.byId('note-site-name')), 'Example Author');
    assert.equal(result.normalized(result.nodes.find(node => node.tagName === 'title')), 'Homological Algebra · Example Author');
    assert.equal(result.attr(result.nodes.find(node => node.tagName === 'meta'), 'content'), 'Two versions of these notes.');
    assert.deepEqual(result.nodes.filter(node => /^h[123]$/.test(node.tagName ?? '')).map(node => node.tagName), ['h1', 'h2', 'h3', 'h2']);
    assert.equal(result.withClass(result.byId('note-content'), 'entry-list').length, 0);
    const blocks = result.withClass(result.byId('note-content'), 'note-pdf-block');
    assert.equal(blocks.length, 2);
    for (const [index, filename] of ['handwritten', 'typeset'].entries()) {
      const block = blocks[index];
      const links = result.descendants(block).filter(node => node.tagName === 'a');
      assert.deepEqual(links.map(node => result.attr(node, 'href')), [`${base}files/notes/${filename}.pdf`, `${base}files/notes/${filename}.pdf`]);
      assert.equal(result.normalized(links[0]), index === 0 ? 'Open handwritten PDF' : 'Open LaTeX PDF');
      assert.equal(result.attr(links[1], 'download'), '');
      const button = result.descendants(block).find(node => node.tagName === 'button');
      assert.equal(result.attr(button, 'type'), 'button');
      assert.equal(result.attr(button, 'hidden'), '');
      assert.equal(result.attr(button, 'aria-expanded'), 'false');
      assert.equal(result.attr(button, 'data-pdf-src'), `${base}files/notes/${filename}.pdf`);
      assert.equal(result.attr(button, 'data-pdf-title'), result.normalized(links[0]));
      const thumbnail = result.withClass(block, 'document-thumbnail');
      assert.equal(thumbnail.length, 1);
      assert.equal(result.attr(result.descendants(thumbnail[0]).find(node => node.tagName === 'img'), 'src'), `${base}files/notes/${filename}.webp`);
    }
    assert.equal(result.nodes.filter(node => ['iframe', 'object', 'embed'].includes(node.tagName)).length, 0);
    assert.ok(result.nodes.some(node => node.tagName === 'a' && result.attr(node, 'href') === `${base}#notes`));
  }
});

test('note pages only enhance standalone local PDFs and retain the Markdown safety boundary', () => {
  const result = inspect(renderNotePageHtml(noteFixture, { name: '<script>name</script>' }, '/project/',
    '# Safe note\n\nSee [the PDF](files/note.pdf) for details.\n\n[External PDF](https://example.org/note.pdf)\n\n[Unsafe](%2e%2e/private.pdf)\n\n<iframe src="files/private.pdf"></iframe>\n\n<!-- author note -->\n\n`<!-- code example -->`'));
  assert.equal(result.withClass(result.byId('note-content'), 'note-pdf-block').length, 0);
  assert.equal(result.nodes.filter(node => ['iframe', 'script', 'button'].includes(node.tagName)).length, 0);
  const links = result.descendants(result.byId('note-content')).filter(node => node.tagName === 'a');
  assert.deepEqual(links.map(node => result.attr(node, 'href')), ['/project/files/note.pdf', 'https://example.org/note.pdf']);
  assert.equal(result.normalized(result.byId('note-site-name')), '<script>name</script>');
  assert.doesNotMatch(result.normalized(result.byId('note-content')), /author note/);
  assert.match(result.normalized(result.byId('note-content')), /<!-- code example -->/);
});

test('note pages require exactly one top-level Markdown title', () => {
  for (const markdown of ['No title.', '# First\n\n# Second', '> # Nested title']) {
    assert.throws(() => renderNotePageHtml(noteFixture, {}, '/', markdown), /one nonempty top-level # title/);
  }
});

test('all four math delimiters produce static accessible KaTeX in prose, links, headings and blocks', () => {
  const result = inspect(renderContentHtml(fixture, {}, '/project/', {
    research: String.raw`### $\mathcal{N}=2$ theories

Inline $L_\infty$ and \(SU(3)\), with [class $\mathcal{S}$](https://example.org/class-s).

$$
\sum_{j=0}^{n} x_j = \frac{n(n+1)}{2}
$$

\[
H^2(X) = 0
\]`,
  }));
  const content = result.byId('research-copy');
  const math = result.descendants(content).filter(node => node.tagName === 'math');
  assert.equal(math.length, 6);
  assert.equal(result.withClass(content, 'katex').length, 6);
  for (const node of math) assert.equal(node.namespaceURI, 'http://www.w3.org/1998/Math/MathML');
  for (const node of result.withClass(content, 'katex-html')) assert.equal(result.attr(node, 'aria-hidden'), 'true');
  assert.equal(result.withClass(result.withClass(content, 'entry-title')[0], 'katex').length, 1);
  const link = result.descendants(content).find(node => node.tagName === 'a');
  assert.equal(result.attr(link, 'href'), 'https://example.org/class-s');
  assert.equal(result.withClass(link, 'katex').length, 1);
  const displays = result.withClass(content, 'math-display');
  assert.equal(displays.length, 2);
  for (const display of displays) {
    assert.equal(result.attr(display, 'tabindex'), '0');
    assert.equal(result.attr(display, 'role'), 'group');
    assert.equal(result.attr(display, 'aria-label'), 'Display equation');
  }
  assert.equal(result.nodes.filter(node => node.tagName === 'script').length, 0);
});

test('math parsing leaves code, escaped dollars, currency and hidden author comments alone', () => {
  const markdown = String.raw`Visible $x^2$.

<!-- PRIVATE $z$ and \(w\)
$$
y = 2
$$
-->

Still visible <!-- PRIVATE $q$ --> text.

\$5 and \$10; a $5 purchase and a $10 purchase.

` + '`$code$ and \\(code\\)`\n\n```math\n$$fenced$$\n\\[fenced\\]\n```\n\n    $indented$';
  const html = renderContentHtml(fixture, {}, '/', { about: markdown });
  const result = inspect(html);
  const content = result.byId('about-copy');
  assert.equal(result.withClass(content, 'katex').length, 1);
  assert.doesNotMatch(html, /PRIVATE/);
  const codes = result.descendants(content).filter(node => node.tagName === 'code');
  assert.deepEqual(codes.map(result.text), ['$code$ and \\(code\\)', '$$fenced$$\n\\[fenced\\]\n', '$indented$\n']);
  assert.match(result.normalized(content), /\$5 and \$10; a \$5 purchase and a \$10 purchase\./);
  assert.equal(result.withClass(content, 'math-display').length, 0);
});

test('math cannot create links, load images or execute HTML extensions', () => {
  const formulas = [
    String.raw`\href{javascript:alert(1)}{click}`,
    String.raw`\href{https://outside.example/}{click}`,
    String.raw`\url{https://outside.example/}`,
    String.raw`\includegraphics{https://outside.example/pixel.png}`,
    String.raw`\htmlClass{injected}{x}`,
    String.raw`\htmlId{injected}{x}`,
    String.raw`\htmlStyle{position:fixed;inset:0}{x}`,
    String.raw`\htmlData{injected=yes}{x}`,
    String.raw`\text{<img src=x onerror=alert(1)>}`,
  ];
  const result = inspect(renderContentHtml(fixture, {}, '/', {
    about: formulas.map(source => `$${source}$`).join('\n\n') + '\n\n[Safe Markdown link](https://example.org/)',
  }));
  const nodes = result.descendants(result.byId('about-copy'));
  assert.deepEqual(nodes.filter(node => node.tagName === 'a').map(node => result.attr(node, 'href')), ['https://example.org/']);
  assert.equal(nodes.filter(node => ['script', 'img', 'iframe', 'object', 'embed'].includes(node.tagName)).length, 0);
  assert.ok(nodes.every(node => !(node.attrs ?? []).some(attribute => /^on/i.test(attribute.name) || attribute.name === 'data-injected' || attribute.value === 'injected')));
  assert.ok(nodes.every(node => !result.attr(node, 'style')?.includes('position:fixed')));
  assert.match(result.normalized(result.byId('about-copy')), /\\href/);
});

test('invalid formulas and macro loops stay readable without breaking later content or exceeding size limits', () => {
  const result = inspect(renderContentHtml(fixture, {}, '/', {
    research: String.raw`Bad $\frac{1}{$ then a valid $x+1$.

$$
\def\loop{\loop}\loop
$$

$$
\rule{5000em}{5000em}
$$

$\unknowncommand{<script>alert(1)</script>}$

Final paragraph.`,
    notes: `### Very long formula\n\n$${'x'.repeat(20001)}$\n\nLater text.`,
  }));
  const research = result.byId('research-copy');
  assert.ok(result.withClass(research, 'katex-error').length >= 2);
  assert.match(result.normalized(research), /\\frac\{1\}\{/);
  assert.match(result.normalized(research), /Final paragraph\./);
  assert.match(result.normalized(result.byId('notes-list')), /Later text\./);
  assert.equal(result.withClass(result.byId('notes-list'), 'katex-error').length, 1);
  assert.ok(result.nodes.every(node => !result.attr(node, 'style')?.includes('5000em')));
  assert.equal(result.nodes.filter(node => node.tagName === 'script').length, 0);
});

test('math contributes one expression to plain summaries and note document titles', () => {
  const source = String.raw`The $\mathcal{N}=2$ theory has \(L_\infty\) symmetry.`;
  assert.equal(plainText(parseMarkdown(source)), String.raw`The \mathcal{N}=2 theory has L_\infty symmetry.`);
  const home = inspect(renderContentHtml(fixture, {}, '/', { about: source }));
  assert.equal(home.attr(home.nodes.find(node => node.tagName === 'meta'), 'content'), String.raw`The \mathcal{N}=2 theory has L_\infty symmetry.`);
  const note = inspect(renderNotePageHtml(noteFixture, { name: 'Example Author' }, '/project/',
    String.raw`# The $H^2(X)$ example

A $\frac{a}{b}$ calculation.`));
  assert.equal(note.normalized(note.nodes.find(node => node.tagName === 'title')), 'The H^2(X) example · Example Author');
  assert.equal(note.attr(note.nodes.find(node => node.tagName === 'meta'), 'content'), String.raw`A \frac{a}{b} calculation.`);
  assert.equal(note.withClass(note.byId('note-title'), 'katex').length, 1);
  assert.equal(note.withClass(note.byId('note-content'), 'katex').length, 1);
});
