// The list remembers its last URL (filters, sort, columns) so the "← Campaigns" link on a
// campaign page can return to exactly that view. sessionStorage may be unavailable
// (privacy modes) — then the link simply goes to /campaigns.

const KEY = "campaigns:last-list-url";

export function rememberListUrl(url: string) {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    // ignore
  }
}

export function readLastListUrl(): string | null {
  try {
    const url = sessionStorage.getItem(KEY);
    return url?.startsWith("/campaigns") ? url : null;
  } catch {
    return null;
  }
}
