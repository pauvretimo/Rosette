/**
 * ISO 639-3 -> ISO 639-1 mapping for the languages franc-min can detect that also have (or are
 * plausible future) Bergamot model coverage. franc reports 639-3; the model registry and our
 * settings schema use 639-1 throughout, so this is the single conversion point between them.
 * Extend as new language pairs are added — an unmapped code is treated as "can't gate on this
 * language," not a crash.
 */
const ISO_639_3_TO_1: Record<string, string> = {
  eng: 'en',
  fra: 'fr',
  deu: 'de',
  spa: 'es',
  por: 'pt',
  ita: 'it',
  nld: 'nl',
  pol: 'pl',
  rus: 'ru',
  ukr: 'uk',
  ces: 'cs',
  ron: 'ro',
  ell: 'el',
  swe: 'sv',
  fin: 'fi',
  dan: 'da',
  nob: 'nb',
  hun: 'hu',
  bul: 'bg',
  hrv: 'hr',
  jpn: 'ja',
  kor: 'ko',
  cmn: 'zh',
  vie: 'vi',
  tha: 'th',
  ind: 'id',
  msa: 'ms',
  ara: 'ar',
  heb: 'he',
  tur: 'tr',
  hin: 'hi',
};

export function iso6393To1(code: string): string | null {
  return ISO_639_3_TO_1[code] ?? null;
}
