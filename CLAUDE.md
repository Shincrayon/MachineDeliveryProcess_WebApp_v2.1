# TienDoMayVe WebApp v2.1 — ghi chú cho người phát triển

App 1 file `index.html` (GitHub Pages) + `metrics.js` + `export.js` + `catalog_sync.js` + `name_std.js`, dữ liệu trên Supabase.
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

## Liên kết Tiến độ → Danh mục MMTB (migration 10, `catalog_sync.js`)
- Liên kết: `mmtb_machines.tracking_machine_id` = `machines.id` (UNIQUE, xoá hẳn máy Tiến độ → gỡ liên kết). Mã Tiến độ (`ma_may`)
  KHÔNG lưu bên Danh mục — app tra qua liên kết. `needs_info` = "Cần bổ sung"; `tracking_synced_at` = lần đồng bộ cuối.
- Một chiều, chạy TRONG APP sau khi giải mã (2 bảng mã hoá `sec`) — không dùng trigger DB. Lưu Tiến độ trước, đồng bộ sau
  (`CS.afterSave`, gọi từ `quSaveOne`, `saveMachine`→`csAfter`, `importMachines`); lỗi đồng bộ chỉ báo, không làm hỏng lần lưu.
  Hàng chờ / lệch không có bảng riêng: tính lại mỗi lần bằng `CS.planAll` (so 2 bên sau giải mã).
- Điều kiện: có `ma_may`. Chưa liên kết + có `nghiemthu_tt` → tạo hồ sơ mới (mã tạm `tempCode`, `code_temp`, `needs_info`,
  `source_ref = "Từ Tiến độ máy về · <ma_may>"`); không xác định công ty (KXD) → không tạo.
- Trạng thái: về NM → `arrived` · lắp đặt / chạy thử → `installing` · nghiệm thu → `in_operation` + `commissioned_date`.
  Không bao giờ hạ trạng thái. Mốc `delivery_milestones`: arrived_site = venm_tt, installed = chaythu_tt, commissioned = nghiemthu_tt.
- Trường chung (model, serial, xuất xứ, công suất, hợp đồng, NCC, công ty, ngày nghiệm thu, mốc): Danh mục trống → điền; khác → "lệch",
  không ghi (admin chọn giữ bên nào ở ⚖️ Lệch dữ liệu; "Giữ Danh mục" ghi ngược về Tiến độ).
- KHÔNG BAO GIỜ ghi bên Danh mục: khu vực, chuyền, máy cha, vai trò, vật liệu, mã tài sản, mã máy đã có, ghi chú, kỹ sư, người quản lý.
  Tên máy chỉ dùng khi tạo mới, không tính lệch. **Tên máy bên Tiến độ không bao giờ bị sửa.**
- NCC: khớp tên đã bỏ dấu / không phân biệt hoa thường với `suppliers`; không khớp → để trống + cảnh báo, KHÔNG tạo NCC mới.
- Mọi ghi vào `mmtb_machines` mã hoá lại cả gói `sec` (giữ các trường không đổi); nhật ký: trigger `mmtb_audit_trg` → `audit_log` (`MMTB_*`).
- Admin: nút 🔗 Danh mục (trang Danh sách) → 🧩 Ghép cặp (đề xuất + file `GhepCap_TienDo_DanhMuc_YYYY-MM-DD.xlsx`, chỉ ghi dòng đã tick),
  🔄 Đồng bộ lại (xem trước rồi ghi), ⚖️ Lệch dữ liệu.

Triển khai: chạy `20261101_10_link_tracking_catalog.sql` (sau 09; câu kiểm tra cuối ra `so_cot = 3`) → admin 🔗 → Ghép cặp → duyệt → Ghi liên kết
→ Đồng bộ lại → xử lý Lệch. File GhepCap chứa dữ liệu đã giải mã — không đưa vào git.

## Tên tài sản chuẩn — Danh mục MMTB (migration 11, `name_std.js`)
- Mẫu: `<Loại thiết bị> <Vật liệu> <Đặc điểm> <Công suất + đơn vị>`, VD `Máy băm PET 3 t/h`; nhiều vật liệu `PET/HDPE`.
  Đơn vị viết tắt quốc tế: `kg/h · t/h · m³/h · l/h · kW · mm` (`NS.normUnit`). Trùng tên cùng nhà máy → thêm ` – <Chuyền>` / ` – <Khu vực>` / ` #2` ở cuối.
