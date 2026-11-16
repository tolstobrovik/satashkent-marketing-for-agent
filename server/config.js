// Fixed app configuration: which repository holds the data, and on which
// branch. The CREDENTIAL does not belong here — see below.

// Option A (default): the database lives INSIDE this GitHub repository.
// The app stores its SQLite database on the branch below and syncs every
// change through the GitHub API — data survives deploys, restarts and cold
// starts with zero external services. The token needs Contents read/write
// on this repository.
//
// The token is read from GITHUB_DATA_TOKEN in the deployment's environment,
// and this placeholder is what it falls back to when that variable never
// arrived. It stays a placeholder on purpose. A token written in here is
// committed, and a committed token is in the repository's history for good:
// scrubbing it later from the working tree changes nothing, because every
// clone and every fork still carries it. db.js treats anything starting
// with REPLACE_WITH as "no token at all", so an untouched placeholder reads
// as missing on /api/health rather than pretending to be a credential — the
// exact reading that tells an admin their environment variable never landed.
//
// Fine-grained tokens expire. When this one does, replace the environment
// variable — no commit, no redeploy of the code, nothing in git history.
// (A classic token with "repo" scope and No expiration never needs it.)
//
// The repository's CURRENT name, never an old one. GitHub answers a renamed
// repository with a redirect, and the upload (ghstore.js push) does not
// follow one: on 23 Oct 2026 every save came back "307 Moved Permanently",
// the nightly squash deleted the branch and could not write it again, and
// the next boot started on an empty database.
// DEMO COPY: there is no shared database. The app always runs on the local
// SQLite file under data/, filled with made-up people and tasks by
// `npm run demo`. Nothing here can reach the team's real data.
export const GITHUB_DATA = null
