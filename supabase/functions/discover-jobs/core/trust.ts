import type { SourceTrustAssessment } from "./types.ts";

const HOSTED_ATS_SUFFIXES = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com", "myworkdayjobs.com",
  "successfactors.com", "successfactors.eu", "taleo.net", "oraclecloud.com", "icims.com",
  "pageuppeople.com", "workable.com", "recruitee.com", "teamtailor.com", "jobvite.com",
  "avature.net", "phenompeople.com", "eightfold.ai", "bamboohr.com", "personio.com",
  "careers-page.com",
];

const FREE_HOSTING_SUFFIXES = [
  "github.io", "gitlab.io", "pages.dev", "vercel.app", "netlify.app", "blogspot.com",
  "wordpress.com", "wixsite.com", "weebly.com", "notion.site", "carrd.co",
  "10001mb.com", "22web.org", "2kool4u.net", "66ghz.com", "a0001.net", "fast-page.org",
  "html-5.me", "iblogger.org", "is-best.net", "is-great.net", "is-great.org", "likesyou.org",
  "loveslife.biz", "my-board.org", "mydiscussion.net", "my-style.in", "nichesite.org",
  "social-networking.me", "synergize.co", "talk4fun.net", "totalh.net", "web1337.net",
  "42web.io", "zya.me", "liveblog365.com",
];

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "lnkd.in", "goo.gl", "ow.ly", "buff.ly"]);
const BOARD_SUFFIXES = [
  "indeed.com", "linkedin.com", "jobstreet.com", "seek.com.au", "mycareersfuture.gov.sg",
  "glints.com", "jobsdb.com", "foundit.sg", "vietnamworks.com", "topcv.vn", "itviec.com",
  "glassdoor.com", "glassdoor.sg", "jobstreet.com.sg",
];

const hostMatches = (hostname: string, root: string) => hostname === root || hostname.endsWith(`.${root}`);
const matchesAny = (hostname: string, roots: string[]) => roots.some((root) => hostMatches(hostname, root));

export function assessSourceTrust(input: { url: string; verifiedEmployerHosts?: string[] }): SourceTrustAssessment {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { trusted: false, level: "untrusted", reason: "Invalid URL" };
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (SHORTENERS.has(hostname)) return { trusted: false, level: "untrusted", reason: "URL shortener" };
  if (matchesAny(hostname, FREE_HOSTING_SUFFIXES)) return { trusted: false, level: "untrusted", reason: "Free-hosting domain" };
  if (matchesAny(hostname, BOARD_SUFFIXES)) return { trusted: false, level: "verified_board", reason: "Third-party job board" };
  if (matchesAny(hostname, HOSTED_ATS_SUFFIXES)) return { trusted: true, level: "official", reason: "Recognized recruitment infrastructure" };

  const verifiedRoots = (input.verifiedEmployerHosts ?? []).map((host) => host.toLowerCase().replace(/^www\./, ""));
  if (verifiedRoots.some((root) => hostMatches(hostname, root))) {
    return { trusted: true, level: "official", reason: "Verified employer host" };
  }

  return { trusted: false, level: "untrusted", reason: "No employer ownership or recognized recruitment evidence" };
}

export { BOARD_SUFFIXES, HOSTED_ATS_SUFFIXES, FREE_HOSTING_SUFFIXES, hostMatches };
