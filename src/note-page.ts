// Keep the complete PDFs off the initial load, particularly the 90 MB scan.
// Preview images, direct PDF links, and downloads also work without JavaScript.
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-pdf-src]')) {
  if (!navigator.pdfViewerEnabled) continue;
  const block = button.closest<HTMLElement>('.note-pdf-block');
  if (!block || !button.dataset.pdfSrc) continue;
  const thumbnail = block.querySelector<HTMLElement>('.document-thumbnail');
  button.hidden = false;
  button.addEventListener('click', () => {
    const existing = block.querySelector<HTMLIFrameElement>('.note-pdf-frame');
    if (existing) {
      existing.remove();
      if (thumbnail) thumbnail.hidden = false;
      button.textContent = 'Read in page';
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    const frame = document.createElement('iframe');
    const source = new URL(button.dataset.pdfSrc!, window.location.href);
    if (!source.hash) source.hash = 'view=FitH';
    frame.src = source.href;
    frame.className = 'note-pdf-frame';
    frame.title = button.dataset.pdfTitle ?? 'PDF preview';
    block.append(frame);
    if (thumbnail) thumbnail.hidden = true;
    button.textContent = 'Show first page';
    button.setAttribute('aria-expanded', 'true');
  });
}
