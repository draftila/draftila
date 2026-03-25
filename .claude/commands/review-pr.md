Review the current branch's changes against main for code quality and correctness.

1. Run `git diff main...HEAD` to get all changes in this branch. If there are no commits ahead of main, fall back to `git diff` (staged + unstaged changes).

2. Read every changed file fully to understand the surrounding context, not just the diff lines.

3. Review the changes against each of the following categories. For each category, list specific findings with file paths and line numbers. If a category has no issues, say so briefly and move on.

**Security**

- Injection vulnerabilities (SQL, command, XSS)
- Auth/authz gaps, missing `requireAuth`, exposed endpoints
- Secrets, credentials, or tokens in code
- Unsafe deserialization, prototype pollution
- Missing input validation at system boundaries

**Maintainability**

- Code that is hard to understand without comments (naming, structure)
- Tight coupling between unrelated modules
- Duplicated logic that should be shared
- Missing or incorrect TypeScript types
- Dead code or unused imports

**Scalability**

- N+1 queries or unbounded database operations
- Missing pagination, limits, or indexes
- Blocking operations in hot paths
- Memory leaks (event listeners, subscriptions not cleaned up)

**Clean Code**

- Functions doing too many things
- Deep nesting that could be flattened
- Magic numbers or strings
- Inconsistent patterns compared to the rest of the codebase
- Overly clever code that sacrifices readability

**Architecture**

- Violations of the project's module pattern (routes/services separation)
- Business logic leaking into route handlers
- Frontend state management misuse (server state in Zustand, client state in TanStack Query)
- Cross-layer concerns in the wrong place

**Best Practices**

- Not following existing project conventions (check CLAUDE.md)
- Missing error handling at system boundaries
- Improper use of async/await
- Not using existing utilities or shared schemas

**No Hacks**

- Symptom patches instead of root-cause fixes
- Workarounds that bypass existing systems
- `any` casts, `@ts-ignore`, `eslint-disable` without justification
- Hardcoded values that should be configurable or derived

4. End with a summary: total number of issues found per severity (critical / warning / nit), and an overall assessment of whether the changes are ready to merge.
