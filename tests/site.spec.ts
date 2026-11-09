import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import configuredContent from '../content/site.json' with { type: 'json' };
import type { SiteContent } from '../src/content';
import { readMarkdownContent, renderContentHtml } from '../scripts/render-content.mjs';

const content: SiteContent = configuredContent;

// Read the standard source tokens independently of the site's HTML decorator.
// Assertions below check source wording/order/URLs, not an expected HTML snapshot
// produced by the renderer under test.
const MarkdownIt = createRequire(import.meta.url)('markdown-it');
const sourceParser = new MarkdownIt({ html: true, typographer: false });
type SourceToken = { type: string; tag: string; content: string; level: number; children?: SourceToken[]; attrs?: [string, string][] };
function inlineText(token: SourceToken): string {
  return (token.children ?? [token]).map(child => {
    if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
    if (child.type === 'html_inline' && /^<!--/.test(child.content)) return '';
    return child.content;
  }).join('').replace(/\s+/g, ' ').trim();
}
function sourceOutline(markdown: string) {
  const tokens = sourceParser.parse(markdown, {}) as SourceToken[];
  const intros: string[] = [];
  const entries: { title: string; url?: string; date?: string }[] = [];
  let foundHeading = false;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      foundHeading = true;
      if (tokens[i].tag !== 'h3') continue;
      const title = tokens[i + 1];
      const entry: { title: string; url?: string; date?: string } = { title: inlineText(title) };
      entry.url = title.children?.find(child => child.type === 'link_open')?.attrs?.find(([key]) => key === 'href')?.[1];
      if (tokens[i + 3]?.type === 'paragraph_open') {
        const date = tokens[i + 4];
        const children = date?.children ?? [];
        if (children[0]?.type === 'em_open' && children.at(-1)?.type === 'em_close') entry.date = inlineText(date);
      }
      entries.push(entry);
    } else if (!foundHeading && tokens[i].level === 0 && tokens[i].type === 'paragraph_open' && tokens[i + 1]?.type === 'inline') {
      intros.push(inlineText(tokens[i + 1]));
    }
  }
  return { intros, entries };
}

const errorsByPage = new WeakMap<Page, string[]>();
const externalRequestsByPage = new WeakMap<Page, string[]>();
const sections = [
  ['About', 'about'],
  ['Research', 'research'],
  ['Notes & Student Seminar', 'notes'],
  ['Miscellany', 'miscellany'],
] as const;

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  externalRequestsByPage.set(page, externalRequests);
  const origin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin;
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) externalRequests.push(url.href);
  });
  errorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page) ?? [], 'Browser console and runtime errors').toEqual([]);
  expect(externalRequestsByPage.get(page) ?? [], 'Unexpected external network requests').toEqual([]);
});

async function visibleNavigation(page: Page) {
  const contents = page.getByRole('button', { name: 'Contents', exact: true });
  const inSheet = await contents.isVisible();
  if (inSheet) {
    await contents.click();
    await expect(page.locator('#contents-sheet')).toBeVisible();
  }
  const nav = inSheet
    ? page.locator('#contents-sheet nav')
    : page.locator('nav:visible').first();
  await expect(nav).toBeVisible();
  return { nav, inSheet };
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(sizes.documentWidth).toBeLessThanOrEqual(sizes.viewportWidth + 1);
}

