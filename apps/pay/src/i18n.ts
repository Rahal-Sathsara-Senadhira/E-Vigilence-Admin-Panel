// English, Sinhala and Tamil from day one (docs/17 D17-5). The choice is
// remembered on this device only.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { si } from "./locales/si";
import { ta } from "./locales/ta";

export const LANGUAGES = [
  { code: "en", label: "English", rupees: "Rs" },
  { code: "si", label: "සිංහල", rupees: "රු." },
  { code: "ta", label: "தமிழ்", rupees: "ரூ." },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "ev-pay-lang";

function saved(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "si" || v === "ta") return v;
  } catch {
    /* storage blocked — fall through */
  }
  const browser = navigator.language.slice(0, 2);
  return browser === "si" || browser === "ta" ? browser : "en";
}

export function setLanguage(code: Language) {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* not remembered */
  }
}

i18n.on("languageChanged", (code) => {
  document.documentElement.lang = code;
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, si: { translation: si }, ta: { translation: ta } },
  lng: saved(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
document.documentElement.lang = i18n.language;

const current = () => LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

export const formatMoney = (amount: number) =>
  `${current().rupees} ${new Intl.NumberFormat("en-LK").format(amount)}`;

// English: "9 November 2026". Sinhala and Tamil: "09/11/2026" — browsers give
// traditional month names (e.g. "වප්") for those locales, which readers may misread.
const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Colombo",
});
const DAY_NUMERIC = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Colombo",
});

export const formatDay = (iso: string | null) =>
  iso ? (current().code === "en" ? DAY_LONG : DAY_NUMERIC).format(new Date(iso)) : "—";

export default i18n;
