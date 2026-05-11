const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export function getApiBaseUrl(): string {
  if (!rawApiBaseUrl) {
    return window.location.origin;
  }

  return rawApiBaseUrl.replace(/\/+$/, "");
}

export function getApiUrl(pathname: string): string {
  return `${getApiBaseUrl()}${pathname}`;
}
