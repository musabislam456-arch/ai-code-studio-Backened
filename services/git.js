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
  return { ok: true, path: workspaceDir };
}

export async function commitAll(workspaceDir, message) {
  const git = getGit(workspaceDir);
  await git.add(".");
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

export async function status(workspaceDir) {
  const git = getGit(workspaceDir);
  return git.status();
}

export async function log(workspaceDir, maxCount = 20) {
  const git = getGit(workspaceDir);
  return git.log({ maxCount });
}
