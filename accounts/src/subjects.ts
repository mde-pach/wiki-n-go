import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

// The token shape. Anchored to the shared `WikigitUser` contract via the account
// type in index.ts (and the Engine's verify read), so the IdP and Engine can't
// disagree. `id` is the stable identity the Engine keys off; `handle` is display;
// `email` never leaves the IdP for the Engine to store.
export const subjects = createSubjects({
  user: object({ id: string(), email: string(), handle: string() }),
});
