# Living Canvas: thiết kế

Ngày: 2026-11-04. Dự án cá nhân.

## 1. Ý định

Living Canvas là một canvas vô hạn nơi người và AI cùng thiết kế workflow. Người
dùng chủ yếu **chat và comment**. AI **vẽ hộ** dưới dạng đề xuất, người dùng
**nhận hoặc bỏ**. Khi sơ đồ đã chốt, nó được chuyển thành workflow D2W chạy được,
và kết quả của từng bước hiện ngay trên canvas cạnh node đó.

**Vì sao làm.** Khi brainstorm workflow (ví dụ workflow sinh video AI về một sự
kiện lịch sử) bằng cách chat với AI, mọi thứ nghe có vẻ hợp lý, nhưng đến lúc
implement mới lộ ra:
- các bước quá thô, che mất bước con (xây nhân vật, dựng bối cảnh, nhịp độ, B-roll…);
- các bước không khớp dữ liệu (ví dụ "Generate bằng API" cần **prompt**, nhưng
  bước trước chỉ có bản đồ; cần một bước gom N cảnh thành M prompt).

Living Canvas làm hai thứ đó hiện ra sớm: bằng hình cho người dùng nhìn, và bằng
mô hình dữ liệu để AI soát được.

**Khác text2diagram ở chỗ:** sơ đồ hai chiều (người sửa trên hình thì AI hiểu, AI
sửa thì người duyệt trên hình), AI hiểu dữ liệu chảy qua mũi tên và quan hệ chứa
trong, sơ đồ chạy được, và kết quả hiện trên canvas để vòng lặp tiếp tục.

**Chứng minh framework.** Dùng model yếu (DeepSeek V4.1 Flash qua Pi) mà vẫn chạy
tốt. Vì vậy độ tin cậy phải đến từ framework (schema, kiểm tra, tự sửa, layout tất
định), không dựa vào model giỏi.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu (người dùng: "làm tất"):**
1. Canvas tldraw: node workflow, mũi tên có nhãn dữ liệu, khung chứa (containment),
   note/chú thích tự do, comment ghim vào node, kéo thả, click, sửa trực tiếp.
2. Chat là kênh chính. AI đề xuất thay đổi dưới dạng "ghost" (nét đứt tím); người
   dùng Nhận tất cả / Chọn từng cái / Bỏ.
3. Lệnh `/tag` trong chat hoặc trong comment ghim vào node: `/review`, `/expand`,
   `/suggest`, `/explain` (tên là builder đặt, người dùng chưa phản đối).
4. AI nhận xét: lỗi logic, bước thiếu, dữ liệu không khớp, hiển thị thành note của
   AI gắn vào node liên quan.
5. Chốt sơ đồ, xuất ra project D2W (`workflow.md`, steps, `evals/cases.yaml`), chạy
   `d2w check`.
6. Chạy thử, hiện kết quả (output, artifact) cạnh từng node trên canvas. Người dùng
   comment lên kết quả, vòng lặp tiếp tục.

**Không làm (bản này):** nhận dạng nét vẽ tay thành sơ đồ (để sau), nhiều người
dùng hoặc realtime, đăng nhập, triển khai cloud, chạy song song.

**Phản mục tiêu (dù chạy được vẫn coi là hỏng):**
- AI tự sửa phần người dùng đã vẽ mà không qua duyệt.
- AI đặt tọa độ lung tung, sơ đồ rối hơn sau mỗi lượt.
- Kéo node đi rồi lần sau node tự nhảy về chỗ cũ.
- Mỗi lần model trả về sai định dạng thì app vỡ hoặc mất dữ liệu.
- Thành một công cụ text-ra-hình một chiều.

## 3. Ràng buộc

- Thư viện canvas: **tldraw** (người dùng chọn; watermark không quan trọng).
- Agent: **Pi** (`pi` CLI, đã cài), model `fai/Alibaba:DeepSeek-V4.1-Flash`
  (provider `ivychat` trong `~/.pi/agent/models.json`). **Chỉ nhận text**, nên AI
  đọc sơ đồ dưới dạng dữ liệu có cấu trúc, không đọc ảnh chụp.
