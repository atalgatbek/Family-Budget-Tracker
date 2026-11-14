import { getLang, getLocale } from "./i18n";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail
          .map((item: { msg: string }) => item.msg.replace("Value error, ", ""))
          .join(" ")
      : detail;
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      typeof message === "string"
        ? message
        : "Something went wrong. Please try again.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

// Not every browser ships Kazakh formatting data (some print "M10" for
// October), so Kazakh months are spelled out here and numbers are grouped
// the same way as in Russian: 160 000.
const kkMonths = [
  "қаңтар",
  "ақпан",
  "наурыз",
  "сәуір",
  "мамыр",
  "маусым",
  "шілде",
  "тамыз",
  "қыркүйек",
  "қазан",
  "қараша",
  "желтоқсан",
];
const kkMonthsShort = [
  "қаң.",
  "ақп.",
  "нау.",
  "сәу.",
  "мам.",
  "мау.",
  "шіл.",
  "там.",
  "қыр.",
  "қаз.",
  "қар.",
  "жел.",
];
export const number = (amount: number) =>
  new Intl.NumberFormat(getLang() === "en" ? "en-US" : "ru-RU", {
    maximumFractionDigits: 0,
  }).format(amount);
export const money = (amount: number) => `${number(amount)} ₸`;
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const monthWord = (month: string) =>
  getLang() === "kk"
    ? kkMonths[Number(month.slice(5, 7)) - 1]
    : new Intl.DateTimeFormat(getLocale(), { month: "long" }).format(
        new Date(`${month.slice(0, 7)}-01T12:00:00`),
      );
/** Month alone, capitalised: "October", "Октябрь", "Қазан". */
export const monthOnly = (month: string) => {
  const word = monthWord(month);
  return word[0].toUpperCase() + word.slice(1);
};
/** Heading form: "October 2026", "Октябрь 2026", "Қазан 2026". */
export const monthName = (month: string) =>
  `${monthOnly(month)} ${month.slice(0, 4)}`;
/** Form used inside a sentence: "за октябрь 2026", "2026 жылғы қазан". */
export const monthInText = (month: string) =>
  getLang() === "en"
    ? monthName(month)
    : getLang() === "kk"
      ? `${month.slice(0, 4)} жылғы ${monthWord(month)}`
      : `${monthWord(month)} ${month.slice(0, 4)}`;
export const dateLabel = (date: string) =>
  getLang() === "kk"
    ? `${Number(date.slice(8, 10))} ${kkMonthsShort[Number(date.slice(5, 7)) - 1]}`
    : new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(
        getLang() === "en" ? "en-GB" : "ru-RU",
        { day: "numeric", month: "short" },
      );
/** Date with the year, for deadlines: "1 Jun 2027". */
export const dateFull = (date: string) =>
  getLang() === "kk"
    ? `${dateLabel(date)} ${date.slice(0, 4)}`
    : new Date(`${date.slice(0, 10)}T12:00:00`)
        .toLocaleDateString(getLang() === "en" ? "en-GB" : "ru-RU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
        .replace(/\s*г\.$/, "");
export const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
