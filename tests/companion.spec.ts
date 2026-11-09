import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import content from '../content/site.json' with { type: 'json' };

// Behavioral cases use a deterministic image-only fixture. A separate case
// verifies the real configured artwork; fixtures never change public/ or JSON.
const fixtureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect x="16" y="16" width="64" height="64" rx="8" fill="#e7f0f2" stroke="#1e5f74"/></svg>';

async function fixtureCompanion(page: Page, companion: { enabled: boolean; image: string; label: string; description: string }) {
  // Route the startup data rather than importing a second HMR-versioned module.
  // A fresh main module mounts exactly one instance and preserves browser storage.
  await page.unroute('**/content/site.json*');
  await page.route('**/content/site.json*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export default ${JSON.stringify({ ...content, companion })};`,
  }));
  await page.reload();
}

async function enable(page: Page) {
  await page.route('**/test-companion.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: fixtureSvg }));
  await fixtureCompanion(page, { enabled: true, image: 'test-companion.svg', label: '02', description: 'Test artwork' });
}
function trigger(page: Page) {
  return page.locator(page.viewportSize()!.width >= 1200 ? '#companion-figure' : '#companion-trigger');
}
function panel(page: Page) {
  return page.locator('#companion-card:visible, #companion-dialog[open]');
}

async function openResearchTools(page: Page) {
  const contents = page.getByRole('button', { name: 'Contents', exact: true });
  const inSheet = await contents.isVisible();
  if (inSheet) await contents.click();
  const nav = inSheet ? page.locator('#contents-sheet nav') : page.locator('nav:visible').first();
  await nav.locator('a[href="#research"]').click();
  await expect(page.locator('#research-title')).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-label', 'Open page tools for Research');
  await trigger(page).click();
  await expect(panel(page).locator('.companion-where')).toHaveText('Research');
}

async function useConfiguredArtwork(page: Page) {
  if (!content.companion.enabled || !content.companion.image) await enable(page);
}

async function expectSpriteStopped(page: Page) {
  const sprites = page.locator('.companion-sprite');
  if (!await sprites.count()) return;
  const states = await sprites.evaluateAll(items => items.map(item => ({
    playing: (item as HTMLElement).dataset.spritePlaying,
    animations: item.querySelector('.companion-strip')!.getAnimations().filter(animation => animation.playState === 'running').length,
  })));
  expect(states.every(state => state.playing === 'false' && state.animations === 0)).toBe(true);
  for (const sprite of await page.locator('.companion-sprite:visible').all()) {
    await expect(sprite.locator('.companion-still')).toBeVisible();
    await expect(sprite.locator('.companion-strip')).toBeHidden();
  }
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('configured companion artwork loads, animates, and stops when hidden', async ({ page }) => {
  test.skip(!content.companion.enabled, 'Owner explicitly disabled the configured companion.');
  await expect(trigger(page)).toBeVisible();
  await expect(trigger(page).locator('.companion-art')).toBeVisible();
  const images = page.locator('#companion-dock img, #companion-header img');
  expect(await images.count()).toBeGreaterThan(0);
  await expect.poll(async () => images.evaluateAll(items =>
    items.every(item => (item as HTMLImageElement).complete && (item as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  const sprite = trigger(page).locator('.companion-sprite');
  if (content.companion.sprite) {
    await expect(sprite).toHaveCount(1);
    const artwork = content.companion.sprite;
    await expect(sprite.locator('.companion-strip')).toHaveJSProperty('naturalWidth', artwork.columns * artwork.frameWidth);
    await expect(sprite.locator('.companion-strip')).toHaveJSProperty('naturalHeight', artwork.rows * artwork.frameHeight);
    await expect(sprite.locator('.companion-still')).toHaveJSProperty('naturalWidth', artwork.frameWidth);
    await expect(sprite.locator('.companion-still')).toHaveJSProperty('naturalHeight', artwork.frameHeight);
    // Keep the pointer outside the local gaze area: looking deliberately uses
    // a still direction frame, while idle must genuinely advance atlas frames.
    await page.mouse.move(0, 0);
    await expect(sprite).toHaveAttribute('data-sprite-playing', 'true');
    const strip = sprite.locator('.companion-strip');
    await expect.poll(async () => strip.evaluate(image => image.getAnimations().filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0);
    const initialFrame = await strip.evaluate(image => getComputedStyle(image).transform);
    await expect.poll(async () => strip.evaluate(image => getComputedStyle(image).transform), { timeout: 4000 }).not.toBe(initialFrame);
    await trigger(page).click();
    await panel(page).getByRole('button', { name: 'Hide the companion' }).click();
    await expectSpriteStopped(page);
    await expect(page.locator('.companion-sprite:visible')).toHaveCount(0);
  }
});

test('companion is completely dormant with empty artwork', async ({ page }) => {
  await fixtureCompanion(page, { enabled: true, image: '', label: '02', description: '' });
  await expect(page.locator('[data-companion], [data-companion-trigger], #companion-dialog')).toHaveCount(0);
  await expect(page.locator('#companion-dock img, #companion-header img')).toHaveCount(0);
});

test('keyboard opens useful tools, Escape closes and restores focus', async ({ page }) => {
  await enable(page);
  const button = trigger(page);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  if (page.viewportSize()!.width >= 1200) await expect(page.locator('#companion-card')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Let 02 explore', exact: true })).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('hidden preference survives reload and has a keyboard restoration path', async ({ page }) => {
  await enable(page);
  await trigger(page).click();
  await panel(page).getByRole('button', { name: 'Hide the companion' }).click();
  const restore = page.getByRole('button', { name: 'Show the companion', exact: true });
  await expect(restore).toBeVisible();
  await expect(restore).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offprint.companion.v1')!).hidden)).toBe(true);
  await page.reload();
  await enable(page);
  await expect(restore).toBeVisible();
  const visibleImages = page.locator('#companion-dock img:visible, #companion-header img:visible');
  await expect(visibleImages).toHaveCount(0);
  await restore.focus();
  await page.keyboard.press('Enter');
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-label', /Open page tools/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offprint.companion.v1')!).hidden)).toBe(false);
});

test('companion offers exploration instead of a copy-link control', async ({ page }) => {
  await enable(page);
  await openResearchTools(page);
  await expect(panel(page).getByRole('button', { name: 'Let 02 explore', exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: /copy/i })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: /^Continue at / })).toHaveCount(0);
  await expect(page.locator('.companion-copy-fallback')).toHaveCount(0);
});

test('system reduced motion fully disables decorative animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useConfiguredArtwork(page);
  await trigger(page).click();
  await expect(panel(page).getByRole('button', { name: 'Motion reduced by system' })).toBeDisabled();
  const animations = await page.locator('.companion-art').evaluateAll(images => images.map(image => ({
    animation: getComputedStyle(image).animationName, transition: getComputedStyle(image).transitionDuration,
  })));
  expect(animations.every(value => value.animation === 'none' && value.transition === '0s')).toBe(true);
  await expectSpriteStopped(page);
});

test('motion can be paused and the preference is retained', async ({ page }) => {
  await useConfiguredArtwork(page);
  await trigger(page).click();
  await panel(page).getByRole('button', { name: 'Pause motion' }).click();
  await expect(panel(page).getByRole('button', { name: 'Resume motion' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offprint.companion.v1')!).paused)).toBe(true);
  await page.keyboard.press('Escape');
  const names = await page.locator('.companion-art').evaluateAll(images => images.map(image => getComputedStyle(image).animationName));
  expect(names.every(name => name === 'none')).toBe(true);
  await expectSpriteStopped(page);
});

test('desktop dragging stays inside its desk and can be reset by keyboard', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'Dragging is deliberately unavailable on narrow screens.');
  await enable(page);
  const button = trigger(page);
  const start = await button.boundingBox();
  const desk = await page.locator('#companion-desk').boundingBox();
  expect(start).not.toBeNull(); expect(desk).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(desk!.x - 500, desk!.y - 400, { steps: 5 });
  await page.mouse.up();
  const final = await button.boundingBox();
  expect(final!.x).toBeGreaterThanOrEqual(desk!.x + 7);
  expect(final!.y).toBeGreaterThanOrEqual(desk!.y + 7);
  expect(final!.x + final!.width).toBeLessThanOrEqual(desk!.x + desk!.width - 7);
  expect(final!.y + final!.height).toBeLessThanOrEqual(desk!.y + desk!.height - 7);
  await expect(panel(page)).toHaveCount(0);
  await button.focus(); await page.keyboard.press('Enter');
  const reset = panel(page).getByRole('button', { name: 'Reset position' });
  await expect(reset).toBeVisible(); await reset.focus(); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offprint.companion.v1')!).offset)).toEqual({ x: .5, y: .5 });
  await expect(button).toBeFocused();
});

test('unavailable browser storage does not break opening or hiding', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await enable(page);
  await trigger(page).click();
  await panel(page).getByRole('button', { name: 'Hide the companion' }).click();
  await expect(page.getByRole('button', { name: 'Show the companion', exact: true })).toBeVisible();
});

test('short desktop viewports use a modal instead of overlapping the rail navigation', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'This is the short desktop fallback.');
  await page.setViewportSize({ width: 1440, height: 620 });
  await enable(page);
  await trigger(page).click();
  await expect(page.locator('#companion-dialog')).toBeVisible();
  await expect(page.locator('#companion-card')).toBeHidden();
});

