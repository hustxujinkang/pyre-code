const { spawn } = require("node:child_process");
const path = require("node:path");

const { getSetupHint, resolvePythonExecutable } = require("./python-env");

const rootDir = path.resolve(__dirname, "..");

function getPythonExecutable() {
  return resolvePythonExecutable({ rootDir });
}

function exitWithSetupHint(reason, statusCode = 1) {
  console.error("");
  console.error(`ERROR: ${reason}`);
  console.error(getSetupHint());
  console.error("");
  process.exit(statusCode);
}

function runPython(args, { onExit } = {}) {
  if (args.length === 0) {
    console.error("Missing Python arguments");
    process.exit(1);
  }

  const child = spawn(getPythonExecutable(), args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    exitWithSetupHint(
      `Python environment is unavailable (${error.message}).`
    );
  });

  child.on("exit", (code) => {
    const exitCode = code === null ? 1 : code;

    if (onExit) {
      onExit(exitCode);
      return;
    }

    process.exit(exitCode);
  });
}

const args = process.argv.slice(2);

if (args[0] === "--check-import") {
  const moduleName = args[1];

  if (!moduleName) {
    console.error("Missing module name for --check-import");
    process.exit(1);
  }

  runPython(["-c", `import ${moduleName}`], {
    onExit(exitCode) {
      if (exitCode === 0) {
        process.exit(0);
      }

      exitWithSetupHint(
        `Could not import \`${moduleName}\` from the active Python environment.`,
        exitCode
      );
    },
  });
} else {
  runPython(args);
}
