const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

function getVirtualEnvPythonCandidates(rootDir, platform = process.platform) {
  if (platform === "win32") {
    return [path.join(rootDir, ".venv", "Scripts", "python.exe")];
  }

  return [path.join(rootDir, ".venv", "bin", "python")];
}

function resolvePythonExecutable({
  rootDir = path.resolve(__dirname, ".."),
  platform = process.platform,
  existsSync = fs.existsSync,
  canRun = canRunExecutable,
} = {}) {
  for (const candidate of getVirtualEnvPythonCandidates(rootDir, platform)) {
    if (existsSync(candidate) && canRun(candidate)) {
      return candidate;
    }
  }

  return "python";
}

function canRunExecutable(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });

  return !result.error && result.status === 0;
}

function getSetupHint() {
  return "Run `npm run setup` or activate your conda environment.";
}

module.exports = {
  canRunExecutable,
  getSetupHint,
  getVirtualEnvPythonCandidates,
  resolvePythonExecutable,
};
