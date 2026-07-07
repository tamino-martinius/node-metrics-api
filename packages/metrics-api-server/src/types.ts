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
  byType?: GithubByType;
  privateLastYear?: number;
  lifetimeTotal?: number;
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
  accountCreatedAt?: string;
  location?: string | null;
}

export interface GithubRepo {
  name: string;
  url: string;
  description: string;
  language: string | null;
  stargazerCount: number;
  forkCount: number;
  isFork: boolean;
  defaultBranchCommits?: number | null;
  createdAt?: string;
  pushedAt?: string;
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

export interface GithubByType {
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
}

export interface GithubUser {
  profile: GithubProfile;
  repos: GithubRepo[];
  contributions: GithubContributions;
  warnings?: string[];
}

export interface TwitterProfile {
  /** Stable numeric account id — survives handle changes. */
  id: string;
  name: string;
  /** Handle without the leading "@". */
  username: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string | null;
  /** Canonical profile URL. */
  url: string;
  /** The user's linked website, or null. */
  website: string | null;
  location: string;
  /** ISO 8601 account creation timestamp. */
  createdAt: string;
  followerCount: number;
  followingCount: number;
  tweetCount: number;
}

export interface TwitterUser {
  profile: TwitterProfile;
  warnings?: string[];
}

export interface LinkedinEducation {
  name: string;
  startYear: number | null;
  endYear: number | null;
}

export interface LinkedinPost {
  text: string;
  url: string;
  /** ISO 8601 publish timestamp. */
  publishedAt: string;
  likeCount: number | null;
}

export interface LinkedinProject {
  name: string;
  /** External link (unwrapped from LinkedIn's redirect), or null. */
  url: string | null;
  description: string;
}

export interface LinkedinArticle {
  headline: string;
  url: string;
  /** ISO 8601 publish timestamp. */
  publishedAt: string;
  likeCount: number | null;
  imageUrl: string | null;
}

export interface LinkedinProfile {
  /** Vanity slug from /in/<slug>. */
  username: string;
  name: string;
  /** The profile headline / summary. */
  headline: string;
  avatarUrl: string | null;
  /** Canonical profile URL. */
  url: string;
  location: string | null;
  /** ISO 3166 country code (e.g. "DE"). */
  countryCode: string | null;
  followerCount: number | null;
  languages: string[];
  /** Employer names. Past employers LinkedIn masks for logged-out viewers are dropped. */
  companies: string[];
  education: LinkedinEducation[];
  /** Recent shares/posts embedded in the public page. */
  posts: LinkedinPost[];
  /** Publications/projects (e.g. linked repos). */
  projects: LinkedinProject[];
  /** Long-form LinkedIn articles (Pulse). */
  articles: LinkedinArticle[];
}

export interface LinkedinUser {
  profile: LinkedinProfile;
  warnings?: string[];
}

export interface GithubGraphqlData {
  accountCreatedAt: string;
  location: string | null;
  repos: Array<{ name: string; defaultBranchCommits: number | null; createdAt: string; pushedAt: string }>;
  byType?: GithubByType;
  privateLastYear?: number;
  lifetimeTotal?: number;
  rateLimit: { cost: number; remaining: number };
}

export interface GitlabByType {
  pushes: number;
  mergeRequests: number;
  issues: number;
  comments: number;
}

export interface GitlabContributions {
  /** Rolling last-year total only: { lastYear: number }. */
  total: Record<string, number>;
  contributions: ContributionDay[];
  byType?: GitlabByType;
}

export interface GitlabProfile {
  name: string;
  username: string;
  bio: string;
  avatarUrl: string;
  url: string;
  /** Token-gated; 0 when anonymous (GitLab returns 403 for /followers without a token). */
  followerCount: number;
  followingCount: number;
  accountCreatedAt?: string;
  location?: string | null;
  jobTitle?: string;
  organization?: string;
}

export interface GitlabProject {
  name: string;
  url: string;
  description: string;
  language: string | null;
  stargazerCount: number;
  forkCount: number;
  isFork: boolean;
  visibility: 'public' | 'internal' | 'private';
  defaultBranchCommits?: number | null;
  createdAt?: string;
  lastActivityAt?: string;
}

export interface GitlabUser {
  profile: GitlabProfile;
  projects: GitlabProject[];
  contributions: GitlabContributions;
  warnings?: string[];
}
