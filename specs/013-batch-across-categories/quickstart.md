# Quickstart: validating one batch per scan across categories

Prerequisites: `npm ci`. Checks: `npm run typecheck && npm run lint && npm test && npm run build`.
Details: [contracts/batch-request.md](contracts/batch-request.md).

1. **Automated**: `npm test` passes, including the new and updated client and orchestrator batch tests.
2. **One batch across categories (Story 1)**: three slots, categories music, comedy and sports, in one scan send one
   `POST /ads/batch` whose placements carry their own categories and no top-level `category`.
3. **Shared details still split (Story 2)**: slots with different countries or device types make separate batches.
4. **Fallback and compatibility (Story 3)**: a failed batch makes every slot request itself; a batch whose placements
   share a category also sends it at the top level.
5. **Time limit (Story 4)**: a batch of ten placements waits longer than a single request before giving up.