test('academic navigation reaches every section and the page stays within the viewport', async ({ page }) => {
  await expect(page.locator('h1#person-name')).toHaveCount(1);
  await expect(page.locator('main section')).toHaveCount(sections.length);
  await expect(page.locator('#cv, #contact, a[href="#cv"], a[href="#contact"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  for (const [name, id] of sections) {
    const { nav, inSheet } = await visibleNavigation(page);
    await expect(nav.getByRole('link')).toHaveCount(sections.length);
    const link = nav.locator(`a[href="#${id}"]`);
    await expect(link).toHaveAccessibleName(new RegExp(name));
    await expect(link).not.toContainText(/\b0[1-6]\b/);
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    if (inSheet) await expect(page.locator('#contents-sheet')).not.toBeVisible();
    await expect(page.locator(`#${id}-title`)).toBeFocused();
    await expect(page.locator(`#${id}-title`)).toBeInViewport();
  }
  await expectNoHorizontalOverflow(page);
});

test('Contents sheet supports keyboard dismissal and restores focus', async ({ page }) => {
  const contents = page.getByRole('button', { name: 'Contents', exact: true });
  if (!await contents.isVisible()) {
    await expect(page.locator('nav:visible').first()).toBeVisible();
    return;
  }
  await contents.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contents-sheet')).toBeVisible();
  expect(await page.locator('#contents-sheet').evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#contents-sheet')).not.toBeVisible();
  await expect(contents).toBeFocused();
});

test('keyboard skip link is first, visible on focus, and reaches main content', async ({ page }) => {
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip (to )?(main )?content/i });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const targetId = (await skip.getAttribute('href'))?.slice(1);
  expect(targetId).toBe('about-title');
  await page.keyboard.press('Enter');
  await expect(page.locator(`[id="${targetId}"]`)).toBeFocused();
});

test('Markdown files render their wording, entry order, dates and links without client rendering', async ({ page, browser }, testInfo) => {
  const docs = await readMarkdownContent();
  const about = sourceOutline(docs.about);
  const research = sourceOutline(docs.research);
  const notes = sourceOutline(docs.notes);
  const seminars = sourceOutline(docs.studentSeminar);
  const aboutURLs = (sourceParser.parse(docs.about, {}) as SourceToken[])
    .flatMap(token => token.children ?? []).filter(token => token.type === 'link_open')
    .map(token => token.attrs!.find(([key]) => key === 'href')![1]);
  async function checkContent(target: Page) {
    if (content.name) await expect(target.locator('#person-name')).toHaveText(content.name);
    await expect(target.locator('#about-copy > p')).toHaveText(about.intros);
    if (research.intros.length) await expect(target.locator('#research-copy > p')).toHaveText(research.intros);
    else if (!research.entries.length) {
      await expect(target.locator('#research-copy')).toBeEmpty();
      await expect(target.locator('#research-copy')).toBeHidden();
    }
    await expect(target.locator('#notes-intro > p')).toHaveText(notes.intros);
    await expect(target.locator('#student-seminar-intro > p')).toHaveText(seminars.intros);
    for (const [id, expected] of [['notes-list', notes], ['student-seminars-list', seminars]] as const) {
      const rows = target.locator(`#${id} > .entry-list > li`);
      await expect(rows).toHaveCount(expected.entries.length);
      await expect(target.locator(`#${id} .entry-title`)).toHaveText(expected.entries.map(entry => entry.title));
      for (const [index, entry] of expected.entries.entries()) {
        const row = rows.nth(index);
        if (entry.date) await expect(row.locator(':scope > .entry-meta')).toHaveText(entry.date);
        else await expect(row.locator(':scope > .entry-meta')).toHaveCount(0);
        if (entry.url) await expect(row.locator('.entry-title a')).toHaveJSProperty('href', new URL(entry.url, target.url()).href);
        else await expect(row.locator('.entry-title a')).toHaveCount(0);
      }
    }
    const aboutLinks = target.locator('#about-copy a');
    await expect(aboutLinks).toHaveCount(aboutURLs.length);
    for (const [index, url] of aboutURLs.entries()) {
      await expect(aboutLinks.nth(index)).toHaveJSProperty('href', new URL(url, target.url()).href);
    }
    await expect(target.locator('#about-links')).toHaveCount(0);
    await expect(target.locator('main')).not.toContainText(/<!--|PRIVATE EDITOR NOTE/);
  }
  await checkContent(page);
  await expect.poll(() => page.locator('img').evaluateAll(images => images.filter(image =>
    !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0,
  ).map(image => image.getAttribute('src')))).toEqual([]);
  if (testInfo.project.name === 'narrow') {
    await test.step('320px content and navigation remain available without JavaScript', async () => {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
      try {
        const noScript = await context.newPage();
        await noScript.goto(page.url());
        await checkContent(noScript);
        await expect(noScript.locator('h1#person-name')).toBeVisible();
        await expect(noScript.getByRole('button', { name: 'Contents', exact: true })).not.toBeVisible();
        const nav = noScript.locator('nav:visible').first();
        await expect(nav).toBeVisible();
        for (const [name, id] of sections) {
          await expect(noScript.locator(`#${id}-title`)).toHaveText(name);
          await nav.locator(`a[href="#${id}"]`).click();
          await expect(noScript).toHaveURL(new RegExp(`#${id}$`));
          await expect(noScript.locator(`#${id}-title`)).toBeInViewport();
        }
        await expectNoHorizontalOverflow(noScript);
      } finally { await context.close(); }
    });
  }
});

