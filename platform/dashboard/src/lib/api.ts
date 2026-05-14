const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export function getApiBaseUrl(): string {
  if (!rawApiBaseUrl) {
    if (typeof window !== "undefined") {
      const { protocol, hostname, port, origin } = window.location;
      if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "5173") {
        return `${protocol}//${hostname}:8787`;
      }

      return origin;
    }

    return "";
  }

  return rawApiBaseUrl.replace(/\/+$/, "");
}

export function getApiUrl(pathname: string): string {
  return `${getApiBaseUrl()}${pathname}`;
}
