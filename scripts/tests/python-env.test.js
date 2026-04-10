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

runTest("tests avoid machine-specific workspace paths", () => {
  const source = fs.readFileSync(__filename, "utf8");
  const currentWorkspaceLiteral = JSON.stringify(
    path.resolve(__dirname, "..", "..")
  ).slice(1, -1);

  assert.equal(source.includes(currentWorkspaceLiteral), false);
});

runTest("prefers Windows virtualenv python when running on win32", () => {
  const rootDir = path.win32.join("C:\\", "workspace", "pyre-code");
  const expected = path.join(rootDir, ".venv", "Scripts", "python.exe");

  const candidates = getVirtualEnvPythonCandidates(rootDir, "win32");

  assert.deepEqual(candidates, [expected]);
});

runTest("prefers POSIX virtualenv python when running on linux", () => {
  const rootDir = path.posix.join("/workspace", "pyre-code");
  const expected = path.join(rootDir, ".venv", "bin", "python");

  const candidates = getVirtualEnvPythonCandidates(rootDir, "linux");

  assert.deepEqual(candidates, [expected]);
});

runTest("falls back to system python when no virtualenv interpreter exists", () => {
  const resolved = resolvePythonExecutable({
    rootDir: path.posix.join("/workspace", "pyre-code"),
    platform: "linux",
    existsSync: () => false,
  });

  assert.equal(resolved, "python");
});

runTest("uses the virtualenv interpreter when it exists", () => {
  const rootDir = path.win32.join("C:\\", "workspace", "pyre-code");
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
  const rootDir = path.win32.join("C:\\", "workspace", "pyre-code");
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
  const rootDir = path.win32.join("C:\\", "workspace", "pyre-code");
  const env = buildChildEnv(
    {
      PATH: "C:\\Windows\\System32",
      TEMP: "C:\\Temp",
      TMP: "C:\\Temp",
    },
    {
      rootDir,
      platform: "win32",
    }
  );

  assert.equal(env.TEMP, path.join(rootDir, ".tmp", "setup"));
  assert.equal(env.TMP, path.join(rootDir, ".tmp", "setup"));
  assert.equal(
    env.npm_config_cache,
    path.join(rootDir, ".tmp", "npm-cache")
  );
});
