import { parseRoute } from "./paths";

export function slugFromLocation(): string {
  return parseRoute().slug;
}
