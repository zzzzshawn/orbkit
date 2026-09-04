import { GitHubIcon, XIcon } from "@/components/matrix-icons";
import { CREATOR_NAME, CREATOR_URL, REPO_URL, SITE_NAME } from "@/lib/site-config";

const linkClassName =
  "inline-flex items-center justify-center gap-1 rounded-lg p-1 text-fg-dim transition-colors duration-150 ease-out hover:text-link-hover focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)";

/** 1234 -> "1.2k", the way GitHub itself abbreviates. */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Star count for the repo behind REPO_URL, cached for an hour so a page
 * render never waits on GitHub more than once per hour per server. Resolves
 * to null when the repo is private, unreachable, or rate-limited, and the
 * header simply shows the icon alone. Set GITHUB_TOKEN to lift the
 * unauthenticated rate limit.
 */
async function fetchStarCount(): Promise<number | null> {
  const match = /github\.com\/([^/]+\/[^/]+?)\/?$/.exec(REPO_URL);
  if (!match) return null;
  const token = process.env.GITHUB_TOKEN;
  try {
    const response = await fetch(`https://api.github.com/repos/${match[1]}`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      next: { revalidate: 3600 }
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

/**
 * External links beside the site nav: the creator's X profile and the source
 * repo with its star count. Same pill as the text nav so the header reads as
 * one strip, but this one stays visible on mobile where the text nav collapses.
 */
export async function SocialLinks() {
  const stars = await fetchStarCount();
  const starsText = stars === null ? null : compact.format(stars).toLowerCase();
  const xLabel = `${CREATOR_NAME} on X`;
  const githubLabel = `${SITE_NAME} on GitHub${starsText ? `, ${starsText} stars` : ""}`;

  return (
    <nav aria-label="Social" className="flex h-8 items-center gap-0.5 rounded-xl bg-preset p-1 sm:h-9">
      <a
        href={CREATOR_URL}
        aria-label={xLabel}
        title={xLabel}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        <XIcon className="size-4 sm:size-5" />
      </a>
      <a
        href={REPO_URL}
        aria-label={githubLabel}
        title={githubLabel}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        <GitHubIcon className="size-4 sm:size-5" />
        {starsText ? (
          <span className="pr-0.5 text-xs font-medium tabular-nums">{starsText}</span>
        ) : null}
      </a>
    </nav>
  );
}
