import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const detailPath = '/notes/homological-algebra/';
const failures = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(failures.get(page) ?? [], 'Unexpected page JavaScript errors').toEqual([]);
});

async function expectNoOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
}

async function expectPreviewsLoaded(page: Page) {
  const images = page.locator('.note-pdf-block .document-thumbnail img');
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll(items => items.every(image =>
    (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
  ))).toBe(true);
  for (const image of await images.all()) {
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('alt', /\S/);
  }
}

// Read a real served file header without buffering the large handwritten PDF,
// even if a future development server ignores the requested byte range.
async function expectPdfHeader(url: string) {
  const response = await fetch(url, { headers: { Range: 'bytes=0-15' } });
  expect([200, 206]).toContain(response.status);
  expect(response.headers.get('content-type')).toMatch(/^application\/pdf(?:;|$)/);
  expect(response.body).not.toBeNull();
  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (bytes < 5) {
      const part = await reader.read();
      if (part.done) break;
      parts.push(part.value);
      bytes += part.value.byteLength;
    }
  } finally {
    await reader.cancel();
  }
  expect(Buffer.concat(parts).subarray(0, 5).toString('ascii')).toBe('%PDF-');
}

test('a note topic opens its detail page with two real downloadable PDFs and a return path', async ({ page }, testInfo) => {
  await page.goto('/');
  const topic = page.locator('#notes-list a').filter({ hasText: /Homological Algebra/ });
  await expect(topic).toHaveCount(1);
  await topic.click();
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
  await expect(page.locator('h1#note-title')).toHaveText(/Homological Algebra/);
  await expect(page.locator('h1')).toHaveCount(1);
  await expectPreviewsLoaded(page);

  const blocks = page.locator('.note-pdf-block');
  await expect(blocks).toHaveCount(2);
  const urls: string[] = [];
  for (const block of await blocks.all()) {
    const open = block.locator('.document-actions a:not([download])');
    const download = block.locator('.document-actions a[download]');
    await expect(open).toHaveCount(1);
    await expect(download).toHaveCount(1);
    const href = await open.getAttribute('href');
    expect(href).toMatch(/\.pdf$/i);
    await expect(download).toHaveAttribute('href', href!);
    expect(await download.getAttribute('download')).not.toBeNull();
    urls.push(new URL(href!, page.url()).href);
  }
  expect(new Set(urls).size).toBe(2);
  if (testInfo.project.name === 'desktop') {
    await test.step('both download targets serve actual PDF signatures', async () => {
      for (const url of urls) await expectPdfHeader(url);
    });
  }
  await expectNoOverflow(page);
  await page.getByRole('link', { name: /Back to notes/ }).first().click();
  await expect(page).toHaveURL(/\/#notes$/);
  await expect(page.locator('#notes-title')).toBeInViewport();
});

test('PDF requests begin only when reading is requested and closing restores the thumbnail', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'pdfViewerEnabled', { configurable: true, value: true }));
  const pdfRequests: string[] = [];
  // The native PDF viewer is not under test. Keep this interaction check small;
  // the preceding test checks the real server targets independently.
  await page.route(/\.pdf(?:[?#]|$)/i, route => {
    pdfRequests.push(route.request().url());
    return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' });
  });
  await page.goto(detailPath);
  await expectPreviewsLoaded(page);
  const blocks = page.locator('.note-pdf-block');
  await expect(blocks).toHaveCount(2);
  await expect(page.locator('iframe')).toHaveCount(0);
  for (const block of await blocks.all()) {
    await expect(block.getByRole('button', { name: 'Read in page', exact: true })).toBeVisible();
  }
  expect(pdfRequests).toEqual([]);

  for (const block of await blocks.all()) {
    const open = block.locator('.document-actions a:not([download])');
    const pdfUrl = new URL((await open.getAttribute('href'))!, page.url()).href;
    const title = (await open.innerText()).trim();
    const button = block.locator('.document-actions button');
    const before = pdfRequests.length;
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const frame = block.locator('iframe.note-pdf-frame');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('title', title);
    expect(await frame.evaluate(element => (element as HTMLIFrameElement).src)).toBe(`${pdfUrl}#view=FitH`);
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(block.locator('.document-thumbnail img')).toBeHidden();
    await expect.poll(() => pdfRequests.length).toBeGreaterThan(before);
    expect(pdfRequests.slice(before).every(url => url === pdfUrl)).toBe(true);
    await expectNoOverflow(page);
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(block.locator('.document-thumbnail img')).toBeVisible();
  }
});

test('browsers without an embedded PDF viewer retain previews and direct file links', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'pdfViewerEnabled', { configurable: true, value: false }));
  const pdfRequests: string[] = [];
  await page.route(/\.pdf(?:[?#]|$)/i, route => {
    pdfRequests.push(route.request().url());
    return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' });
  });
  await page.goto(detailPath);
  await expectPreviewsLoaded(page);
  await expect(page.locator('.document-actions button:visible')).toHaveCount(0);
  await expect(page.locator('.document-actions a[download]')).toHaveCount(2);
  await expect(page.locator('.document-actions a:not([download])')).toHaveCount(2);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(pdfRequests).toEqual([]);
  await expectNoOverflow(page);
});

test('without JavaScript the introduction, previews, open links and downloads remain usable', async ({ browser, baseURL, page }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize()! });
  try {
    const noScript = await context.newPage();
    const pdfRequests: string[] = [];
    noScript.on('request', request => {
      if (/\.pdf(?:[?#]|$)/i.test(request.url())) pdfRequests.push(request.url());
    });
    await noScript.goto(new URL(detailPath, baseURL).href);
    await expect(noScript.locator('h1#note-title')).toHaveText(/Homological Algebra/);
    await expect(noScript.locator('#note-content')).not.toBeEmpty();
    await expectPreviewsLoaded(noScript);
    await expect(noScript.locator('.document-actions a[download]')).toHaveCount(2);
    await expect(noScript.locator('.document-actions a:not([download])')).toHaveCount(2);
    for (const button of await noScript.locator('.document-actions button').all()) await expect(button).toBeHidden();
    await expect(noScript.locator('iframe')).toHaveCount(0);
    expect(pdfRequests).toEqual([]);
    await expectNoOverflow(noScript);
    await noScript.getByRole('link', { name: /Back to notes/ }).first().click();
    await expect(noScript.locator('#notes-title')).toBeInViewport();
  } finally { await context.close(); }
});

test('the note detail stays within the viewport and passes accessibility checks', async ({ page }) => {
  await page.goto(detailPath);
  await expectPreviewsLoaded(page);
  await expectNoOverflow(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});
