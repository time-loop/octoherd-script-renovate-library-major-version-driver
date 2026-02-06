// @ts-check

const noTouchTopicName = "octoherd-no-touch";

/**
 * Updates pnpm version from "9" to 9.15.7 in workflow files
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {object} baseParams - { owner, repo }
 * @param {string} prBranch - PR branch name
 * @param {string} repoFullName - Full repository name for logging
 */
async function updateWorkflowPnpmVersions(
  octokit,
  baseParams,
  prBranch,
  repoFullName,
) {
  const workflowFiles = [
    ".github/workflows/build.yml",
    ".github/workflows/release.yml",
    ".github/workflows/update-projen-main.yml",
  ];

  const updatedFiles = [];

  for (const workflowPath of workflowFiles) {
    try {
      // Try to fetch the workflow file from the PR branch
      let fileResponse;
      try {
        fileResponse = await octokit.request(
          "GET /repos/{owner}/{repo}/contents/{path}",
          {
            ...baseParams,
            path: workflowPath,
            ref: prBranch,
          },
        );
      } catch (error) {
        if (error.status === 404) {
          octokit.log.info(
            `${repoFullName}: ${workflowPath} not found in PR branch, skipping`,
          );
          continue;
        }
        throw error;
      }

      const content = Buffer.from(fileResponse.data.content, "base64").toString(
        "utf-8",
      );
      const fileSha = fileResponse.data.sha;

      // Check if the file contains the pattern we're looking for
      // We need to ensure we're updating the version under pnpm/action-setup
      const pnpmActionRegex =
        /uses:\s*pnpm\/action-setup@v4[\s\S]*?with:\s*\n(\s+)version:\s*"9"/;

      if (!pnpmActionRegex.test(content)) {
        // Pattern not found, skip this file
        continue;
      }

      // Replace quoted "9" with unquoted 10.22.0, preserving indentation
      const updatedContent = content.replace(
        /(\s+version:\s*)"9"/g,
        "$110.22.0",
      );

      // Only commit if content actually changed
      if (updatedContent !== content) {
        await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
          ...baseParams,
          path: workflowPath,
          message: "chore(projen): update pnpm version in workflows",
          content: Buffer.from(updatedContent).toString("base64"),
          sha: fileSha,
          branch: prBranch,
        });

        updatedFiles.push(workflowPath);
        octokit.log.info(
          `${repoFullName}: Updated pnpm version in ${workflowPath}`,
        );
      }
    } catch (error) {
      // Log warning but continue with other files
      octokit.log.warn(
        `${repoFullName}: Failed to update ${workflowPath}: ${error.message}`,
      );
    }
  }

  if (updatedFiles.length > 0) {
    octokit.log.info(
      `${repoFullName}: Successfully updated pnpm version in ${updatedFiles.length} workflow file(s): ${updatedFiles.join(", ")}`,
    );
  } else {
    octokit.log.info(
      `${repoFullName}: No workflow files needed pnpm version update`,
    );
  }
}

/**
 * Drive renovate's major library update process.
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 * @param {object} options
 * @param {string} [options.majorVersion] major version number for the library, for example v11. If you provide `all` then it will instead address the `all non-major updates` PR. If you provide `projen`, it will address the `fix(deps): upgrade projen` PR.
 * @param {string} [options.library] full name of library to be updated via renovate, for example \@time-loop/cdk-library. Ignored when doing an `all non-major updates`.
 * @param {number} [options.maxAgeDays] the maximum age, in days, since when a PR was merge to consider it the relevant PR. Ignored except when doing `all non-major updates`. Defaults to 7.
 * @param {boolean} [options.merge] whether to merge PRs. Defaults to true.
 */
