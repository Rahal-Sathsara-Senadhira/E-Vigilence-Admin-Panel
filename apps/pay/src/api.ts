// The three public endpoints (docs/07 §5.1, docs/05 §6.2–6.3). No session:
// every call carries the notice number and the addressee's ID number.

import type { PublicNoticeView } from "@ev/shared";

export class PublicError extends Error {
  constructor(
    readonly code: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(code);
  }
}

export type Credentials = { noticeNumber: string; idNumber: string };

async function post(path: string, body: unknown): Promise<PublicNoticeView> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/public/notices/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "e-vigilance" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PublicError("network");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = res.status === 404 ? "not_found" : (data?.error?.code ?? "generic");
    throw new PublicError(code, data?.error?.fields ?? {});
  }
  return data as PublicNoticeView;
}

export const lookup = (c: Credentials) => post("lookup", c);
export const nominate = (c: Credentials, input: object) => post("nominate", { ...c, ...input });
export const dispute = (c: Credentials, input: object) => post("dispute", { ...c, ...input });
