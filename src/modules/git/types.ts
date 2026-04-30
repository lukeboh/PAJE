export type GitLabGroup = {
  id: number;
  name: string;
  full_path: string;
  parent_id?: number | null;
};

export type GitLabProject = {
  id: number;
  name: string;
  path_with_namespace: string;
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  default_branch?: string;
  visibility?: "public" | "internal" | "private";
  archived?: boolean;
  namespace?: {
    id: number;
    full_path: string;
  };
};

export type GitLabTreeNodeType = "group" | "project";

export type GitLabTreeNode = {
  id: string;
  label: string;
  type: GitLabTreeNodeType;
  groupId?: number;
  project?: GitLabProject;
  children?: GitLabTreeNode[];
  selected?: boolean;
  partiallySelected?: boolean;
};

export type GitRepositoryTarget = {
  id: number;
  name: string;
  pathWithNamespace: string;
  sshUrl: string;
  localPath: string;
  defaultBranch?: string;
  branch?: string;
};

export type ParallelSyncOptions = {
  concurrency?: number | "auto";
  shallow?: boolean;
  dryRun?: boolean;
};

export type GitLabServerConfig = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
};