export async function script(
  octokit,
  repository,
  {
    majorVersion,
    library = "@time-loop/cdk-library",
    maxAgeDays = 7,
    merge = true,
  },
) {
  if (!majorVersion) {
    throw new Error("--majorVersion is required, example v11");
  }

  let checkMaxAge = false;
  let expectedTitle = `fix(deps): update dependency ${library} to ${majorVersion}`;
  let workflowName = "renovate";
  switch (majorVersion) {
    case "all":
      checkMaxAge = true;
      expectedTitle = "fix(deps): update all non-major dependencies";
      break;
    case "projen":
      checkMaxAge = true;
      expectedTitle = "fix(deps): upgrade projen";
      workflowName = "update-projen-main";
  }

  const [repoOwner, repoName] = repository.full_name.split("/");
  const baseParams = {
    owner: repoOwner,
    repo: repoName,
  };

  try {
    // skip archived repos
    if (repository.archived) {
      octokit.log.info(`${repository.full_name} is archived, skipping.`);
      return;
    }

    // Safety check.
    const topics = await octokit.request(
      "GET /repos/{owner}/{repo}/topics",
      baseParams,
    );
    if (topics.data.names.includes(noTouchTopicName)) {
      octokit.log.warn(
        `${repository.full_name} has label '${noTouchTopicName}'`,
      );
      return;
    }

    // Find PR for library update?
    const prs = await octokit.paginate(
      "GET /repos/{owner}/{repo}/pulls",
      { ...baseParams, state: "all" },
      (response) => response.data,
    );
    for (const pr of prs) {
      const { id, title, merged_at, html_url, draft, closed_at } = pr;

      if (!title.startsWith(expectedTitle)) {
        continue; // This is not the PR we're looking for. Maybe the next one is?
      }

      // Is it already merged?
      if (merged_at) {
        const currentDate = new Date();
        const mergedAt = Date.parse(merged_at);
        const daysAgo =
          (currentDate.getTime() - mergedAt) / (1000 * 60 * 60 * 24);
        if (checkMaxAge && daysAgo > maxAgeDays) {
          octokit.log.info(
            `${repository.full_name} already merged ${html_url} at ${merged_at}, ${daysAgo.toFixed(1)} days ago, ignoring`,
          );
          break; // PRs are returned in chronological order. No need to look further, it doesn't exist.
        }
        octokit.log.info(
          `${repository.full_name} already merged ${html_url} at ${merged_at}`,
        );
        return;
      }

      if (closed_at) {
        continue;
      }

      if (draft) {
        octokit.log.warn(`${repository.full_name} has DRAFT PR at ${html_url}`);
        return;
      }

      // Apply .projenrc.ts fix for projen PRs
      if (majorVersion === "projen") {
        try {
          const prBranch = pr.head.ref;
          const projenrcPath = ".projenrc.ts";

          // Fetch the .projenrc.ts file from the PR branch
          let fileResponse;
          try {
            fileResponse = await octokit.request(
              "GET /repos/{owner}/{repo}/contents/{path}",
              {
                ...baseParams,
                path: projenrcPath,
                ref: prBranch,
              },
            );
          } catch (error) {
            // File doesn't exist or can't be fetched, continue normally
            if (error.status === 404) {
              octokit.log.info(
                `${repository.full_name}: .projenrc.ts not found in PR branch, skipping fix`,
              );
            } else {
              octokit.log.warn(
                `${repository.full_name}: Could not fetch .projenrc.ts: ${error.message}`,
              );
            }
            // Continue to PR validation
            fileResponse = null;
          }

          if (fileResponse) {
            const content = Buffer.from(
              fileResponse.data.content,
              "base64",
            ).toString("utf-8");
            const fileSha = fileResponse.data.sha;

            // Check if the file contains the deprecated packageManager configuration
            if (
              content.includes(
                "packageManager: javascript.NodePackageManager.PNPM",
              )
            ) {
              octokit.log.info(
                `${repository.full_name}: Found deprecated packageManager configuration, applying fix...`,
              );

              let updatedContent = content;

              // Check if pnpmVersion exists and warn if it's not the default
              const pnpmVersionMatch = content.match(
                /pnpmVersion:\s*['"]([^'"]+)['"]/,
              );
              if (pnpmVersionMatch && pnpmVersionMatch[1] !== "9") {
                octokit.log.warn(
                  `${repository.full_name}: Removing non-standard pnpmVersion: '${pnpmVersionMatch[1]}'`,
                );
              }

              // Remove the packageManager line
              updatedContent = updatedContent.replace(
                /^\s*packageManager:\s*javascript\.NodePackageManager\.PNPM,?\s*$/gm,
                "",
              );

              // Remove the pnpmVersion line (handles any version)
              updatedContent = updatedContent.replace(
                /^\s*pnpmVersion:\s*['"][^'"]*['"],?\s*$/gm,
                "",
              );

              // Check if 'javascript' import is still used elsewhere in the file
              const remainingContent = updatedContent.replace(
                /^import\s+\{[^}]*\}\s+from\s+['"]projen['"];?\s*$/gm,
                "",
              );

              // If 'javascript' is not used anywhere else, remove the import
              if (!remainingContent.includes("javascript.")) {
                updatedContent = updatedContent.replace(
                  /^import\s+\{\s*javascript\s*\}\s+from\s+['"]projen['"];?[ \t]*\n/gm,
                  "",
                );
              }

              // Clean up any extra blank lines that might have been created
              updatedContent = updatedContent.replace(/\n\n\n+/g, "\n\n");

              // Clean up blank lines left in object/array property lists after removing lines
              // This handles: property,\n\n  property -> property,\n  property
              updatedContent = updatedContent.replace(
                /,\s*\n\s*\n(\s+)/g,
                ",\n$1",
              );

              // Clean up blank lines at the start of objects/arrays after removing first property
              // This handles: {\n\n  property -> {\n  property
              updatedContent = updatedContent.replace(
                /\{\s*\n\s*\n(\s+)/g,
                "{\n$1",
              );

              // Clean up blank lines before closing braces
              // This handles: \n\n} -> \n} while preserving commas
              updatedContent = updatedContent.replace(
                /\s*\n\s*\n(\s*\})/g,
                "\n$1",
              );

              // Only commit if content actually changed
              if (updatedContent !== content) {
                // Commit the changes to the PR branch
                await octokit.request(
                  "PUT /repos/{owner}/{repo}/contents/{path}",
                  {
                    ...baseParams,
                    path: projenrcPath,
                    message:
                      "chore(projen): remove deprecated packageManager configuration",
                    content: Buffer.from(updatedContent).toString("base64"),
                    sha: fileSha,
                    branch: prBranch,
                  },
                );

                octokit.log.info(
                  `${repository.full_name}: Successfully fixed .projenrc.ts in PR ${html_url}`,
                );
              } else {
                octokit.log.info(
                  `${repository.full_name}: No changes needed for .projenrc.ts`,
                );
              }
            }

            // Always update pnpm version in workflow files for idempotency
            // (handles cases where .projenrc.ts was already fixed but workflows weren't)
            await updateWorkflowPnpmVersions(
              octokit,
              baseParams,
              prBranch,
              repository.full_name,
            );
          }
        } catch (error) {
          // Log error but don't stop the script
          octokit.log.error(
            `${repository.full_name}: Error while fixing .projenrc.ts: ${error.message}`,
          );
          // Continue to PR validation
        }
      }

      let autoMergeEnabled = false;
      if (merge) {
        try {
          await octokit.graphql(
            `mutation enableAutoMerge($pullRequestId: ID!) {
              enablePullRequestAutoMerge(input: {
                pullRequestId: $pullRequestId
                mergeMethod: SQUASH
              }) {
                pullRequest {
                  autoMergeRequest {
                    enabledAt
                  }
                }
              }
            }`,
            {
              pullRequestId: id,
            },
          );
          octokit.log.info(
            "auto-merge enabled, GitHub will merge when ready: %s",
            pr.html_url,
          );
          autoMergeEnabled = true;
        } catch (error) {
          // Auto-merge not allowed or failed, fall back to manual merge
          octokit.log.info(
            `${repository.full_name}: auto-merge not available (${error.message}), falling back to manual merge`,
          );
        }
      }

      // Copied from
      // https://github.com/gr2m/octoherd-script-merge-pull-requests/blob/main/script.js
      const result = await octokit.graphql(
        `query prStatus($htmlUrl: URI!) {
          resource(url: $htmlUrl) {
            ... on PullRequest {
              # merge status
              mergeable
              # review status
              reviewDecision
              viewerCanUpdate
              viewerDidAuthor
              latestOpinionatedReviews(first:10,writersOnly:true) {
                nodes {
                  viewerDidAuthor
                }
              }
              # CI status
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
        }
        `,
        {
          htmlUrl: html_url,
        },
      );

      const { reviewDecision, mergeable, viewerCanUpdate, viewerDidAuthor } =
        result.resource;

      // Status check information
      const combinedStatus =
        result.resource.commits.nodes[0].commit.statusCheckRollup?.state ||
        "PENDING";

      // Approval information
      const viewerDidApprove =
        !!result.resource.latestOpinionatedReviews.nodes.find(
          (node) => node.viewerDidAuthor,
        );

      const latestCommitId = result.resource.commits.nodes[0].commit.oid;

      const logData = {
        pr: {
          number: pr.number,
          reviewDecision,
          mergeable,
          combinedStatus,
          viewerCanUpdate,
        },
      };

      if (!viewerCanUpdate) {
        octokit.log.info(
          logData,
          `%s: you cannot update this PR. Skipping`,
          pr.html_url,
        );
        return;
      }

      if (combinedStatus !== "SUCCESS") {
        octokit.log.info(
          logData,
          `%s: status is "%s". Skipping`,
          pr.html_url,
          combinedStatus,
        );
        return;
      }

      if (mergeable !== "MERGEABLE") {
        octokit.log.info(
          logData,
          `%s: mergable status is "%s". Skipping`,
          pr.html_url,
          mergeable,
        );
        return;
      }

      if (reviewDecision !== "APPROVED") {
        if (!viewerDidAuthor && !viewerDidApprove) {
          // attempt to add approval
          await octokit.request(
            "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
            {
              owner: repository.owner.login,
              repo: repository.name,
              pull_number: pr.number,
              event: "APPROVE",
              commit_id: latestCommitId,
            },
          );

          // check if PR is now approved
          const {
            resource: { reviewDecision: newReviewDecision },
          } = await octokit.graphql(
            `query prStatus($htmlUrl: URI!) {
                resource(url: $htmlUrl) {
                  ... on PullRequest {
                    reviewDecision
                  }
                }
              }`,
            {
              htmlUrl: pr.html_url,
            },
          );

          if (newReviewDecision !== "APPROVED") {
            octokit.log.info(
              logData,
              "%s: awaiting approval. Skipping",
              pr.html_url,
            );
            return;
          }
        } else {
          octokit.log.info(
            logData,
            "%s: awaiting approval. Skipping",
            pr.html_url,
          );
          return;
        }
      }

      if (merge && !autoMergeEnabled) {
        const commit_title = `${pr.title} (#${pr.number})`;
        await octokit.request(
          "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
          {
            owner: repository.owner.login,
            repo: repository.name,
            pull_number: pr.number,
            commit_title,
            merge_method: "squash",
          },
        );
        octokit.log.info("pull request manually merged: %s", pr.html_url);
      } else {
        octokit.log.info(
          "pull request ready to merge (merge disabled): %s",
          pr.html_url,
        );
      }
      return;
    }

    // TODO: trigger renovate to generate the PR? If so, we should also detect when the action is already running.
    octokit.log.warn(`${repository.full_name} has no PR for ${expectedTitle}`);

    // Find the update-main workflow,
    const workflowPath = `.github/workflows/${workflowName}.yml`;
    const workflows = await octokit.paginate(
      "GET /repos/{owner}/{repo}/actions/workflows",
      { ...baseParams, per_page: 100 },
      (response) => response.data,
    );
    const renovateWf = workflows.find((w) => w.path === workflowPath);
    // octokit.log.info(JSON.stringify(renovateWf));
    if (renovateWf === undefined) {
      octokit.log.error(`Missing workflow at ${workflowPath}`);
      return;
    }
    const workflow_id = renovateWf?.id ?? 0; // Should never be 0, but...

    // is it still running?
    const runs = await octokit.paginate(
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
      {
        ...baseParams,
        workflow_id,
        per_page: 100,
      },
      (response) => response.data,
    );

    const sortedRunsOnMain = runs
      .filter((r) => r.head_branch === "main")
      .sort((a, b) => b.run_number - a.run_number); // Sort to find newest

    const lastRun = sortedRunsOnMain[0];
    octokit.log.info(
      `${repository.full_name} lastRun.run_started_at: ${lastRun.run_started_at} status: ${lastRun.status} id: ${lastRun.id}`,
    );

    // If it's still running, comment and proceed
    // Per https://docs.github.com/en/free-pro-team@latest/rest/actions/workflow-runs?apiVersion=2022-11-28#get-a-workflow-run
    // Can be one of: completed, action_required, cancelled, failure, neutral, skipped, stale, success, timed_out, in_progress, queued, requested, waiting, pending
    if (
      ["in_progress", "queued", "requested", "waiting", "pending"].includes(
        lastRun.status ?? "unknown",
      )
    ) {
      octokit.log.info(
        `${repository.full_name} renovate is currently ${lastRun.status}: ${lastRun.html_url}`,
      );
      return;
    }

    // Don't re-run more than once every 30 min
    if (lastRun.run_started_at) {
      const lastRunTime = Date.parse(lastRun.run_started_at);
      const minutesSinceLastRun = (Date.now() - lastRunTime) / (1000 * 60);
      if (minutesSinceLastRun < 30) {
        octokit.log.info(
          `${repository.full_name} workflow ran ${minutesSinceLastRun.toFixed(1)} minutes ago, skipping re-run (throttled)`,
        );
        return;
      }
    }

    // Otherwise trigger a re-run
    octokit.log.info(
      `${repository.full_name} Triggering re-run of ${lastRun.id}`,
    );
    octokit.request("POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun", {
      ...baseParams,
      run_id: lastRun.id,
    });
  } catch (e) {
    octokit.log.error(e);
  }
}
