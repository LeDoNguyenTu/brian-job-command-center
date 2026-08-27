import type { MarketCode } from "./types.ts";

const MARKET_PATTERNS: Array<[MarketCode, RegExp[]]> = [
  ["SG", [/\bsingapore\b/i, /(?:^|[,\s])SG(?:$|[,\s])/]],
  ["VN", [/\bvietnam\b/i, /\bho chi minh\b/i, /\bhanoi\b/i, /\bda nang\b/i, /(?:^|[,\s])VN(?:$|[,\s])/]],
  ["MY", [/\bmalaysia\b/i, /\bkuala lumpur\b/i, /\bpenang\b/i, /\bselangor\b/i, /(?:^|[,\s])MY(?:$|[,\s])/]],
  ["TH", [/\bthailand\b/i, /\bbangkok\b/i, /(?:^|[,\s])TH(?:$|[,\s])/]],
  ["ID", [/\bindonesia\b/i, /\bjakarta\b/i, /\bbali\b/i, /(?:^|[,\s])ID(?:$|[,\s])/]],
  ["PH", [/\bphilippines\b/i, /\bmanila\b/i, /\bmakati\b/i, /\btaguig\b/i, /\bcebu\b/i, /(?:^|[,\s])PH(?:$|[,\s])/]],
];

export function normalizeJobMarkets(locations: string[]): MarketCode[] {
  const matches = new Set<MarketCode>();
  for (const location of locations) {
    for (const [code, patterns] of MARKET_PATTERNS) {
      if (patterns.some((pattern) => pattern.test(location))) matches.add(code);
    }
  }
  return [...matches];
}
