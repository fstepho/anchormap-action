import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(repoRoot, "scripts", "run-anchormap.sh");

test("writes outputs, artifacts, and summary for passing policy", async () => {
	const result = await runScript({ scenario: "pass" });

	assert.equal(result.code, 0, result.stderr);
	assert.deepEqual(result.commands, [
		["scan", "--json"],
		["check", "--scan", ".anchormap/action-output/anchormap.scan.json", "--policy", "anchormap.policy.yaml", "--json"],
		["report", "--scan", ".anchormap/action-output/anchormap.scan.json", "--check", ".anchormap/action-output/anchormap.check.json", "--format", "markdown"],
	]);
	assert.match(result.outputs, /^decision=pass$/m);
	assert.match(result.outputs, /^analysis_health=clean$/m);
	assert.match(result.outputs, /^policy_exit=0$/m);
	assert.match(result.outputs, /^scan_path=.anchormap\/action-output\/anchormap.scan.json$/m);
	assert.match(result.outputs, /^check_path=.anchormap\/action-output\/anchormap.check.json$/m);
	assert.match(result.outputs, /^report_path=.anchormap\/action-output\/anchormap.report.md$/m);
	assert.doesNotMatch(result.outputs, /^diff_path=/m);
	assert.equal(result.summary, "# AnchorMap traceability report\n");
});

test("keeps artifacts and exits zero for policy failure code 5", async () => {
	const result = await runScript({ scenario: "policy-fail" });

	assert.equal(result.code, 0, result.stderr);
	assert.match(result.outputs, /^decision=fail$/m);
	assert.match(result.outputs, /^analysis_health=degraded$/m);
	assert.match(result.outputs, /^policy_exit=5$/m);
	await stat(join(result.cwd, ".anchormap/action-output/anchormap.check.json"));
	await stat(join(result.cwd, ".anchormap/action-output/anchormap.report.md"));
});

test("exits on technical check failure without report", async () => {
	const result = await runScript({ scenario: "technical-fail" });

	assert.equal(result.code, 2);
	assert.match(result.stderr, /technical exit code 2/);
	await assert.rejects(stat(join(result.cwd, ".anchormap/action-output/anchormap.check.json")));
	await assert.rejects(stat(join(result.cwd, ".anchormap/action-output/anchormap.report.md")));
});

test("exits on technical scan failure without publishing scan artifacts", async () => {
	const result = await runScript({ scenario: "scan-fail" });

	assert.equal(result.code, 3);
	assert.match(result.stderr, /invalid config/);
	await assert.rejects(stat(join(result.cwd, ".anchormap/action-output/anchormap.scan.json")));
	await assert.rejects(stat(join(result.cwd, ".anchormap/action-output/anchormap.check.json")));
});

test("generates diff and includes it in the report command when base scan is supplied", async () => {
	const result = await runScript({ scenario: "pass", baseScan: "baseline.scan.json" });

	assert.equal(result.code, 0, result.stderr);
	assert.deepEqual(result.commands, [
		["scan", "--json"],
		["check", "--scan", ".anchormap/action-output/anchormap.scan.json", "--policy", "anchormap.policy.yaml", "--json"],
		["diff", "--base", "baseline.scan.json", "--head", ".anchormap/action-output/anchormap.scan.json", "--json"],
		["report", "--scan", ".anchormap/action-output/anchormap.scan.json", "--check", ".anchormap/action-output/anchormap.check.json", "--diff", ".anchormap/action-output/anchormap.diff.json", "--format", "markdown"],
	]);
	assert.match(result.outputs, /^diff_path=.anchormap\/action-output\/anchormap.diff.json$/m);
	await stat(join(result.cwd, ".anchormap/action-output/anchormap.diff.json"));
});

test("propagates missing base scan as a technical diff failure", async () => {
	const result = await runScript({ scenario: "missing-base", baseScan: "missing.scan.json" });

	assert.equal(result.code, 4);
	assert.match(result.stderr, /missing base scan/);
	await assert.rejects(stat(join(result.cwd, ".anchormap/action-output/anchormap.diff.json")));
	await assert.rejects(stat(join(result.cwd, ".anchormap/action-output/anchormap.report.md")));
});

