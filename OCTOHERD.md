# Octoherd Framework Reference for LLMs

**Target Audience**: Language Learning Models (LLMs) working with Octoherd-based scripts

**Last Updated**: 2025-10-22

**Official Documentation**: https://github.com/octoherd/cli

## Table of Contents

1. [Overview](#overview)
2. [Core Architecture](#core-architecture)
3. [Script Function Signature](#script-function-signature)
4. [The Octokit Instance](#the-octokit-instance)
5. [The Repository Object](#the-repository-object)
6. [CLI Options and Execution](#cli-options-and-execution)
7. [Repository Matching Patterns](#repository-matching-patterns)
8. [Logging Patterns](#logging-patterns)
9. [Error Handling](#error-handling)
10. [Pagination](#pagination)
11. [Common Patterns and Best Practices](#common-patterns-and-best-practices)
12. [TypeScript Type Definitions](#typescript-type-definitions)
13. [Complete Examples](#complete-examples)

---

## Overview

### What is Octoherd?

Octoherd is a CLI framework for running custom JavaScript scripts across multiple GitHub repositories. It solves the problem of managing bulk operations across many repositories in an organization by providing:

- Consistent script execution model
- Pre-authenticated GitHub API access via Octokit
- Repository filtering and matching capabilities
- Built-in logging, caching, and debugging support
- Error handling and retry mechanisms

### Design Philosophy

- **Script-first approach**: Write custom logic rather than relying on pre-built commands
- **Simplicity**: Minimal boilerplate, focus on the task at hand
- **Flexibility**: Handle any GitHub API operation across any set of repositories
- **Safety**: Built-in confirmation prompts, dry-run support, and error recovery

### Common Use Cases

- Synchronizing branch protection rules
- Managing repository settings at scale
- Automating dependency updates across multiple repos
- Bulk label management
- Repository cleanup and archival tasks
- Custom automation workflows

---

## Core Architecture

### Package Structure

An Octoherd script typically consists of:

```
my-octoherd-script/
├── package.json          # Dependencies and metadata
├── cli.js               # Entry point for CLI execution
├── script.js            # Main script logic (exported script function)
└── README.md            # Documentation
```

### package.json Configuration

```json
{
  "name": "@org/octoherd-script-my-script",
  "version": "1.0.0",
  "type": "module",                    // REQUIRED: Must be ES Module
  "exports": "./script.js",
  "bin": {
    "octoherd-script-my-script": "./cli.js"
  },
  "keywords": ["octoherd-script"],     // Recommended for discoverability
  "dependencies": {
    "@octoherd/cli": "^4.0.5"
  },
  "engines": {
    "node": ">= 18.17.1"
  }
}
```

### cli.js Entry Point

```javascript
#!/usr/bin/env node

import { script } from "./script.js";
import { run } from "@octoherd/cli/run";

run(script);
```

**Key Points**:
- Must have shebang `#!/usr/bin/env node`
- Must import `script` from your script module
- Must import `run` from `@octoherd/cli/run`
- Call `run(script)` to execute

---

## Script Function Signature

### Basic Structure

Every Octoherd script must export an async function with this exact signature:

```javascript
/**
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 */
export async function script(octokit, repository, options) {
  // Your script logic here
}
```

### Parameters Explained

1. **`octokit`** (type: `import('@octoherd/cli').Octokit`)
   - Pre-authenticated Octokit instance
   - Includes custom logging methods
   - Has built-in plugins: pagination, retry, throttling

2. **`repository`** (type: `import('@octoherd/cli').Repository`)
   - The response data from GitHub's `GET /repos/{owner}/{repo}` API
   - Contains all repository metadata (name, owner, settings, etc.)

3. **`options`** (type: `object`)
   - All CLI flags/options that are not consumed by Octoherd itself
   - Define custom options in JSDoc for your script

### Defining Custom Options

```javascript
/**
 * My custom script description
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.majorVersion] - Major version number (e.g., v11)
 * @param {string} [options.library] - Full library name (e.g., @org/library)
 * @param {number} [options.maxAgeDays=7] - Maximum age in days
 * @param {boolean} [options.dryRun=false] - Preview changes without applying
 */
export async function script(
  octokit,
  repository,
  { majorVersion, library = '@org/default', maxAgeDays = 7, dryRun = false }
) {
  // Validate required options
  if (!majorVersion) {
    throw new Error('--majorVersion is required, example: v11');
  }

  // Use options in your logic
  octokit.log.info(`Processing ${repository.full_name} for ${library} ${majorVersion}`);
}
```

---

## The Octokit Instance

### What is Provided

The `octokit` parameter is a customized instance of `@octoherd/octokit`, which extends the standard Octokit with:

1. **Pre-authentication**: Token is already configured
2. **Custom logging**: `octokit.log.*` methods
3. **Built-in plugins**:
   - `@octokit/plugin-paginate-rest`: For paginating REST API results
   - `@octokit/plugin-retry`: Automatic retry on transient errors
   - `@octokit/plugin-throttling`: Rate limit management

### Making REST API Calls

```javascript
// Simple request
const response = await octokit.request('GET /repos/{owner}/{repo}/topics', {
  owner: 'octoherd',
  repo: 'cli'
});

// Using destructuring
const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
  owner: repository.owner.login,
  repo: repository.name,
  state: 'open'
});

// POST request
await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
  owner: repository.owner.login,
  repo: repository.name,
  pull_number: 123,
  event: 'APPROVE',
  commit_id: 'abc123'
});

// PUT request
await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
  owner: repository.owner.login,
  repo: repository.name,
  pull_number: 123,
  commit_title: 'Merge PR #123',
  merge_method: 'squash'
});
```

### Making GraphQL Queries

```javascript
// Basic GraphQL query
const result = await octokit.graphql(
  `query prStatus($htmlUrl: URI!) {
    resource(url: $htmlUrl) {
      ... on PullRequest {
        mergeable
        reviewDecision
        viewerCanUpdate
        commits(last: 1) {
          nodes {
            commit {
              oid
              statusCheckRollup {
                state
              }
            }
          }
        }
      }
    }
  }`,
  {
    htmlUrl: 'https://github.com/owner/repo/pull/123'
  }
);

// Access the data
const { reviewDecision, mergeable } = result.resource;
const combinedStatus = result.resource.commits.nodes[0].commit.statusCheckRollup.state;
```

**GraphQL Best Practices**:
- Use variables instead of template literals to prevent injection attacks
- Only request the fields you need
- Be aware of rate limits when making many queries
- Consider nested pagination limitations (only single resource pagination supported)

### REST API Pagination

The `octokit.paginate()` method automatically handles pagination:

```javascript
// Get ALL pull requests (automatically paginated)
const allPRs = await octokit.paginate(
  'GET /repos/{owner}/{repo}/pulls',
  {
    owner: repository.owner.login,
    repo: repository.name,
    state: 'all',
    per_page: 100  // Max 100, default 30
  },
  (response) => response.data  // Map function to extract data
);

// Process all results
for (const pr of allPRs) {
  console.log(pr.title);
}
```

**Pagination Best Practices**:
- Set `per_page: 100` for efficiency (max allowed)
- Use map function to extract only needed data (reduces memory)
- Consider early termination with `done()` callback:

```javascript
// Stop pagination early
const recentPRs = await octokit.paginate(
  'GET /repos/{owner}/{repo}/pulls',
  { owner, repo, state: 'all', per_page: 100 },
  (response, done) => {
    const data = response.data;
    // Stop if we find a PR older than 30 days
    if (data.some(pr => isOlderThan(pr, 30))) {
      done();
    }
    return data;
  }
);
```

---

## The Repository Object

### Structure

The `repository` parameter contains the complete response from GitHub's `GET /repos/{owner}/{repo}` REST API endpoint.

### Key Properties

```javascript
// Repository identification
repository.id                    // 12345678
repository.node_id               // "MDEwOlJlcG9zaXRvcnkxMjM0NTY3OA=="
repository.name                  // "my-repo"
repository.full_name             // "owner/my-repo"
repository.owner.login           // "owner"
repository.owner.id              // 87654321

// Repository settings
repository.private               // false
repository.archived              // false
repository.disabled              // false
repository.is_template           // false
repository.fork                  // false

// Repository features
repository.has_issues            // true
repository.has_projects          // true
repository.has_wiki              // true
repository.has_pages             // false
repository.has_downloads         // true
repository.has_discussions       // false

// URLs
repository.html_url              // "https://github.com/owner/my-repo"
repository.url                   // API URL
repository.git_url               // Git protocol URL
repository.ssh_url               // SSH clone URL
repository.clone_url             // HTTPS clone URL

// Metadata
repository.description           // "Repository description"
repository.homepage              // "https://example.com"
repository.language              // "JavaScript"
repository.default_branch        // "main"

// Statistics
repository.size                  // 1234 (KB)
repository.stargazers_count      // 100
repository.watchers_count        // 50
repository.forks_count           // 25
repository.open_issues_count     // 10

// Timestamps (ISO 8601 format)
repository.created_at            // "2020-01-01T00:00:00Z"
repository.updated_at            // "2025-10-22T12:34:56Z"
repository.pushed_at             // "2025-10-22T12:00:00Z"

// Permissions (based on the authenticated user)
repository.permissions           // { admin: true, maintain: true, push: true, triage: true, pull: true }
```

### Common Patterns

```javascript
// Extracting owner and repo name
const [repoOwner, repoName] = repository.full_name.split('/');

// Creating base parameters for API calls
const baseParams = {
  owner: repository.owner.login,
  repo: repository.name
};

// Checking repository state
if (repository.archived) {
  octokit.log.info(`${repository.full_name} is archived, skipping.`);
  return;
}

if (repository.disabled) {
  octokit.log.warn(`${repository.full_name} is disabled`);
  return;
}

// Working with repository topics (requires separate API call)
const topics = await octokit.request('GET /repos/{owner}/{repo}/topics', {
  owner: repository.owner.login,
  repo: repository.name
});

if (topics.data.names.includes('no-automation')) {
  octokit.log.info(`${repository.full_name} has no-automation topic, skipping`);
  return;
}
```

---

## CLI Options and Execution

### Required Options

```bash
# Minimum required: script path
octoherd run -S path/to/script.js

# With token and repositories
octoherd run -S path/to/script.js \
  -T ghp_your_github_token_here \
  -R owner/repo
```

### All CLI Options

| Flag | Long Form | Description | Type | Default |
|------|-----------|-------------|------|---------|
| `-S` | `--octoherd-script` | Path to JavaScript script (ES Module) | string | (required) |
| `-T` | `--octoherd-token` | GitHub Personal Access Token | string | (prompts) |
| `-R` | `--octoherd-repos` | Target repositories | string[] | (prompts) |
| | `--octoherd-cache` | Cache responses for debugging | boolean/string | false |
| | `--octoherd-debug` | Show debug logs | boolean | false |
| | `--octoherd-bypass-confirms` | Skip confirmation prompts | boolean | false |
| | `--octoherd-base-url` | GitHub Enterprise Server API URL | string | https://api.github.com |

### Token Requirements

**For public repositories**: `public_repo` scope

**For private repositories**: `repo` scope (full control)

**Creating a token**:
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select appropriate scopes
4. Copy token (it won't be shown again)

### Usage Examples

```bash
# Basic usage with prompts
octoherd run -S ./script.js

# Pass token and repos as flags
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R owner/repo

# All repositories for an owner
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*'

# Multiple repository patterns
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  -R 'other-owner/specific-repo'

# Exclude specific repositories
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  -R '!owner/excluded-repo'

# Skip confirmations (for CI/automation)
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  --octoherd-bypass-confirms

# Enable debugging
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  --octoherd-debug

# Cache responses (creates ./cache folder)
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  --octoherd-cache

# GitHub Enterprise Server
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  --octoherd-base-url https://github.company.com/api/v3

# Custom script options
octoherd run -S ./script.js \
  -T $GITHUB_TOKEN \
  -R 'owner/*' \
  --majorVersion v11 \
  --library @org/package \
  --dryRun
```

---

## Repository Matching Patterns

### Pattern Syntax

| Pattern | Matches | Example |
|---------|---------|---------|
| `owner/repo` | Single specific repository | `octoherd/cli` |
| `owner/*` | All repositories for an owner | `octoherd/*` |
| `*` | All accessible repositories | `*` |
| `!owner/repo` | Exclude specific repository | `!octoherd/test-repo` |

### Combining Patterns

```bash
# Include all from owner1, plus specific repo from owner2
-R 'owner1/*' -R 'owner2/specific-repo'

# Include all from owner, but exclude specific ones
-R 'owner/*' -R '!owner/old-repo' -R '!owner/archived-repo'

# Complex filtering
-R 'org1/*' -R 'org2/*' -R '!org1/exclude1' -R '!org2/exclude2'
```

### Access Control

- Octoherd only processes repositories the authenticated user has access to
- Private repositories require appropriate token scopes
- Organization repositories require organization membership
- Token permissions determine what operations can be performed

---

## Logging Patterns

### Available Methods

The `octokit.log` object provides structured logging:

```javascript
octokit.log.info(message, ...args)      // Informational messages
octokit.log.warn(message, ...args)      // Warnings
octokit.log.error(message, ...args)     // Errors
octokit.log.debug(message, ...args)     // Debug (only when --octoherd-debug)
```

### Basic Logging

```javascript
// Simple message
octokit.log.info(`Processing ${repository.full_name}`);

// String interpolation (printf-style)
octokit.log.info('Processing %s', repository.full_name);

// Multiple values
octokit.log.info('Found %d PRs in %s', prs.length, repository.full_name);
```

### Structured Logging with Metadata

```javascript
// Log with structured data
const logData = {
  pr: {
    number: pr.number,
    reviewDecision: 'APPROVED',
    mergeable: 'MERGEABLE',
    combinedStatus: 'SUCCESS'
  }
};

octokit.log.info(
  logData,
  '%s: ready to merge',
  pr.html_url
);

// This outputs both the human-readable message and structured data
// for programmatic consumption
```

### Logging Best Practices

```javascript
// 1. Always include repository context
octokit.log.info(`${repository.full_name}: operation completed`);

// 2. Use appropriate log levels
if (repository.archived) {
  octokit.log.info(`${repository.full_name} is archived, skipping.`);
  return;
}

if (someWarningCondition) {
  octokit.log.warn(`${repository.full_name} has unusual configuration`);
}

// 3. Include URLs for easy navigation
octokit.log.info('Pull request merged: %s', pr.html_url);

// 4. Log both success and skip conditions
octokit.log.info(`${repository.full_name} already merged ${pr.html_url} at ${pr.merged_at}`);
return;

// 5. Debug logging for detailed information
octokit.log.debug('API response: %j', response.data);
```

### Common Logging Patterns

```javascript
// Operation start
octokit.log.info(`${repository.full_name}: Starting operation`);

// Skipping with reason
octokit.log.info(`${repository.full_name} is archived, skipping.`);
return;

// Warning about state
octokit.log.warn(`${repository.full_name} has DRAFT PR at ${html_url}`);

// Success with details
octokit.log.info('Pull request merged: %s', pr.html_url);

// Error (caught in try-catch)
octokit.log.error(e);

// Not found condition
octokit.log.warn(`${repository.full_name} has no PR for ${expectedTitle}`);
```

---

## Error Handling

### Basic Pattern

Always wrap your script logic in try-catch:

```javascript
export async function script(octokit, repository, options) {
  try {
    // Your script logic here

  } catch (e) {
    octokit.log.error(e);
    // Optionally re-throw for critical errors
    // throw e;
  }
}
```

### Handling GitHub API Errors

```javascript
try {
  const response = await octokit.request('GET /repos/{owner}/{repo}/topics', {
    owner: repository.owner.login,
    repo: repository.name
  });
} catch (error) {
  // GitHub API errors have a status property
  if (error.status === 404) {
    octokit.log.warn(`${repository.full_name}: topics not found`);
    return;
  }

  if (error.status === 403) {
    octokit.log.error(`${repository.full_name}: forbidden (check permissions)`);
    return;
  }

  // Unknown error, log and potentially re-throw
  octokit.log.error(error);
  throw error;
}
```

### Built-in Error Recovery

The `@octoherd/octokit` package includes automatic retry and throttling:

**Retry Plugin**:
- Automatically retries on transient server errors (5xx)
- Uses exponential backoff
- Handles rate limit errors

**Throttling Plugin**:
- Prevents hitting rate limits
- Automatically waits when approaching limits
- Handles abuse detection warnings

### Error Handling Best Practices

```javascript
// 1. Fail gracefully for missing resources
const workflows = await octokit.paginate(
  'GET /repos/{owner}/{repo}/actions/workflows',
  { owner, repo, per_page: 100 },
  (response) => response.data
);

const targetWorkflow = workflows.find(w => w.path === '.github/workflows/renovate.yml');
if (!targetWorkflow) {
  octokit.log.error(`${repository.full_name}: workflow not found`);
  return; // Don't throw, just skip this repo
}

// 2. Validate preconditions early
if (!options.requiredOption) {
  throw new Error('--requiredOption is required, example: value');
}

// 3. Handle permission issues gracefully
if (!repository.permissions?.push) {
  octokit.log.warn(`${repository.full_name}: insufficient permissions`);
  return;
}

// 4. Provide context in error messages
try {
  await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
    owner, repo, pull_number: pr.number, merge_method: 'squash'
  });
} catch (error) {
  octokit.log.error(
    `${repository.full_name}: failed to merge PR #${pr.number}: ${error.message}`
  );
}
```

---

## Pagination

### REST API Pagination

#### Basic Pattern

```javascript
// Paginate all results
const items = await octokit.paginate(
  'GET /repos/{owner}/{repo}/pulls',
  {
    owner: repository.owner.login,
    repo: repository.name,
    state: 'all',
    per_page: 100  // Use max for efficiency
  },
  (response) => response.data
);
```

#### Early Termination

```javascript
// Stop pagination when a condition is met
const recentPRs = await octokit.paginate(
  'GET /repos/{owner}/{repo}/pulls',
  { owner, repo, state: 'all', per_page: 100 },
  (response, done) => {
    const data = response.data;

    // Check if we should stop
    const oldestPR = data[data.length - 1];
    if (isOlderThan(oldestPR.created_at, maxAgeDays)) {
      done(); // Stop pagination
    }

    return data;
  }
);
```

#### Memory-Efficient Pagination

```javascript
// Extract only needed fields to reduce memory usage
const prTitles = await octokit.paginate(
  'GET /repos/{owner}/{repo}/pulls',
  { owner, repo, state: 'all', per_page: 100 },
  (response) => response.data.map(pr => ({
    number: pr.number,
    title: pr.title,
    html_url: pr.html_url
  }))
);
```

#### Iterator Pattern

For processing items as they arrive (useful for large datasets):

```javascript
for await (const response of octokit.paginate.iterator(
  'GET /repos/{owner}/{repo}/pulls',
  { owner, repo, state: 'all', per_page: 100 }
)) {
  // Process each page as it arrives
  for (const pr of response.data) {
    console.log(pr.title);
  }
}
```

### GraphQL Pagination

GraphQL pagination in Octoherd requires manual implementation or using `@octokit/plugin-paginate-graphql`:

```javascript
// Note: This requires additional setup beyond base @octoherd/octokit
// Manual cursor-based pagination
let hasNextPage = true;
let cursor = null;

while (hasNextPage) {
  const result = await octokit.graphql(
    `query ($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, after: $cursor) {
          nodes {
            number
            title
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`,
    {
      owner: repository.owner.login,
      repo: repository.name,
      cursor
    }
  );

  // Process results
  const prs = result.repository.pullRequests.nodes;
  for (const pr of prs) {
    console.log(pr.title);
  }

  // Update pagination
  hasNextPage = result.repository.pullRequests.pageInfo.hasNextPage;
  cursor = result.repository.pullRequests.pageInfo.endCursor;
}
```

### Pagination Best Practices

1. **Always use `per_page: 100`** for REST API calls (maximum allowed)
2. **Use map function** to extract only needed data (reduces memory)
3. **Implement early termination** when you don't need all results
4. **Consider iterator pattern** for very large datasets
5. **Be aware of rate limits** - pagination counts against your quota
6. **Use GraphQL** when you need complex related data (fewer requests)

---

## Common Patterns and Best Practices

### Repository Filtering

```javascript
// Skip archived repositories
if (repository.archived) {
  octokit.log.info(`${repository.full_name} is archived, skipping.`);
  return;
}

// Skip disabled repositories
if (repository.disabled) {
  octokit.log.warn(`${repository.full_name} is disabled, skipping.`);
  return;
}

// Check repository topics for opt-out
const topics = await octokit.request('GET /repos/{owner}/{repo}/topics', {
  owner: repository.owner.login,
  repo: repository.name
});

if (topics.data.names.includes('octoherd-no-touch')) {
  octokit.log.warn(`${repository.full_name} has octoherd-no-touch topic, skipping.`);
  return;
}

// Check permissions
if (!repository.permissions?.push) {
  octokit.log.warn(`${repository.full_name}: no push permission, skipping.`);
  return;
}
```

### Finding and Processing Pull Requests

```javascript
// Get all PRs (or filter by state)
const prs = await octokit.paginate(
  'GET /repos/{owner}/{repo}/pulls',
  {
    owner: repository.owner.login,
    repo: repository.name,
    state: 'all',  // 'open', 'closed', 'all'
    per_page: 100
  },
  (response) => response.data
);

// Find specific PR by title
const targetPR = prs.find(pr => pr.title.startsWith('fix(deps): update dependency'));

if (!targetPR) {
  octokit.log.warn(`${repository.full_name}: PR not found`);
  return;
}

// Check PR state
if (targetPR.merged_at) {
  octokit.log.info(`${repository.full_name}: already merged at ${targetPR.merged_at}`);
  return;
}

if (targetPR.closed_at) {
  octokit.log.info(`${repository.full_name}: PR was closed without merging`);
  return;
}

if (targetPR.draft) {
  octokit.log.warn(`${repository.full_name}: PR is still a draft`);
  return;
}
```

### Using GraphQL for Rich PR Data

```javascript
// Get PR status using GraphQL (more efficient than multiple REST calls)
const result = await octokit.graphql(
  `query prStatus($htmlUrl: URI!) {
    resource(url: $htmlUrl) {
      ... on PullRequest {
        mergeable
        reviewDecision
        viewerCanUpdate
        viewerDidAuthor
        latestOpinionatedReviews(first: 10, writersOnly: true) {
          nodes {
            viewerDidAuthor
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              oid
              statusCheckRollup {
                state
              }
            }
          }
        }
      }
    }
  }`,
  { htmlUrl: pr.html_url }
);

const { reviewDecision, mergeable, viewerCanUpdate } = result.resource;
const combinedStatus = result.resource.commits.nodes[0].commit.statusCheckRollup.state;
const latestCommitId = result.resource.commits.nodes[0].commit.oid;
```

### Approving Pull Requests

```javascript
// Check if approval is needed
if (reviewDecision !== 'APPROVED') {
  // Only approve if we haven't already
  if (!viewerDidAuthor && !viewerDidApprove) {
    await octokit.request(
      'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
      {
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pr.number,
        event: 'APPROVE',
        commit_id: latestCommitId
      }
    );

    octokit.log.info(`${repository.full_name}: approved PR #${pr.number}`);
  }
}
```

### Merging Pull Requests

```javascript
// Verify PR is ready to merge
if (combinedStatus !== 'SUCCESS') {
  octokit.log.info(`${repository.full_name}: status is ${combinedStatus}, skipping`);
  return;
}

if (mergeable !== 'MERGEABLE') {
  octokit.log.info(`${repository.full_name}: not mergeable, skipping`);
  return;
}

if (reviewDecision !== 'APPROVED') {
  octokit.log.info(`${repository.full_name}: awaiting approval, skipping`);
  return;
}

// Merge the PR
const commit_title = `${pr.title} (#${pr.number})`;
await octokit.request(
  'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
  {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pr.number,
    commit_title,
    merge_method: 'squash'  // 'merge', 'squash', or 'rebase'
  }
);

octokit.log.info(`${repository.full_name}: merged PR #${pr.number} - ${pr.html_url}`);
```

### Working with GitHub Actions Workflows

```javascript
// Get all workflows
const workflows = await octokit.paginate(
  'GET /repos/{owner}/{repo}/actions/workflows',
  {
    owner: repository.owner.login,
    repo: repository.name,
    per_page: 100
  },
  (response) => response.data
);

// Find specific workflow
const workflowPath = '.github/workflows/renovate.yml';
const targetWorkflow = workflows.find(w => w.path === workflowPath);

if (!targetWorkflow) {
  octokit.log.error(`${repository.full_name}: workflow ${workflowPath} not found`);
  return;
}

// Get recent workflow runs
const runs = await octokit.paginate(
  'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
  {
    owner: repository.owner.login,
    repo: repository.name,
    workflow_id: targetWorkflow.id,
    per_page: 100
  },
  (response) => response.data
);

// Filter to main branch and sort by run number
const mainRuns = runs
  .filter(r => r.head_branch === 'main')
  .sort((a, b) => b.run_number - a.run_number);

const latestRun = mainRuns[0];

// Check if workflow is currently running
const runningStatuses = ['in_progress', 'queued', 'requested', 'waiting', 'pending'];
if (runningStatuses.includes(latestRun.status)) {
  octokit.log.info(
    `${repository.full_name}: workflow is ${latestRun.status}: ${latestRun.html_url}`
  );
  return;
}

// Trigger workflow re-run
await octokit.request(
  'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
  {
    owner: repository.owner.login,
    repo: repository.name,
    run_id: latestRun.id
  }
);

octokit.log.info(`${repository.full_name}: triggered workflow re-run`);
```

### Date/Time Handling

```javascript
// Parse ISO 8601 timestamps
const mergedAt = new Date(pr.merged_at);
const now = new Date();

// Calculate age in days
const ageMs = now.getTime() - mergedAt.getTime();
const ageDays = ageMs / (1000 * 60 * 60 * 24);

// Check if too old
if (ageDays > maxAgeDays) {
  octokit.log.info(
    `${repository.full_name}: PR merged ${ageDays.toFixed(1)} days ago, skipping`
  );
  return;
}

// Format for display
octokit.log.info(
  `${repository.full_name}: PR merged at ${pr.merged_at} (${ageDays.toFixed(1)} days ago)`
);
```

### Dry Run Pattern

```javascript
export async function script(octokit, repository, { dryRun = false }) {
  // ... determine what changes to make ...

  if (dryRun) {
    octokit.log.info(`[DRY RUN] Would merge PR #${pr.number} in ${repository.full_name}`);
    return;
  }

  // Actually perform the operation
  await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pr.number,
    merge_method: 'squash'
  });

  octokit.log.info(`${repository.full_name}: merged PR #${pr.number}`);
}
```

---

## TypeScript Type Definitions

### Using Types in JavaScript (JSDoc)

```javascript
// @ts-check  // Enable TypeScript checking in JavaScript

/**
 * Script description
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.majorVersion]
 * @param {string} [options.library]
 * @param {number} [options.maxAgeDays]
 */
export async function script(octokit, repository, options) {
  // TypeScript will now provide type checking and autocomplete
}
```

### Available Types

From `@octoherd/cli`:
- `Octokit`: The customized Octokit instance type
- `Repository`: The repository object type

### Extending Options Type

```javascript
/**
 * @typedef {object} ScriptOptions
 * @property {string} majorVersion - Major version number
 * @property {string} [library] - Library name
 * @property {number} [maxAgeDays] - Maximum age in days
 * @property {boolean} [dryRun] - Preview mode
 */

/**
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {ScriptOptions} options
 */
export async function script(octokit, repository, options) {
  // options is now fully typed
}
```

### Getting Response Types

For GitHub API response types, use `@octokit/types`:

```javascript
/**
 * @type {import('@octokit/types').Endpoints['GET /repos/{owner}/{repo}/pulls']['response']['data']}
 */
let pullRequests;
```

---

## Complete Examples

### Example 1: Simple Repository Lister

```javascript
// @ts-check

/**
 * List all repositories and their star counts
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 */
export async function script(octokit, repository) {
  try {
    octokit.log.info(
      `${repository.full_name}: ${repository.stargazers_count} stars`
    );
  } catch (e) {
    octokit.log.error(e);
  }
}
```

### Example 2: Find and Report Outdated Dependencies

```javascript
// @ts-check

/**
 * Find repositories with outdated dependencies
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} options.dependency - Dependency name to check
 */
export async function script(octokit, repository, { dependency }) {
  if (!dependency) {
    throw new Error('--dependency is required');
  }

  try {
    // Skip archived repos
    if (repository.archived) {
      octokit.log.info(`${repository.full_name} is archived, skipping.`);
      return;
    }

    // Get package.json
    try {
      const { data } = await octokit.request(
        'GET /repos/{owner}/{repo}/contents/{path}',
        {
          owner: repository.owner.login,
          repo: repository.name,
          path: 'package.json'
        }
      );

      // Decode content
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const packageJson = JSON.parse(content);

      // Check dependencies
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      if (deps[dependency]) {
        octokit.log.info(
          `${repository.full_name}: uses ${dependency}@${deps[dependency]}`
        );
      }
    } catch (error) {
      if (error.status === 404) {
        octokit.log.debug(`${repository.full_name}: no package.json`);
        return;
      }
      throw error;
    }
  } catch (e) {
    octokit.log.error(e);
  }
}
```

### Example 3: Auto-Merge Renovate PRs (Complete Pattern)

```javascript
// @ts-check

/**
 * Auto-merge approved Renovate PRs
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} options.library - Library name
 * @param {string} options.version - Version to merge
 * @param {boolean} [options.dryRun=false] - Preview without merging
 */
export async function script(
  octokit,
  repository,
  { library, version, dryRun = false }
) {
  if (!library || !version) {
    throw new Error('--library and --version are required');
  }

  try {
    // Skip archived repos
    if (repository.archived) {
      octokit.log.info(`${repository.full_name} is archived, skipping.`);
      return;
    }

    const expectedTitle = `fix(deps): update dependency ${library} to ${version}`;

    // Find PR
    const prs = await octokit.paginate(
      'GET /repos/{owner}/{repo}/pulls',
      {
        owner: repository.owner.login,
        repo: repository.name,
        state: 'open',
        per_page: 100
      },
      (response) => response.data
    );

    const pr = prs.find(p => p.title === expectedTitle);

    if (!pr) {
      octokit.log.debug(`${repository.full_name}: no matching PR found`);
      return;
    }

    if (pr.draft) {
      octokit.log.warn(`${repository.full_name}: PR #${pr.number} is a draft`);
      return;
    }

    // Get PR details via GraphQL
    const result = await octokit.graphql(
      `query prStatus($htmlUrl: URI!) {
        resource(url: $htmlUrl) {
          ... on PullRequest {
            mergeable
            reviewDecision
            viewerCanUpdate
            commits(last: 1) {
              nodes {
                commit {
                  oid
                  statusCheckRollup {
                    state
                  }
                }
              }
            }
          }
        }
      }`,
      { htmlUrl: pr.html_url }
    );

    const { reviewDecision, mergeable, viewerCanUpdate } = result.resource;
    const combinedStatus = result.resource.commits.nodes[0].commit.statusCheckRollup.state;

    // Check merge conditions
    if (!viewerCanUpdate) {
      octokit.log.warn(`${repository.full_name}: cannot update PR #${pr.number}`);
      return;
    }

    if (combinedStatus !== 'SUCCESS') {
      octokit.log.info(
        `${repository.full_name}: PR #${pr.number} status is ${combinedStatus}`
      );
      return;
    }

    if (mergeable !== 'MERGEABLE') {
      octokit.log.info(
        `${repository.full_name}: PR #${pr.number} is not mergeable`
      );
      return;
    }

    if (reviewDecision !== 'APPROVED') {
      octokit.log.info(
        `${repository.full_name}: PR #${pr.number} awaiting approval`
      );
      return;
    }

    // Merge
    if (dryRun) {
      octokit.log.info(
        `[DRY RUN] ${repository.full_name}: would merge PR #${pr.number} - ${pr.html_url}`
      );
      return;
    }

    const commit_title = `${pr.title} (#${pr.number})`;
    await octokit.request(
      'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
      {
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pr.number,
        commit_title,
        merge_method: 'squash'
      }
    );

    octokit.log.info(
      `${repository.full_name}: merged PR #${pr.number} - ${pr.html_url}`
    );
  } catch (e) {
    octokit.log.error(e);
  }
}
```

---

## Additional Resources

### Official Documentation

- **Octoherd CLI**: https://github.com/octoherd/cli
- **Octoherd Octokit**: https://github.com/octoherd/octokit
- **Example Scripts**: https://github.com/topics/octoherd-script
- **Awesome Scripts**: https://github.com/robvanderleek/awesome-octoherd-scripts

### GitHub API Documentation

- **REST API**: https://docs.github.com/en/rest
- **GraphQL API**: https://docs.github.com/en/graphql
- **Repository Object**: https://docs.github.com/en/rest/repos/repos#get-a-repository

### Octokit Documentation

- **Octokit.js**: https://github.com/octokit/octokit.js
- **REST Plugin**: https://github.com/octokit/plugin-rest.js
- **Paginate Plugin**: https://github.com/octokit/plugin-paginate-rest.js
- **Types**: https://github.com/octokit/types.ts

### Community

- **DEV Article**: https://dev.to/github/next-level-repository-management-with-octoherd-47ea
- **Octoherd Organization**: https://github.com/octoherd

---

## Summary for LLMs

When working with Octoherd scripts, remember:

1. **Script structure**: Always export an async `script` function with three parameters: `octokit`, `repository`, `options`

2. **Error handling**: Wrap logic in try-catch, log errors with `octokit.log.error(e)`

3. **Early returns**: Check conditions early (archived, disabled, missing permissions) and return to skip

4. **Logging**: Use appropriate log levels (info, warn, error, debug) and include repository context

5. **Pagination**: Use `octokit.paginate()` with `per_page: 100` for efficiency

6. **GraphQL**: Use for complex queries that would require multiple REST calls

7. **Repository filtering**: Always check `repository.archived`, permissions, and other conditions

8. **Type safety**: Use JSDoc comments with `@ts-check` for type checking in JavaScript

9. **Custom options**: Document in JSDoc and provide defaults in function destructuring

10. **Dry run**: Consider adding a `--dryRun` option for safe testing

This framework is designed for bulk operations across repositories. Think in terms of: filter repositories, check conditions, perform action (or skip with reason), log outcome.
