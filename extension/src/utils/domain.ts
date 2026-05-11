export function extractDomain(rawUrl?: string | null): string {
  if (!rawUrl) {
    return "No active site";
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.replace(/^www\./, "") || "No active site";
    }

    if (url.protocol === "file:") {
      return "Local file";
    }

    if (url.protocol === "chrome:" || url.protocol === "edge:" || url.protocol === "about:") {
      return "Browser page";
    }

    if (url.protocol === "chrome-extension:") {
      return "Extension page";
    }

    return url.hostname || url.protocol.replace(":", "") || "No active site";
  } catch {
    return "No active site";
  }
}
