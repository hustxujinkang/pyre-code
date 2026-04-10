const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");

const { resolvePythonExecutable } = require("./python-env");

const rootDir = path.resolve(__dirname, "..");

function buildCreateVenvArgs() {
  return ["-m", "venv", "--clear", ".venv"];
}

function getWorkspaceTempDir(rootDirOverride = rootDir) {
  return path.join(rootDirOverride, ".tmp", "setup");
}

function getWorkspaceNpmCacheDir(rootDirOverride = rootDir) {
  return path.join(rootDirOverride, ".tmp", "npm-cache");
}

function buildChildEnv(
  baseEnv = process.env,
  {
    rootDir: targetRootDir = rootDir,
    platform = process.platform,
  } = {}
) {
  const tempDir = getWorkspaceTempDir(targetRootDir);
  const env = { ...baseEnv };

  if (platform === "win32") {
    env.TEMP = tempDir;
    env.TMP = tempDir;
  } else {
    env.TMPDIR = tempDir;
  }

  env.npm_config_cache = getWorkspaceNpmCacheDir(targetRootDir);

  return env;
}

function ensureWorkspaceTempDir() {
  fs.mkdirSync(getWorkspaceTempDir(), { recursive: true });
  fs.mkdirSync(getWorkspaceNpmCacheDir(), { recursive: true });
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, label, env = buildChildEnv()) {
  console.log(`> ${label}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      shell: process.platform === "win32" && command.endsWith(".cmd"),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      process.exit(code || 1);
    });
  });
}

function probe(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, [...args, "--version"], {
      cwd: rootDir,
      env: buildChildEnv(),
      stdio: "ignore",
    });

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function findBootstrapPython() {
  const candidates =
    process.platform === "win32"
      ? [
          { command: "py", args: ["-3.11"] },
          { command: "python", args: [] },
          { command: "py", args: ["-3"] },
        ]
      : [
          { command: "python3", args: [] },
          { command: "python", args: [] },
        ];

  for (const candidate of candidates) {
    if (await probe(candidate.command, candidate.args)) {
      return candidate;
    }
  }

  throw new Error("Python 3.11+ was not found in PATH.");
}

async function main() {
  ensureWorkspaceTempDir();

  const bootstrapPython = await findBootstrapPython();

  await run(
    bootstrapPython.command,
    [...bootstrapPython.args, ...buildCreateVenvArgs()],
    "Creating .venv"
  );

  const venvPython = resolvePythonExecutable({ rootDir });

  await run(
    venvPython,
    ["-m", "pip", "install", "--upgrade", "pip"],
    "Upgrading pip"
  );
  await run(
    venvPython,
    ["-m", "pip", "install", "-e", ".[dev]"],
    "Installing Python dependencies"
  );
  await run(
    getNpmCommand(),
    ["ci"],
    "Installing Node dependencies",
    buildChildEnv()
  );

  console.log("");
  console.log("Setup complete.");
  console.log("To start: npm run dev");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildChildEnv,
  buildCreateVenvArgs,
  findBootstrapPython,
  getNpmCommand,
  getWorkspaceNpmCacheDir,
  getWorkspaceTempDir,
};
