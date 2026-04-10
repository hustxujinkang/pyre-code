const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getVirtualEnvPythonCandidates,
  resolvePythonExecutable,
} = require("../python-env");
const { buildChildEnv, buildCreateVenvArgs } = require("../setup");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("prefers Windows virtualenv python when running on win32", () => {
  const rootDir = "D:\\github-projects\\pyre-code";
  const expected = path.join(rootDir, ".venv", "Scripts", "python.exe");

  const candidates = getVirtualEnvPythonCandidates(rootDir, "win32");

  assert.deepEqual(candidates, [expected]);
});

runTest("prefers POSIX virtualenv python when running on linux", () => {
  const rootDir = "/workspace/pyre-code";
  const expected = path.join(rootDir, ".venv", "bin", "python");

  const candidates = getVirtualEnvPythonCandidates(rootDir, "linux");

  assert.deepEqual(candidates, [expected]);
});

runTest("falls back to system python when no virtualenv interpreter exists", () => {
  const resolved = resolvePythonExecutable({
    rootDir: "/workspace/pyre-code",
    platform: "linux",
    existsSync: () => false,
  });

  assert.equal(resolved, "python");
});

runTest("uses the virtualenv interpreter when it exists", () => {
  const rootDir = "D:\\github-projects\\pyre-code";
  const venvPython = path.join(rootDir, ".venv", "Scripts", "python.exe");
  const resolved = resolvePythonExecutable({
    rootDir,
    platform: "win32",
    existsSync: (target) => target === venvPython,
    canRun: () => true,
  });

  assert.equal(resolved, venvPython);
});

runTest("falls back to system python when the virtualenv interpreter is not runnable", () => {
  const rootDir = "D:\\github-projects\\pyre-code";
  const venvPython = path.join(rootDir, ".venv", "Scripts", "python.exe");
  const resolved = resolvePythonExecutable({
    rootDir,
    platform: "win32",
    existsSync: (target) => target === venvPython,
    canRun: () => false,
  });

  assert.equal(resolved, "python");
});

runTest("setup recreates the virtualenv with --clear to avoid stale binary wheels", () => {
  assert.deepEqual(buildCreateVenvArgs(), ["-m", "venv", "--clear", ".venv"]);
});

runTest("predev checks the backend import chain, not just torch_judge", () => {
  const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  assert.equal(
    packageJson.scripts.predev,
    "node scripts/run-python.js --check-import grading_service.main"
  );
});

runTest("setup uses a workspace-local temp directory on Windows", () => {
  const env = buildChildEnv(
    {
      PATH: "C:\\Windows\\System32",
      TEMP: "C:\\Temp",
      TMP: "C:\\Temp",
    },
    {
      rootDir: "D:\\github-projects\\pyre-code",
      platform: "win32",
    }
  );

  assert.equal(env.TEMP, "D:\\github-projects\\pyre-code\\.tmp\\setup");
  assert.equal(env.TMP, "D:\\github-projects\\pyre-code\\.tmp\\setup");
  assert.equal(
    env.npm_config_cache,
    "D:\\github-projects\\pyre-code\\.tmp\\npm-cache"
  );
});
