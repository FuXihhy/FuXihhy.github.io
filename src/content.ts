import content from '../content/site.json';

export type SiteContent = {
  name: string; nameLocal: string; role: string; affiliation: string;
  companion: { image: string; label: string; description: string; enabled: boolean;
    sprite?: { image: string; columns: number; rows: number; frameWidth: number; frameHeight: number } };
};
export const site = content as SiteContent;

export function publicUrl(value: string): string | null {
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.username || parsed.password ? null : parsed.href;
    } catch { return null; }
  }
  if (/^[a-z][a-z\d+.-]*:|^\/\/|[\\\s]/i.test(url)) return null;
  if (url.startsWith('#')) return document.getElementById(url.slice(1)) ? url : null;
  const path = url.replace(/^\//, '');
  try {
    const decoded = decodeURIComponent(path.split(/[?#]/, 1)[0]);
    if (!decoded || /[\u0000-\u0020\u007f\\]/.test(decoded) || decoded.startsWith('/') || decoded.split('/').includes('..')) return null;
  } catch { return null; }
  return `${import.meta.env.BASE_URL}${path}`;
}
