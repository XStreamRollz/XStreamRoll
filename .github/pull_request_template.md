<!-- Pull Request template for XStreamRoll
     Mirrors the "Pull Request Process" in CONTRIBUTING.md and
     auto-populates when creating a PR. -->

## Summary

Provide a short description of the changes in this PR and the motivation/why.

## Related issues

Link any related issues. Use `Closes #<id>` to close issues automatically.

Closes: 

## Type of change

- [ ] feat
- [ ] fix
- [ ] docs
- [ ] chore
- [ ] test
- [ ] ci

Match the PR title to Conventional Commits: `<type>(<scope>): <summary>`.

## Testing performed

Describe how you tested this change. Include commands, environment, and any setup steps.

Example:

```
cd api
npm run lint
npm run build
npm test
```

## Screenshots (if applicable)

Attach screenshots or animated GIFs for UI changes.

## Checklist — author

- [ ] I rebased onto `origin/main` and resolved conflicts.
- [ ] I ran the quality gates locally: `npm run lint`, `npm run build`, `npm test`.
- [ ] Title follows Conventional Commits and references the issue (see above).
- [ ] I added/updated tests where applicable and they pass locally.
- [ ] No new TypeScript errors or lint warnings introduced.
- [ ] I updated documentation if the change affects public behavior.
- [ ] Screenshots included for UI changes.

## Checklist — reviewer guidance

- Required checks: lint, build, unit tests, and any package-specific E2E must be green.
- Request review from CODEOWNER(s) for touched packages.
- Prefer small, focused PRs. If large, confirm feature-flagging or follow-up tasks.

---

Follow the full PR process in CONTRIBUTING.md — particularly: sync with `main`, run quality gates, request a CODEOWNER review, and use squash-and-merge with a Conventional Commit-style squash message.
