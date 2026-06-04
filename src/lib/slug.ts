import { config } from "../config";

export function slugFromLocation(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return path || config.homeSlug;
}
