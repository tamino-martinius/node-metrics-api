import { ScrapeError } from './errors.js';

export const attr = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : null;
};

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);

export const squash = (html: string): string => html.replace(/\s+/g, ' ');

export const parseCount = (text: string): number => {
  const cleaned = text.trim().replace(/,/g, '').toLowerCase();
  const scale = cleaned.endsWith('k') ? 1_000 : cleaned.endsWith('m') ? 1_000_000 : 1;
  const value = scale === 1 ? Number.parseInt(cleaned, 10) : Number.parseFloat(cleaned);
  if (Number.isNaN(value)) throw new ScrapeError(`unparseable count: "${text}"`);
  return Math.round(value * scale);
};
