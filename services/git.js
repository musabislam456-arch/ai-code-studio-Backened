import simpleGit from "simple-git";
import { Octokit } from "@octokit/rest";
import fs from "node:fs";

export function getGit(workspaceDir) {
  return simpleGit(workspaceDir);
}

export async function initRepo(workspaceDir) {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const git = getGit(workspaceDir);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
    await git.addConfig("user.name", process.env.GIT_USER_NAME || "AI Code Studio");
    await git.addConfig("user.email", process.env.GIT_USER_EMAIL || "ai-code-studio@local");
  }
  // Always use main so the GitHub remote and local branch agree.
  await git.branch(["-M", "main"]).catch(() => {});
  return { ok: true, path: workspaceDir };
}

export async function commitAll(workspaceDir, message) {
  const git = getGit(workspaceDir);
  await git.add(".");
  const before = await git.status();
  if (before.isClean) return { ...before, nothingToCommit: true };
  const summary = await git.commit(message || "Update from AI Code Studio");
  return summary;
}

export async function push(workspaceDir, remote = "origin", branch = "main") {
  const git = getGit(workspaceDir);
  return git.push(remote, branch, ["-u"]);
}

export async function pull(workspaceDir, remote = "origin", branch = "main") {
  const git = getGit(workspaceDir);
  return git.pull(remote, branch);
}

export async function addRemote(workspaceDir, remoteUrl, remote = "origin") {
  const git = getGit(workspaceDir);
  const remotes = await git.getRemotes();
  if (remotes.find((r) => r.name === remote)) {
    await git.removeRemote(remote);
  }
  await git.addRemote(remote, remoteUrl);
  return { ok: true };
}

export async function unlinkRemote(workspaceDir, remote = "origin") {
  const git = getGit(workspaceDir);
  const remotes = await git.getRemotes();
  if (!remotes.find((r) => r.name === remote)) return { ok: true, removed: false };
  await git.removeRemote(remote);
  return { ok: true, removed: true };
}

function sanitizeRemoteUrl(url = "") {
  return url.replace(/^https:\/\/[^@]+@github\.com\//i, "https://github.com/");
}

export async function getRemoteInfo(workspaceDir, remote = "origin") {
  const git = getGit(workspaceDir);
  const remotes = await git.getRemotes(true);
  const found = remotes.find((r) => r.name === remote);
  if (!found) return { connected: false, remote };
  const url = sanitizeRemoteUrl(found.refs?.fetch || found.refs?.push || "");
  return {
    connected: true,
    remote,
    name: found.name,
    url,
    htmlUrl: url.replace(/\.git$/, "")
  };
}

export async function createGithubRepo({ token, name, description, isPrivate = true }) {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name,
    description,
    private: isPrivate,
    auto_init: false
  });
  const authedCloneUrl = data.clone_url.replace(
    "https://",
    `https://${token}@`
  );
  return { htmlUrl: data.html_url, cloneUrl: data.clone_url, authedCloneUrl };
}

export async function createGithubRepoAndPush({ workspaceDir, token, name, description, isPrivate = true }) {
  await initRepo(workspaceDir);
  const existing = await getRemoteInfo(workspaceDir, "origin");
  if (existing.connected) {
    throw new Error(`This project is already connected to ${existing.htmlUrl}. Unlink it first before creating another repository.`);
  }

  const result = await createGithubRepo({ token, name, description, isPrivate });
  await addRemote(workspaceDir, result.authedCloneUrl);
  await commitAll(workspaceDir, "Initial commit from AI Code Studio");
  await push(workspaceDir, "origin", "main");
  return { ...result, pushed: true, branch: "main" };
}

export async function status(workspaceDir) {
  const git = getGit(workspaceDir);
  return git.status();
}

export async function log(workspaceDir, maxCount = 20) {
  const git = getGit(workspaceDir);
  return git.log({ maxCount });
}
