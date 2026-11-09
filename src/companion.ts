import { publicUrl, site } from './content';
import './companion.css';

type Section = { id: string; title: string; number: string };
type Settings = { hidden: boolean; paused: boolean; offset: { x: number; y: number } };
type Mood = 'hidden' | 'resting' | 'attentive' | 'dozing' | 'dragging' | 'tools';
type Reaction = 'happy' | 'jumping' | 'thinking' | 'waiting' | 'waving';
type SpriteArt = { frame: HTMLSpanElement; still: HTMLImageElement; sheet: HTMLImageElement; key: string; animation?: Animation };
const settingsKey = 'offprint.companion.v1';
const sections: Section[] = [
  ['about', 'About'], ['research', 'Research'], ['notes', 'Notes & Student Seminar'],
  ['miscellany', 'Miscellany'],
].map(([id, title], index) => ({ id, title, number: String(index + 1).padStart(2, '0') }));
const clamp = (value: number) => Math.min(1, Math.max(0, value));
let dispose: (() => void) | undefined;

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Memory state remains usable. */ }
}
function settingsFrom(value: unknown): Settings {
  const data = value as Partial<Settings> | null;
  return {
    hidden: data?.hidden === true,
    paused: data?.paused === true,
    offset: {
      x: typeof data?.offset?.x === 'number' && Number.isFinite(data.offset.x) ? clamp(data.offset.x) : .5,
      y: typeof data?.offset?.y === 'number' && Number.isFinite(data.offset.y) ? clamp(data.offset.y) : .5,
    },
  };
}

/** Supports the owner's v2 atlas while retaining the single-image fallback.
 * Atlas frames are displayed directly; neither the supplied drawing nor source
 * package is modified. Disabled/missing image configurations remain dormant.
 */