async function runScript({ scenario, baseScan = "" }) {
	const cwd = await mkdtemp(join(tmpdir(), "anchormap-action-test-"));
	const binDir = join(cwd, "bin");
	await writeFile(join(cwd, "anchormap.policy.yaml"), "version: 1\n", "utf8");
	await writeFile(join(cwd, "baseline.scan.json"), '{"schema_version":4}\n', "utf8");
	await writeFile(join(cwd, "summary.md"), "", "utf8");
	await writeFile(join(cwd, "outputs.txt"), "", "utf8");
	await writeFile(join(cwd, "commands.jsonl"), "", "utf8");
	await mkFakeAnchormap(binDir);

	const child = spawn("bash", [scriptPath], {
		cwd,
		env: {
			...process.env,
			PATH: `${binDir}:${process.env.PATH}`,
			ANCHORMAP_POLICY: "anchormap.policy.yaml",
			ANCHORMAP_BASE_SCAN: baseScan,
			ANCHORMAP_TEST_SCENARIO: scenario,
			ANCHORMAP_TEST_COMMANDS: join(cwd, "commands.jsonl"),
			GITHUB_OUTPUT: join(cwd, "outputs.txt"),
			GITHUB_STEP_SUMMARY: join(cwd, "summary.md"),
		},
	});

	const [stdout, stderr, code] = await Promise.all([
		readStream(child.stdout),
		readStream(child.stderr),
		new Promise((resolve) => child.on("close", resolve)),
	]);

	return {
		cwd,
		code,
		stdout,
		stderr,
		outputs: await readFile(join(cwd, "outputs.txt"), "utf8"),
		summary: await readFile(join(cwd, "summary.md"), "utf8"),
		commands: (await readFile(join(cwd, "commands.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line)),
	};
}

async function mkFakeAnchormap(binDir) {
	await import("node:fs/promises").then(({ mkdir }) => mkdir(binDir, { recursive: true }));
	const fakePath = join(binDir, "anchormap");
	await writeFile(
		fakePath,
		`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ANCHORMAP_TEST_COMMANDS, JSON.stringify(args) + "\\n");
const command = args[0];
const scenario = process.env.ANCHORMAP_TEST_SCENARIO;
if (command === "scan") {
  if (scenario === "scan-fail") {
    process.stderr.write("invalid config\\n");
    process.exit(3);
  }
  process.stdout.write('{"schema_version":4,"analysis_health":"clean"}\\n');
  process.exit(0);
}
if (command === "check") {
  if (scenario === "technical-fail") {
    process.stdout.write("{}\\n");
    process.stderr.write("invalid policy\\n");
    process.exit(2);
  }
  const fail = scenario === "policy-fail";
  process.stdout.write(JSON.stringify({
    schema_version: 1,
    decision: fail ? "fail" : "pass",
    source_scan_schema_version: 4,
    analysis_health: fail ? "degraded" : "clean",
    violations: [],
    summary: {}
  }) + "\\n");
  process.exit(fail ? 5 : 0);
}
if (command === "diff") {
  const base = args[args.indexOf("--base") + 1];
  if (scenario === "missing-base" || !fs.existsSync(base)) {
    process.stderr.write("missing base scan\\n");
    process.exit(4);
  }
  process.stdout.write('{"schema_version":1}\\n');
  process.exit(0);
}
if (command === "report") {
  process.stdout.write("# AnchorMap traceability report\\n");
  process.exit(0);
}
process.stderr.write("unexpected command\\n");
process.exit(99);
`,
		"utf8",
	);
	await import("node:fs/promises").then(({ chmod }) => chmod(fakePath, 0o755));
}

function readStream(stream) {
	return new Promise((resolve, reject) => {
		let output = "";
		stream.setEncoding("utf8");
		stream.on("data", (chunk) => {
			output += chunk;
		});
		stream.on("error", reject);
		stream.on("end", () => resolve(output));
	});
}
