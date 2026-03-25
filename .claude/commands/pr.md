Create a PR for the current changes, optionally closing a GitHub issue.

Argument: $ARGUMENTS (optional GitHub issue ID, e.g. "123" or "#123" — may be empty)

Follow these steps:

1. Run `git status` (no -uall flag) and `git diff` and `git log --oneline -5` in parallel to understand the current state.

2. Determine a branch name:
   - Look at the staged/unstaged changes and recent commits to understand what the changes are about.
   - Generate a short, descriptive branch name in the format `feat/short-description`, `fix/short-description`, or `chore/short-description`.
   - If an issue ID is provided, prefix it: e.g. `feat/123-short-description`.

3. Stage all relevant changes (prefer specific files over `git add .`), create a commit with a good message, then create and push the new branch:
   - `git checkout -b <branch-name>`
   - `git push -u origin <branch-name>`

4. Create the PR using `gh pr create`:
   - Write a concise PR title (under 70 characters).
   - In the body, include a summary of changes.
   - If an issue ID was provided (the $ARGUMENTS value is not empty), add `Closes #<issue-id>` to the PR body.
   - Use `--base main`.

5. Return the PR URL when done.

Important notes:

- Strip any leading `#` from the issue ID argument if present.
- If there are no changes to commit, inform the user and stop.
- Do NOT run dev servers or long-running processes.
