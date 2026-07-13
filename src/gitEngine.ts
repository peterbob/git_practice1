import type { Commit, CommandResult, GitState } from './types'

export const makeId = () => Math.floor(Math.random() * 0xfffffff).toString(16).padStart(7, '0')
export const createState = (): GitState => ({ initialized: false, commits: {}, branches: { main: { name: 'main', commitId: null } }, currentBranch: 'main', head: null, files: {}, remotes: {}, commandHistory: [], conflictFiles: [] })
const clone = (s: GitState): GitState => structuredClone(s)
const snapshot = (s: GitState) => Object.fromEntries(Object.values(s.files).filter(f => f.status !== 'deleted').map(f => [f.name, f.workingContent]))
const commitSnapshot = (s: GitState) => s.head ? s.commits[s.head].filesSnapshot : {}
const refresh = (s: GitState) => {
  const base = commitSnapshot(s)
  for (const f of Object.values(s.files)) {
    if (f.status === 'conflict' || f.status === 'staged') continue
    f.committedContent = base[f.name]
    if (!(f.name in base)) f.status = 'untracked'
    else if (f.workingContent !== base[f.name]) f.status = 'modified'
    else f.status = 'clean'
  }
}
const restoreFrom = (s: GitState, snap: Record<string, string>) => {
  s.files = Object.fromEntries(Object.entries(snap).map(([name, content]) => [name, { name, workingContent: content, committedContent: content, status: 'clean' as const }]))
}
const ancestors = (s: GitState, id: string | null): Set<string> => { const set = new Set<string>(); const walk = (x: string | null) => { if (!x || set.has(x)) return; set.add(x); s.commits[x]?.parentIds.forEach(walk) }; walk(id); return set }
const firstParentChain = (s: GitState, id: string | null) => { const out: string[] = []; while (id) { out.push(id); id = s.commits[id]?.parentIds[0] ?? null } return out }
const tokenize = (input: string) => input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(x => x.replace(/^"|"$/g, '')) ?? []
const similarity = (a: string, b: string) => { let hits = 0; for (const c of a) if (b.includes(c)) hits++; return hits / Math.max(a.length, b.length) }
const commands = ['init','status','add','commit','log','branch','switch','checkout','merge','rebase','cherry-pick','reset','restore','diff','remote','push','pull','fetch']

