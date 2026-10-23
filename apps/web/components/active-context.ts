import type { ContextView } from "@helios/contracts";
const key = "helios.active-context";
export function savedContext() {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function rememberContext(id: string) {
  try {
    window.localStorage.setItem(key, id);
  } catch {
    /* URL still retains the explicit choice. */
  }
}
export function resolveContext(
  contexts: ContextView[],
  requested: string | null,
  stored: string | null,
) {
  const id = requested ?? stored;
  return contexts.some((c) => c.id === id && c.active) ? id! : "";
}
