# CLA Assistant setup

This repository is prepared for hosted CLA Assistant.

## 1. Create a Gist for the CLA text

1. Create a new public GitHub Gist.
2. Paste the contents of `CLA.md` into the Gist.
3. Save and keep the Gist URL.

## 2. Enable CLA Assistant on the repository

1. Open `https://cla-assistant.io`.
2. Sign in with the GitHub account that administers this repository.
3. Select this repository.
4. Paste the CLA Gist URL.
5. Save the configuration.

## 3. Configure repository protections

1. Open repository settings on GitHub.
2. Go to branch protection for the default branch.
3. Enable required status checks.
4. Add the CLA Assistant status check as required.

## 4. Optional allowlist

Add bot accounts like `dependabot[bot]` in CLA Assistant allowlist so automation PRs are not blocked.
