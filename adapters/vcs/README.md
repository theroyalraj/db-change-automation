# VCS Adapters

## Adding a New VCS Integration

1. Create a new file (e.g., `gitlab-adapter.js`)
2. Extend `BaseVcsAdapter`
3. Implement all methods: `getPRDetails`, `addPRComment`, `getChangedFiles`, `requestReviewers`, `getPRApprovalStatus`, `setCommitStatus`
4. Update the pipeline scripts to select the correct adapter based on config

See `github-adapter.js` for a reference implementation.
