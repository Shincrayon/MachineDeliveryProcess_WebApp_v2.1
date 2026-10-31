# TienDoMayVe WebApp v2.1 — ghi chú cho người phát triển

App 1 file `index.html` (GitHub Pages) + `metrics.js` + `export.js`, dữ liệu trên Supabase.
Dữ liệu máy được mã hoá trong trình duyệt (cột `sec`); không gửi bản rõ lên Supabase, không đưa tên NCC vào URL.

## Hai loại định danh của máy (bảng `machines`)

| | ID hệ thống | Mã máy |
|---|---|---|
| Cột | `id` (uuid) | `ma_may` |
| Có từ khi | tạo dòng | máy **đã về** (có `venm_tt` – Ngày máy về NM TT) |
| Dùng để | **khoá khớp dòng** khi nạp / xuất Excel; liên kết bảng khác (thanh toán, checklist…) | định danh tài sản cho người dùng (dán nhãn, tìm kiếm, báo cáo) |
| Trên giao diện | không hiện | cột đầu bảng, popup, Gantt… |
| Trong Excel (⬇️ Excel) | cột **cuối** "ID hệ thống" — ghi chú "KHÔNG SỬA" | cột **đầu** "Mã máy" — chỉ đọc |

Quy tắc Mã máy:
- Định dạng `<MÃ CÔNG TY>-<NĂM VỀ>-<STT 3 số>`, VD `DTR-2026-001`. Công ty lấy từ Nơi lắp đặt (DTR DAL DOL KN TDP TT, không xác định → `KXD`). Năm = năm của `venm_tt`.
- STT tăng theo công ty + năm trong `machine_code_seq`; không dùng lại số đã cấp.
- Cấp tự động phía DB (trigger `machines_code_trg`) khi `venm_tt` đổi từ trống sang có ngày và máy chưa có mã — mọi đường ghi (Cập nhật nhanh, Xác nhận hàng loạt, nạp Excel, thêm máy) đều đi qua trigger. App không tự tính mã.
- Mã đã cấp **không đổi**, kể cả khi sửa / xoá `venm_tt`. Máy có mã nhưng mất ngày về → app cảnh báo ⚠ "Máy đã có mã nhưng mất ngày về TT".
- Chỉ admin đổi được mã (đổi tay → bộ đếm nhảy theo).
- Ràng buộc DB (migration 08): `venm_tt is null or ma_may is not null`; `ma_may` UNIQUE (cho phép NULL).

Nạp Excel (`import_machines_by_id`): có ID → cập nhật đúng máy; không có ID → máy mới (hỏi xác nhận);
ID không có / lặp → dừng, không ghi gì; cột Mã máy trong file bị bỏ qua (khác DB thì cảnh báo);
file không có cột "ID hệ thống" khi app đã có dữ liệu → chặn. Máy không có trong file giữ nguyên.

## Lắp đặt – Nghiệm thu (sau khi máy về; migration 09)
| Cột | Nhãn | Sửa ở |
|---|---|---|
| `nghiemthu_kh` | Ngày nghiệm thu KH | form Sửa đầy đủ / Thêm máy |
| `lapdat_tt`, `chaythu_tt`, `nghiemthu_tt` | Bắt đầu lắp đặt / Chạy thử / Nghiệm thu TT | ⚡ Cập nhật nhanh (nhóm 3, khoá khi chưa có `venm_tt`) |
| `ghichu_ld` | Ghi chú lắp đặt | ⚡ Cập nhật nhanh — **mã hoá trong `sec`** cùng giải trình |

- Trạng thái + cảnh báo chỉ tính ở `DM.installStatus` (metrics.js); `x.status` vẫn là trạng thái ngày về (`DM.arrivalStatus`), không đổi.
  `installing` = đã về + có ngày lắp đặt hoặc chạy thử, chưa nghiệm thu · `in_operation` = đã về + có ngày nghiệm thu TT.
  Cảnh báo: `wait_install` (về > `APP_CONFIG.INSTALL_WAIT_DAYS` ngày — mặc định 30 trong config.js — chưa có ngày lắp đặt nào),
  `late_accept` (quá Ngày nghiệm thu KH, chưa nghiệm thu). Có ngày lắp đặt mà mất `venm_tt` → không tính giai đoạn, cảnh báo ⚠.
- Không nằm trong `REC_KEYS` (form Sửa không ghi đè). `ghichu_ld` nằm trong `SEC.machines.f`: mọi chỗ mã hoá lại `sec`
  (saveMachine, nạp Excel, Cập nhật nhanh, cắt tên) phải đưa ghi chú đang có vào gói, nếu không sẽ mất ghi chú.
- Cột mới chỉ gửi khi có giá trị → app chạy được trên DB chưa có 09 (lưu ngày lắp đặt thì báo "cần chạy 09").
- Thẻ KPI "Chờ nghiệm thu" và bảng Phân tích "Về NM → nghiệm thu" tính trên mọi kỳ (không theo tháng / năm).

Triển khai: Supabase > SQL Editor chạy `20261031_09_install_lifecycle.sql` (sau 07; chạy lại an toàn; câu kiểm tra cuối ra `so_cot = 5`).
File Excel xuất trước bản này vẫn nạp lại được — dữ liệu lắp đặt của máy giữ nguyên.

## Quy ước làm việc
- Migration mới = file mới trong `supabase/migrations/` (không sửa file đã có). Thư mục `supabase/` không nằm trong git.
- Người dùng tự chạy migration trên Supabase và tự commit / push; hỏi trước khi làm gì trên Supabase thật.
- Làm trên nhánh riêng; lập kế hoạch và chờ xác nhận trước khi code.
- Bộ test (Playwright + PGlite) để ở `..\_dev_tests_TienDoMayVe\` (ngoài repo): `python <test>.py <thư mục app>`.

## Triển khai Mã máy (code đã merge vào `main` — commit dce2af5)
1. Supabase > SQL Editor: chạy `20261031_05_machine_code.sql` (bỏ qua nếu đã chạy) rồi `20261031_07_machine_code_on_arrival.sql`.
   Lần chạy đầu 07 gỡ mọi mã do 05 tự cấp; câu kiểm tra cuối file phải ra `co_ma = 0`.
   Trước khi chạy 07: 📂 Nạp Excel báo "cần chạy 05 rồi 07" (không ghi gì); KHÔNG bấm 🏷.
2. Admin bấm 🏷 Cấp mã máy → Tải file đề xuất `DeXuat_MaMay_YYYY-MM-DD.xlsx` (sheet 2: máy quá hạn chưa xác nhận) → duyệt → tick "đã duyệt" → Ghi mã.
   Nên làm ngay sau bước 1 để STT trong năm theo đúng thứ tự ngày về.
3. Chạy `20261031_08_machine_code_arrived_check.sql` (dừng lại nếu còn máy đã về chưa có mã).
4. Từ đây: nhập Ngày máy về NM TT là máy có mã. File Excel xuất trước bản này không nạp lại được — xuất file mới.

`20261031_06_machine_code_not_null.sql` đã bỏ (chưa từng chạy) — thay bằng 08.