test('semantic structure, names, and contrast pass automated accessibility checks', async ({ page }, testInfo) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  if (['desktop', 'mobile'].includes(testInfo.project.name)) {
    await mkdir(new URL('../qa/', import.meta.url), { recursive: true });
    const path = fileURLToPath(new URL(`../qa/${testInfo.project.name}.png`, import.meta.url));
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('Initial viewport', { path, contentType: 'image/png' });
  }
});

test('configured URLs reject unsafe schemes and traversal while preserving usable targets', async ({ page }) => {
  const urls = await page.evaluate(async () => {
    const modulePath = '/src/content.ts';
    const { publicUrl } = await import(modulePath);
    return Object.fromEntries([
      '', 'javascript:alert(1)', 'data:text/html,test', '//outside.example/file',
      '..?view=1', '..#research', '../private.pdf', '%2e%2e/private.pdf',
      'files/notes.pdf', 'https://example.org/paper?q=1#abstract', '#research', '#missing-section',
    ].map(input => [input, publicUrl(input)]));
  });
  for (const value of ['', 'javascript:alert(1)', 'data:text/html,test', '//outside.example/file',
    '..?view=1', '..#research', '../private.pdf', '%2e%2e/private.pdf', '#missing-section']) {
    expect(urls[value], value).toBeNull();
  }
  expect(urls['files/notes.pdf']).toBe('/files/notes.pdf');
  expect(urls['https://example.org/paper?q=1#abstract']).toBe('https://example.org/paper?q=1#abstract');
  expect(urls['#research']).toBe('#research');
});