test('cancelled desktop drag leaves the next keyboard activation usable', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'Only desktop exposes dragging.');
  await enable(page);
  const button = trigger(page);
  const start = await button.boundingBox();
  await page.mouse.move(start!.x + 44, start!.y + 46);
  await page.mouse.down();
  await page.mouse.move(start!.x + 60, start!.y + 40);
  await button.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up();
  // A browser cancellation emits no click; synthetic pointerup may, so close any
  // resulting panel before checking the independent keyboard path.
  if (await panel(page).count()) await page.keyboard.press('Escape');
  await button.focus(); await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
});

test('open companion controls pass automated accessibility checks', async ({ page }) => {
  await enable(page);
  await trigger(page).click();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('storage updates restore displaced companion focus without stealing content focus', async ({ page }) => {
  await enable(page);
  await trigger(page).click();
  await expect(panel(page).getByRole('button', { name: 'Let 02 explore', exact: true })).toBeFocused();
  const updateHidden = async (hidden: boolean) => page.evaluate(value => {
    const key = 'offprint.companion.v1';
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify({ hidden: value, paused: false, offset: { x: .5, y: .5 } });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue }));
  }, hidden);
  await updateHidden(true);
  await expect(page.getByRole('button', { name: 'Show the companion', exact: true })).toBeFocused();
  await expect(panel(page)).toHaveCount(0);
  await updateHidden(false);
  await expect(trigger(page)).toBeFocused();
  const heading = page.locator('#about-title');
  await heading.focus();
  await updateHidden(true);
  await expect(heading).toBeFocused();
  await updateHidden(false);
  await expect(heading).toBeFocused();
});

test('viewport changes preserve companion focus and leave unrelated focus untouched', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'Exercises both directions from the desktop rail.');
  await enable(page);
  await trigger(page).click();
  await expect(page.locator('#companion-card')).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect(page.locator('#companion-trigger')).toBeFocused();
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#companion-dialog')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#companion-figure')).toBeFocused();
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await panel(page).getByRole('button', { name: 'Hide the companion' }).click();
  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect(page.locator('#companion-trigger')).toBeFocused();
  await expect(page.locator('#companion-trigger')).toHaveAttribute('aria-label', 'Show the companion');
  const heading = page.locator('#about-title');
  await heading.focus();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(heading).toBeFocused();
});

test('shrinking desktop height closes the card before it overlaps navigation', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'Desktop nonmodal-card regression.');
  await enable(page);
  await trigger(page).click();
  await expect(page.locator('#companion-card')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Let 02 explore', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 580 });
  await expect(page.locator('#companion-card')).toBeHidden();
  await expect(page.locator('#companion-dialog')).toBeHidden();
  await expect(page.locator('#companion-figure')).toBeFocused();
  await expect(page.locator('#companion-figure')).toHaveAttribute('aria-expanded', 'false');
});