- Kiểm tra (`NS.issues`) chỉ CẢNH BÁO, không chặn lưu: chưa bắt đầu bằng Loại trong danh sách · đơn vị chưa chuẩn · có tên NCC / model
  trong tên · trùng tên cùng nhà máy · khoảng trắng / chữ đầu.
- Loại thiết bị: bảng `mmtb_equipment_types` (📚 Thư viện › Loại thiết bị, chỉ admin sửa; đổi tên loại → đổi theo trên các máy).
  `equipment_type` của máy chọn từ danh sách này.
- `alias_names` ("Tên gọi khác / tên cũ") mã hoá trong `sec` (nằm trong `SEC.mmtb_machines.f`): mọi chỗ mã hoá lại hồ sơ Danh mục phải
  giữ trường này (form Danh mục gửi `m_alias`; `catalog_sync.js` / `NS.rename` chỉ đưa trường có trên dòng). Đổi sang tên chuẩn → tên cũ tự vào đây.
- Tên chỉ đổi trong Danh mục; tên mua hàng bên Tiến độ (`machines.ten`) không bao giờ đổi.
- Công cụ admin 📚 Thư viện › ✏️ Chuẩn hoá tên: đề xuất (sửa được), gợi ý "loại thường gặp" để thêm nhanh vào danh sách,
  tải `ChuanHoaTen_YYYY-MM-DD.xlsx` → duyệt (cột "Duyệt" ghi x) → nạp lại → Ghi (chỉ dòng đã tick). App biết đã chạy 11 qua `MM.hasTypes`.

Triển khai: chạy `20261102_11_standard_name.sql` (sau 07 / 10; câu kiểm tra cuối ra `co_cot_ten_khac = 1`) → admin bổ sung Loại thiết bị
(dùng nút "loại thường gặp") → ✏️ Chuẩn hoá tên → tải file duyệt → nạp lại → Ghi. File ChuanHoaTen chứa tên đã giải mã — không đưa vào git.

## Thẻ 📈 Phân tích / 🏅 Đánh giá (Tiến độ máy về)
- Phân tích: 5 thẻ chỉ số · thanh xếp hạng NCC (top 8 + "Khác", nút Giá trị / Số máy) · Xuất xứ & nơi lắp đặt (thanh chia theo trạng thái;
  nút Danh sách | 🗺 Bản đồ — bản đồ Leaflet thay chỗ danh sách, chỉ vẽ lần đầu bấm, `initMaps`) · thanh giai đoạn sau khi về + 1 bảng
  Về NM → nghiệm thu (nút Theo công ty | Theo NCC). Bấm 1 dòng / thẻ → `showMachines`.
- Đánh giá: bộ lọc Kỳ đánh giá nằm trên tiêu đề bảng NCC. 1 bảng NCC — hạng `DM.supplierGrade` (metrics.js): **C** = đúng hạn < 50% hoặc trễ TB > 14 ngày · **A** = đúng hạn ≥ 80% và trễ TB ≤ 7 ngày
  · còn lại **B**; mặc định kém nhất lên đầu. 1 bảng xếp hạng nhân sự — điểm = không trễ 50% · số thiết bị 30% · giá trị 20%.

## Mỗi thẻ vừa 1 màn hình (máy tính)
- Mọi thẻ của 2 phân hệ (Tổng quan, Phân tích, Đánh giá, Kế hoạch, Danh sách · Danh mục: Tổng quan, Danh sách, Thư viện) phải vừa 1 màn hình
  ở 1536×864 và 1920×1080: trong `@media(min-width:1100px) and (min-height:640px)` trang là flex cột, thẻ dài cuộn BÊN TRONG thẻ
  (tiêu đề cột sticky). Điện thoại / màn thấp: cuộn trang như thường.
- Kiểm tra: `analytics_eval_test.py` (bước [26]) và `onescreen_mmtb_check.py` (Danh mục, 60 máy, cả 8 thẻ Thư viện).

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
