# Living Canvas M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canvas tldraw cho workflow (node, mũi tên có nhãn dữ liệu, khung chứa, note), chat với AI (Pi + DeepSeek V4.1 Flash) trả về ops; ops hiện thành ghost; người dùng Nhận tất cả / Chọn từng cái / Bỏ; tự lưu project.

**Architecture:** Monorepo npm workspaces gồm `shared/` (IR, zod schema, các hàm thuần: graph → text, diff, validate và apply ops, layout), `server/` (Hono trên Node: lưu project, gọi Pi, orchestrator có vòng tự sửa), `web/` (Vite + React + tldraw: shape `wf-node`, chuyển store sang IR, ghost, chat panel). Mọi logic có thể test được nằm trong hàm thuần ở `shared/`; `web/` chỉ nối.

**Tech Stack:** TypeScript 5, Node 22, npm workspaces, vitest, zod, Hono + @hono/node-server, tldraw 5.6, elkjs 0.12, React 19, Vite.

**Spec:** `docs/superpowers/specs/2026-11-04-living-canvas-design.md`

## Global Constraints

- Model: `fai/Alibaba:DeepSeek-V4.1-Flash`, gọi qua `pi -p --mode json --no-tools --no-session --no-context-files --no-extensions --no-skills --model <model> --system-prompt <text> <prompt>`. Model và đường dẫn `pi` để trong `server/src/config.ts`, có thể đè bằng env `LC_MODEL`, `LC_PI_BIN`.
- Câu trả lời của Pi là `text` nối lại từ sự kiện JSONL cuối cùng có `type == "message_end"` và `message.role == "assistant"` (bỏ phần `thinking`).
- Model chỉ nhận text: AI đọc IR dạng text, không đọc ảnh.
- AI không bao giờ đặt tọa độ. Vị trí do `layoutNewNodes` tính và chỉ cho node mới. Node đã có vị trí thì không bị dịch chuyển.
- AI không sửa canvas trực tiếp: mọi thay đổi của AI đi qua proposal (ghost), riêng `add_note kind=review` hiện ngay.
- Giao diện tiếng Việt. Tên tag: `/review`, `/expand`, `/suggest`, `/explain`.
- Dữ liệu project: `projects/<name>/canvas.json`, `projects/<name>/chat.jsonl` (thư mục `projects/` nằm trong `.gitignore`).
- Server cổng 8787, web cổng 5173 (Vite proxy `/api` → 8787).

## Review Focus

