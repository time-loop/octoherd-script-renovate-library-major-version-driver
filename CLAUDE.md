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
- **script.js** - Main script logic with two key exports:
  - `updateWorkflowPnpmVersions()` - Helper function (lines 13-104) that updates pnpm versions in workflow files
  - `script()` - Main function (lines 117-635) that orchestrates the PR merge workflow

### Workflow Logic (script.js)

The script follows this sequence for each repository:

1. **Safety checks** (lines 151-168):
   - Skip archived repositories
   - Check for `octoherd-no-touch` topic to skip protected repos

2. **PR Discovery** (lines 170-209):
   - Search for PRs matching the expected title pattern
   - For special cases (`all` and `projen`), check `maxAgeDays` to avoid stale merged PRs
   - Skip if PR is already merged, closed, or in draft state

4. **Projen-specific fixes** (lines 210-363):
   - For `projen` major version only:
     - Updates `.projenrc.ts` to remove deprecated `packageManager: javascript.NodePackageManager.PNPM` configuration
     - Removes `pnpmVersion` property (warns if non-standard value found)
     - Cleans up unused `javascript` imports
     - Updates pnpm version in workflow files (`.github/workflows/*.yml`) from "9" to 10.22.0
   - These changes are committed directly to the PR branch before approval/merge

5. **Auto-merge attempt** (lines 365-396):
   - Tries to enable GitHub auto-merge via GraphQL mutation (SQUASH method)
   - Falls back to manual merge if auto-merge is not available
   - Auto-merge allows GitHub to merge when all checks pass

6. **PR Validation** (lines 398-488):
   - Uses GraphQL query to fetch comprehensive PR status
   - Checks: mergeable state, review decision, CI status (statusCheckRollup)
   - Exits early if PR cannot be updated, CI failing, or conflicts exist

7. **Auto-approval** (lines 490-536):
   - Attempts to approve PR if not already approved and viewer can approve
   - Re-checks approval status after attempting approval

8. **Merge** (lines 538-557):
   - Only performs manual merge if auto-merge was not enabled
   - Squash merges the PR with standardized commit title format

9. **Workflow Re-run** (lines 559-632):
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
- `--merge` (default: true): Whether to merge PRs. Use `--no-merge` to validate PRs without actually merging them

### PAT Requirements

The GitHub Personal Access Token needs:
- `repo` - Full control of private repositories

## Key Implementation Details

- Uses `@octoherd/cli` framework for multi-repository operations
- Combines REST API and GraphQL for comprehensive PR status checking
- Workflow re-run logic ensures Renovate runs are triggered when PRs don't exist
- The `noTouchTopicName` constant (`octoherd-no-touch`) provides escape hatch for repositories
- For projen updates, automatically modernizes pnpm configuration:
  - Removes deprecated `packageManager` and `pnpmVersion` properties from `.projenrc.ts`
  - Updates workflow files to use pnpm 10.22.0 (unquoted) instead of "9" (quoted)
  - Targets `.github/workflows/{build,release,update-projen-main}.yml`
  - Changes are idempotent and committed directly to the PR branch before merge
