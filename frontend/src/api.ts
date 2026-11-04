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

export const money = (amount: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} ₸`;
export const number = (amount: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
export const dateLabel = (date: string) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
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