test('freshly compiled Markdown supports prose, dates, lists and comments without a browser parser', async ({ page }) => {
  const docs = {
    about: 'A **formatted** introduction with a [useful link](https://example.org/reference).\n\nA literal <script>window.injected = true</script> & a quotation: "hello".\n\n<!-- PRIVATE EDITOR NOTE -->\n\n- **Contact me:**\n\n  [A real profile link](https://example.org/profile)\n\n  [Unsafe email](mailto:person@example.org?bcc=someone@example.org)',
    research: '<!-- Temporarily hidden research prose. -->',
    notes: 'Notes introduction.\n\n### [A real note](https://example.org/note)\n\nTwo topics:\n\n- Geometry\n- Algebra',
    studentSeminar: 'A student seminar introduction.\n\nAnother introduction paragraph.\n\n### [Example seminar](https://example.org/talk)\n\n*Sep 13, 2026*\n\nIndividual seminar details.\n\nMore discussion with **emphasis**.\n\n### Undated seminar\n\nNo date was supplied.',
    miscellany: '## Projects\n\n### <img src=x onerror=alert(1)>\n\n[Unsafe link](javascript:alert(1))\n\n### [A real project link](https://example.org/project)\n\nPlain text & symbols.',
  };
  const rootURL = new URL('/', page.url()).href;
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  await page.route(rootURL, async route => {
    const original = await route.fetch();
    // Exercise a static compiled response, without Vite's development modules
    // (synthetic navigation can otherwise fail Chromium's local-network HMR
    // checks). Normal page tests above still execute the real application JS.
    const template = (await original.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace('</head>', `<style>${css}</style></head>`);
    const compiled = renderContentHtml(template, {
      ...content, name: 'Example <person>',
    }, '/', docs);
    await route.fulfill({ response: original, body: compiled });
  });
  await page.goto(rootURL);
  await expect(page.locator('#person-name')).toHaveText('Example <person>');
  await expect(page.locator('#about-copy > p')).toHaveText([
    'A formatted introduction with a useful link.',
    'A literal <script>window.injected = true</script> & a quotation: "hello".',
  ]);
  await expect(page.locator('#about-copy > p strong')).toHaveText('formatted');
  await expect(page.locator('#research-copy')).toBeEmpty();
  await expect(page.locator('#research-copy')).toBeHidden();
  await expect(page.locator('#notes-intro > p')).toHaveText('Notes introduction.');
  await expect(page.locator('#notes-list .entry-list > li ul > li')).toHaveText(['Geometry', 'Algebra']);
  await expect(page.locator('#student-seminar-intro > p')).toHaveText(['A student seminar introduction.', 'Another introduction paragraph.']);
  await expect(page.locator('#student-seminars-list .entry-title')).toHaveText(['Example seminar', 'Undated seminar']);
  await expect(page.locator('#student-seminars-list .entry-meta')).toHaveText('Sep 13, 2026');
  await expect(page.locator('#student-seminars-list')).toContainText('More discussion with emphasis.');
  await expect(page.locator('#about-copy script, #miscellany-copy img')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('PRIVATE EDITOR NOTE');
  await expect(page.locator('#miscellany-copy .entry-title').first()).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#miscellany-copy a')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'A real project link' })).toHaveAttribute('href', 'https://example.org/project');
  await expect(page.locator('#about-copy > ul a')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'A real profile link' })).toHaveAttribute('href', 'https://example.org/profile');
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  await expectNoHorizontalOverflow(page);
  // A second fresh response models editing Markdown and the Vite full reload.
  docs.studentSeminar = '<!-- Temporarily removed seminar material. -->';
  await page.reload();
  await expect(page.locator('#student-seminar-intro')).toBeEmpty();
  await expect(page.locator('#student-seminar-intro')).toBeHidden();
  await expect(page.locator('#student-seminars-list')).toBeEmpty();
});

test('reduced motion keeps navigation usable without smooth scrolling or running animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const { nav, inSheet } = await visibleNavigation(page);
  await nav.locator('a[href="#research"]').click();
  if (inSheet) await expect(page.locator('#contents-sheet')).not.toBeVisible();
  await expect(page.locator('#research-title')).toBeFocused();
  const motion = await page.evaluate(() => ({
    scroll: getComputedStyle(document.documentElement).scrollBehavior,
    activeAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
  }));
  expect(motion.scroll).toBe('auto');
  expect(motion.activeAnimations).toBe(0);
  await expectNoHorizontalOverflow(page);
});

test('disabled companion remains absent despite a stale visible preference', async ({ page }) => {
  let artworkRequested = false;
  await page.route('**/disabled-companion.svg', route => {
    artworkRequested = true;
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  });
  await page.route('**/content/site.json*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export default ${JSON.stringify({ ...content, companion: {
      enabled: false, image: 'disabled-companion.svg', label: '02', description: 'Disabled test artwork',
    } })};`,
  }));
  await page.evaluate(() => {
    localStorage.setItem('offprint.companion.v1', JSON.stringify({ hidden: false, offset: { x: 0.5, y: 0.5 } }));
  });
  await page.reload();
  await expect(page.locator('[data-companion], [data-companion-trigger], #companion-dialog')).toHaveCount(0);
  expect(artworkRequested).toBe(false);
});

test('content reflows at a halved desktop CSS viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One focused 200% layout-equivalent reflow check.');
  // Halving a 1440px CSS viewport exercises the layout consequence of 200%
  // browser zoom; this does not claim to automate native browser zoom itself.
  await page.setViewportSize({ width: 720, height: 500 });
  await expectNoHorizontalOverflow(page);
  const { nav } = await visibleNavigation(page);
  await nav.locator('a[href="#miscellany"]').click();
  await expect(page.locator('#miscellany-title')).toBeFocused();
  await expect(page.locator('#miscellany-title')).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});
