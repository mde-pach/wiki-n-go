// The identity contract between the IdP (accounts/) and the Engine (worker/):
// what auth.wikigit.org puts in the sign-in token, and what the Engine reads back.
//
// Dependency-free on purpose — these two Workers build and deploy independently,
// so they can't share node_modules. Each side builds its own valibot `subjects`
// but anchors it to this type at the boundaries (the IdP's account, the Engine's
// verify result), so the two can't drift on the token shape.
export interface WikigitUser {
  id: string; // stable, unique — the `wg:` key (survives a handle change)
  email: string; // stays inside the IdP; the Engine derives a no-PII author from `id`
  handle: string; // display label
}