- D2W: `/home/dungdn10/Desktop/D2V`, lệnh `d2w` đã cài. Định dạng ở
  `skills/design/references/workflow-format.md`. Đặc điểm cần tôn trọng:
  - step có `kind` ∈ agent | llm | code | human, có `output_schema`, `next`, `inputs`;
  - lịch chạy **tuần tự** theo `next`, không song song, không có khái niệm "chứa trong";
  - vết chạy ở `runs/<run_id>/NNN-<step>/{input,output}.json`, artifact ở
    `runs/<run_id>/artifacts/`;
  - step `human` mở trang review trên trình duyệt (khi chạy từ Living Canvas cần
    xử lý thay thế, xem §6.6).
- Chạy local trên máy Linux của người dùng, Node 22, Python qua `uv`.

## 4. Đã quyết (từ hội thoại)

| Quyết định | Nguồn |
|---|---|
| Sơ đồ có cấu trúc (node + mũi tên) là chính; vẽ nguệch ngoạc chưa cần | người dùng |
| tldraw, hai lớp: lớp cấu trúc (vào workflow) và lớp tự do (chú thích, note, kết quả: chỉ là ngữ cảnh) | người dùng đồng ý |
| Chú thích lên sơ đồ và bày kết quả chạy ra canvas là cốt lõi | người dùng |
| Tọa độ node lưu riêng; người dùng kéo đi thì giữ nguyên | người dùng |
| AI bung bước con **trên luồng chính** (cách A), không nhét vào trong node khác khi chúng không thuộc về nó | người dùng |
| Nhưng có quan hệ **chứa trong** khi thật sự thuộc về (Nhân vật, Bối cảnh ⊂ Chuẩn hóa) | người dùng |
| Mũi tên mang nhãn dữ liệu; AI dùng nó để bắt chỗ không khớp | người dùng đồng ý |
| Chat với AI là kênh chính; người dùng vẫn kéo thả, click, note, comment, `/tag` | người dùng |
| AI vẽ hộ, người dùng xác nhận; AI cũng tự nhận xét và đề xuất | người dùng |
| Pi + DeepSeek V4.1 Flash | người dùng |

## 5. Kiến trúc

```
Browser (Vite + React + TS + tldraw)
  ├─ Canvas: custom shapes + arrow bindings
  ├─ Chat panel (có chip node được ghim/chọn)
  └─ Proposal bar (Nhận / Chọn từng cái / Bỏ)
        │  HTTP + WebSocket (stream)
Local server (Node + TS)
  ├─ Graph IR: canvas ↔ IR (thuần, có test)
  ├─ AI orchestrator: dựng prompt, gọi Pi, validate, tự sửa, trả ops
  ├─ Project store: projects/<name>/canvas.json, chat.jsonl
  ├─ D2W bridge: IR → project D2W, d2w check, d2w run, đọc runs/
  └─ Pi runner: spawn `pi -p --mode json --no-tools --model ...`
```

Gói: monorepo `pnpm` hoặc `npm workspaces` với `web/`, `server/`, `shared/` (kiểu
IR + ops + zod schema dùng chung). *Builder quyết.*

## 6. Các phần

### 6.1 Graph IR (trung tâm)

Mô hình dữ liệu mà AI đọc và mọi phép biến đổi đi qua. Canvas là một view của IR,
Mermaid và D2W là các bản xuất ra.

```ts
Node   { id, title, description?, kind?: 'agent'|'llm'|'code'|'human'|'unknown',
         parentId?: id,          // quan hệ "chứa trong"
         inputs?: string[], outputs?: string[],   // mô tả dữ liệu, chữ tự do
         status: 'draft'|'locked' }
Edge   { id, from, to, label?: string,           // label = dữ liệu chảy qua
         type: 'flow'|'data' }                    // data = cạnh `inputs` (nét chấm)
Note   { id, text, author: 'user'|'ai', targetIds: id[], kind: 'note'|'comment'|'review' }
Result { nodeId, runId, output: json, artifacts: path[] }
```

Vị trí và kích thước **không** nằm trong IR mà nằm trong store của tldraw (lưu
cùng `canvas.json`). AI không bao giờ đặt tọa độ.

Khi gửi cho model, IR được in thành dạng text gọn, dễ đọc cho model yếu (dạng
dòng `id | title | kind | parent | in → out`, cạnh `a -[label]-> b`). *Builder quyết
định dạng cụ thể, kèm test.*

