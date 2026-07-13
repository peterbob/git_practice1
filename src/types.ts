export type FileStatus = 'untracked' | 'modified' | 'staged' | 'clean' | 'deleted' | 'conflict'
export type Commit = { id: string; message: string; parentIds: string[]; filesSnapshot: Record<string, string>; createdAt: number }
export type Branch = { name: string; commitId: string | null }
export type FileState = { name: string; workingContent: string; stagedContent?: string; committedContent?: string; status: FileStatus }
export type Remote = { name: string; url: string; branches: Record<string, string | null>; upstream?: string }
export type GitState = {
  initialized: boolean; commits: Record<string, Commit>; branches: Record<string, Branch>; currentBranch: string
  head: string | null; files: Record<string, FileState>; remotes: Record<string, Remote>; commandHistory: string[]
  conflictFiles: string[]
}
export type CommandResult = { state: GitState; output: string[]; explanation?: string; clear?: boolean }
