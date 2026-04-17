import { en } from './en'
import { es } from './es'
import { pt } from './pt'
import { fr } from './fr'
import { it } from './it'
import { ja } from './ja'
import { ko } from './ko'
import { zh } from './zh'
import { de } from './de'
import { nl } from './nl'

export const translations = {
  en,
  es,
  pt,
  fr,
  it,
  ja,
  ko,
  zh,
  de,
  nl
}

export type TranslationKey = keyof typeof translations.en
