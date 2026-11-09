export type MarkdownContent = {
  about: string;
  research: string;
  notes: string;
  studentSeminar: string;
  miscellany: string;
};
export function readMarkdownContent(): Promise<MarkdownContent>;
export function renderContentHtml(html: string, settings: Record<string, unknown>, base?: string, markdownDocs?: Partial<MarkdownContent>): string;
