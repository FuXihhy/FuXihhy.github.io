import { test, expect, type Page, type Locator } from '@playwright/test';
import content from '../content/site.json' with { type: 'json' };
import { renderContentHtml } from '../scripts/render-content.mjs';
import { renderNotePageHtml } from '../scripts/note-pages.mjs';

const notePath = '/notes/homological-algebra/';
const longFormula = String.raw`\sum_{j=1}^{24} a_j = a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}+a_{16}+a_{17}+a_{18}+a_{19}+a_{20}+a_{21}+a_{22}+a_{23}+a_{24}`;
const fixture = [
  String.raw`Inline dollar $x_1+\alpha$ and bracket \(y^2+\beta\).`,
  'A [reference with $z$](https://example.org/reference?q=1#part) keeps its link and surrounding prose.',
  '$$\nE=mc^2\n$$',
  `\\[\n${longFormula}\n\\]`,
  'Inline code: `$literal$` and `\\(code\\)`.',
  '```tex\n$$not_math$$\n\\[not_math\\]\n```',
].join('\n\n');

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('requestfailed', request => {
    if (/KaTeX.*\.(?:woff2?|ttf)/i.test(request.url())) messages.push(request.url());
  });
});
test.afterEach(({ page }) => expect(errors.get(page) ?? []).toEqual([]));

async function expectFontsAndViewport(page: Page) {
  const status = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      loaded: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family),
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    };
  });
  expect(status.loaded.some(name => name.includes('KaTeX_Main'))).toBe(true);
  expect(status.width).toBeLessThanOrEqual(status.viewport + 1);
}

async function expectNoRawDelimiters(scope: Locator) {
  const prose = await scope.evaluate(node => {
    const copy = node.cloneNode(true) as Element;
    copy.querySelectorAll('.katex, code, pre').forEach(element => element.remove());
    return copy.textContent;
  });
  expect(prose).not.toMatch(/\$|\\[()[\]]/);
}

async function expectActualResearch(page: Page) {
  const research = page.locator('#research-copy');
  const formulas = research.locator('.katex');
  expect(await formulas.count()).toBeGreaterThanOrEqual(4);
  const tex = (await research.locator('.katex annotation[encoding="application/x-tex"]').allTextContents())
    .map(value => value.replace(/\s+/g, ''));
  expect(tex).toEqual(expect.arrayContaining([String.raw`\mathcal{N}=2`, 'SU(3)', String.raw`\mathcal{S}`, String.raw`L_\infty`]));
  await expect(research.locator('.katex-mathml math')).toHaveCount(await formulas.count());
  await expect(research.locator('.katex-html[aria-hidden="true"]')).toHaveCount(await formulas.count());
  const linkedMath = research.locator('a').filter({ has: page.locator('.katex') });
  expect(await linkedMath.count()).toBeGreaterThan(0);
  for (const link of await linkedMath.all()) await expect(link).toHaveAttribute('href', /^https:\/\//);
  await expectNoRawDelimiters(research);
  await expectFontsAndViewport(page);
}

async function serveFixture(page: Page, baseURL: string, path: string) {
  const url = new URL(path, baseURL).href;
  await page.route(url, async route => {
    const response = await route.fetch();
    // Compile an isolated HTML response through the same build-time renderer.
    // User Markdown stays untouched, and all real stylesheet/font links remain.
    const template = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    const html = path === '/'
      ? renderContentHtml(template, content, '/', { about: '', research: fixture, notes: '', studentSeminar: '', miscellany: '' })
      : renderNotePageHtml(template, content, '/', `# Mathematical notation\n\n${fixture}`);
    await route.fulfill({ response, body: html });
  });
  await page.goto(url);
}

async function expectFixture(page: Page, selector: string) {
  const scope = page.locator(selector);
  await expect(scope.locator('.katex')).toHaveCount(5);
  await expect(scope.locator('.katex-display')).toHaveCount(2);
  await expect(scope.locator('.katex-mathml math')).toHaveCount(5);
  await expect(scope.locator('code .katex')).toHaveCount(0);
  await expect(scope.locator('p > code')).toHaveText(['$literal$', String.raw`\(code\)`]);
  await expect(scope.locator('pre > code')).toHaveText('$$not_math$$\n\\[not_math\\]\n');
  const link = scope.locator('a[href="https://example.org/reference?q=1#part"]');
  await expect(link).toHaveCount(1);
  await expect(link.locator('.katex')).toHaveCount(1);
  await expect(link).toContainText('reference with');
  await expect(scope).toContainText('keeps its link and surrounding prose.');
  await expectNoRawDelimiters(scope);
  await expectFontsAndViewport(page);
  if (page.viewportSize()!.width <= 390) {
    const scrollLeft = await scope.locator('.math-display').last().evaluate(root => {
      const scroller = [root, ...root.querySelectorAll('*')].find(element =>
        element.scrollWidth > element.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(element).overflowX),
      );
      if (!scroller) return null;
      scroller.scrollLeft = scroller.scrollWidth;
      return scroller.scrollLeft;
    });
    expect(scrollLeft, 'A long formula can scroll within its own block').toBeGreaterThan(0);
  }
}

test('Research formulas arrive as accessible server-rendered math with loaded local fonts', async ({ page }) => {
  const response = await page.goto('/');
  expect(await response!.text()).toContain('class="katex"');
  await expectActualResearch(page);
});

test('all four math delimiters preserve code and links while long display math stays contained', async ({ page, baseURL }) => {
  await serveFixture(page, baseURL!, '/');
  await expectFixture(page, '#research-copy');
});

test('the homepage and a note detail render math without JavaScript', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize()! });
  try {
    const noScript = await context.newPage();
    await noScript.goto(baseURL!);
    await expectActualResearch(noScript);
    await serveFixture(noScript, baseURL!, notePath);
    await expect(noScript.locator('#note-title')).toHaveText('Mathematical notation');
    await expectFixture(noScript, '#note-content');
  } finally { await context.close(); }
});