export function mountCompanion(): () => void {
  if (dispose) return dispose;
  const source = publicUrl(site.companion.image);
  const dock = document.getElementById('companion-dock');
  const header = document.getElementById('companion-header');
  if (!site.companion.enabled || !source || !dock || !header) return () => {};
  const sprite = site.companion.sprite;
  const supportedFrame = sprite && ((sprite.frameWidth === 192 && sprite.frameHeight === 208) ||
    (sprite.frameWidth === 384 && sprite.frameHeight === 416));
  const spriteSource = sprite?.columns === 8 && sprite.rows === 11 && supportedFrame
    ? publicUrl(sprite.image) : null;
  const spriteArt: SpriteArt[] = [];

  const controller = new AbortController();
  const signal = controller.signal;
  const wide = matchMedia('(min-width: 1200px)');
  const fine = matchMedia('(pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let settings = settingsFrom(read(settingsKey));
  let current = sections.find(section => `#${section.id}` === location.hash) ?? sections[0];
  let mood: Mood = 'resting';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let reactionTimer: ReturnType<typeof setTimeout> | undefined;
  let varietyTimer: ReturnType<typeof setTimeout> | undefined;
  let roamTimer: ReturnType<typeof setTimeout> | undefined;
  let reaction: Reaction | undefined;
  let varietyIndex = 0;
  let roaming = false;
  let roamMoving = false;
  let roamHovered = false;
  let roamNearby = false;
  let roamTravel: Animation | undefined;
  let roamPosition = { x: 0, y: 0 };
  let roamDirection: 'left' | 'right' = 'left';
  let stroke: { target: HTMLElement; x: number; time: number; distance: number; direction: number; turns: number } | undefined;
  let lastActivity = 0;
  let lastNod = 0;
  let suppressClick = false;
  let pressedOutside = false;
  let lastCompanionFocus: HTMLElement | null = null;
  let previousWide = wide.matches;
  let dragDirection: 'left' | 'right' = 'right';
  let gazeIndex: number | undefined;
  let lastGazeUpdate = 0;
  let pointer: { id: number; x: number; y: number; lastX: number; left: number; top: number; moved: boolean; offset: Settings['offset'] } | undefined;

  const den = document.createElement('div');
  den.className = 'companion-den';
  den.dataset.companion = '';
  den.innerHTML = `<div id="companion-desk" class="companion-desk">
    <button id="companion-figure" class="companion-figure" type="button" aria-expanded="false" aria-controls="companion-card"></button>
  </div><span class="companion-shelf" aria-hidden="true"></span>
  <p class="companion-caption">02</p>
  <button id="companion-recall" class="companion-recall" type="button" hidden>Bring 02 back</button>
  <button id="companion-restore" class="companion-restore" type="button" hidden>Show the companion</button>`;
  const figure = den.querySelector<HTMLButtonElement>('#companion-figure')!;
  const desk = den.querySelector<HTMLElement>('#companion-desk')!;
  const restore = den.querySelector<HTMLButtonElement>('#companion-restore')!;
  const recall = den.querySelector<HTMLButtonElement>('#companion-recall')!;
  den.querySelector<HTMLElement>('.companion-caption')!.textContent = `${site.companion.label || '02'} · A little company`;
  const trigger = document.createElement('button');
  trigger.id = 'companion-trigger'; trigger.className = 'companion-trigger'; trigger.type = 'button';
  trigger.dataset.companionTrigger = '';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', 'companion-dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const triggerText = document.createElement('span');
  triggerText.textContent = site.companion.label || '02'; triggerText.hidden = true;
  const roamer = document.createElement('button');
  roamer.id = 'companion-roamer'; roamer.className = 'companion-roamer'; roamer.type = 'button'; roamer.hidden = true;
  roamer.setAttribute('aria-haspopup', 'dialog'); roamer.setAttribute('aria-controls', 'companion-dialog');
  roamer.setAttribute('aria-expanded', 'false');
  function art() {
    const image = document.createElement('img');
    image.className = 'companion-art'; image.src = source!;
    image.alt = site.companion.description; image.draggable = false;
    image.width = sprite ? sprite.frameWidth : 96; image.height = sprite ? sprite.frameHeight : 96;
    if (!spriteSource || !sprite) return image;
    const frame = document.createElement('span');
    frame.className = 'companion-art companion-sprite';
    frame.setAttribute('role', 'img'); frame.setAttribute('aria-label', site.companion.description);
    frame.dataset.spriteState = 'static'; frame.dataset.spritePlaying = 'false';
    image.className = 'companion-still'; image.alt = '';
    const sheet = document.createElement('img');
    sheet.className = 'companion-strip'; sheet.src = spriteSource; sheet.alt = ''; sheet.draggable = false;
    sheet.width = sprite.columns * sprite.frameWidth; sheet.height = sprite.rows * sprite.frameHeight;
    sheet.style.width = `${sprite.columns * 100}%`; sheet.style.height = `${sprite.rows * 100}%`; sheet.hidden = true;
    frame.append(image, sheet);
    spriteArt.push({ frame, still: image, sheet, key: '' });
    sheet.addEventListener('load', renderSprites, { signal });
    return frame;
  }
  figure.append(art()); trigger.append(art(), triggerText); roamer.append(art());
  for (const host of [figure, roamer]) {
    const hearts = document.createElement('span');
    hearts.className = 'companion-hearts'; hearts.setAttribute('aria-hidden', 'true');
    hearts.innerHTML = '<i>♥</i><i>♥</i><i>♥</i>';
    host.append(hearts);
  }

  function tools(id: string, dialog: boolean) {
    const panel = document.createElement(dialog ? 'dialog' : 'div') as HTMLDialogElement | HTMLDivElement;
    panel.id = id; panel.className = dialog ? 'companion-dialog' : 'companion-card';
    panel.setAttribute('aria-labelledby', `${id}-title`);
    if (dialog) panel.setAttribute('closedby', 'any');
    else { panel.hidden = true; panel.setAttribute('role', 'group'); }
    panel.innerHTML = `<div class="companion-tools-inner">
      <div class="companion-tools-heading"><div><h2 id="${id}-title">02</h2><p class="companion-where"></p></div>
        <button class="companion-close" type="button" aria-label="Close page tools">×</button></div>
      <p class="companion-greeting">A little company while you read.</p>
      <div class="companion-play-actions">
        <button type="button" data-action="roam" aria-pressed="false">Let 02 explore</button>
        <button type="button" data-action="pet">Pet 02</button>
        <button type="button" data-action="jump">Hop!</button>
      </div>
      <div class="companion-actions">
        <button type="button" data-action="top">Back to top</button>
        <button type="button" data-action="motion" aria-pressed="false">Pause motion</button>
        <button type="button" data-action="hide">Hide the companion</button>
        <button type="button" data-action="reset" hidden>Reset position</button>
      </div>
      <p class="companion-fine">Try brushing the top of my head.</p>
    </div>`;
    if (dialog) {
      panel.querySelector<HTMLElement>('.companion-tools-heading')!.prepend(art());
      panel.querySelector<HTMLButtonElement>('[data-action="roam"]')!.autofocus = true;
    }
    return panel;
  }
  const card = tools('companion-card', false) as HTMLDivElement;
  const dialog = tools('companion-dialog', true) as HTMLDialogElement;
  den.append(card); dock.append(den); header.append(trigger); document.body.append(dialog, roamer);
  const panels = [card, dialog];
  const actors = [den, trigger, dialog, roamer];

  function announce(message: string) {
    const live = document.getElementById('live'); if (live) live.textContent = message;
  }
  const hasSelection = () => !window.getSelection()?.isCollapsed;
  const motionAllowed = () => !settings.paused && !reduced.matches && !document.hidden && !hasSelection();
  function setMood(value: Mood) {
    mood = settings.hidden ? 'hidden' : value;
    for (const node of actors) node.dataset.state = mood;
    renderSprites();
  }
  function renderSprites() {
    if (!sprite) return;
    const baseMode = reaction ?? (mood === 'dragging' ? `running-${dragDirection}` :
      mood === 'dozing' ? 'waiting' : gazeIndex !== undefined && (mood === 'resting' || mood === 'attentive') ? 'look' :
      mood === 'attentive' || mood === 'tools' ? 'waving' : 'idle');
    const sequences: Record<string, { row: number; frames: number; duration: number; loop: boolean }> = {
      idle: { row: 0, frames: 6, duration: 2400, loop: true },
      'running-right': { row: 1, frames: 8, duration: 880, loop: true },
      'running-left': { row: 2, frames: 8, duration: 880, loop: true },
      waving: { row: 3, frames: 4, duration: 720, loop: false },
      waiting: { row: 6, frames: 6, duration: 3600, loop: true },
      jumping: { row: 4, frames: 5, duration: 1000, loop: false },
      thinking: { row: 7, frames: 6, duration: 2100, loop: false },
    };
    const position = (column: number, row: number) => `translate(${-100 * column / sprite.columns}%, ${-100 * row / sprite.rows}%)`;
    for (const art of spriteArt) {
      const mode = art.frame.parentElement === roamer && roamMoving ? `running-${roamDirection}` : baseMode;
      const active = !settings.hidden && motionAllowed() && art.sheet.complete && art.sheet.naturalWidth > 0 &&
        art.frame.getClientRects().length > 0;
      const key = active ? `${mode}:${gazeIndex ?? ''}` : 'static';
      if (art.key === key) continue;
      art.animation?.cancel(); art.animation = undefined; art.key = key;
      art.frame.dataset.spriteState = active ? mode : 'static';
      art.frame.dataset.spritePlaying = 'false';
      art.still.hidden = active; art.sheet.hidden = !active;
      if (!active) continue;
      if (mode === 'happy') {
        // The supplied idle frame 3 has closed eyes and a genuine smile.
        // Ease into it through frame 2, then hold; do not loop the whole idle row.
        art.sheet.style.transform = position(3, 0);
        art.animation = art.sheet.animate([
          { transform: position(2, 0) }, { transform: position(3, 0) },
        ], { duration: 180, easing: 'steps(1, end)', fill: 'forwards' });
        art.frame.dataset.spritePlaying = 'true';
        art.animation.onfinish = () => { art.frame.dataset.spritePlaying = 'false'; };
        continue;
      }
      if (mode === 'look') {
        art.sheet.style.transform = position(gazeIndex! % 8, 9 + Math.floor(gazeIndex! / 8));
        continue;
      }
      const sequence = sequences[mode];
      const end = sequence.loop ? sequence.frames : sequence.frames - 1;
      art.sheet.style.transform = position(0, sequence.row);
      art.animation = art.sheet.animate([
        { transform: position(0, sequence.row) }, { transform: position(end, sequence.row) },
      ], { duration: sequence.duration, iterations: sequence.loop ? Infinity : 1,
        easing: `steps(${end}, end)`, fill: 'forwards' });
      art.frame.dataset.spritePlaying = 'true';
      art.animation.onfinish = () => { art.frame.dataset.spritePlaying = 'false'; };
    }
  }
  function stopIdle() {
    clearTimeout(idleTimer); idleTimer = undefined;
    clearTimeout(varietyTimer); varietyTimer = undefined;
  }
  function clearReaction() {
    clearTimeout(reactionTimer); reactionTimer = undefined; reaction = undefined;
    for (const node of [...actors, figure]) delete node.dataset.reaction;
  }
  function playReaction(value: Reaction, duration = value === 'happy' ? 1500 : value === 'jumping' ? 1200 : 2600) {
    if (settings.hidden || !motionAllowed()) return;
    freezeRoam(); gazeIndex = undefined;
    clearTimeout(varietyTimer); varietyTimer = undefined;
    clearTimeout(reactionTimer); reaction = value;
    for (const node of [...actors, figure]) node.dataset.reaction = value;
    for (const panel of panels) panel.querySelector<HTMLElement>('.companion-greeting')!.textContent =
      value === 'happy' ? 'That feels lovely. ♡' : value === 'jumping' ? 'A little hop, just for you.' : 'A little company while you read.';
    renderSprites();
    reactionTimer = setTimeout(() => {
      clearReaction(); renderSprites(); scheduleVariation(); scheduleRoam();
    }, duration);
  }
  function scheduleVariation() {
    if (varietyTimer || reaction || !motionAllowed() || settings.hidden || roaming ||
      mood === 'tools' || mood === 'dragging' || mood === 'dozing') return;
    varietyTimer = setTimeout(() => {
      varietyTimer = undefined;
      if (motionAllowed() && !settings.hidden && !roaming && mood !== 'tools' && mood !== 'dragging') {
        const choices: Reaction[] = ['waiting', 'thinking', 'waving', 'waiting', 'jumping'];
        playReaction(choices[varietyIndex++ % choices.length]);
      }
    }, varietyIndex === 0 ? 6500 : 7500 + Math.random() * 4500);
  }
  function scheduleIdle() {
    clearTimeout(idleTimer); idleTimer = undefined;
    if (!settings.hidden && motionAllowed() && mood !== 'tools' && mood !== 'dragging' && !roaming) {
      idleTimer = setTimeout(() => { stopIdle(); clearReaction(); setMood('dozing'); }, 90_000);
      scheduleVariation();
    }
  }
  function updateMotion() {
    const paused = settings.hidden || !motionAllowed();
    if (paused) { gazeIndex = undefined; stroke = undefined; freezeRoam(); clearReaction(); stopIdle(); }
    for (const node of actors) node.dataset.motion = paused ? 'paused' : 'on';
    for (const panel of panels) {
      const button = panel.querySelector<HTMLButtonElement>('[data-action="motion"]')!;
      button.textContent = reduced.matches ? 'Motion reduced by system' : settings.paused ? 'Resume motion' : 'Pause motion';
      button.setAttribute('aria-pressed', String(settings.paused || reduced.matches));
      button.disabled = reduced.matches;
      for (const action of ['pet', 'jump']) panel.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = paused;
      panel.querySelector<HTMLButtonElement>('[data-action="roam"]')!.disabled = !roaming && paused;
    }
    renderSprites(); scheduleIdle(); scheduleRoam();
  }
  function clampRoamPosition() {
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 8, top = (viewport?.offsetTop ?? 0) + 8;
    const width = viewport?.width ?? document.documentElement.clientWidth;
    const height = viewport?.height ?? window.innerHeight;
    roamPosition.x = Math.max(left, Math.min(roamPosition.x, left + width - roamer.offsetWidth - 16));
    roamPosition.y = Math.max(top, Math.min(roamPosition.y, top + height - roamer.offsetHeight - 16));
    roamer.style.transform = `translate(${roamPosition.x}px, ${roamPosition.y}px)`;
  }
  function freezeRoam() {
    clearTimeout(roamTimer); roamTimer = undefined;
    if (roamTravel) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(roamer).transform);
      roamPosition = { x: matrix.m41, y: matrix.m42 };
      roamTravel.cancel(); roamTravel = undefined;
      roamer.style.transform = `translate(${roamPosition.x}px, ${roamPosition.y}px)`;
    }
    roamMoving = false;
  }
  function canRoam() {
    return roaming && !settings.hidden && motionAllowed() && !roamHovered && !roamNearby && !reaction && card.hidden && !dialog.open;
  }
  function scheduleRoam(delay = 900 + Math.random() * 1400) {
    if (roamTimer || roamTravel || !canRoam()) return;
    roamTimer = setTimeout(() => {
      roamTimer = undefined;
      if (!canRoam()) return;
      clampRoamPosition();
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 16;
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const right = Math.max(left, left + width - roamer.offsetWidth - 32);
      const target = {
        x: roamPosition.x < (left + right) / 2 ? right - Math.random() * (right - left) * .22 : left + Math.random() * (right - left) * .22,
        y: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - roamer.offsetHeight - 18,
      };
      const distance = Math.hypot(target.x - roamPosition.x, target.y - roamPosition.y);
      roamDirection = target.x < roamPosition.x ? 'left' : 'right';
      roamMoving = true; gazeIndex = undefined; renderSprites();
      roamTravel = roamer.animate([
        { transform: `translate(${roamPosition.x}px, ${roamPosition.y}px)` },
        { transform: `translate(${target.x}px, ${target.y}px)` },
      ], { duration: Math.max(1000, Math.min(10000, distance / 115 * 1000)), easing: 'linear', fill: 'forwards' });
      roamTravel.onfinish = () => {
        roamPosition = target; roamTravel?.cancel(); roamTravel = undefined; roamMoving = false;
        clampRoamPosition();
        const stops: Reaction[] = ['waiting', 'thinking', 'jumping', 'waving'];
        playReaction(stops[varietyIndex++ % stops.length]);
        scheduleRoam();
      };
    }, delay);
  }
  function setRoaming(value: boolean, moveFocus = false) {
    freezeRoam(); clearReaction(); stroke = undefined; roamHovered = false; roamNearby = false;
    if (value && !roaming) {
      const box = figure.getBoundingClientRect();
      roamPosition = wide.matches ? { x: box.left, y: box.top } : { x: window.innerWidth - 110, y: window.innerHeight - 140 };
    }
    roaming = value;
    roamer.hidden = !value; figure.hidden = value; recall.hidden = !value || settings.hidden;
    document.documentElement.dataset.companionRoaming = String(value);
    if (value) { stopIdle(); clampRoamPosition(); }
    updateContext(); updateMotion(); place();
    if (moveFocus) (value ? (wide.matches ? recall : trigger) : invoker()).focus({ preventScroll: true });
  }
  function bounds() {
    return { width: Math.max(0, desk.clientWidth - figure.offsetWidth - 16), height: Math.max(0, desk.clientHeight - figure.offsetHeight - 16) };
  }
  function place() {
    if (!wide.matches || roaming) return;
    const area = bounds();
    figure.style.transform = `translate(${8 + area.width * settings.offset.x}px, ${8 + area.height * settings.offset.y}px)`;
    const displaced = Math.abs(settings.offset.x - .5) > .01 || Math.abs(settings.offset.y - .5) > .01;
    for (const panel of panels) panel.querySelector<HTMLButtonElement>('[data-action="reset"]')!.hidden = !displaced;
  }
  function updateContext() {
    const label = `Open page tools for ${current.title}`;
    figure.setAttribute('aria-label', label);
    trigger.setAttribute('aria-label', settings.hidden ? 'Show the companion' : label);
    roamer.setAttribute('aria-label', label);
    for (const panel of panels) {
      panel.querySelector<HTMLElement>('.companion-where')!.textContent = current.title;
      const explore = panel.querySelector<HTMLButtonElement>('[data-action="roam"]')!;
      explore.textContent = roaming ? 'Bring 02 back' : 'Let 02 explore';
      explore.setAttribute('aria-pressed', String(roaming));
      panel.querySelector<HTMLElement>('.companion-fine')!.textContent = fine.matches
        ? 'Brush my head for a smile. I’ll stop when you come close.' : 'Tap Pet 02 for a happy little hello.';
      panel.querySelector<HTMLButtonElement>('[data-action="reset"]')!.hidden = roaming || !wide.matches ||
        (Math.abs(settings.offset.x - .5) < .01 && Math.abs(settings.offset.y - .5) < .01);
    }
  }
  function invoker() { return roaming ? roamer : wide.matches ? figure : trigger; }
  function ownsElement(element: Element | null): element is HTMLElement {
    return Boolean(element && (den.contains(element) || dialog.contains(element) || trigger.contains(element) || roamer.contains(element)));
  }
  function ownsFocus() {
    if (ownsElement(document.activeElement)) return true;
    // A CSS breakpoint can remove the focused control before resize/media-query
    // callbacks run. Recover only that lost focus, never a deliberate move into
    // page content or the browser's chrome.
    return document.activeElement === document.body && lastCompanionFocus !== null &&
      lastCompanionFocus.getClientRects().length === 0;
  }
  function focusVisibleControl() {
    (settings.hidden && wide.matches ? restore : invoker()).focus({ preventScroll: true });
  }
  function resetExpanded() {
    for (const button of [figure, trigger, roamer]) button.setAttribute('aria-expanded', 'false');
    setMood('resting'); updateMotion();
  }
  function closeTools(returnFocus = false) {
    const wasCard = !card.hidden;
    card.hidden = true;
    if (dialog.open) dialog.close(); // Native modal returns focus to its invoker.
    resetExpanded();
    if (returnFocus && wasCard) invoker().focus({ preventScroll: true });
  }
  function syncHidden(moveFocus = false) {
    if (settings.hidden) { closeTools(); if (roaming) setRoaming(false); }
    desk.hidden = settings.hidden; restore.hidden = !settings.hidden;
    den.querySelector<HTMLElement>('.companion-shelf')!.hidden = settings.hidden;
    den.querySelector<HTMLElement>('.companion-caption')!.hidden = settings.hidden;
    trigger.querySelector<HTMLElement>('.companion-art')!.hidden = settings.hidden;
    triggerText.hidden = !settings.hidden;
    trigger.dataset.hidden = String(settings.hidden);
    document.documentElement.dataset.companion = settings.hidden ? 'hidden' : 'shown';
    setMood(settings.hidden ? 'hidden' : 'resting'); updateContext(); updateMotion(); place();
    if (moveFocus) focusVisibleControl();
  }
  function cardFits() {
    // Contents now occupies its own left rail. Only the right rail and viewport
    // constrain this card; no assumed navigation element is needed here.
    const rail = dock?.closest('.apparatus')?.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const minimumTop = Math.max(16, rail?.top ?? 16);
    return wide.matches && window.innerHeight >= 680 && box.top >= minimumTop &&
      box.left >= 0 && box.right <= document.documentElement.clientWidth;
  }
  function nod() {
    if (!motionAllowed() || performance.now() - lastNod < 400) return;
    lastNod = performance.now();
    if (!reaction) for (const node of actors) node.dataset.reaction = 'nod';
  }
  function openTools() {
    if (settings.hidden) {
      settings.hidden = false; save(settingsKey, settings); syncHidden(true); return;
    }
    if (!card.hidden || dialog.open) { closeTools(true); return; }
    freezeRoam(); clearReaction();
    updateContext();
    let useCard = !roaming && wide.matches && window.innerHeight >= 680;
    if (useCard) {
      card.hidden = false;
      useCard = cardFits();
      if (!useCard) card.hidden = true;
    }
    setMood('tools'); stopIdle();
    for (const button of [figure, trigger, roamer]) button.setAttribute('aria-expanded', 'true');
    if (useCard) {
      figure.setAttribute('aria-controls', card.id); figure.removeAttribute('aria-haspopup');
      card.querySelector<HTMLButtonElement>('[data-action="roam"]')!.focus({ preventScroll: true });
    } else {
      figure.setAttribute('aria-controls', dialog.id); figure.setAttribute('aria-haspopup', 'dialog');
      dialog.showModal();
    }
    renderSprites();
  }
  function navigate(section: Section | null) {
    closeTools();
    const target = section ? document.getElementById(`${section.id}-title`) : document.querySelector<HTMLElement>('h1');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    history.replaceState(null, '', section ? `#${section.id}` : `${location.pathname}${location.search}`);
    target.scrollIntoView({ block: 'start', behavior: motionAllowed() ? 'smooth' : 'instant' });
    target.focus({ preventScroll: true });
    if (section) {
      current = section; updateContext();
      window.dispatchEvent(new CustomEvent('sectionchange', { detail: section }));
    }
  }
  for (const panel of panels) {
    panel.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.classList.contains('companion-close')) { closeTools(true); return; }
      switch (button.dataset.action) {
        case 'roam': {
          const next = !roaming; closeTools(); setRoaming(next, true);
          announce(next ? '02 is exploring. Use Bring 02 back to call her home.' : '02 is back beside the page.'); break;
        }
        case 'pet': playReaction('happy'); announce('02 smiles happily.'); break;
        case 'jump': playReaction('jumping'); break;
        case 'top': navigate(null); break;
        case 'motion': settings.paused = !settings.paused; save(settingsKey, settings); updateMotion(); break;
        case 'hide': settings.hidden = true; save(settingsKey, settings); syncHidden(true); break;
        case 'reset': settings.offset = { x: .5, y: .5 }; save(settingsKey, settings); place();
          announce('Companion position reset.'); closeTools(true); break;
      }
    }, { signal });
    panel.addEventListener('animationend', () => {
      if (!reaction) for (const node of actors) delete node.dataset.reaction;
    }, { signal });
  }
  for (const button of [figure, trigger, roamer]) {
    button.addEventListener('click', event => {
      if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
      openTools();
    }, { signal });
    button.addEventListener('pointerenter', () => {
      if (button === roamer) { roamHovered = true; freezeRoam(); }
      if (mood !== 'tools') setMood('attentive');
    }, { signal });
    button.addEventListener('pointerleave', () => {
      stroke = undefined;
      if (button === roamer && !roamer.matches(':focus-visible')) { roamHovered = false; scheduleRoam(900); }
      if (mood !== 'tools' && mood !== 'dragging') setMood('resting');
      scheduleVariation();
    }, { signal });
    button.addEventListener('focus', () => {
      if (button === roamer) {
        roamHovered = roamer.matches(':focus-visible') || roamer.matches(':hover');
        if (roamHovered) freezeRoam(); else scheduleRoam();
      }
      if (mood !== 'tools') setMood('attentive');
    }, { signal });
    button.addEventListener('blur', () => {
      if (button === roamer && !roamer.matches(':hover')) { roamHovered = false; scheduleRoam(); }
      if (mood !== 'tools') setMood('resting');
    }, { signal });
    button.addEventListener('animationend', () => {
      if (!reaction) for (const node of actors) delete node.dataset.reaction;
    }, { signal });
  }
  recall.addEventListener('click', () => { closeTools(); setRoaming(false, true); }, { signal });
  roamer.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeTools(); setRoaming(false, true); }
  }, { signal });
  restore.addEventListener('click', openTools, { signal });
  den.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !card.hidden) { event.preventDefault(); closeTools(true); }
  }, { signal });
  document.addEventListener('pointerdown', event => {
    if (!ownsElement(event.target as Element)) lastCompanionFocus = null;
    if (!card.hidden && !den.contains(event.target as Node)) closeTools();
  }, { signal });
  document.addEventListener('focusin', event => {
    lastCompanionFocus = ownsElement(event.target as Element) ? event.target as HTMLElement : null;
  }, { signal });
  document.addEventListener('focusout', event => {
    if (event.target !== lastCompanionFocus) return;
    if (event.relatedTarget || lastCompanionFocus?.getClientRects().length) lastCompanionFocus = null;
  }, { signal });
  dialog.addEventListener('close', () => { dialog.returnValue = ''; resetExpanded(); }, { signal });
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { pressedOutside = outside(event); }, { signal });
    dialog.addEventListener('pointerup', event => { if (pressedOutside && outside(event)) dialog.close(); }, { signal });
  }

  figure.addEventListener('pointerdown', event => {
    if (roaming || !wide.matches || !fine.matches || event.pointerType === 'touch' || event.button !== 0) return;
    clearReaction();
    const area = bounds();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, left: settings.offset.x * area.width,
      top: settings.offset.y * area.height, moved: false, offset: { ...settings.offset } };
    figure.setPointerCapture(event.pointerId);
  }, { signal });
  figure.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.moved && Math.hypot(dx, dy) <= 4) return;
    if (!pointer.moved) { closeTools(); pointer.moved = true; }
    if (Math.abs(event.clientX - pointer.lastX) > 1) dragDirection = event.clientX < pointer.lastX ? 'left' : 'right';
    pointer.lastX = event.clientX;
    setMood('dragging'); stopIdle(); event.preventDefault();
    const area = bounds();
    settings.offset = { x: area.width ? clamp((pointer.left + dx) / area.width) : .5,
      y: area.height ? clamp((pointer.top + dy) / area.height) : .5 };
    place();
  }, { signal });
  function finishDrag(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const moved = pointer.moved;
    if (event.type === 'pointercancel') settings.offset = pointer.offset;
    else if (moved) save(settingsKey, settings);
    pointer = undefined; suppressClick = moved && event.type !== 'pointercancel';
    if (figure.hasPointerCapture(event.pointerId)) figure.releasePointerCapture(event.pointerId);
    place(); setMood('resting'); scheduleIdle();
  }
  figure.addEventListener('pointerup', finishDrag, { signal });
  figure.addEventListener('pointercancel', finishDrag, { signal });

  window.addEventListener('sectionchange', event => {
    const detail = (event as CustomEvent<Partial<Section>>).detail;
    const next = sections.find(section => section.id === detail?.id);
    if (!next || next.id === current.id) return;
    current = next; updateContext();
    if (performance.now() - lastNod > 6000 && !settings.hidden) nod();
  }, { signal });
  function activity() {
    if (performance.now() - lastActivity < 1000) return;
    lastActivity = performance.now();
    if (mood === 'dozing') setMood('resting'); scheduleIdle();
  }
  document.addEventListener('pointermove', activity, { signal, passive: true });
  document.addEventListener('pointermove', event => {
    if (!spriteSource) return;
    const canInteract = fine.matches && event.pointerType !== 'touch' && !event.buttons && motionAllowed() && !settings.hidden;
    const target = roaming ? roamer : figure;
    if (roaming && canInteract) {
      const box = roamer.getBoundingClientRect();
      const near = event.clientX >= box.left - 24 && event.clientX <= box.right + 24 &&
        event.clientY >= box.top - 24 && event.clientY <= box.bottom + 24;
      if (near !== roamNearby) {
        roamNearby = near;
        if (near) { freezeRoam(); renderSprites(); } else scheduleRoam(900);
      }
    }
    const petTargets: HTMLElement[] = [target];
    if (dialog.open) {
      const portrait = dialog.querySelector<HTMLElement>('.companion-tools-heading > .companion-art');
      if (portrait) petTargets.push(portrait);
    }
    const head = canInteract ? petTargets.find(host => {
      const box = host.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && event.clientX >= box.left + box.width * .25 &&
        event.clientX <= box.left + box.width * .78 && event.clientY >= box.top + box.height * .05 &&
        event.clientY <= box.top + box.height * .38;
    }) : undefined;
    if (head) {
      const now = performance.now();
      if (!stroke || stroke.target !== head || now - stroke.time > 750) {
        stroke = { target: head, x: event.clientX, time: now, distance: 0, direction: 0, turns: 0 };
      } else {
        const delta = event.clientX - stroke.x;
        if (Math.abs(delta) >= 1) {
          const direction = Math.sign(delta);
          if (stroke.direction && stroke.direction !== direction) stroke.turns++;
          stroke.distance += Math.abs(delta); stroke.direction = direction; stroke.x = event.clientX; stroke.time = now;
          if (stroke.distance >= 28 && stroke.turns >= 1) {
            playReaction('happy'); stroke.distance = 0; stroke.turns = 0;
          }
        }
      }
    } else stroke = undefined;
    const canLook = (wide.matches || roaming) && canInteract && !reaction &&
      !settings.hidden && (mood === 'resting' || mood === 'attentive');
    const box = target.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height * .3);
    const distance = Math.hypot(dx, dy);
    if (!canLook || distance > 180 || distance < 12) {
      if (gazeIndex !== undefined) { gazeIndex = undefined; renderSprites(); }
      return;
    }
    // The supplied atlas defines 0° as up, then clockwise in 22.5° steps.
    // Only a nearby pointer turns her head; roaming stops for interaction.
    if (performance.now() - lastGazeUpdate < 80) return;
    lastGazeUpdate = performance.now();
    const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
    const direction = Math.round(angle / (Math.PI / 8)) % 16;
    if (gazeIndex !== direction) { gazeIndex = direction; renderSprites(); }
  }, { signal, passive: true });
  document.addEventListener('pointerleave', () => {
    stroke = undefined; roamNearby = false; roamHovered = false; scheduleRoam();
    if (gazeIndex !== undefined) { gazeIndex = undefined; renderSprites(); }
  }, { signal });
  document.addEventListener('keydown', activity, { signal });
  document.addEventListener('selectionchange', updateMotion, { signal });
  document.addEventListener('visibilitychange', () => {
    freezeRoam(); clearReaction(); stroke = undefined; roamNearby = false; roamHovered = false;
    for (const node of actors) delete node.dataset.reaction;
    if (mood !== 'tools') setMood('resting'); updateMotion();
  }, { signal });
  window.addEventListener('storage', event => {
    if (event.key === settingsKey || event.key === null) {
      const hadFocus = ownsFocus();
      const wasHidden = settings.hidden;
      settings = settingsFrom(read(settingsKey));
      syncHidden(hadFocus && settings.hidden !== wasHidden);
    }
  }, { signal });
  reduced.addEventListener('change', updateMotion, { signal });
  function reconcileLayout() {
    const mustClose = previousWide !== wide.matches || (!card.hidden && !cardFits());
    const hadFocus = ownsFocus();
    previousWide = wide.matches;
    if (mustClose) closeTools();
    if (roaming) { freezeRoam(); clampRoamPosition(); roamHovered = false; roamNearby = false; scheduleRoam(); }
    updateContext(); place(); renderSprites();
    if (mustClose && hadFocus) focusVisibleControl();
  }
  wide.addEventListener('change', reconcileLayout, { signal });
  window.addEventListener('resize', reconcileLayout, { signal });
  window.visualViewport?.addEventListener('resize', reconcileLayout, { signal });
  window.visualViewport?.addEventListener('scroll', reconcileLayout, { signal });
  const resize = new ResizeObserver(place); resize.observe(desk);
  syncHidden();
  dispose = () => {
    controller.abort(); stopIdle(); clearReaction(); freezeRoam(); resize.disconnect();
    spriteArt.forEach(art => art.animation?.cancel());
    if (dialog.open) dialog.close();
    den.remove(); trigger.remove(); dialog.remove(); roamer.remove();
    delete document.documentElement.dataset.companion;
    delete document.documentElement.dataset.companionRoaming;
    dispose = undefined;
  };
  return dispose;
}
