import { test, expect, type Locator, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
const panel = (page: Page) => page.locator('#companion-card:visible, #companion-dialog[open]');
const home = (page: Page) => page.locator(page.viewportSize()!.width >= 1200 ? '#companion-figure' : '#companion-trigger');
const roaming = (page: Page) => page.locator('#companion-roamer');

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await expect(home(page).locator('.companion-strip')).toHaveJSProperty('naturalWidth', 3072);
});
test.afterEach(({ page }) => expect(errors.get(page) ?? []).toEqual([]));

async function startExploring(page: Page) {
  await home(page).click();
  await panel(page).getByRole('button', { name: 'Let 02 explore', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-companion-roaming', 'true');
  await expect(roaming(page)).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(roaming(page).locator('.companion-strip')).toHaveJSProperty('naturalWidth', 3072);
  await expect(roaming(page).locator('.companion-strip')).toHaveJSProperty('naturalHeight', 4576);
  await page.mouse.move(0, 0);
}

async function openRoamingControls(page: Page) {
  // A keyboard user can activate the moving character without chasing it.
  await roaming(page).focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
}

async function expectInsideViewport(page: Page) {
  // setViewportSize resolves before the resize event is necessarily delivered.
  // Require containment promptly after layout reconciliation, not in that gap.
  await expect.poll(async () => roaming(page).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return Math.max(-rect.left, -rect.top,
      rect.right - window.innerWidth, rect.bottom - window.innerHeight,
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }), { timeout: 500 }).toBeLessThanOrEqual(1);
}

async function expectMovement(page: Page) {
  const initial = await roaming(page).boundingBox();
  await expect.poll(async () => {
    const rect = await roaming(page).boundingBox();
    return Math.hypot(rect!.x - initial!.x, rect!.y - initial!.y);
  }, { timeout: 8000 }).toBeGreaterThan(8);
  await expectInsideViewport(page);
}

async function expectFrozen(page: Page) {
  const initial = await roaming(page).boundingBox();
  await page.waitForTimeout(350);
  const final = await roaming(page).boundingBox();
  expect(Math.hypot(final!.x - initial!.x, final!.y - initial!.y)).toBeLessThan(1);
  await expect(roaming(page).locator('.companion-sprite')).toHaveAttribute('data-sprite-playing', 'false');
}

test('02 explores the viewport and can be recalled from a stationary control', async ({ page }) => {
  await startExploring(page);
  await expectMovement(page);
  if (page.viewportSize()!.width >= 1200) {
    await expect(page.locator('#companion-figure')).toBeHidden();
    await page.locator('#companion-recall').click();
  } else {
    await page.locator('#companion-trigger').click();
    await panel(page).getByRole('button', { name: 'Bring 02 back', exact: true }).click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-companion-roaming', 'false');
  await expect(roaming(page)).toBeHidden();
  await expect(home(page)).toBeVisible();
});

test('mouse-opened roaming controls resume exploration after closing and moving away', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'Exercises the desktop fine-pointer interaction.');
  await startExploring(page);
  await expectMovement(page);
  const box = (await roaming(page).boundingBox())!;
  const point = { x: box.x + box.width * .5, y: box.y + box.height * .6 };
  await page.mouse.move(point.x, point.y);
  const stopped = (await roaming(page).boundingBox())!;
  await page.waitForTimeout(250);
  const held = (await roaming(page).boundingBox())!;
  expect(Math.hypot(held.x - stopped.x, held.y - stopped.y)).toBeLessThan(1);
  await page.mouse.click(point.x, point.y);
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Close page tools', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.mouse.move(0, 0);
  // Do not blur the returned focus: a mouse user's normal close gesture must
  // resume movement without requiring an extra click somewhere in the page.
  await expectMovement(page);
});

