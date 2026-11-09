export type NotePage = { slug: string; route: string; htmlPath: string; markdownPath: string };
export function discoverNotePages(root?: string): Promise<NotePage[]>;
export function renderNotePageHtml(html: string, settings: Record<string, unknown>, base?: string, markdown?: string): string;
