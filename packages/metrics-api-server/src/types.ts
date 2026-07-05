export type FetchFn = typeof globalThis.fetch;

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface ContributionDay {
  date: string; // YYYY-MM-DD
  count: number;
  level: ContributionLevel;
}

export interface GithubContributions {
  /** Keyed by year ("2024") or "lastYear" for the rolling last-year view. */
  total: Record<string, number>;
  contributions: ContributionDay[];
}

export interface GithubOrganization {
  name: string;
  avatarUrl: string;
  url: string;
}

export interface GithubProfile {
  name: string;
  username: string;
  bio: string;
  avatarUrl: string;
  url: string;
  /** Counts >= 1000 are approximate — GitHub renders them abbreviated ("1.2k"). */
  followerCount: number;
  followingCount: number;
  organizations: GithubOrganization[];
}

export interface GithubRepo {
  name: string;
  url: string;
  description: string;
  language: string | null;
  stargazerCount: number;
  forkCount: number;
  isFork: boolean;
}

export interface NpmPackageDetails {
  name: string;
  description: string;
  latestVersion: string;
  license: string;
  keywords: string[];
  links: { npm?: string; homepage?: string; repository?: string; bugs?: string };
}

export interface NpmPackageStats {
  details: NpmPackageDetails;
  downloadsPerDate: Record<string, number>; // YYYY-MM-DD -> count (within window)
  versionsPerDate: Record<string, number>; // YYYY-MM-DD -> publishes (full history)
  versionsPerHour: Record<string, number>; // "Mon, 08" (UTC) -> publishes
}

export interface NpmStats {
  user: {
    username: string;
    versionsPerDate: Record<string, number>;
    versionsPerHour: Record<string, number>;
  };
  packages: NpmPackageStats[];
}