export function execute(input: string, original: GitState): CommandResult {
  const s = clone(original); const args = tokenize(input.trim()); s.commandHistory.push(input)
  const ok = (output: string[] = [], explanation?: string): CommandResult => ({ state: s, output, explanation })
  if (!args.length) return ok([])
  if (input.includes('→')) return ok(['提示中的 → 表示“然后执行下一条命令”，不是终端命令的一部分。', '请从左到右逐条输入，每输入一条按一次 Enter。'])
  if (args[0] === 'clear') return { ...ok([]), clear: true }
  if (args[0] === 'echo') return echoCommand(args, s)
  if (['touch','write','append','cat','rm','ls','resolve'].includes(args[0])) return fileCommand(args, s)
  if (args[0] !== 'git') return ok([`zsh: command not found: ${args[0]}`])
  const cmd = args[1]
  if (!commands.includes(cmd)) { const near = commands.sort((a,b) => similarity(cmd || '', b) - similarity(cmd || '', a))[0]; return ok([`git: '${cmd || ''}' is not a git command.`, ...(near ? ['The most similar command is:', `    ${near}`] : [])]) }
  if (cmd === 'init') { s.initialized = true; return ok(['Initialized empty Git repository in /project/.git/'], '仓库已初始化，Git 现在可以追踪这里的文件。') }
  if (!s.initialized) return ok(['fatal: not a git repository (or any of the parent directories): .git'])
  if (cmd === 'status') {
    refresh(s); const staged = Object.values(s.files).filter(f => f.status === 'staged'); const changed = Object.values(s.files).filter(f => ['modified','deleted','conflict'].includes(f.status)); const untracked = Object.values(s.files).filter(f => f.status === 'untracked')
    return ok([`On branch ${s.currentBranch}`, ...(staged.length ? ['', 'Changes to be committed:', ...staged.map(f => `  modified:   ${f.name}`)] : []), ...(changed.length ? ['', 'Changes not staged for commit:', ...changed.map(f => `  ${f.status}:   ${f.name}`)] : []), ...(untracked.length ? ['', 'Untracked files:', ...untracked.map(f => `  ${f.name}`)] : []), ...(!staged.length && !changed.length && !untracked.length ? ['', 'nothing to commit, working tree clean'] : [])])
  }
  if (cmd === 'add') { const names = args.slice(2); const targets = names.includes('.') ? Object.values(s.files) : names.map(n => s.files[n]).filter(Boolean); if (!targets.length) return ok([`fatal: pathspec '${names[0] || ''}' did not match any files`]); targets.forEach(f => { f.stagedContent = f.status === 'deleted' ? undefined : f.workingContent; f.status = 'staged' }); return ok([], '改动已进入暂存区；下一次 commit 会记录这些内容。') }
  if (cmd === 'commit') {
    if (s.conflictFiles.length) return ok(['error: Committing is not possible because you have unmerged files.'])
    const staged = Object.values(s.files).filter(f => f.status === 'staged'); if (!staged.length) return ok(['nothing to commit, working tree clean'])
    const mi = args.indexOf('-m'); if (mi < 0 || !args[mi + 1]) return ok(['error: switch `m` requires a value'])
    const snap = { ...commitSnapshot(s) }; staged.forEach(f => { if (f.stagedContent === undefined) delete snap[f.name]; else snap[f.name] = f.stagedContent })
    const c: Commit = { id: makeId(), message: args[mi + 1], parentIds: s.head ? [s.head] : [], filesSnapshot: snap, createdAt: Date.now() }; s.commits[c.id] = c; s.head = c.id; s.branches[s.currentBranch].commitId = c.id; restoreFrom(s, snap)
    return ok([`[${s.currentBranch} ${c.id}] ${c.message}`, ` ${staged.length} file(s) changed`], '提交已创建，当前分支与 HEAD 都向前移动了一步。')
  }
  if (cmd === 'branch') { const name = args[2]; if (!name) return ok(Object.values(s.branches).map(b => `${b.name === s.currentBranch ? '* ' : '  '}${b.name}`)); if (s.branches[name]) return ok([`fatal: a branch named '${name}' already exists`]); s.branches[name] = { name, commitId: s.head }; return ok([], `你创建了 ${name} 分支，但仍停留在 ${s.currentBranch}。git branch 只创建，不切换。`) }
  if (cmd === 'switch' || cmd === 'checkout') {
    const create = args[2] === '-c' || args[2] === '-b'; const name = create ? args[3] : args[2]; if (!name) return ok(['fatal: missing branch name']); if (create) { if (s.branches[name]) return ok([`fatal: a branch named '${name}' already exists`]); s.branches[name] = { name, commitId: s.head } } else if (!s.branches[name]) return ok([`fatal: invalid reference: ${name}`]); s.currentBranch = name; s.head = s.branches[name].commitId; restoreFrom(s, commitSnapshot(s)); return ok([`Switched to ${create ? 'a new branch' : 'branch'} '${name}'`], `HEAD 现在指向 ${name}，工作区也更新为该分支的快照。`)
  }
  if (cmd === 'log') { if (!s.head) return ok(["fatal: your current branch 'main' does not have any commits yet"]); const all = args.includes('--all'); const ids = all ? [...new Set(Object.values(s.branches).flatMap(b => firstParentChain(s,b.commitId)))] : firstParentChain(s,s.head); return ok(ids.map(id => { const labels = Object.values(s.branches).filter(b => b.commitId === id).map(b => b.name); return `${id} ${labels.length ? `(${id === s.head ? 'HEAD -> ' : ''}${labels.join(', ')}) ` : ''}${s.commits[id].message}` })) }
  if (cmd === 'merge') return merge(args[2], s)
  if (cmd === 'cherry-pick') { const old = s.commits[args[2]]; if (!old) return ok([`fatal: bad object ${args[2] || ''}`]); const parent = old.parentIds[0] ? s.commits[old.parentIds[0]].filesSnapshot : {}; const next = { ...commitSnapshot(s) }; for (const k of new Set([...Object.keys(parent),...Object.keys(old.filesSnapshot)])) if (parent[k] !== old.filesSnapshot[k]) { if (old.filesSnapshot[k] === undefined) delete next[k]; else next[k] = old.filesSnapshot[k] } const c = { ...old, id: makeId(), parentIds: s.head ? [s.head] : [], filesSnapshot: next, createdAt: Date.now() }; s.commits[c.id] = c; s.head = c.id; s.branches[s.currentBranch].commitId = c.id; restoreFrom(s,next); return ok([`[${s.currentBranch} ${c.id}] ${c.message}`], `Git 复制了 ${old.id} 的改动并生成新提交 ${c.id}；改动相同，但 ID 不同。`) }
  if (cmd === 'rebase') return rebase(args[2], s)
  if (cmd === 'reset') return reset(args, s)
  if (cmd === 'restore') { const staged = args[2] === '--staged'; const name = staged ? args[3] : args[2]; const f = s.files[name]; if (!f) return ok([`error: pathspec '${name}' did not match any file(s) known to git`]); const base = commitSnapshot(s); if (staged) { f.stagedContent = undefined; f.status = name in base ? (f.workingContent === base[name] ? 'clean' : 'modified') : 'untracked' } else { if (!(name in base)) return ok([`error: pathspec '${name}' did not match any file(s) known to git`]); f.workingContent = base[name]; f.status = 'clean' } return ok([], staged ? '文件已移出暂存区，工作区改动仍然保留。' : '工作区改动已恢复为最近一次提交。') }
  if (cmd === 'diff') { const staged = args.includes('--staged'); const files = Object.values(s.files).filter(f => staged ? f.status === 'staged' : ['modified','deleted'].includes(f.status)); return ok(files.length ? files.flatMap(f => [`diff --git a/${f.name} b/${f.name}`, `- ${f.committedContent ?? ''}`, `+ ${staged ? f.stagedContent ?? '' : f.workingContent}`]) : []) }
  if (cmd === 'remote' && args[2] === 'add') { if(!args[3]||!args[4]) return ok(['usage: git remote add <name> <url>']); s.remotes[args[3]] = { name: args[3], url: args[4], branches: {} }; return ok([]) }
  if (cmd === 'push') { const r = s.remotes.origin; if (!r) return ok(["fatal: 'origin' does not appear to be a git repository"]); r.branches[s.currentBranch] = s.head; r.upstream = `${s.currentBranch}`; return ok([`To ${r.url}`, ` * [new branch] ${s.currentBranch} -> ${s.currentBranch}`], '远程分支已更新为当前本地提交。') }
  if (cmd === 'fetch') return ok(s.remotes.origin ? ['Already up to date.'] : ["fatal: 'origin' does not appear to be a git repository"])
  if (cmd === 'pull') return ok(s.remotes.origin ? ['Already up to date.'] : ["fatal: 'origin' does not appear to be a git repository"])
  return ok([])
}

