# Living Canvas

Canvas vô hạn nơi người và AI cùng thiết kế workflow. Bạn chat, comment, kéo thả;
AI đề xuất thay đổi ngay trên sơ đồ (nét đứt tím), bạn nhận hoặc bỏ. Mục tiêu cuối
là sơ đồ chốt xong thì chuyển thành workflow chạy được qua [D2W](https://github.com/Arrogant-Wind/D2W)
và hiện kết quả của từng bước trên canvas.

Vì sao: brainstorm workflow bằng chat thì nghe hợp lý, đến lúc code mới lộ ra các bước
quá thô (thiếu bước con) hoặc không khớp dữ liệu (bước sau cần thứ bước trước không tạo
ra). Living Canvas làm hai chuyện đó hiện ra sớm: bằng hình cho người nhìn, và bằng mô
hình dữ liệu để AI soát.

Chạy với một model nhỏ (DeepSeek V4.1 Flash qua [Pi](https://pi.dev)): độ tin cậy đến từ
framework (schema, kiểm tra thao tác, vòng tự sửa, layout bằng code) chứ không dựa vào
model giỏi.

## Trạng thái

Đã có (mốc M1 và các cải tiến sau đó):

- Canvas [tldraw](https://tldraw.dev): ô workflow (tên, loại `agent` / `llm` / `code` /
  `human`), mũi tên gấp khúc có nhãn dữ liệu, khung chứa ô con, note và comment ghim vào ô.
- Rê chuột vào ô để xem mô tả, input, output và schema (JSON) của nó.
- Chat với AI, kèm lệnh `/review`, `/expand`, `/suggest`, `/explain`. AI trả lời bằng thao
  tác (thêm/sửa/xóa ô, nối mũi tên, đổi khung, ghi nhận xét). Thao tác được kiểm tra, sai
  thì gửi lỗi lại cho model sửa (tối đa 2 lần).
- Đề xuất của AI hiện mờ trên canvas: **Nhận tất cả**, **Chọn từng cái** hoặc **Bỏ**.
  Một lần Ctrl+Z hoàn tác cả lần nhận. Nhận xét của AI hiện ngay thành note cam.
- AI không bao giờ đặt tọa độ. Ô mới được đặt bằng code, ô bạn đã kéo không bị xê dịch.
- Phát hiện chồng chéo bằng code (ô đè ô, mũi tên xuyên qua ô, nhãn đè nhau, note đè
  ô) và **Sắp xếp lại** bằng [ELK](https://eclipse.dev/elk/): xếp theo luồng, xếp cả
  khung lồng nhau, chừa chỗ cho nhãn, luồng dài thì xuống hàng kiểu zigzag theo tỉ lệ
  màn hình. Có xem trước với **Giữ** / **Hoàn tác**.
- Tự lưu từng project, hiện trạng thái lưu, thử lại khi server lỗi.

Chưa có (xem [tài liệu thiết kế](docs/superpowers/specs/2026-11-04-living-canvas-design.md)):

- **M2:** tinh chỉnh review và tag (gửi tag từ comment ghim trên ô, bộ đánh giá lớn hơn).
- **M3:** chốt sơ đồ và xuất ra project D2W (`workflow.md`, steps, `d2w check`).
- **M4:** chạy workflow, hiện trạng thái và kết quả cạnh từng ô, comment lên kết quả rồi chạy lại.

## Cần có

- Node.js 22 trở lên và npm.
- [Pi](https://pi.dev) (lệnh `pi`) đã cấu hình một provider có model dùng cho AI. Mặc định
  là `fai/Alibaba:DeepSeek-V4.1-Flash`; đổi bằng biến `LC_MODEL` (xem bên dưới). Model chỉ
  cần nhận text: AI đọc sơ đồ dưới dạng dữ liệu có cấu trúc, không đọc ảnh.

Thử Pi trước khi chạy app:

```bash
pi -p --no-tools --model "fai/Alibaba:DeepSeek-V4.1-Flash" 'Trả về đúng JSON {"ok":true}'
```

## Chạy

```bash
npm install
npm run dev
```

Mở <http://localhost:5173>. Server API chạy ở `127.0.0.1:8787` (chỉ nhận kết nối từ máy
này); Vite chuyển `/api` sang đó.

Mỗi project là một thư mục trong `projects/` (không đưa lên git). Mặc định là `demo`;
mở project khác bằng `?p=<ten-project>`, ví dụ <http://localhost:5173/?p=video-lich-su>
(tên chỉ gồm chữ thường, số và `-`).

## Dùng

| Việc | Cách làm |
|---|---|
| Thêm bước / khung | Nút **+ Bước**, **+ Khung** bên trái. Kéo ô vào khung để thành ô con. |
| Sửa ô | Chọn ô, sửa ở bảng bên trái: tên, loại, nhận vào, trả ra, schema vào/ra, mô tả. Double-click để sửa tên ngay trên ô. |
| Nối bước | Công cụ mũi tên của tldraw, kéo từ ô này sang ô kia. Gõ nhãn là dữ liệu chảy qua. |
| Ghim comment | Chọn ô, bấm **💬 Comment**. AI đọc comment này cùng sơ đồ. |
| Nhờ AI | Gõ ở khung chat. Ô đang chọn hiện thành chip và được gửi kèm. Gõ `/` để xem lệnh. |
| Duyệt đề xuất | Thanh phía trên canvas: **Nhận tất cả**, **Chọn từng cái**, **Bỏ**. |
| Dọn sơ đồ | Bấm chip "N chỗ chồng chéo · Sắp xếp lại" hiện ở chỗ rối, hoặc nút **⇄ Sắp xếp lại** (đang chọn khung thì xếp trong khung, không chọn gì thì xếp cả sơ đồ). |

Lệnh trong chat:

- `/review`: soát lỗi logic, bước thiếu, dữ liệu không khớp, nhánh lỗi chưa xử lý. Mỗi vấn đề là một note gắn vào ô liên quan.
- `/expand`: bung ô đang chọn thành các bước chi tiết (trên luồng chính, hoặc làm ô con nếu thật sự thuộc về ô đó).
- `/suggest`: đề xuất sửa sơ đồ bằng thao tác cụ thể.
- `/explain`: giải thích ô đang chọn.

## Cấu hình

Biến môi trường cho server:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `LC_MODEL` | `fai/Alibaba:DeepSeek-V4.1-Flash` | Model Pi dùng cho AI |
| `LC_PI_BIN` | `pi` | Đường dẫn lệnh Pi |
| `LC_TIMEOUT_MS` | `120000` | Thời gian tối đa cho một lần gọi model |
| `LC_PROJECTS_DIR` | `./projects` | Nơi lưu project |
| `LC_PORT` | `8787` | Cổng server |

## Cấu trúc

```
shared/   IR (mô hình sơ đồ), kiểm tra và áp thao tác, in sơ đồ thành text cho model,
          đặt ô mới, phát hiện chồng chéo, sắp xếp bằng ELK. Hàm thuần, có test.
server/   Hono: lưu project, gọi Pi, orchestrator (prompt theo lệnh, vòng tự sửa).
web/      Vite + React + tldraw: shape ô workflow, chuyển canvas thành IR, đề xuất mờ,
          chat, thẻ hover, sắp xếp lại, tự lưu.
docs/     Tài liệu thiết kế và plan.
```

Luồng một lượt chat: canvas → IR (`storeToGraph`) → server dựng prompt (sơ đồ dạng text,
thay đổi từ lượt trước, ô đang chọn, vài tin gần nhất) → Pi → tách JSON, kiểm tra thao
tác, tự sửa → client dựng đề xuất mờ và đặt chỗ cho ô mới.

## Kiểm thử

```bash
npm test
```

Bộ đánh giá với model thật (tốn lượt gọi model; mỗi case chạy `LC_EVAL_RUNS` lần):

```bash
LC_EVAL_RUNS=3 npm run eval -w server
```

Lần chạy gần nhất với DeepSeek V4.1 Flash: 18/18 đạt (6 case × 3 lần).

## Giới hạn hiện tại

- Một người dùng, chạy trên máy cá nhân. Mở cùng một project ở hai tab thì tab lưu sau ghi đè tab trước.
- Phát hiện chồng chéo chưa kiểm tra mũi tên chạy trùng lên mũi tên khác.
- Mũi tên do tldraw tự vẽ đường đi; ELK chỉ quyết định vị trí ô và chừa chỗ cho nhãn.
- tldraw cần license key khi dùng cho sản phẩm thương mại; bản dùng thử có watermark.
