// Commit messages start with a type, Conventional Commits style (docs/17 §7):
//   feat(api): add triage queue
//   fix(web): keep filters when paging
//   docs: agree 18 notifications
// Length and capitalisation are free: names such as Railway, Vercel or
// Docker may start the summary, and a long first line is allowed.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [0],
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