test('pausing and system reduced motion freeze exploration as well as sprite animation', async ({ page }) => {
  await startExploring(page);
  await expectMovement(page);
  await openRoamingControls(page);
  await panel(page).getByRole('button', { name: 'Pause motion', exact: true }).click();
  await page.keyboard.press('Escape');
  await expectFrozen(page);
  await expect(page.locator('html')).toHaveAttribute('data-companion-roaming', 'true');
  await openRoamingControls(page);
  await panel(page).getByRole('button', { name: 'Resume motion', exact: true }).click();
  await page.keyboard.press('Escape');
  await home(page).evaluate(button => (button as HTMLElement).blur());
  await roaming(page).evaluate(button => (button as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectFrozen(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expectMovement(page);
});

test('exploration stays reachable after resizing and hiding returns to the dock', async ({ page }) => {
  await startExploring(page);
  await page.setViewportSize({ width: 320, height: 580 });
  await expectInsideViewport(page);
  await openRoamingControls(page);
  await panel(page).getByRole('button', { name: 'Hide the companion', exact: true }).click();
  await expect(roaming(page)).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-companion-roaming', 'false');
  await page.getByRole('button', { name: 'Show the companion', exact: true }).click();
  await expect(page.locator('#companion-trigger .companion-art')).toBeVisible();
  await expect(roaming(page)).toBeHidden();
});

test('the explicit Pet 02 action provides an accessible happy reaction', async ({ page }) => {
  await home(page).click();
  const pet = panel(page).getByRole('button', { name: 'Pet 02', exact: true });
  await pet.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => page.locator('.companion-sprite:visible').evaluateAll(items =>
    items.some(item => (item as HTMLElement).dataset.spriteState === 'happy'),
  )).toBe(true);
  await expect.poll(async () => page.locator('.companion-sprite:visible').evaluateAll(items =>
    items.every(item => (item as HTMLElement).dataset.spriteState !== 'happy'),
  ), { timeout: 5000 }).toBe(true);
});

async function stroke(page: Page, target: Locator, height: number) {
  const box = (await target.boundingBox())!;
  const y = box.y + box.height * height;
  await page.mouse.move(box.x + box.width * .3, y);
  await page.mouse.move(box.x + box.width * .72, y, { steps: 6 });
  await page.mouse.move(box.x + box.width * .3, y, { steps: 6 });
}

test('only rubbing the head triggers happiness, while a body pass and hover do not', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1200, 'Fine-pointer petting is exercised on the full-size desktop companion.');
  const figure = page.locator('#companion-figure');
  const sprite = figure.locator('.companion-sprite');
  await stroke(page, figure, .75);
  await expect(sprite).not.toHaveAttribute('data-sprite-state', 'happy');
  const box = (await figure.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .2);
  await page.waitForTimeout(250);
  await expect(sprite).not.toHaveAttribute('data-sprite-state', 'happy');
  await stroke(page, figure, .2);
  await expect(sprite).toHaveAttribute('data-sprite-state', 'happy');
  await expect(sprite.locator('.companion-strip')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(sprite).not.toHaveAttribute('data-sprite-state', 'happy', { timeout: 5000 });
});

test('resting naturally cycles through varied brief actions', async ({ page }) => {
  await page.clock.install();
  await page.reload();
  await expect(home(page).locator('.companion-strip')).toHaveJSProperty('naturalWidth', 3072);
  await page.mouse.move(0, 0);
  const sprite = home(page).locator('.companion-sprite');
  await sprite.evaluate(element => {
    const states: string[] = [];
    (window as unknown as { observedPetStates: string[] }).observedPetStates = states;
    new MutationObserver(() => {
      const state = (element as HTMLElement).dataset.spriteState;
      if (state && states.at(-1) !== state) states.push(state);
    }).observe(element, { attributes: true, attributeFilter: ['data-sprite-state'] });
  });
  await page.clock.runFor(36_000);
  const states = await page.evaluate(() => (window as unknown as { observedPetStates: string[] }).observedPetStates);
  const lively = new Set(states.filter(state => ['waiting', 'thinking', 'waving', 'jumping'].includes(state)));
  expect(lively.size).toBeGreaterThanOrEqual(2);
  expect(states).toContain('idle');
});

test('background visibility suspends exploration and resumes it on return', async ({ page }) => {
  await startExploring(page);
  await expectMovement(page);
  // Exercise the browser lifecycle event explicitly; headless tabs do not
  // reliably become hidden when another test-owned tab is brought forward.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectFrozen(page);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectMovement(page);
});