1. Model trả JSON bọc trong ```` ```json ```` hoặc kèm chữ trước/sau: phải tách được (test trong Task 5).
2. Proposal đang chờ mà người dùng xóa node mà op tham chiếu tới: lúc nhận, op đó bị bỏ và báo, không crash (test trong Task 3, `applyOps` với id không còn).
3. `pi` không có, timeout hoặc exit khác 0: chat hiện lỗi dễ hiểu, canvas không đổi (test trong Task 4 và Task 6).
4. Tiếng Việt có dấu trong title, label và chat đi qua JSON, file và CLI không bị hỏng (test trong Task 6: round-trip "Chuẩn hóa thời gian, không gian").
5. AI đề xuất `set_parent` tạo vòng cha-con, hoặc làm node là cha của chính nó: bị loại khi validate (test trong Task 3).

---

## File Structure

```
package.json                      workspaces: shared, server, web
tsconfig.base.json
shared/src/ir.ts                  kiểu + zod schema: GraphNode, GraphEdge, GraphNote, Graph, Op, AiReply
shared/src/graphText.ts           graphToText(graph): string
shared/src/diff.ts                diffGraphs(prev, next): GraphDiff, diffToText
shared/src/ops.ts                 validateOps, applyOps
shared/src/layout.ts              layoutNewNodes (elkjs)
shared/src/index.ts
shared/test/*.test.ts
server/src/config.ts
server/src/pi.ts                  runPi, parsePiJsonl
server/src/json.ts                extractJson
server/src/prompts.ts             system prompt theo intent
server/src/orchestrator.ts        askAi
server/src/store.ts               ProjectStore
server/src/app.ts                 Hono app (route)
server/src/main.ts                serve
server/test/*.test.ts
web/index.html, web/vite.config.ts
web/src/main.tsx, App.tsx
web/src/canvas/WfNodeShape.tsx    ShapeUtil 'wf-node'
web/src/canvas/storeToGraph.ts    records → Graph (thuần)
web/src/canvas/applyProposal.ts   ops + layout → shape/binding partials (thuần) + hàm áp vào editor
web/src/proposal/useProposal.ts   trạng thái proposal
web/src/ui/ChatPanel.tsx, ProposalBar.tsx, Toolbar.tsx
web/src/api.ts
web/test/*.test.ts
```

---

### Task 1: Scaffold monorepo + IR schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `shared/package.json`, `shared/tsconfig.json`, `shared/src/ir.ts`, `shared/src/index.ts`
- Test: `shared/test/ir.test.ts`

**Interfaces:**
- Produces (`@lc/shared`):
```ts
type NodeKind = 'agent'|'llm'|'code'|'human'|'unknown'
interface GraphNode { id: string; title: string; description?: string; kind?: NodeKind; parentId?: string; inputs?: string[]; outputs?: string[]; status: 'draft'|'locked' }
interface GraphEdge { id: string; from: string; to: string; label?: string; type: 'flow'|'data' }
interface GraphNote { id: string; text: string; author: 'user'|'ai'; targetIds: string[]; kind: 'note'|'comment'|'review' }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[]; notes: GraphNote[] }
type Op =
 | {op:'add_node'; tempId: string; title: string; kind?: NodeKind; parent?: string; after?: string; inputs?: string[]; outputs?: string[]; description?: string}
 | {op:'update_node'; id: string; title?: string; kind?: NodeKind; inputs?: string[]; outputs?: string[]; description?: string}
 | {op:'delete_node'; id: string}
 | {op:'set_parent'; id: string; parent: string|null}
 | {op:'add_edge'; from: string; to: string; label?: string; type?: 'flow'|'data'}
 | {op:'update_edge'; id: string; label?: string}
 | {op:'delete_edge'; id: string}
 | {op:'add_note'; targets: string[]; text: string; kind: 'review'|'note'}
interface AiReply { reply: string; ops: Op[] }
const GraphSchema, OpSchema, AiReplySchema  // zod
```
`from`/`to`/`parent`/`after`/`targets` trong op có thể là id thật hoặc `tempId` của một `add_node` trong cùng lô.

- [ ] **Step 1: Root setup.** `package.json` có `"workspaces": ["shared","server","web"]`, script `"test": "npm test -ws --if-present"`. `shared` là package `@lc/shared`, `type: module`, vitest. `npm install`.
- [ ] **Step 2: Write failing test** `shared/test/ir.test.ts`:
  - `AiReplySchema.parse({reply:"ok", ops:[{op:"add_node",tempId:"n1",title:"Xây nhân vật"}]})` thành công.
  - `OpSchema.safeParse({op:"add_node", title:"x"}).success === false` (thiếu tempId).
  - `OpSchema.safeParse({op:"fly", id:"a"}).success === false`.
  - `AiReplySchema.parse({reply:"ok"})` cho `ops` mặc định `[]`.
- [ ] **Step 3: Run** `npm test -w shared`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement** `ir.ts` bằng `z.discriminatedUnion('op', ...)`; export kiểu bằng `z.infer`.
- [ ] **Step 5: Run** `npm test -w shared`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(shared): IR types and zod schemas`.

### Task 2: Graph → text và diff

**Files:** Create `shared/src/graphText.ts`, `shared/src/diff.ts`. Test `shared/test/graphText.test.ts`, `shared/test/diff.test.ts`.

**Interfaces:**
- Consumes: `Graph` (Task 1).
- Produces: `graphToText(g: Graph): string`; `interface GraphDiff { addedNodes: string[]; removedNodes: string[]; changedNodes: string[]; addedEdges: string[]; removedEdges: string[]; addedNotes: string[] }`; `diffGraphs(prev: Graph, next: Graph): GraphDiff`; `diffToText(d: GraphDiff, next: Graph, prev: Graph): string`.

Định dạng text (chốt ở đây, để model yếu dễ đọc):
```
NODES
n1 | Tìm hiểu dữ kiện | kind=agent | in: sự kiện | out: dữ kiện
n2 | Chuẩn hóa | kind=? | in: dữ kiện | out: mốc + địa điểm
  n5 | Nhân vật | parent=n2
EDGES
n1 -[dữ kiện]-> n2
n3 ..[facts]..> n4        (data edge)
NOTES
c1 (user, comment) on n4: "bước này còn mơ hồ quá"
```
Node con thụt 2 dấu cách dưới cha. Trường rỗng thì bỏ. Không có node thì in `NODES\n(trống)`.

- [ ] **Step 1: Failing tests:**
  - Graph mẫu video lịch sử (n1 → n2 có label "dữ kiện", n5 parent n2, một comment trên n4) cho ra đúng text như trên (so sánh với chuỗi kỳ vọng).
  - Graph rỗng cho ra chuỗi chứa `(trống)`.
  - `diffGraphs`: prev có n1, n2; next đổi title n2, thêm n3 và một edge → `changedNodes=['n2'], addedNodes=['n3'], addedEdges=[id]`.
  - `diffToText` của diff rỗng là `"(không đổi)"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shared): graph text format and diff`.

### Task 3: Validate và apply ops

**Files:** Create `shared/src/ops.ts`. Test `shared/test/ops.test.ts`.

**Interfaces:**
- Consumes: `Graph`, `Op`.
- Produces:
```ts
interface OpError { index: number; op: Op; reason: string }
validateOps(g: Graph, ops: Op[]): { ok: Op[]; errors: OpError[] }
applyOps(g: Graph, ops: Op[], newId: () => string): { graph: Graph; idMap: Record<string,string>; errors: OpError[] }
```
`validateOps` xét theo thứ tự và mô phỏng các op trước đó (để tempId của `add_node` trước dùng được ở op sau). Lý do lỗi (chuỗi tiếng Việt, gửi lại cho model): id không tồn tại, tempId trùng, tạo vòng cha-con, cha là chính nó, cạnh trùng (cùng from, to, type), `delete_node` thì cũng xóa cạnh và bỏ target của note. `applyOps` gọi validate rồi áp các op hợp lệ, cấp id thật qua `newId`.

- [ ] **Step 1: Failing tests:**
  - `add_node{tempId:'t1'}` rồi `add_edge{from:'n1',to:'t1',label:'cảnh × N'}` → cả hai ok; `applyOps` cho ra node mới có id từ `newId`, edge trỏ tới id đó, `idMap.t1` đúng.
  - `update_node{id:'zzz'}` → errors[0].reason chứa `zzz`.
  - `set_parent{id:'n2',parent:'n5'}` khi n5 là con của n2 → lỗi vòng.
  - `set_parent{id:'n2',parent:'n2'}` → lỗi.
  - `delete_node{id:'n2'}` → các cạnh nối n2 biến mất, con của n2 mất `parentId`.
  - Review Focus #2: `applyOps` với op tham chiếu node đã bị xóa khỏi graph hiện tại → op đó vào `errors`, các op khác vẫn áp.
- [ ] **Step 2–4:** Run FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(shared): op validation and application`.

### Task 4: Pi runner

**Files:** Create `server/package.json` (`@lc/server`, deps hono, @hono/node-server, zod, @lc/shared), `server/src/config.ts`, `server/src/pi.ts`. Test `server/test/pi.test.ts`, fixture `server/test/fixtures/pi-ok.jsonl` (chép từ một lần chạy thật: `pi -p --mode json ... 'Trả về đúng JSON {"ok":true}'`).

**Interfaces:**
- Produces:
```ts
config: { piBin: string; model: string; timeoutMs: number /*120000*/; maxRepairs: number /*2*/; projectsDir: string }
parsePiJsonl(raw: string): string            // text cuối của assistant; throw PiError nếu không có
class PiError extends Error { kind: 'not_found'|'timeout'|'exit'|'no_answer' }
type Spawner = (bin: string, args: string[], opts: {timeoutMs: number}) => Promise<{code: number|null; stdout: string; stderr: string; timedOut: boolean; notFound: boolean}>
runPi(args: {system: string; prompt: string}, spawner?: Spawner): Promise<string>
```
- [ ] **Step 1: Failing tests:** `parsePiJsonl(fixture) === '{"ok":true}'`; chuỗi không có assistant message_end → throw `no_answer`; `runPi` với spawner giả trả `notFound:true` → `PiError` kind `not_found`; `timedOut` → `timeout`; `code 1` → `exit` kèm stderr trong message; kiểm tra args có `--model`, `--system-prompt`, `--no-tools`, `--no-session`.
- [ ] **Step 2–4:** FAIL → implement (spawner mặc định dùng `child_process.spawn`, ENOENT → notFound) → PASS.
- [ ] **Step 5: Commit** `feat(server): pi runner`.

### Task 5: Orchestrator có vòng tự sửa

**Files:** Create `server/src/json.ts`, `server/src/prompts.ts`, `server/src/orchestrator.ts`. Test `server/test/json.test.ts`, `server/test/orchestrator.test.ts`.

**Interfaces:**
- Consumes: `runPi`, `graphToText`, `diffToText`, `validateOps`, `AiReplySchema`.
- Produces:
```ts
extractJson(text: string): unknown            // throw nếu không có
type Intent = 'chat'|'review'|'expand'|'suggest'|'explain'
parseIntent(message: string): { intent: Intent; text: string }   // "/expand bung ra" → expand
interface AskInput { graph: Graph; prevGraph?: Graph; selection: string[]; history: {role:'user'|'ai'; text:string}[]; message: string }
interface AskResult { reply: string; ops: Op[]; dropped: OpError[] }
askAi(input: AskInput, llm?: (system: string, prompt: string) => Promise<string>): Promise<AskResult>
```
`prompts.ts`: `systemPrompt(intent)` gồm: vai trò (cộng sự thiết kế workflow), định dạng text của IR, danh sách op kèm 1 ví dụ JSON đầy đủ, luật (không đặt tọa độ; bước không thuộc về node khác thì `after`, chỉ dùng `parent` khi thật sự là một phần của nó; mỗi mũi tên nên có `label` dữ liệu; chú ý input/output không khớp thì `add_note kind=review`), và đúng một câu hướng dẫn riêng theo intent. M1 phải có đủ 5 intent (M2 sẽ tinh chỉnh). `buildPrompt(input)` gồm các mục `SƠ ĐỒ`, `THAY ĐỔI TỪ LƯỢT TRƯỚC`, `ĐANG CHỌN`, `HỘI THOẠI GẦN ĐÂY` (6 tin cuối), `YÊU CẦU`.

Vòng tự sửa: gọi llm, `extractJson`, `AiReplySchema.safeParse`, `validateOps`. Nếu parse lỗi hoặc có op lỗi và còn lượt (≤ `config.maxRepairs`) thì gọi lại với prompt thêm mục `LỖI Ở LẦN TRƯỚC` liệt kê lỗi và yêu cầu trả lại toàn bộ JSON. Hết lượt thì trả các op hợp lệ cộng `dropped`. Parse không được lần nào thì `reply` = text thô của model, `ops: []`.

- [ ] **Step 1: Failing tests:**
  - `extractJson('Đây:\n```json\n{"reply":"a","ops":[]}\n```')` ra object (Review Focus #1); `extractJson('xx {"a":1} yy')` ra `{a:1}`; `extractJson('không có')` throw.
  - `parseIntent('/expand bung node này')` → `{intent:'expand', text:'bung node này'}`; không có tag → `chat`.
  - `askAi` với llm giả: lần 1 trả op `update_node{id:'zzz'}`, lần 2 trả op đúng → kết quả có op đúng, llm được gọi 2 lần, prompt lần 2 chứa `zzz`.
  - llm giả luôn trả rác → sau `1+maxRepairs` lần gọi, `ops=[]`, `reply` là text thô.
  - Prompt chứa text của `graphToText(graph)` và id của node đang chọn.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(server): AI orchestrator with repair loop`.

