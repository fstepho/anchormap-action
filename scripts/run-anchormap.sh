#!/usr/bin/env bash
set -euo pipefail

output_dir=".anchormap/action-output"
tmp_dir=".anchormap/action-tmp"
rm -rf "$output_dir" "$tmp_dir"
mkdir -p "$output_dir" "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT

scan_path="$output_dir/anchormap.scan.json"
check_path="$output_dir/anchormap.check.json"
diff_path="$output_dir/anchormap.diff.json"
report_path="$output_dir/anchormap.report.md"
generated_diff="false"

scan_tmp="$tmp_dir/anchormap.scan.json"
check_tmp="$tmp_dir/anchormap.check.json"
diff_tmp="$tmp_dir/anchormap.diff.json"
report_tmp="$tmp_dir/anchormap.report.md"

anchormap scan --json >"$scan_tmp"
mv "$scan_tmp" "$scan_path"

set +e
anchormap check \
	--scan "$scan_path" \
	--policy "${ANCHORMAP_POLICY}" \
	--json >"$check_tmp"
check_exit="$?"
set -e

case "$check_exit" in
	0 | 5)
		mv "$check_tmp" "$check_path"
		;;
	*)
		rm -f "$check_tmp"
		echo "anchormap check failed with technical exit code ${check_exit}; no PolicyResult-compatible report will be generated." >&2
		exit "$check_exit"
		;;
esac

if [[ -n "${ANCHORMAP_BASE_SCAN:-}" ]]; then
	anchormap diff \
		--base "$ANCHORMAP_BASE_SCAN" \
		--head "$scan_path" \
		--json >"$diff_tmp"
	mv "$diff_tmp" "$diff_path"
	generated_diff="true"

	anchormap report \
		--scan "$scan_path" \
		--check "$check_path" \
		--diff "$diff_path" \
		--format markdown >"$report_tmp"
	mv "$report_tmp" "$report_path"
else
	anchormap report \
		--scan "$scan_path" \
		--check "$check_path" \
		--format markdown >"$report_tmp"
	mv "$report_tmp" "$report_path"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
	cat "$report_path" >>"$GITHUB_STEP_SUMMARY"
fi

decision="$(node -e 'const fs=require("node:fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.decision ?? ""));' "$check_path")"
analysis_health="$(node -e 'const fs=require("node:fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.analysis_health ?? ""));' "$check_path")"

{
	echo "decision=${decision}"
	echo "analysis_health=${analysis_health}"
	echo "policy_exit=${check_exit}"
	echo "scan_path=${scan_path}"
	echo "check_path=${check_path}"
	echo "report_path=${report_path}"
	if [[ "$generated_diff" == "true" ]]; then
		echo "diff_path=${diff_path}"
	fi
} >>"$GITHUB_OUTPUT"
