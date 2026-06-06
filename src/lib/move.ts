import { config } from "../config";

export interface MoveResult {
  ok: true;
  from: string;
  to: string;
}

export async function movePage(
  from: string,
  to: string,
  summary: string,
  token?: string,
): Promise<MoveResult> {
  const res = await fetch(`${config.workerUrl}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, summary, token }),
  });
  const data = (await res.json()) as Partial<MoveResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as MoveResult;
}
