import argon2 from "argon2";

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error("Run this utility in an interactive terminal.");
  process.stderr.write(prompt);
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return await new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("data", onData); process.stderr.write("\n"); };
    const onData = (chunk) => {
      for (const key of chunk) {
        if (key === "\u0003") { cleanup(); reject(new Error("Cancelled.")); return; }
        if (key === "\r" || key === "\n") { cleanup(); resolve(value); return; }
        if (key === "\u007f" || key === "\b") { value = value.slice(0, -1); continue; }
        if (value.length < 128) value += key;
      }
    };
    process.stdin.on("data", onData);
  });
}

try {
  const password = await readHidden("Admin password (12-128 characters): ");
  if (password.length < 12 || password.length > 128) throw new Error("Password must contain 12 to 128 characters.");
  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  process.stdout.write(`${await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to generate hash."}\n`);
  process.exitCode = 1;
}
