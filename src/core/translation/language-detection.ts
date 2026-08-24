import { francAll } from 'franc-min';
import { iso6393To1 } from './iso639';

const URL_PATTERN = /https?:\/\/\S+/gi;
const MENTION_PATTERN = /[@#][^\s@#]+/g;

/** Strips tokens that carry no language signal but can dominate short messages enough to skew
 *  detection — a single URL was enough to make a two-line Japanese message register as Latin
 *  script. Only used for detection; the original text (URLs included) is still what gets
 *  translated and displayed. */
function stripDetectionNoise(text: string): string {
  return text.replace(URL_PATTERN, ' ').replace(MENTION_PATTERN, ' ');
}

/**
 * Lightweight, pure-JS source-language detection used only to gate auto-translate decisions
 * (not translation quality). franc returns ISO 639-3 codes; the rest of the extension (and the
 * Bergamot model registry) works in ISO 639-1, so results are mapped down and anything franc
 * can't confidently place ("und") or that has no 639-1 equivalent is dropped.
 */
export function detectLanguage(text: string): string | null {
  const cleaned = stripDetectionNoise(text).trim();
  if (cleaned.length < 3) return null;

  const [best] = francAll(cleaned, { minLength: 3 });
  if (!best || best[0] === 'und') return null;

  return iso6393To1(best[0]) ?? null;
}
