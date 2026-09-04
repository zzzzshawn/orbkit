import { GitHubIcon, XIcon } from "@/components/matrix-icons";
import { CREATOR_NAME, CREATOR_URL, REPO_URL, SITE_NAME } from "@/lib/site-config";

const LINKS = [
  { label: `${CREATOR_NAME} on X`, href: CREATOR_URL, Icon: XIcon },
  { label: `${SITE_NAME} on GitHub`, href: REPO_URL, Icon: GitHubIcon }
];

/**
 * External links beside the site nav: the creator's X profile and the source
 * repo. Same pill as the text nav so the header reads as one strip, but this
 * one stays visible on mobile where the text nav collapses.
 */
export function SocialLinks() {
  return (
    <nav aria-label="Social" className="flex items-center gap-0.5 rounded-xl bg-preset p-1">
      {LINKS.map(({ label, href, Icon }) => (
        <a
          key={href}
          href={href}
          aria-label={label}
          title={label}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg p-1 text-fg-dim transition-colors duration-150 ease-out hover:text-link-hover focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
          <Icon className="size-4 sm:size-5" />
        </a>
      ))}
    </nav>
  );
}
