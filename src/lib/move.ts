import { postJson } from "./api";

export interface MoveResult {
  ok: true;
  from: string;
  to: string;
}

export function movePage(
  from: string,
  to: string,
  summary: string,
  token?: string,
): Promise<MoveResult> {
  return postJson<MoveResult>("/move", { from, to, summary, token }, { auth: false });
}
