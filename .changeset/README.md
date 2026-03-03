# Changesets

Use changesets to track user-facing changes:

1. `npm run changeset`
2. Select bump type (patch/minor/major)
3. Commit generated `.changeset/*.md`
4. Merge PR

Release workflow will either:

- open/update a version PR when pending changesets exist, or
- publish to npm when version packages are already committed.