### Task 6: Project store + HTTP API

**Files:** Create `server/src/store.ts`, `server/src/app.ts`, `server/src/main.ts`. Test `server/test/app.test.ts`.

**Interfaces:**
- Produces:
```ts
class ProjectStore { constructor(dir: string); loadCanvas(name): Promise<unknown|null>; saveCanvas(name, snapshot: unknown): Promise<void>; appendChat(name, msg: {role:'user'|'ai'; text: string; at: string}): Promise<void>; loadChat(name): Promise<ChatMsg[]> }
createApp(deps: { store: ProjectStore; ask: typeof askAi }): Hono
```
Route:
- `GET /api/projects/:name/canvas` → `{snapshot|null}`; `PUT` body `{snapshot}` → `{ok:true}`
- `GET /api/projects/:name/chat` → `{messages}`
- `POST /api/projects/:name/ask` body `{graph, prevGraph?, selection, message}` → `AskResult`. Ghi cả tin nhắn user lẫn reply của AI vào chat. `PiError` → HTTP 502 `{error: <tiếng Việt dễ hiểu theo kind>}`.
- Tên project chỉ nhận `[a-z0-9-]+`, sai thì 400.

`main.ts`: `serve({fetch: app.fetch, port: 8787})`.

- [ ] **Step 1: Failing tests** (dùng `app.request`, thư mục tạm):
  - PUT rồi GET canvas round-trip có node title `"Chuẩn hóa thời gian, không gian"` (Review Focus #4).
  - POST ask với `ask` giả → 200, trả `reply`/`ops`; chat có 2 tin.
  - `ask` giả throw `PiError('not_found')` → 502, `error` chứa `pi` (Review Focus #3).
  - name `../x` → 400.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Verify thật:** `npm run dev -w server`, rồi `curl -s -XPOST localhost:8787/api/projects/demo/ask -H 'content-type: application/json' -d '{"graph":{"nodes":[{"id":"n1","title":"Tìm hiểu dữ kiện","status":"draft"},{"id":"n2","title":"Generate bằng API","status":"draft"}],"edges":[{"id":"e1","from":"n1","to":"n2","type":"flow"}],"notes":[]},"selection":[],"message":"/review"}'`. Expected: JSON có `reply` không rỗng.
- [ ] **Step 6: Commit** `feat(server): project store and HTTP API`.

### Task 7: Web scaffold + shape wf-node + storeToGraph

**Files:** Create `web/package.json` (react, react-dom, tldraw@^5.6, @lc/shared, vite, @vitejs/plugin-react), `web/index.html`, `web/vite.config.ts` (proxy `/api`), `web/src/main.tsx`, `web/src/App.tsx`, `web/src/canvas/WfNodeShape.tsx`, `web/src/canvas/storeToGraph.ts`, `web/src/ui/Toolbar.tsx`. Test `web/test/storeToGraph.test.ts`.

**Interfaces:**
- Produces:
  - Shape `wf-node` props: `{ w: number; h: number; title: string; kind: NodeKind; inputs: string; outputs: string; description: string; container: boolean }` (inputs/outputs là chuỗi phân tách bởi dấu phẩy để sửa dễ). Meta: `{ ghost?: string /*proposalId*/ }`.
  - Note dùng shape `note` có sẵn của tldraw; `meta: { author: 'user'|'ai'; kind: 'note'|'comment'|'review'; targetIds: string[] }`. Comment ghim là note có `targetIds` khác rỗng.
  - Cha: `parentId` của tldraw (`wf-node` có `container:true` thì nhận con: `canReceiveNewChildrenOfType` trả `true` cho `wf-node`).
  - `storeToGraph(records: TLRecord[], opts?: {includeGhosts?: boolean}): Graph`: node lấy từ `wf-node` (id = id shape bỏ tiền tố `shape:`), edge lấy từ shape `arrow` có đủ 2 binding `arrow` đầu và cuối vào `wf-node` (label = text của arrow; `meta.edgeType ?? 'flow'`), note như trên. Mặc định bỏ ghost.
- Hiển thị wf-node: tiêu đề đậm, màu theo kind (dùng bảng màu của D2W: code `#e8f0fe`, llm `#e6f4ea`, agent `#f3e8fd`, human `#fff4e0`, unknown trắng), dòng nhỏ `in → out`; ghost: viền nét đứt `#7c4dff`, nền `#f3eeff`, opacity 0.85. Double-click để sửa title (dùng pattern editing của tldraw).
- Toolbar: nút "Thêm bước" (tạo wf-node ở giữa viewport), "Thêm khung" (container), và "Đổi kind" cho node đang chọn.

- [ ] **Step 1: Failing test** `storeToGraph` trên mảng record viết tay: 2 wf-node + 1 arrow có 2 binding + 1 arrow chỉ có 1 binding + 1 note có targetIds + 1 ghost wf-node → ra 2 node, 1 edge (label đúng), 1 note, không có ghost; node có `parentId` là wf-node khác thì `parentId` đúng.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Verify thủ công:** `npm run dev -w web`, mở http://localhost:5173: thêm 2 bước, nối mũi tên, gõ nhãn, kéo node vào khung, node con đi theo khung. Chụp màn hình.
- [ ] **Step 6: Commit** `feat(web): tldraw canvas with workflow node shape`.

### Task 8: Layout node mới + chuyển ops thành ghost

**Files:** Create `shared/src/layout.ts`, `web/src/canvas/applyProposal.ts`. Test `shared/test/layout.test.ts`, `web/test/applyProposal.test.ts`.

**Interfaces:**
- Produces:
```ts
// shared/layout.ts
type Box = { x: number; y: number; w: number; h: number }
layoutNewNodes(g: Graph, boxes: Record<string, Box>, newIds: string[]): Promise<Record<string, Box>>
// web/applyProposal.ts
interface Proposal { id: string; ops: Op[]; reply: string; items: ProposalItem[] }
interface ProposalItem { key: string; label: string; shapeIds: TLShapeId[]; checked: boolean }
proposalToPartials(current: Graph, boxes: Record<string,Box>, ops: Op[], proposalId: string): Promise<{ create: TLShapePartial[]; bindings: TLBindingCreate[]; updates: TLShapePartial[]; items: ProposalItem[]; errors: OpError[] }>
mountProposal(editor: Editor, p: ...): void; acceptProposal(editor, proposal, keys?: string[]): void; rejectProposal(editor, proposal): void
```
Thuật toán layout (chốt): chạy elk `layered`, `direction: RIGHT` trên toàn graph với node cũ được ghim (`elk.position` bằng box hiện tại, `org.eclipse.elk.layered.crossingMinimization.semiInteractive`), lấy vị trí cho node mới. Sau đó dời node mới nếu chồng lên box cũ (dời xuống theo bước 40px cho đến khi hết chồng). Node có `after: X` thì đặt ngay bên phải X (x = X.x + X.w + 60, cùng y); nếu chỗ đó đã có node thì dời xuống. Node có `parent` thì đặt bên trong box của cha (lưới 2 cột, padding 20). **Không trả vị trí cho id cũ.**

Ghost: `add_node` → wf-node có `meta.ghost`; `add_edge` → arrow có `meta.ghost` kèm binding; `update_node`/`update_edge`/`delete_*`/`set_parent` → item hiển thị bằng cách tô viền node đích (`meta.pendingOp`) và áp khi nhận. `add_note kind=review` → note thật luôn (`author:'ai'`), không thành item. Mỗi op là một item (label tiếng Việt, ví dụ "Thêm bước: Xây nhân vật"); một `add_edge` có đầu là ghost node thì gộp vào item của node đó.

Accept: bỏ `meta.ghost` của các shape thuộc item được chọn, áp các update/delete, tất cả trong một `editor.run` (một mục undo). Item không được chọn thì xóa. Op mà đích không còn tồn tại thì bỏ và trả về danh sách bị bỏ (Review Focus #2).

- [ ] **Step 1: Failing tests:**
  - `layoutNewNodes`: graph có n1 (0,0), n2 (300,0), node mới t1 với `after` n1 → t1 không chồng n1/n2, kết quả không chứa key n1, n2.
  - Node mới có parent c1 → box nằm trong box c1.
  - `proposalToPartials` cho 1 add_node + 1 add_edge (n1 → t1) + 1 add_note review → 1 item (gộp), create gồm wf-node ghost và arrow ghost, note không có meta.ghost.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: deterministic layout and proposal ghosts`.

### Task 9: Chat panel + proposal bar + autosave

**Files:** Create `web/src/api.ts`, `web/src/proposal/useProposal.ts`, `web/src/ui/ChatPanel.tsx`, `web/src/ui/ProposalBar.tsx`; Modify `web/src/App.tsx`.

**Interfaces:**
- Consumes: `/api/projects/:name/*` (Task 6), `storeToGraph` (Task 7), `proposalToPartials`/`mountProposal`/`acceptProposal`/`rejectProposal` (Task 8).
- Hành vi:
  - Project mặc định `demo` (hoặc lấy từ `?p=`). Lúc mở thì tải snapshot và chat; thay đổi store (`editor.store.listen`, scope document) thì lưu, debounce 800ms.
  - Chat panel bên phải (rộng 320px): danh sách tin, chip các node đang chọn, ô nhập, gợi ý tag khi gõ `/`. Gửi: `graph = storeToGraph(records)`, `prevGraph` = graph lúc AI trả lời lượt trước (giữ trong ref), `selection` = id các wf-node đang chọn. Trong lúc chờ thì hiện "AI đang nghĩ…" và khóa nút gửi.
  - Nhận kết quả: dựng proposal và mount ghost. Có `dropped` thì hiện dòng nhỏ "Bỏ N đề xuất không hợp lệ". Lỗi 502 thì hiện lỗi màu đỏ trong chat.
  - ProposalBar (nổi trên canvas khi có proposal): "Nhận tất cả", "Chọn từng cái" (mở danh sách checkbox theo item, có nút "Nhận các mục đã chọn"), "Bỏ". Chỉ có một proposal đang chờ; gửi tin mới khi đang có proposal thì proposal cũ tự bị bỏ.
- [ ] **Step 1: Verify thủ công** (chạy `npm run dev` ở root, chạy cả server và web):
  1. Vẽ `Tìm hiểu dữ kiện → Chuẩn hóa → Tạo map → Generate bằng API`.
  2. Chọn "Generate bằng API", gõ `/expand video lịch sử cần nhân vật, bối cảnh, nhịp độ`. Expected: ghost tím xuất hiện, node cũ không dịch chuyển.
  3. "Chọn từng cái", bỏ tick một mục, nhận. Expected: mục bỏ tick biến mất, còn lại thành node thật; Ctrl+Z hoàn tác toàn bộ lần nhận.
  4. Gõ `/review`. Expected: note cam của AI gắn gần node liên quan.
  5. Reload trang. Expected: canvas và chat còn nguyên, vị trí giữ nguyên.
  6. Đổi `LC_PI_BIN=/không/có` rồi gửi. Expected: lỗi đỏ dễ hiểu, canvas không đổi.
- [ ] **Step 2: Commit** `feat(web): chat panel, proposal bar, autosave`.

### Task 10: Đánh giá orchestrator với model thật (tiền đề M2)

**Files:** Create `server/eval/cases.ts`, `server/eval/run.ts`, script `npm run eval -w server`.

**Interfaces:** `cases: {id: string; graph: Graph; selection: string[]; message: string; check: (r: AskResult) => string|null}[]`. `run.ts` chạy từng case với `askAi` thật, in PASS/FAIL, lý do, số lần sửa và thời gian, rồi ghi `server/eval/results/<timestamp>.json`.

Case tối thiểu:
- `mismatch`: `Tạo map → Generate bằng API` với `/review` → có ít nhất 1 op `add_note` kind review nhắc tới "prompt".
- `expand-video`: 4 bước của video lịch sử, chọn Generate, `/expand` → có ít nhất 3 `add_node`, mọi op hợp lệ (`dropped` rỗng sau khi sửa).
- `containment`: comment "Nhân vật, bối cảnh thuộc bước chuẩn hóa" trên 2 node song song → có `set_parent` vào node Chuẩn hóa.
- `noop-chat`: "chào" → `ops` rỗng, `reply` không rỗng.

- [ ] **Step 1:** Viết cases và runner. **Step 2:** `npm run eval -w server`, ghi lại tỉ lệ đạt trong commit message. **Step 3:** Commit `test(server): live eval for orchestrator`.

---

## M2–M4 (chỉ phác thảo; mỗi mốc sẽ có plan riêng)

- **M2: Review và tag:** tinh chỉnh prompt theo kết quả của Task 10; comment ghim có nút gửi (tag trong note); `/explain` trả lời gắn vào node; note của AI có nút "bỏ qua"; nâng bộ eval lên ≥ 10 case, chạy ≥ 3 lần mỗi case để đo độ ổn định.
- **M3: Xuất D2W:** khóa/mở khóa sơ đồ; nút xuất Mermaid (spec §6.7); `graphToD2W(graph)` (ánh xạ theo spec §6.6) ra bản khung `workflow.md`; Pi điền kind, schema, prompt; `d2w new` hoặc `d2w init` vào `projects/<name>/d2w/`; Pi (agent, có tool read/write/edit) viết `steps/<id>.py`; vòng `d2w check` tự sửa; map step id ↔ node id lưu trong `projects/<name>/d2w-map.json`.
- **M4: Chạy và kết quả:** `POST /run` chạy `d2w eval --case` hoặc `d2w run`; theo dõi `runs/<run_id>/NNN-<step>/` rồi stream qua SSE; node có huy hiệu trạng thái; shape `wf-result` cạnh node (JSON gọn, ảnh, link artifact phục vụ qua `/api/projects/:name/artifacts/*`); comment lên kết quả và chạy lại.