function fileCommand(args: string[], s: GitState): CommandResult { const [cmd,name,...rest] = args; const out = (output:string[], explanation?:string):CommandResult => ({state:s,output,explanation}); if (cmd === 'ls') return out(Object.keys(s.files).filter(n => s.files[n].status !== 'deleted')); if (!name) return out([`${cmd}: missing file operand`]); if (cmd === 'cat') return out(s.files[name] && s.files[name].status !== 'deleted' ? [s.files[name].workingContent] : [`cat: ${name}: No such file or directory`]); if (cmd === 'touch') { if (!s.files[name]) s.files[name] = {name,workingContent:'',status:'untracked'}; return out([], '文件已在工作区创建，Git 还没有追踪它。') } if (cmd === 'rm') { if (!s.files[name]) return out([`rm: ${name}: No such file`]); s.files[name].workingContent=''; s.files[name].status='deleted'; return out([]) } const content = rest.join(' '); if (cmd === 'resolve') { if (!s.conflictFiles.includes(name)) return out([`error: ${name} is not conflicted`]); s.files[name].workingContent=content; s.files[name].status='modified'; s.conflictFiles=s.conflictFiles.filter(x=>x!==name); return out([], '冲突标记已解决；请 add 后提交 merge。') } const existing=s.files[name]; s.files[name]={name,workingContent:cmd==='append'&&existing ? `${existing.workingContent}${existing.workingContent?'\n':''}${content}` : content,committedContent:existing?.committedContent,status:existing?.committedContent===undefined?'untracked':'modified'}; return out([], '文件内容已更新，改动目前只在工作区。') }
function echoCommand(args:string[],s:GitState):CommandResult { const redirect=args.findIndex(x=>x==='>'||x==='>>'); if(redirect<0)return {state:s,output:[args.slice(1).join(' ')]}; const name=args[redirect+1]; if(!name)return {state:s,output:['zsh: parse error near `\\n\'']}; const content=args.slice(1,redirect).join(' '),existing=s.files[name]; const working=args[redirect]==='>>'&&existing?`${existing.workingContent}${existing.workingContent?'\n':''}${content}`:content; s.files[name]={name,workingContent:working,committedContent:existing?.committedContent,status:existing?.committedContent===undefined?'untracked':'modified'}; return {state:s,output:[],explanation:args[redirect]==='>>'?`${content ? '内容' : '空行'}已追加到 ${name}。`:`${name} 的内容已被覆盖写入。`} }
function merge(name:string, s:GitState):CommandResult {
  const b=s.branches[name]
  if(!b) return {state:s,output:[`merge: ${name} - not something we can merge`]}
  if(!b.commitId) return {state:s,output:['Already up to date.']}
  if(ancestors(s,s.head).has(b.commitId)) return {state:s,output:['Already up to date.']}
  if(!s.head||ancestors(s,b.commitId).has(s.head)){
    s.head=b.commitId; s.branches[s.currentBranch].commitId=b.commitId
    restoreFrom(s,s.commits[b.commitId].filesSnapshot)
    return {state:s,output:[`Updating ${b.commitId}`,'Fast-forward'],explanation:'当前分支没有独有提交，因此只需把分支指针快进。'}
  }
  const ours=commitSnapshot(s), theirs=s.commits[b.commitId].filesSnapshot
  const baseId=firstParentChain(s,s.head).find(x=>ancestors(s,b.commitId).has(x))
  const base=baseId?s.commits[baseId].filesSnapshot:{}
  const conflicts=Object.keys({...ours,...theirs}).filter(k=>ours[k]!==base[k]&&theirs[k]!==base[k]&&ours[k]!==theirs[k])
  if(conflicts.length){
    conflicts.forEach(k=>s.files[k]={name:k,workingContent:`<<<<<<< ${s.currentBranch}\n${ours[k]??''}\n=======\n${theirs[k]??''}\n>>>>>>> ${name}`,status:'conflict'})
    s.conflictFiles=conflicts
    return {state:s,output:[...conflicts.map(k=>`CONFLICT (content): Merge conflict in ${k}`),'Automatic merge failed; fix conflicts and then commit the result.'],explanation:'两个分支修改了同一内容，需要 resolve、add，再 commit。'}
  }
  const snap={...ours,...theirs}
  const c:Commit={id:makeId(),message:`Merge branch '${name}'`,parentIds:[s.head,b.commitId],filesSnapshot:snap,createdAt:Date.now()}
  s.commits[c.id]=c; s.head=c.id; s.branches[s.currentBranch].commitId=c.id; restoreFrom(s,snap)
  return {state:s,output:[`Merge made by the 'ort' strategy.`,`[${s.currentBranch} ${c.id}] ${c.message}`],explanation:'两个分支都有独立提交，因此生成了一个拥有两个父节点的 merge commit。'}
}
function rebase(name:string,s:GitState):CommandResult{const b=s.branches[name];if(!b?.commitId)return{state:s,output:[`fatal: invalid upstream '${name}'`]};const upstream=ancestors(s,b.commitId);const unique=firstParentChain(s,s.head).filter(id=>!upstream.has(id)).reverse();let parent=b.commitId;for(const id of unique){const old=s.commits[id];const c={...old,id:makeId(),parentIds:[parent],createdAt:Date.now()};s.commits[c.id]=c;parent=c.id}s.head=parent;s.branches[s.currentBranch].commitId=parent;restoreFrom(s,s.commits[parent].filesSnapshot);return{state:s,output:[`Successfully rebased and updated refs/heads/${s.currentBranch}.`],explanation:`${unique.length} 个独有提交已被复制到 ${name} 之后，并获得新的 ID。`}}
function reset(args:string[],s:GitState):CommandResult{const mode=(args.find(x=>x.startsWith('--'))||'--mixed').slice(2);const spec=args.find(x=>x.startsWith('HEAD~'));const n=Number(spec?.split('~')[1]||1);let target=s.head;for(let i=0;i<n&&target;i++)target=s.commits[target]?.parentIds[0]??null;const before=snapshot(s);const targetSnap=target?s.commits[target].filesSnapshot:{};s.head=target;s.branches[s.currentBranch].commitId=target;if(mode==='hard')restoreFrom(s,targetSnap);else {const all=new Set([...Object.keys(before),...Object.keys(targetSnap)]);s.files={};all.forEach(name=>{const working=before[name]??'';s.files[name]={name,workingContent:working,committedContent:targetSnap[name],stagedContent:mode==='soft'?(name in before?working:undefined):undefined,status:mode==='soft'?'staged':name in targetSnap?(working===targetSnap[name]?'clean':'modified'):'untracked'}})}return{state:s,output:[],explanation:mode==='soft'?'HEAD 已后退，改动保留在暂存区。':mode==='hard'?'HEAD、暂存区和工作区都已恢复。':'HEAD 已后退，改动保留在工作区但移出暂存区。'}}
