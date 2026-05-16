# AnchorMap GitHub Action

## Give a 5-minute first reaction

AnchorMap flags docs-to-code drift in TypeScript PRs before merge.

You do not need to install anything to react to the preview.

Start here:

- Clean demo PR: https://github.com/fstepho/anchormap-h3-demo/pull/2
- New unmapped anchor: https://github.com/fstepho/anchormap-h3-demo/pull/3
- Stale mapping: https://github.com/fstepho/anchormap-h3-demo/pull/4
- Degraded analysis: https://github.com/fstepho/anchormap-h3-demo/pull/5
- Feedback issue: https://github.com/fstepho/anchormap/issues/5

If you only open one link, start with the clean demo PR. The other three PRs
show failure or warning-style cases:

- New unmapped anchor: a spec-like statement appears without a mapping.
- Stale mapping: a human mapping points to an anchor that is no longer observed.
- Degraded analysis: the report still renders, but analysis trust is reduced.

Useful reaction:

1. Did you understand the problem?
2. Did the PR report make sense?
3. Would you try this on a TypeScript repo?
4. What confused you?

Negative feedback is useful when it names the blocker.

## The problem

In many TypeScript projects, product/API/spec documents change separately from code.

During review, it is hard to see whether:

- a new requirement-like statement was added without code mapping;
- an old mapping points to something that no longer exists;
- a PR reduced traceability coverage;
- the report is still reliable enough to trust.

AnchorMap makes those cases visible in CI as local artifacts and a PR-readable Markdown report.

## What This Action Does

Run AnchorMap in GitHub Actions and produce PR-ready local artifacts.

This composite action is an orchestration layer over the AnchorMap CLI. It does
not upload source code to a service, infer a baseline from Git refs, create PR
comments, or redefine AnchorMap report semantics.

## Preview Status

The current preview is available from the immutable preview tag:

```text
fstepho/anchormap-action@v0-preview.3
```

The preview examples pin `anchormap@1.2.2`. There is no stable Action release,
Marketplace publication, or merge guarantee yet. Use this tag only for preview
testing.

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

      - uses: fstepho/anchormap-action@v0-preview.3
        with:
          anchormap-version: "1.2.2"
          policy: anchormap.policy.yaml
          upload-artifacts: "true"
          fail-on-policy: "true"
```

For diff output, provide an explicit baseline scan artifact from the repository:

```yaml
- uses: fstepho/anchormap-action@v0-preview.3
  with:
    anchormap-version: "1.2.2"
    policy: anchormap.policy.yaml
    base-scan: .anchormap/baseline.scan.json
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `anchormap-version` | required | Pinned npm version of `anchormap` to install. |
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
