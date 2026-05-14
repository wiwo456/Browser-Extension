const ALWAYS_ALLOWED_STUDY_DOMAINS = [
  "youtube.com",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "vercel.app",
  "vercel.com",
  "github.com",
  "github.dev",
  "gist.github.com",
  "netlify.app",
  "netlify.com",
  "replit.com",
  "replit.dev",
  "codesandbox.io",
  "stackblitz.com",
  "figma.com"
];

function matchesDomain(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

export function isAlwaysAllowedStudyDomain(domain: string): boolean {
  return (
    ALWAYS_ALLOWED_STUDY_DOMAINS.some((candidate) => matchesDomain(domain, candidate)) ||
    domain === "edu" ||
    domain.endsWith(".edu") ||
    domain.endsWith(".localhost")
  );
}
