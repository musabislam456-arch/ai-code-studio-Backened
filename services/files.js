import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import archiver from "archiver";

export function listTree(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.name !== ".git" && e.name !== "node_modules")
    .map((e) => {
      const full = path.join(dir, e.name);
      const rel = path.relative(base, full);
      if (e.isDirectory()) {
        return { type: "dir", name: e.name, path: rel, children: listTree(full, base) };
      }
      return { type: "file", name: e.name, path: rel };
    });
}

export function readFile(root, relPath) {
  const full = path.join(root, relPath);
  return fs.readFileSync(full, "utf-8");
}

export function writeFile(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return { ok: true };
}

export function deleteFile(root, relPath) {
  const full = path.join(root, relPath);
  fs.rmSync(full, { recursive: true, force: true });
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
