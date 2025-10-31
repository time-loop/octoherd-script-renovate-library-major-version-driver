# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Octoherd script that automates the merging of Renovate dependency update PRs across multiple repositories. It's designed to handle major version library updates, "all non-major updates" PRs, and projen update PRs.

## Key Commands

### Running the Script
```bash
# Basic usage
node cli.js \
  -R time-loop/*-cdk \
  -T ghp_TOKEN \
  --majorVersion v11

# Handle "all non-major updates" PRs
node cli.js \
  -R time-loop/*-cdk \
  -T ghp_TOKEN \
  --majorVersion all

# Handle projen update PRs
node cli.js \
  -R time-loop/*-cdk \
  -T ghp_TOKEN \
  --majorVersion projen
```

### Testing
```bash
npm test  # Alias for: node script.js
npm start # Alias for: node cli.js
```

## Architecture

### Core Files
- **cli.js** - Entry point that imports and runs the script using `@octoherd/cli/run`
- **script.js** - Main script logic exported as `async function script(octokit, repository, options)`

### Workflow Logic (script.js)

The script follows this sequence for each repository:

1. **Safety checks** (lines 46-61):
   - Skip archived repositories
   - Check for `octoherd-no-touch` topic to skip protected repos

2. **PR Discovery** (lines 63-100):
   - Search for PRs matching the expected title pattern
   - For special cases (`all` and `projen`), check `maxAgeDays` to avoid stale merged PRs
   - Skip if PR is already merged, closed, or in draft state

3. **PR Validation** (lines 104-191):
   - Uses GraphQL query to fetch comprehensive PR status
   - Checks: mergeable state, review decision, CI status (statusCheckRollup)
   - Exits early if PR cannot be updated, CI failing, or conflicts exist

4. **Auto-approval** (lines 193-239):
   - Attempts to approve PR if not already approved and viewer can approve
   - Re-checks approval status after attempting approval

5. **Merge** (lines 241-253):
   - Squash merges the PR with standardized commit title format

6. **Workflow Re-run** (lines 256-305):
   - If no PR exists, finds the relevant workflow (renovate.yml or update-projen-main.yml)
   - Checks if workflow is already running
   - Validates that at least 30 minutes have passed since the last workflow run (throttling)
   - Re-runs the last workflow if it's not currently active and throttle period has elapsed
   - Throttling prevents excessive CI usage when the script runs frequently

### Special Cases

The script handles three distinct patterns via the `--majorVersion` parameter:

- **Standard major version** (e.g., `v11`): Targets PRs like "fix(deps): update dependency @time-loop/cdk-library to v11"
- **`all`**: Targets "fix(deps): update all non-major dependencies" PRs, uses `maxAgeDays` parameter
- **`projen`**: Targets "fix(deps): upgrade projen" PRs from `update-projen-main` workflow, uses `maxAgeDays` parameter

### Options

- `--majorVersion` (required): Major version (e.g., `v11`), `all`, or `projen`
- `--library` (default: `@time-loop/cdk-library`): Library name (ignored for `all` and `projen`)
- `--maxAgeDays` (default: 7): Maximum age in days for merged PRs (only used with `all` and `projen`)

### PAT Requirements

The GitHub Personal Access Token needs:
- `repo` - Full control of private repositories

## Key Implementation Details

- Uses `@octoherd/cli` framework for multi-repository operations
- Combines REST API and GraphQL for comprehensive PR status checking
- Workflow re-run logic ensures Renovate runs are triggered when PRs don't exist
- The `noTouchTopicName` constant (`octoherd-no-touch`) provides escape hatch for repositories