### 6.2 Canvas (tldraw)

- Custom shape `wf-node`: tiêu đề, kind (màu), dòng in/out nhỏ, huy hiệu trạng
  thái chạy, có thể là container (khung chứa node con). Với container, dùng `frame`
  của tldraw hoặc shape riêng có thể làm cha. *Builder quyết.*
- Mũi tên tldraw gắn (bind) vào `wf-node`, nhãn của mũi tên = `label`.
- Lớp tự do: note, text, highlight, vẽ tay của tldraw. Comment ghim là một note có
  `targetIds`.
- Ghost: shape đề xuất có `meta.proposalId`, nét đứt tím, không vào IR "chính" cho
  tới khi được nhận.
- Card kết quả: shape `wf-result` đặt cạnh node, hiện output JSON gọn, ảnh hoặc
  link artifact, phóng to để đọc.
- Đồng bộ: mọi thay đổi trên store tldraw → tính lại IR (hàm thuần
  `storeToIR`). Hiệu của IR kể từ lượt AI trước được lưu lại để gửi kèm.

### 6.3 Ops và proposal

AI không sửa canvas trực tiếp. AI trả về danh sách op:

```
add_node{tempId,title,kind?,parent?,after?,inputs?,outputs?,description?}
update_node{id, ...fields}     delete_node{id}     set_parent{id,parent|null}
add_edge{from,to,label?,type?} update_edge{id,label?}  delete_edge{id}
add_note{targets[],text,kind:'review'|'note'}
```

- Server validate bằng zod và kiểm tra tham chiếu (id tồn tại, không tạo vòng
  cha-con). Op sai thì gửi lỗi lại cho model sửa (tối đa N lần), op không cứu được
  thì bỏ và báo cho người dùng biết.
- Client áp ops thành ghost shapes. Vị trí của node mới do **layout tất định**
  (elkjs layered) tính, chỉ cho node mới; node đã có vị trí thì giữ nguyên. Riêng
  node có `after: X` thì được chèn vào luồng sau X, đẩy các node sau đó ra chỗ khác
  (chỉ đẩy các node ghost/mới, hoặc dịch nguyên một dải; *builder quyết, nhưng
  không được phá vị trí người dùng đã kéo*).
- Proposal bar: Nhận tất cả / Chọn từng cái (tick từng ghost) / Bỏ. Nhận thì ghost
  thành shape thật. Toàn bộ thao tác nhận là một mục undo.
- Nhận xét của AI (`add_note kind=review`) hiện ngay như note màu cam gắn vào node,
  không cần duyệt, và có nút "bỏ qua".

### 6.4 AI orchestrator (làm cho model yếu vẫn chạy tốt)

- **Prompt theo việc:** mỗi tag/ý định có system prompt ngắn riêng (review,
  expand, suggest, explain, chat tự do, export). Không dùng một prompt to cho tất cả.
- **Ngữ cảnh mỗi lượt:** IR dạng text + hiệu IR từ lượt trước + node đang chọn hoặc
  ghim + note của người dùng gắn vào các node đó + vài tin nhắn chat gần nhất + tin
  nhắn hiện tại.
- **Đầu ra:** model trả về `{reply: string, ops: Op[]}`. Server tách JSON, validate,
  tự sửa qua vòng lặp (gửi lỗi validate lại cho model).
- **Đánh giá:** bộ test hồi quy offline cho orchestrator, gồm các IR mẫu (ví dụ
  video lịch sử) cộng yêu cầu cộng kỳ vọng ở mức cấu trúc (ví dụ `/review` trên sơ
  đồ "Tạo map → Generate" phải có note nhắc chuyện dữ liệu không khớp). Chạy bằng
  model thật, tách khỏi unit test. Đây là bằng chứng cho mục "model yếu vẫn chạy tốt".
- Gọi Pi: `pi -p --mode json --no-tools --no-session --model fai/Alibaba:DeepSeek-V4.1-Flash`
  (hoặc `--mode rpc` nếu cần giữ phiên). Builder kiểm tra định dạng output của Pi
  rồi chọn. Model và lệnh để trong config.

### 6.5 Chat và `/tag`

