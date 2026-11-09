import { mountCompanion } from './companion';

const disposeCompanion = mountCompanion();
if (import.meta.hot) import.meta.hot.dispose(disposeCompanion);

const links = [...document.querySelectorAll<HTMLAnchorElement>('nav a[href^="#"]')];
const sections = [...document.querySelectorAll<HTMLElement>('main > section[id]')];
const contents = document.querySelector<HTMLDialogElement>('#contents-sheet')!;
const contentsButton = document.querySelector<HTMLButtonElement>('.contents-btn')!;
let currentId = '';

function selectSection(id: string) {
  const section = sections.find(item => item.id === id);
  if (!section) return;
  links.forEach(link => {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  if (currentId !== id) {
    currentId = id;
    window.dispatchEvent(new CustomEvent('sectionchange', { detail: {
      id, title: section.querySelector('h2')!.textContent!, number: sections.indexOf(section) + 1,
    } }));
  }
}

function updateCurrentSection() {
  const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  const section = atBottom ? sections.at(-1)! : [...sections].reverse().find(item => item.getBoundingClientRect().top <= 180) ?? sections[0];
  selectSection(section.id);
}

for (const link of links) {
  link.addEventListener('click', event => {
    const section = sections.find(item => `#${item.id}` === link.hash);
    if (!section) return;
    event.preventDefault();
    if (contents.open) contents.close();
    history.pushState(null, '', link.hash);
    const title = section.querySelector<HTMLElement>('h2')!;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ behavior: 'instant', block: 'start' });
    selectSection(section.id);
  });
}
contentsButton.addEventListener('click', () => {
  contents.showModal();
  contents.querySelector<HTMLElement>('[aria-current="location"]')?.focus();
});
contents.querySelector('.sheet-close')!.addEventListener('click', () => contents.close());
contents.addEventListener('click', event => {
  if (event.target !== contents) return;
  const box = contents.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) contents.close();
});
contents.addEventListener('close', () => {
  if (document.activeElement === document.body || contents.contains(document.activeElement)) contentsButton.focus();
});
window.matchMedia('(min-width: 1025px)').addEventListener('change', event => { if (event.matches && contents.open) contents.close(); });
document.querySelector('.page-footer .top')!.addEventListener('click', event => {
  event.preventDefault();
  history.pushState(null, '', '#top');
  document.querySelector<HTMLElement>('#person-name')!.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
  selectSection('about');
});
let scrollFrame = 0;
window.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateCurrentSection(); });
}, { passive: true });
window.addEventListener('hashchange', updateCurrentSection);
updateCurrentSection();
