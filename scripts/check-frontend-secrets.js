#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd().endsWith(path.sep + "frontend") ? process.cwd() : path.join(process.cwd(), "frontend");
const scanDirs = [path.join(root, "src")];
const scanFiles = [
  path.join(root, ".env"),
  path.join(root, ".env.local"),
  path.join(root, ".env.production"),
  path.join(root, ".env.development"),
];

const forbiddenPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /DB_PASSWORD/i,
  /DB_USER/i,
  /DATABASE_URL/i,
  /JWT_SECRET/i,
  /AWS_SECRET_ACCESS_KEY/i,
  /PRIVATE_KEY/i,
  /postgres:\/\/[^ \n]+/i,
  /mysql:\/\/[^ \n]+/i,
  /mssql:\/\/[^ \n]+/i,
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx|json|env|txt|md)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [...scanDirs.flatMap((dir) => walk(dir)), ...scanFiles.filter((file) => fs.existsSync(file))];
const findings = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      findings.push({ file: path.relative(process.cwd(), file), pattern: String(pattern) });
    }
  }
}

if (findings.length > 0) {
  console.error("Frontend security check failed. Forbidden secret patterns found:");
  for (const finding of findings) {
    console.error(`- ${finding.file} matched ${finding.pattern}`);
  }
  process.exit(1);
}

console.log("Frontend security check passed.");