- Chat panel bên phải. Node đang chọn hiện thành chip trong ô nhập.
- Tag trong chat: `/review` (cả sơ đồ hoặc phần đang chọn), `/expand` (bung node
  đang chọn thành các bước trên luồng chính, hoặc bước con nếu thật sự thuộc về nó),
  `/suggest`, `/explain`, `/export`, `/run`.
- Tag trong comment ghim vào node: viết `/expand` trong note gắn vào node rồi gửi
  (ví dụ bằng nút gửi trên note) cũng kích hoạt AI với node đó làm đích.
- Lịch sử chat lưu trong `chat.jsonl` của project.

### 6.6 Xuất và chạy D2W

- **Chốt:** người dùng bấm "Chốt sơ đồ", các node chuyển sang `locked` (vẫn sửa
  được khi mở khóa).
- **Ánh xạ IR → D2W:**
  - Node lá trên luồng thành step. Container chỉ để gom nhóm: các node con của nó
    được nối vào luồng theo cạnh bên trong, và tên container đưa vào `description`
    hoặc `notes` của step. Container không có con thì bản thân nó là một step.
  - Cạnh `flow` thành `next`, cạnh `data` thành `inputs`.
  - Thiếu `kind`, schema, prompt thì AI (Pi) điền bằng prompt "export" theo đúng
    `workflow-format.md`. Kết quả qua `d2w check`; có lỗi thì lặp sửa.
  - Rẽ nhánh song song trên canvas thì báo cho người dùng biết là D2W chạy tuần tự,
    và AI đề xuất thứ tự.
  - Fan-out (ví dụ "lặp cho mỗi prompt") nằm trong một step (agent/code tự lặp).
- **Project D2W** sinh ra ở `projects/<name>/d2w/` bằng `d2w new` hoặc `d2w init`.
  Step `code` cần file `steps/<id>.py`: dùng Pi ở chế độ agent (có tool
  read/write/edit) để viết, rồi `d2w check`.
- **Chạy:** server chạy `d2w run --input ...` (hoặc `d2w eval --case` để step
  `human` tự đồng ý), theo dõi `runs/<run_id>/` (state.json, các thư mục
  `NNN-step/`) và stream trạng thái về client. Node hiện trạng thái (chờ, chạy,
  xong, lỗi), card kết quả hiện cạnh node, artifact được phục vụ qua server.
- **Step human:** ở bản này, khi chạy từ Living Canvas, dùng chế độ eval (tự đồng ý)
  và việc duyệt diễn ra trên canvas (người dùng comment lên kết quả rồi chạy lại).
  *Builder quyết; ghi lại nếu cần đổi.*

### 6.7 Lưu trữ

`projects/<name>/canvas.json` (snapshot tldraw, có meta IR), `chat.jsonl`,
`d2w/` (project D2W). Lưu tự động, có debounce. Có nút xuất Mermaid để chia sẻ.

## 7. Thứ tự làm (builder quyết)

1. **M1: Canvas + IR + chat + proposal:** node, mũi tên nhãn, container, note;
   IR hai chiều; chat gọi Pi; ops thành ghost, Nhận/Chọn/Bỏ; layout tất định; lưu project.
2. **M2: Review và tag:** `/review` `/expand` `/suggest` `/explain`, note của AI,
   comment ghim có tag, bộ đánh giá orchestrator.
3. **M3: Xuất D2W:** chốt, IR → workflow.md, Pi điền phần thiếu, `d2w check`.
4. **M4: Chạy và kết quả trên canvas:** run, stream trạng thái, card kết quả,
   comment lên kết quả, chạy lại.

Mỗi mốc dùng được ngay và demo được với ví dụ video lịch sử.

## 8. Để builder quyết

Cấu trúc thư mục, framework server (Express/Fastify/Hono), cách đóng gói, định
dạng IR dạng text cho model, chi tiết thuật toán layout, giới hạn số lần tự sửa,
style giao diện, cách gọi Pi (`json` hay `rpc`).

## 9. Câu hỏi còn mở (không chặn M1–M2)

- Ánh xạ container sang D2W như §6.6 đã đúng ý người dùng chưa, hay container nên
  là một step `agent` lớn.
- Step `human` của D2W nên duyệt trên canvas hay mở trang review của D2W.
