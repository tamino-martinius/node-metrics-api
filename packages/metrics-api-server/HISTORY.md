# History

## vNext

## v0.0.3

- Added GitLab support over the GitLab REST API: `getGitlabUser` / `gitlabUserResponse`, with profile, projects, and calendar-based contributions, plus `isValidGitlabUsername` and `GitlabTokenError`/`GitlabRateLimitError`/`GitlabApiError`. An optional GitLab token (server-side or a caller `Authorization` header) enriches follower counts and per-type contribution tallies.
- Added an X (Twitter) profile scraper: `getTwitterUser` parses the server-rendered JSON-LD `ProfilePage` (no API key or login), with `isValidTwitterUsername`.
- Added a LinkedIn profile scraper: `getLinkedinUser` parses the public JSON-LD `@graph` (headline, location, followers, languages, employer, education) plus recent posts/projects/articles, with `isValidLinkedinUsername`.

## v0.0.2

- Initial release: GitHub contributions/profile/repos scrapers, npm stats aggregator, Web-standard handler factory.
- Consolidated GitHub endpoints into `GET /github/:user`; optional GraphQL enrichment (public via `GITHUB_TOKEN`, private via caller `Authorization`).
