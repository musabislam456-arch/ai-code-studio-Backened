import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import archiver from "archiver";

function safePath(root, relPath) {
  const base = path.resolve(root);
  const full = path.resolve(root, String(relPath || ""));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Path is outside the workspace.");
  return full;
}

export function listTree(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.filter(e => e.name !== ".git" && e.name !== "node_modules").map(e => {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full);
    return e.isDirectory()
      ? { type: "dir", name: e.name, path: rel, children: listTree(full, base) }
      : { type: "file", name: e.name, path: rel };
  });
}

export function readFile(root, relPath) {
  return fs.readFileSync(safePath(root, relPath), "utf-8");
}

export function writeFile(root, relPath, content) {
  const full = safePath(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return { ok: true };
}

export function deleteFile(root, relPath) {
  fs.rmSync(safePath(root, relPath), { recursive: true, force: true });
  return { ok: true };
}

export function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  return { ok: true };
}

export function createZip(sourceDir, outZipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve({ ok: true, bytes: archive.pointer() }));
    archive.on("error", reject);
    archive.pipe(output);
    archive.glob("**/*", { cwd: sourceDir, ignore: ["node_modules/**", ".git/**"] });
    archive.finalize();
  });
}
