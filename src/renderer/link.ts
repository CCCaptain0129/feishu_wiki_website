const SPONSORED_PATTERNS = [/(\.|^)curl\.qcloud\.com$/i, /(\.|^)aliyun\.com$/i];

function isSponsoredUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const hasSponsoredHost = SPONSORED_PATTERNS.some((pattern) => pattern.test(host));
    const hasSponsoredHint =
      parsed.searchParams.has('userCode') ||
      parsed.pathname.includes('/activity/ecs/clawdbot') ||
      parsed.pathname.includes('/minisite/goods');
    return hasSponsoredHost || hasSponsoredHint;
  } catch {
    return false;
  }
}

export function getExternalLinkRel(url: string) {
  const rel = ['noopener', 'noreferrer'];
  if (isSponsoredUrl(url)) {
    rel.unshift('sponsored', 'nofollow');
  }
  return rel.join(' ');
}
