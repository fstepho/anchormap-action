# AnchorMap GitHub Action

Run AnchorMap in GitHub Actions and produce PR-ready local artifacts.

This composite action is an orchestration layer over the AnchorMap CLI. It does
not upload source code to a service, infer a baseline from Git refs, create PR
comments, or redefine AnchorMap report semantics.

## Preview Status

The current preview is available from the draft branch:

```text
fstepho/anchormap-action@task/gha-1-composite-action
```

The preview pins `anchormap@1.2.2` by default. There is no stable Action tag,
release, Marketplace publication, or merge guarantee yet. Use the branch ref
only for preview testing.

A public demo workflow and scenario PRs are available in
[`fstepho/anchormap-h3-demo`](https://github.com/fstepho/anchormap-h3-demo):

- workflow base: <https://github.com/fstepho/anchormap-h3-demo/pull/1>
- clean scenario: <https://github.com/fstepho/anchormap-h3-demo/pull/2>
- unmapped anchor scenario: <https://github.com/fstepho/anchormap-h3-demo/pull/3>
- stale mapping scenario: <https://github.com/fstepho/anchormap-h3-demo/pull/4>
- degraded analysis scenario: <https://github.com/fstepho/anchormap-h3-demo/pull/5>

## Usage

```yaml
name: AnchorMap

on:
  pull_request:

jobs:
  anchormap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: fstepho/anchormap-action@task/gha-1-composite-action
        with:
          anchormap-version: "1.2.2"
          policy: anchormap.policy.yaml
          upload-artifacts: "true"
          fail-on-policy: "true"
```

For diff output, provide an explicit baseline scan artifact from the repository:

```yaml
- uses: fstepho/anchormap-action@task/gha-1-composite-action
  with:
    anchormap-version: "1.2.2"
    policy: anchormap.policy.yaml
    base-scan: .anchormap/baseline.scan.json
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `anchormap-version` | `1.2.2` | Pinned npm version of `anchormap` to install. |
| `node-version` | `22` | Node.js version used to run AnchorMap. |
| `policy` | `anchormap.policy.yaml` | Explicit policy file path. |
| `base-scan` | empty | Explicit baseline scan artifact for diff mode. |
| `upload-artifacts` | `true` | Upload generated local files as GitHub workflow artifacts. |
| `fail-on-policy` | `true` | Whether AnchorMap policy exit code `5` fails the workflow. |

## Outputs

| Output | Description |
| --- | --- |
| `decision` | `pass` or `fail` from the policy result. |
| `analysis_health` | Analysis health from the check result. |
| `policy_exit` | Exit code returned by `anchormap check`. |
| `scan_path` | Path to `anchormap.scan.json`. |
| `check_path` | Path to `anchormap.check.json`. |
| `diff_path` | Path to `anchormap.diff.json` when `base-scan` is supplied. |
| `report_path` | Path to `anchormap.report.md`. |

## Generated Files

The action writes generated files under `.anchormap/action-output/`.

Always generated after successful CLI phases:

- `anchormap.scan.json`
- `anchormap.check.json`
- `anchormap.report.md`

Generated only when `base-scan` is supplied:

- `anchormap.diff.json`

The job summary appends the generated Markdown report. The Markdown file remains
the canonical AnchorMap report artifact.

## Policy Example

```yaml
version: 1
fail_on:
  analysis_health: degraded
  finding_kinds:
    - unmapped_anchor
    - stale_mapping_anchor
thresholds:
  min_covered_product_file_percent: 1
  max_untraced_product_files: 1000
```

Policy failures exit `anchormap check` with code `5`. The Action still writes
artifacts and the job summary before the final `fail-on-policy` step decides
whether the workflow itself should fail.

## Limits

- No PR comments are created.
- No source code is uploaded to an AnchorMap service.
- No baseline is inferred from Git refs or workflow history.
- No bundle, JUnit, SARIF, GitHub App, or SaaS upload behavior is part of this
  preview Action.
