// Commit messages follow Conventional Commits (docs/17 §7):
//   feat(api): add triage queue
//   fix(web): keep filters when paging
//   docs: agree 18 notifications
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 100],
  },
};
