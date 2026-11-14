# TienDoMayVe WebApp v2.1 — ghi chú cho người phát triển

App 1 file `index.html` (Vercel, https://machinestracking.vercel.app/ — push `main` là tự lên bản mới) + `metrics.js` + `export.js` + `catalog_sync.js` + `name_std.js` + `motion.js` + `multi_pick.js` + `combo.js` + `page_fit.js` + `users_admin.js`, dữ liệu trên Supabase.
Dữ liệu máy được mã hoá trong trình duyệt (cột `sec`); không gửi bản rõ lên Supabase, không đưa tên NCC vào URL.

## Hai loại định danh của máy (bảng `machines`)

| | ID hệ thống | Mã máy |
|---|---|---|
| Cột | `id` (uuid) | `ma_may` |
| Có từ khi | tạo dòng | máy **đã về** (có `venm_tt` – Ngày máy về NM TT) |
| Dùng để | **khoá khớp dòng** khi nạp / xuất Excel; liên kết bảng khác (thanh toán, checklist…) | định danh tài sản cho người dùng (dán nhãn, tìm kiếm, báo cáo) |
| Trên giao diện | không hiện | **chỉ trong cửa sổ chi tiết** khi bấm vào máy (cả Danh mục MMTB). Không hiện ở bảng Danh sách, Tổng quan, Kế hoạch, tooltip (user chốt 2026-11-10). Ô tìm kiếm vẫn tìm theo mã; form Sửa, ⚡, 🏷, Tên chuẩn vẫn hiện |
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
  `installing` = đã về + có ngày lắp đặt (hoặc chỉ có Ngày chạy thử TT ở tương lai), chưa nghiệm thu
  · `testing` (🧪 Đang thử nghiệm) = đã về + Ngày chạy thử TT ≤ hôm nay, chưa nghiệm thu
  · `in_operation` = đã về + có ngày nghiệm thu TT.
  Ngày chạy thử TT > hôm nay chỉ là kế hoạch: `s.trialPlan = true`, máy vẫn `installing`, chi tiết ghi "(kế hoạch — sau hôm nay)",
  thanh mốc hiện "(dk)", không ghi mốc `installed` sang Danh mục. `testing` là bậc riêng ở mọi nơi (lọc Danh sách, Tổng quan, phễu,
  Phân tích, xuất file); riêng Danh mục không có `testing` nên đồng bộ thành `installing`. Test: `e2e_trial_test.py`.
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
- Điều kiện: có `ma_may`. Chưa liên kết + `nghiemthu_tt` đã qua đủ `WAIT_DAYS` = 10 ngày (mọi máy, 2026-11-13; chưa đủ → skip `wait_days`,
  popup ghi "(từ dd/mm/yyyy)"; bài test đặt `window.CS_WAIT_DAYS`) → tạo hồ sơ mới (mã tạm `tempCode`, `code_temp`, `needs_info`,
  `source_ref = "Từ Tiến độ máy về · <ma_may>"`); không xác định công ty (KXD) → không tạo.
- Trạng thái: về NM → `arrived` · lắp đặt / đang thử nghiệm (`testing`) → `installing` · nghiệm thu → `in_operation` + `commissioned_date`.
  Mốc `installed` = chaythu_tt chỉ khi ≤ hôm nay.
  Không bao giờ hạ trạng thái. Mốc `delivery_milestones`: arrived_site = venm_tt, installed = chaythu_tt, commissioned = nghiemthu_tt.
- Trường chung (model, serial, xuất xứ, công suất, hợp đồng, NCC, công ty, ngày nghiệm thu, mốc): Danh mục trống → điền; khác → "lệch",
  không ghi (admin chọn giữ bên nào ở ⚖️ Lệch dữ liệu; "Giữ Danh mục" ghi ngược về Tiến độ).
- KHÔNG BAO GIỜ ghi bên Danh mục: khu vực, chuyền, máy cha, vai trò, vật liệu, mã tài sản, mã máy đã có, ghi chú, kỹ sư, người quản lý.
  **Tên máy (2026-11-14): máy đã liên kết thì tên Danh mục LUÔN theo tên Tiến độ** (ghi đè mỗi lần đồng bộ, không tính lệch; tên cũ Danh mục
  nối vào `alias_names`). Danh mục khoá ô Tên của máy đã liên kết (`m_name.readOnly` + `#m_nameLock` → mở máy bên Tiến độ); `nameIss` trả []
  cho máy đã liên kết nên ✏️ Chuẩn hoá tên bỏ qua; 🩺 có mục `name_diff`. Máy đã ghép cặp mà bên Tiến độ CHƯA có `ma_may` (chưa về NM): `plan` vẫn trả `update` CHỈ với tên (`nameFollow`), mọi trường khác chờ có mã. **Tên máy bên Tiến độ không bao giờ bị sửa.** Test: `e2e_name_follow_test.py`.
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
- Riêng Danh sách của 2 phân hệ không cuộn cả bên trong thẻ: `page_fit.js` (window.PF) tính số dòng mỗi trang theo chỗ trống, mọi dòng cao bằng `--list-row`,
  chữ dài 1 dòng có "…" (rê chuột thấy đủ). Đổi cỡ cửa sổ giữ máy đầu trang đang xem. Điện thoại / màn thấp: Tiến độ 10, Danh mục 50 máy mỗi trang, cuộn như cũ. Test: `e2e_list_fit_test.py`.

## Quản lý người dùng (nút 👥, chỉ admin)
- `users_admin.js` (window.UA) gọi Edge Function `manage-users` (`supabase/functions/manage-users/index.ts`, repo sao lưu). Hàm giữ service role, tự xác minh JWT + quyền admin; chỉ nhận origin link Vercel và Live Server (link xem trước của Vercel không dùng được).
- **Chỉ admin cần mật khẩu dữ liệu.** Quyền khác chỉ cần email + mật khẩu: khoá dữ liệu gói riêng cho từng người trong bảng `user_keys` (migration 16).
- Mật khẩu gõ vào tách bằng PBKDF2 (`CRYPTO.loginKeys`, salt `'tdmv-login-v1|' + email chữ thường`) thành `auth_pw` (Supabase chỉ thấy chuỗi này) và wrap key (không rời trình duyệt). Không cắt khoảng trắng của mật khẩu.
- Đăng nhập: thử `auth_pw`; chỉ khi bị từ chối vì sai mật khẩu mới thử mật khẩu gốc (tài khoản cũ / đặt tay trên Supabase), vào được thì tự chuyển sang `auth_pw`. Quyền khác admin mở bản gói ngay lúc đăng nhập và KHÔNG BAO GIỜ có ô nhập trong `cryptoGate`: khoá nhớ ở `localStorage['tdmv_kd']` (kèm email, chỉ người không phải admin; xoá khi Đăng xuất, khi email khác, khi là admin) nên tab mới vào thẳng. Không mở được bản gói lúc đăng nhập (`sessionStorage['tdmv_w']` = '1') → màn hình "chưa được kích hoạt, nhờ admin Đặt lại mật khẩu"; mất khoá nhớ → "Đăng nhập lại". Chỉ admin nhập mật khẩu dữ liệu (mỗi tab, sai 5 lần → PIN).
- Mật khẩu tạm sinh ở trình duyệt admin (`UA.randomPassword`); hàm chỉ nhận `auth_pw` + `wrapped`, cần tab admin đang mở khoá. Cờ `user_metadata.must_change_pw` buộc đổi mật khẩu SAU `cryptoGate` (`UA.forceChangePw`, cần khoá để gói lại). Mật khẩu tối thiểu 10 ký tự, chặn ký tự ngoài ASCII (bộ gõ tiếng Việt), ở cả nút 🔑.
- `auth_pw` = `'Aa1!'` + 64 hex (tiền tố để qua yêu cầu ký tự mật khẩu của Supabase). Đổi mật khẩu (`changeOwnPassword`): lưu bản gói mới kèm bản cũ (`wrapped_prev`) TRƯỚC, rồi `updateUser`, xong mới xoá bản cũ — đổi lỗi thì mật khẩu cũ vẫn mở được.
- Bước thử mật khẩu gốc bị bỏ khi máy đã nhớ email đã chuyển (`localStorage['tdmv_pwv']`) hoặc `LEGACY_LOGIN: false` trong `config.js`. Đã chuyển = `user_metadata.pw_v = 1`; câu đếm người chưa chuyển ở cuối migration 16.
- Đặt mật khẩu trực tiếp trên Supabase hoặc đổi email của tài khoản: đăng nhập được nhưng không mở được bản gói, phải Đặt lại mật khẩu trong app.
- Không thao tác được lên chính mình, nên luôn còn ít nhất 1 admin; hạ 1 trong 2 admin cuối phải bấm xác nhận. Thu hồi: xoá `app_users` → `user_keys` → tài khoản. Nhật ký: `user_admin_log` (migration 15), chỉ service role ghi.
- Triển khai: migration 15 → 16 → Supabase › Edge Functions: dán `index.ts` vào `manage-users`, Deploy → merge app (làm liền nhau: hàm mới + app cũ hoặc ngược lại thì thêm người lỗi). `02_users.sql` để dự phòng khi hàm lỗi.
- Test: `users_fn_test.py` (logic hàm, deps giả), `e2e_users_admin_test.py` (giao diện, hàm giả), `e2e_user_keys_test.py` (tách mật khẩu, RLS `user_keys`, đăng nhập với Supabase Auth giả có kiểm tra mật khẩu). Hàm và Auth thật chỉ thử được sau khi triển khai.

## Quyền viewer: chỉ Tổng quan + Danh sách (migration 17)
- `viewer` chỉ thấy tab `c1`, `c2`, `p1`, `p3`. `window.__tabOk(id)` (mainSrc, cạnh `showPage`) bỏ các tab khác khỏi thanh tab; `showPage` ở cả 2 phân hệ gọi nó, mở tab khác bằng code thì về Tổng quan của phân hệ đó.
- Không có nút 💳 Thanh toán trong chi tiết máy; `showPayments` thoát ngay với viewer.
- Ẩn tab KHÔNG phải bảo mật. Bảo mật thật: migration 17 cho chỉ `admin`, `editor`, `catalog_editor` đọc `payment_schedule`, `site_readiness`, `milestone_forecast_history`. Viewer vẫn nhận đủ bảng máy (Danh sách cần), nên Phân tích / Đánh giá có mở lại bằng F12 cũng không lộ gì mới.
- Tab hoặc bảng mới chỉ dành cho người sửa: thêm vào chặn ở cả 2 lớp. Test: `e2e_viewer_tabs_test.py`.

## Hiệu ứng chuyển động (`motion.js`, khối CSS "chuyển động" cuối `<style>`)
- Không thư viện ngoài. Mỗi hiệu ứng ≤ 0,4 s (biểu đồ / thanh mốc ~0,8 s). Không thêm hiệu ứng chạy mãi — ngoại lệ: dòng trễ hạn
  (`latePulse`) người dùng muốn giữ nhấp nháy.
- "Giảm chuyển động" của hệ điều hành (`MO.reduced()`): CSS tắt mọi animation / transition, JS không đếm số, biểu đồ không hiệu ứng.
- Tự động qua MutationObserver, không cần gọi: số `.kpi .val` chạy từ số cũ sang mới (bỏ qua ô dạng "8 / 12"); dải KPI hiện lần lượt
  lần đầu; ô sáng `.tab-ink` dưới tab đang chọn; `.pages` trượt ngang khi đổi `body[data-mod]`.
- Gọi tay: `MO.saved(id)` sau khi lưu (đã có trong `quSaveOne`, `saveMachine`, lưu hồ sơ Danh mục) → dòng `tr[data-mo=id]` loé xanh 1 lần
  khi bảng vẽ lại. Bảng mới muốn có hiệu ứng này thì thêm `data-mo` cho dòng. `MO.skel(n)` = khung chờ; `#moBoot` gỡ khi `mainSrc` chạy.
- Popup `.modal-bg` / `.notice-bg` luôn `display:flex`, ẩn bằng `visibility` + `opacity` (đóng mờ dần 0,12 s) — vẫn chỉ bật / tắt class `show`.
- Thanh mốc đầu popup chi tiết: `msTrack(x)` vẽ từ `DM.track(x)` (metrics.js).
- Kiểm tra: `motion_test.py` (cả lượt "giảm chuyển động").

## Ô Tháng / Năm chọn nhiều (`multi_pick.js`, window.MP)
- Tổng quan (`ovMonth/ovYear`), Danh sách (`fMon/fYr`), Đánh giá (`evMonth/evYear`): `MP.make(select)` giữ nguyên ô `<select>` (id, kiểu dáng), bấm vào mở bảng ô tick; tick là lọc ngay (bắn `change`), không có nút áp dụng.
- `sel.value` = các giá trị đã tick nối dấu phẩy theo thứ tự danh sách (`'03,04'`), `''` = tất cả; gán `value` cũng được. Test: đặt `.value` rồi `dispatchEvent(new Event('change'))` — KHÔNG dùng `select_option`.
- Lọc kỳ: `DM.inPeriod(ngày, m, y)` = mọi tổ hợp tháng × năm theo ngày về NM; link `?m=03,04&y=2025,2026` (link cũ 1 tháng vẫn đúng).
- Test: `multipick_test.py`.

## Ngày dự kiến về NM (`vedukienn`) — ai tính, khi nào
- Có `venm_tt` → = `venm_tt`; chưa có nhưng có `capcang_tt` → = cập cảng + TG lãnh máy TT: trigger `machines_actual_sync` (migration 04) tính, mọi đường ghi.
- Chưa có cả hai: app tính = xuất xưởng + TG đi tàu TT + TG lãnh máy TT (form Sửa `calcDates`, nạp Excel, và ⚡ Cập nhật nhanh khi ĐỔI ngày xuất xưởng — `quShip`) rồi gửi kèm `vedukienn` + `danhgia`; trigger giữ nguyên. Xoá ngày xuất xưởng trong Cập nhật nhanh: giữ ngày về cũ. Test: `e2e_quick_test.py` [8g].
- **TG đi tàu / lãnh máy TT trống HOẶC = 0 → lấy KH** ở mọi nơi (nạp Root data, nạp Excel của app, form Sửa — ô TT = 0 hiện trống, Cập nhật nhanh, trigger nhánh cập cảng: `coalesce(nullif(lanhtt,0), lanhkh)`). Trước đây ô trống bị lưu 0 → ngày về = đúng ngày xuất xưởng / cập cảng. Sửa dữ liệu cũ + trigger: `supabase/migrations/20261103_12_tt_theo_kh.sql` (PHẦN 1 xem trước, PHẦN 2 sửa). Test: `e2e_quick_test.py` [8h].

## Hình thức mua — Tiến độ máy về (migration 13, `hinh_thuc_mua`, `hinh_thuc_can_xn`)
- `import` Nhập khẩu trực tiếp · `agency` Qua đại lý · `domestic` Trong nước; trống = chưa chọn. Quyết định theo việc máy CÓ khâu nhập hàng không, KHÔNG suy từ Xuất xứ (nơi sản xuất; máy ngoại mua qua đơn vị trong nước vẫn là nhập khẩu / đại lý, và một số máy VN qua agency vẫn có lãnh máy). Hai cột không mã hoá.
- `domestic`: ẩn tàu chạy + cập cảng (⚡) và 4 ô đi tàu / lãnh máy (form Sửa), thay bằng 1 ô TG vận chuyển lưu vào `ditaukh = ditautt`, `lanh = 0`; thanh mốc bỏ Cập cảng (`DM.track`). Công thức ngày về không đổi: tổng đi tàu + lãnh máy. Form Sửa không cho đổi sang `domestic` khi máy còn ngày tàu chạy / cập cảng.
- `DM.missingTransit`: máy import / agency chưa về NM mà TG đi tàu / lãnh máy (TT, trống thì KH) = 0 → cảnh báo. Không chặn lưu.
- `hinh_thuc_can_xn = true`: giá trị do migration gợi ý. Chỉ tắt khi người dùng TỰ chọn: ⚡ (ô để trống, chọn mới tính), form Sửa khi bấm Lưu, hoặc nạp Excel đổi giá trị. Sửa ngày ở ⚡ không xác nhận.
- Chưa chạy migration: `hasPT()` = false, mọi phần tự ẩn, app chạy như cũ (nên merge app trước, chạy SQL sau). Test: `e2e_purchase_test.py`.

## Thương hiệu — Tiến độ máy về (migration 18, `thuong_hieu`)
- Mã hoá trong gói `sec` như NCC / Model: `SEC.machines.f` chỉ thêm `thuong_hieu` khi dòng đọc về có cột (trong `clean`), để chỗ ghi lại cả gói (⚡, cắt tên, `writeTrack`) không gửi cột chưa tồn tại. Chưa chạy 18: `hasTH()` = false, ô / cột / Excel tự ẩn.
- Bảng Danh sách: cột "Thương hiệu / NCC" (`thCell`): thương hiệu ở trên, NCC dòng nhỏ dưới (user chọn 2026-11-10); máy chưa có thương hiệu thì chỉ NCC như cũ. Cột vẫn sắp theo NCC. Có trong form Sửa (ô chọn, gợi ý thêm thương hiệu bên Danh mục), chi tiết máy, tìm kiếm, Excel (cột trước "Nhà cung cấp"; file không có cột thì giữ giá trị).
- Đồng bộ Danh mục: `thuong_hieu` ↔ `manufacturer`, quy tắc giống model (Danh mục trống thì điền, khác thì vào ⚖️ Lệch). Máy đã liên kết mà Tiến độ trống: admin bấm 🔗 Danh mục › 🏷 Điền thương hiệu từ Danh mục (`csBrand`, ghi bằng `writeTrack`). Migration không điền dữ liệu cũ (giá trị Danh mục đã mã hoá). Test: `e2e_brand_test.py`.

## 🎨 Màu dùng chung + thẻ KPI có hình nhỏ (`chart_theme.js`, window.VZ) — CHỈ HIỂN THỊ
- User yêu cầu: tối ưu giao diện KHÔNG được đụng dữ liệu, KHÔNG đổi logic tính toán; đổi màu/bố cục thì hỏi ý kiến.
- Bảng màu từ skill dataviz (8 màu chuẩn, bước riêng cho sáng/tối), thứ tự vòng đời đã chạy validate_palette.js cả 2 chế độ:
  đặt hàng/chế tạo tím · vận chuyển ngọc · quá hạn cam · đã về xanh dương · lắp đặt vàng · thử nghiệm hồng · vận hành xanh lá; đỏ = Trễ.
  Trạng thái ngày về: chờ về tím, sắp về ngọc, quá hạn cam, đã về xanh dương (cùng màu giai đoạn tương ứng).
- `VZ.life(k)` / `VZ.lifeInk(k)` / `VZ.arrival(k)` / `VZ.evalc(k)` / `VZ.cat(i)` / `VZ.one()` — đọc lúc vẽ (theo chế độ).
  CSS `--lc-*`, `--lci-*` (chữ), `--ar-*`; các biến cũ `--st-inst/--st-test/--st-oper/--st-over` được đặt lại theo bảng này.
  `const C` (trạng thái ngày về), `DGC` (đánh giá), `LCC` (Danh mục) là getter gọi VZ.
- Hình nhỏ: `VZ.spark`, `VZ.segbar`, `VZ.bullet` (mục tiêu đúng hạn 80%, vùng <60 / 60–80 / ≥80 — cùng ngưỡng tô màu cũ),
  `VZ.cols`, `VZ.delta`. Tổng quan Tiến độ: `kpiViz()` — xu hướng 6 tháng dùng `ovRowsAllTime()` (mọi kỳ, có ghi "mọi kỳ").
  Con số trên thẻ giữ nguyên (`DM.kpis`). Test: `e2e_ui_theme_test.py`.
- Tổng quan Danh mục (bước C, `drawOverview/updOverview`, ECharts — không còn Chart.js ở trang này):
  thanh **Vòng đời** (đoạn theo thứ tự LC, bấm → `mmGo({co,st})`) · **treemap** Nhà máy → Chuyền → Máy (`#mmTm`, giá trị / số máy,
  1 tông xanh dương `VZ.seq` theo giá trị — không dùng màu trạng thái; lọc 1 nhà máy thì cấp 1 là chuyền; bấm máy → `mmShow`) ·
  **Top 10 NCC** + **Nhóm** (7 nhóm + "Khác") thanh ngang 1 màu. Đổi sáng/tối: `setTheme` phát sự kiện `themechange` để vẽ lại.
  Test: `e2e_catalog_overview_test.py`, `onescreen_mmtb_check.py`.
- 🏅 Đánh giá — Bảng điểm NCC (bước D1, `drawScorecard / renderScTable / drawScMatrix`): cột Đúng hạn = bullet (vùng C <50% · 50–80% · A ≥80%,
  vạch mục tiêu 80% — đúng ngưỡng `DM.supplierGrade`), cột **Lịch sử giao** (1 chấm / máy đã về theo thời gian: xanh đúng/sớm, vàng trễ ≤7, đỏ >7),
  **Ma trận NCC** (ECharts scatter: x % đúng hạn, y TB ngày trễ đảo trục, bong bóng = số máy đã giao, màu hạng; NCC trùng vị trí 1 nhãn "Tên +n";
  bấm → `showMachines`). Hạng / % / ngày trễ không đổi. Test: `e2e_supplier_matrix_test.py`.
- 📅 Kế hoạch — **Lịch nhiệt 90 ngày** (bước D2, `plDrawCal(L)` gọi trong `plDrawLook`, `#plCal`): cột = tuần, hàng = thứ, ô = số máy dự kiến về NM
  (cùng danh sách `DM.lookahead`), màu `VZ.seq` (đậm/nổi = nhiều máy), viền đỏ = ngày có máy `o.red`, chấm = hôm nay, hàng cuối = tổng tuần;
  bấm ô → cuộn tới thẻ máy (`.pl-m[data-mid]`, nháy sáng). Test: phần [1b] trong `e2e_planning_test.py`.
- 📅 Kế hoạch — **Dòng tiền** (bước D3): nút `Theo tháng | Luỹ kế (đường S)` (`PL.cmode`). Theo tháng = cột 5 loại đợt, 1 trục (bỏ đường luỹ kế trục phải).
  Đường S (`plSCurve / plDrawScurve`, 6 tháng trước → 12 tháng tới): Kế hoạch luỹ kế (planned_date, không có thì ngày mốc như DM.cashflow),
  Thực tế đã trả luỹ kế (paid_date; paid_amount trống = đủ số tiền đợt), Dự báo = đã trả + cumulative của `DM.cashflow` (không đổi). Test: phần [3] `e2e_planning_test.py`.
- 📊 Tổng quan — thẻ **Cần chú ý**: nút `Danh sách | Chênh lệch` (`ATT_MODE`, bước D4, `attVariance(rows)`): thanh 2 chiều quanh 0 theo IBCS,
  đã về = ngày về TT − KH (đặc), chưa về = dự kiến − KH (viền), quá hạn chưa xác nhận = `DM.delay().days` (sọc ⚠); đỏ trễ / xanh sớm;
  xếp trễ nhất → sớm nhất, máy thiếu ngày KH đếm riêng, bấm → `showDetail`. Test: phần [2b] `e2e_ui_theme_test.py`.
- Bước E (hoàn thiện): **đã gỡ Chart.js** — toàn app chỉ ECharts. "Máy về theo tháng" (`drawMonth` trong initP1) = cột chồng 4 trạng thái + đường Trễ, 1 trục;
  "Trạng thái thiết bị" (`updateStatusChart`) = thanh ngang theo trạng thái ngày về, chia đoạn theo đánh giá (+ "Chưa đánh giá"), cùng số `statusRings()`.
  Tiền rút gọn dùng chung **`VZ.money(v, cur)`**: ≥1 tỷ "12,3 tỷ ₫" (≥10 tỷ không lẻ), ≥1 triệu "850 tr ₫", USD "$1,25M"/"$850K" — `tyT`, `plB`, `vTxt` gọi nó;
  bảng chi tiết vẫn số đầy đủ. Mọi ECharts tự bật `aria` (chart_theme.js bọc echarts.init); motion.js tắt hiệu ứng khi "giảm chuyển động".
  Trạng thái trống: `.dm-hint` (📭 + câu có gợi ý việc cần làm) / `.dm-empty` (ổn, xanh). Phân tích: hàng NCC/Xuất xứ cao vừa nội dung (`max-height:58%`),
  đang xem bản đồ thì `#p2.an-mapmode` giữ chiều cao cũ. Thẻ "Giá trị theo NCC" dùng `--vz-one` (xanh dương 1 màu, biến của chart_theme.js).
- Đổi sáng/tối (`themechange`): vẽ lại `OV_HOOKS` (Tổng quan, Phân tích), Kế hoạch (`plDrawMta/Cash/Look`), ma trận NCC, Tổng quan Danh mục.

## ⛓ Ghi chú chuyền (migration 19) + 🎲 mã ngẫu nhiên
- `production_lines.notes` (`supabase/migrations/20261112_19_line_notes.sql`): loader dò cột (`select('notes')`) TRƯỚC khi giải mã chuyền; có cột thì
  `SEC.production_lines.f` thêm `notes` (mã hoá cùng tên chuyền) và `MM.hasLineNotes = true`. Chưa chạy 19: ô Ghi chú ẩn (`need:` trong LIB.lines), app chạy như cũ.
- Hiện ghi chú khi chọn chuyền: `lineLbl(l)` = "Tên — ghi chú (≤40 ký tự)" (window.__lineLbl) ở ô Chuyền form máy, ô lọc Danh sách, hộp Đưa vào… (arrange.js);
  dòng ⓘ dưới tên chuyền ở 🧩 Sắp xếp; rê chuột ô Chuyền ở Danh sách / treemap. `x.line_notes` gắn vào máy trong deriveMmtb.
- Mã ngẫu nhiên `randCode(prefix, used)` = `<mã nhà máy>-XXXX` (bảng `CODE_ABC`, bỏ 0 O 1 I L), không trùng: Thư viện Nhà xưởng / Chuyền (`gen:1` → nút 🎲,
  thêm mới tự điền, đổi nhà máy đổi tiền tố nếu chưa sửa tay, Sửa không tự đổi) và **mã tạm máy Danh mục** (`tempCode`, cả catalog_sync qua `__tempCode`).
  Không mã nào bị đổi tự động. **Chuẩn hoá mã tạm cũ** (tab Mã máy, admin): `oldTemps()` = máy `code_temp` mà mã không khớp
  `NEW_FMT` (`<NM>-XXXX`) → nút "🎲 Chuẩn hoá N mã tạm cũ" → `libConvertCodes` tạo sẵn mã mới (không trùng mã hiện có + legacy_code),
  xem trước từng dòng `#cvPrev` (qua `confirmBox({extra})`) rồi `setCode` từng máy (mã đầu tiên giữ ở `legacy_code`). Mã kế toán
  (`code_temp=false`) và `ma_may` Tiến độ không đụng; Tiến độ liên kết bằng `tracking_machine_id` nên tự hiện mã mới.
  Test: `e2e_line_notes_test.py`.
- **Mã chuyền 5 ký tự** (2026-11-13): `randCode(prefix, used, n)`; field `gen` = số ký tự (Nhà xưởng `gen:4`, Chuyền `gen:5` → `DTR-7K4MQ`).
  **Chuẩn hoá mã chuyền cũ**: `oldLines()` = chuyền không khớp `LINE_FMT` (`<NM>-XXXXX`), bỏ `PHUTRO` và dòng `__locked` → nút
  "🎲 Chuẩn hoá N mã chuyền cũ" (tab Chuyền) → `libConvertLines` xem trước `#cvPrev` rồi update từng chuyền; gói `sec` phải đủ
  `name` + `notes`; mã cũ nối vào Ghi chú ("Mã cũ: L1") khi có cột notes. Máy trỏ chuyền bằng `line_id` nên không phải sửa máy.
  Mã Nhà xưởng KHÔNG chuẩn hoá (user chưa yêu cầu).

## 📋 Nhân bản máy (2 phân hệ)
- Form ➕ Thêm có ô "Sao chép từ máy có sẵn…" (`clonePicker(host, list, onPick, onClear, srcTitle)` trong mainSrc, dùng chung; tìm không dấu, ↑↓ Enter);
  chi tiết máy có nút 📋 Nhân bản (`cloneMachine(i)` / `mmClone(id)`). Form Sửa không có ô này. Lưu vẫn qua đường Thêm máy (mã hoá, kiểm tra như cũ).
- Tiến độ (`fillFromClone`): chép tên, phụ trách, SL, công suất, thương hiệu, NCC, xuất xứ, model, đơn giá, hình thức mua, số ngày KH (ctu/đi tàu/lãnh máy/CTM),
  working day; để trống mã máy, serial, mọi ngày, TG đi tàu/lãnh máy TT, giải trình. Ô Nơi lắp đặt tô viền nhắc (`cloneHl`).
- Danh mục (`openForm(x, true)`): chép mọi trường form trừ mã (cấp mã tạm mới), serial, máy cha, ngày duyệt, ngày NT, mốc, ghi chú, cần bổ sung; trạng thái Kế hoạch.
- Test: `e2e_clone_test.py`. Kèm sửa: `.add-grid` cột `minmax(0,1fr)` để form không tràn ngang trên điện thoại.

## 🧩 Sắp xếp — Danh mục MMTB (`arrange.js`, trang `#c4`, không cần migration)
- Cấu trúc: Nhà máy → Chuyền (`production_lines`) → ⭐ máy chính (`role=main`) / ◇ máy phụ (`auxiliary`) → ↳ máy con (`sub_unit`, có `parent_machine_id`).
  Chuyền trọn gói = 1 máy chính mang tên chuyền + máy con; chuyền ghép = nhiều máy chính/phụ. Thiết bị dùng chung xếp vào chuyền
  **Phụ trợ** (mã `PHUTRO`, mỗi nhà máy 1 chuyền, tạo bằng nút ＋ — tên chuyền mã hoá qua `__seal('production_lines')`).
- Chỉ ghi `line_id, area_id, parent_machine_id, role, sort_order` (không nằm trong sec → không cần __seal), từng máy, chống ghi đè bằng `version`.
- Chuyển 1 máy = cả nhánh con đi theo (cùng chuyền); xưởng lấy theo `production_lines.area_id`, chuyền chưa gắn xưởng thì giữ xưởng cũ.
  Máy con đưa ra chuyền → `auxiliary` (chuyền chưa có máy chính thì `main`); gỡ ra → về "Chưa xếp" (line_id null).
  Chặn vòng tròn cha-con và khác nhà máy. ⚠ Cần xem lại: máy con khác chuyền máy cha (có nút sửa), máy cha khác nhà máy, chuyền chưa có máy chính.
- Thao tác: tick + 📦 Đưa vào… (chuyền / làm máy con / đặt vai trò / gỡ ra), kéo-thả trên máy tính, ▲▼, ↩ Hoàn tác (9 giây).
  Giao diện: thanh tiến độ "Đã xếp x / y máy", thẻ chuyền viền màu theo xưởng (Phụ trợ màu ngọc) + đếm ⭐◇↳ + thanh trạng thái nhỏ,
  cây có đường nối (ul.ar-kids), hộp chờ xếp có lọc + "Chọn tất cả máy đang lọc", thanh nổi có nút nhanh ⭐ / 📥, vùng thả có nhãn,
  dòng vừa xếp nháy 1 lần. Trạng thái chỉ là chấm màu (chữ chỉ hiện khi khác "Đang vận hành"); nhãn/màu lấy từ `__mmCtx().lcl/lcc`.
  Điện thoại: 2 tab Cây chuyền / Chưa xếp. mmtbSrc đưa ngữ cảnh qua `window.__mmCtx()`; viewer không thấy tab (không có trong VIEW_TABS).
- Test: `e2e_arrange_test.py`.

## Ô chọn trong form + Nhà máy lấy từ thư viện (migration 14)
- `combo.js` (`CB.make`): ô chữ có danh sách xổ, gõ không dấu để lọc, vẫn gõ được giá trị mới; gần giống giá trị đã có thì nhắc "Có phải … không?", không chặn. Danh sách lấy từ dữ liệu đã giải mã trong trình duyệt, không có bảng riêng: giá trị tự mất khi không còn máy nào dùng. Dùng cho `f_pt`, `f_xx`, `f_th` (thêm thương hiệu Danh mục), `f_ncc` (thêm thư viện NCC), `m_origin`, `m_brand`, `m_eng`, `m_mgr`, `m_capu`. Thêm (2026-11-13): `f_ten`, `f_cs`, `m_name` (Model KHÔNG xổ — user: không phải thư viện; hint:false — tên máy hay chỉ khác số thứ tự; nguồn cả 2 phân hệ).
- `CB.select(sel, { add })` (2026-11-13): biến `<select>` thư viện thành ô gõ để tìm `#<id>_q`, CHỈ nhận giá trị trong danh sách. `<select>` vẫn giữ
  giá trị (class `cb-src`: opacity 0, 1px — vẫn select_option / đọc .value được); `.value`/`.selectedIndex` bị ghi đè trên phần tử để code đặt giá trị
  hay đổi innerHTML đều cập nhật chữ (MutationObserver). Rời ô: khớp đúng 1 dòng (fold) thì chọn, trống thì bỏ chọn, còn lại trả giá trị cũ.
  Dùng cho `m_sup`, `m_type`, `m_group`, `m_area`, `m_line`, `m_parent`, `f_nld`. `add` = `libQuickAdd('sup'|'type'|'group', text)` (chỉ admin):
  gõ giá trị chưa có → nút "➕ Thêm … vào thư viện" → insert (NCC mã hoá qua `__seal`), cập nhật MM tại chỗ + thêm <option> + chọn luôn; trùng tên (fold) thì chọn mục có sẵn.
  Test: `e2e_form_pick2_test.py`.
- `f_nld` (Nơi lắp đặt) là `<select>`, chỉ chọn nhà máy đang hoạt động trong thư viện (`siteFill`). Giá trị lưu vẫn là chữ: cách ghi nhiều máy của công ty đó đang dùng, công ty chưa có máy thì lưu mã. Máy đang ghi cách khác / nơi lạ giữ nguyên khi mở Sửa. Nạp Excel không qua ô này.
- Thêm nhà máy: Danh mục › Thư viện › 🏭 Nhà máy, không sửa code. `DM.setCompanies(companies)` chạy trong `loadMmtb`, nhận theo mã + tên; 6 công ty gốc giữ cách nhận và thứ tự (`CO_ALIAS`, `CO_BASE`), đọc thư viện lỗi thì dùng 6 công ty này. Mã máy: `machine_company_code` đọc bảng `companies` từ migration 14; chưa chạy thì nhà máy mới nhận KXD. Hai bên phải giữ cùng quy tắc.
- Mã nhà máy 2–4 chữ in hoa (định dạng Mã máy), không dùng KXD (`DM.companyCodeOk`). Bộ lọc công ty ở Tổng quan vẽ một lần, cần tải lại trang mới thấy nhà máy vừa thêm. Test: `e2e_form_pick_test.py`.

## Quy ước làm việc
- Migration mới = file mới trong `..\supabase\migrations\` (không sửa file đã có). Thư mục `supabase\` nằm CẠNH repo app
  (`01.Machine Tracking\supabase\`), không thuộc repo app công khai; được sao lưu trong repo riêng tư ở `01.Machine Tracking\`
  cùng bộ test. Dữ liệu thật / email thật để ở `..\_du_lieu_goc\` — KHÔNG đưa lên git nào.
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

## ✂️ Tách máy Danh mục (2026-11-13, `mmSplit`)
- Nút ✂️ Tách máy trong chi tiết máy Danh mục (cùng quyền với Nhân bản), chỉ hiện khi `splitMax(x)` ≥ 2. `splitMax` = max(quantity Danh mục,
  SL Tiến độ − số máy đã tách từ máy này [source_ref "Tách từ <mã>"]) (2026-11-14). Chọn số máy 2…splitMax; máy gốc giữ quantity = splitMax − (n−1),
  mỗi máy chọn Khu vực / Chuyền / Ghi chú vị trí (nối vào notes "Vị trí: …").
- Máy gốc: giữ mã, serial, giá trị hợp đồng, liên kết `tracking_machine_id`; đổi area/line, quantity 1 (notes trong sec → mã hoá lại cả gói `SEC.mmtb_machines.f`).
- Máy mới: chép cột + trường sec, mã tạm `randCode`, `code_temp`, chép mốc `delivery_milestones`; để trống serial, asset_code, contract_amount
  (tổng không nhân đôi); không liên kết Tiến độ (UNIQUE); `source_ref` = "Tách từ <mã gốc> · <nguồn gốc>". Bên Tiến độ không đổi. Test: `e2e_sync_split_test.py`.

## 📏 Thư viện Đơn vị (2026-11-13, migration 20 `mmtb_units`)
- Bảng `mmtb_units (name unique, sort_order)`, mọi người xem, admin sửa; nạp sẵn 10 đơn vị chuẩn (kg/h … m³). Loader → `MM.units`, `MM.hasUnits`.
  Chưa chạy 20: mọi ô đơn vị như cũ (Danh mục ô gõ combo; Tiến độ dùng danh sách chuẩn `CAP_STD`).
- Tab 📚 › 📏 Đơn vị (`LIB.units`, `needs20`). Sửa được tên (2026-11-14): đổi tên → mã hoá lại từng máy Danh mục đang dùng (capacity_unit trong sec) + `mmtb_equipment_types.default_unit`; Tiến độ (congsuat mã hoá, dạng chữ) giữ nguyên.
- Danh mục: có thư viện thì `m_capu` là `<select>` + `CB.select` (admin ➕ `libQuickAdd('unit')`); `unitOpts(sel, cur)` thêm đơn vị cũ
  của máy "(chưa có trong thư viện)" để không mất; đơn vị cũ viết khác (VD tấn/h) được nhận là đơn vị chuẩn (t/h) khi mở Sửa.
  Loại thiết bị: `default_unit` kiểu `unit` (select từ thư viện).
- Tiến độ: ô Công suất = `f_csv` (số) + `f_csu` (CB.select đơn vị); `f_cs` (hidden) vẫn là giá trị đọc/ghi/lưu "3000 kg/h"
  (setter `.value` tách ra 2 ô qua `__capSplit`, sửa 2 ô thì ghép lại). Không tách được (VD "khoảng 3 tấn") → giữ nguyên + dòng `#f_csOld` cho tới khi nhập số.
- `CB.select`: khi gõ, dòng khớp nguyên văn → bắt đầu bằng → khớp không dấu (hoặc dòng đầu) được bôi sáng, Enter chọn luôn. Test: `e2e_units_test.py`.

## Danh sách Danh mục phẳng (2026-11-13)
- `renderList`: chế độ mặc định `sortK='__tree'` nay là danh sách PHẲNG (nhà máy → sort_order → mã máy), không thụt lề / không gom con dưới cha.
  Máy cha: nhãn `.mm-kidtag` "🧩 N bộ phận con" (title = tên các máy con); máy con: `small.mm-of` "↳ thuộc: <máy cha>" (bấm mở máy cha).
  Phân cấp cha-con chỉ xem / chỉnh ở 🧩 Sắp xếp và mục Bộ phận con trong chi tiết. `treeIdx` vẫn tính (không còn dùng cho danh sách). Test: `e2e_flat_list_test.py`.

## Tổng quan Danh mục đếm theo máy cha + 🩺 Kiểm tra dữ liệu (2026-11-13)
- `updOverview`: `all` = máy theo nhà máy; `rows` = chỉ máy gốc (`rootOf(x) === x`); bộ phận con không tính thành máy riêng (thẻ Tổng thiết bị ghi
  "gồm N bộ phận con"). Giá trị nhánh (máy + bộ phận con) cộng vào máy gốc (`brVal`) cho treemap / nhóm; Tổng giá trị = mọi hồ sơ; Top NCC dùng
  giá trị riêng từng hồ sơ (`ownVal`). Thẻ Chuyền = chuyền `is_active !== false` (+ "N ngừng").
- Biểu đồ "Thiết bị theo nhóm": đủ nhóm thư viện theo `sort_order` (kể cả 0 máy) → nhóm lạ "⚠ …" → "(chưa có nhóm)"; nút Số máy / Giá trị
  (`grMode`); bấm thanh → `mmGo({co, grp})` (`grp:'__none'` = chưa có nhóm). Ô lọc Nhóm ở Danh sách cũng theo thư viện + nhóm lạ + chưa có nhóm.
- 📚 › 🩺 Kiểm tra dữ liệu (`LIB.health`, `admin:true` — tab ẩn với người không phải admin): `dataIssues()` (`window.__dataIssues`) rà dữ liệu đã giải mã,
  chỉ đọc. Nhóm kiểm tra: máy cha mất / vòng lặp / con khác nhà máy / con khác chuyền với cha · chuyền / khu vực thuộc nhà máy khác · khu vực khác
  xưởng của chuyền · máy vận hành trên chuyền ngừng · nhóm / loại / đơn vị không có trong thư viện · NCC mất · vận hành chưa có ngày NT · có ngày NT
  mà trạng thái còn trước · trùng serial · chưa giải mã · liên kết Tiến độ mất / lệch nhà máy · máy Tiến độ đủ điều kiện chưa sang · trường lệch ·
  Tiến độ không xác định nhà máy · Cần bổ sung. (Vai trò ⇔ máy cha đã được ràng buộc DB `mmtb_machines_check1` nên không kiểm.) Test: `e2e_overview_health_test.py`.

## Popup chỉ đóng bằng ✕ + không tải lại trang (2026-11-14)
- Popup có ô nhập / sửa chỉ đóng bằng ✕ hoặc Hủy: `addBg` (form Tiến độ) và `mmBg` (form Danh mục) bỏ hẳn đóng-khi-bấm-ngoài; `mBg` (popup chung)
  chỉ đóng khi bấm ngoài nếu `window.mBgEditing()` = false (không có form / textarea / select / input). Popup chỉ xem (chi tiết, xem trước) vẫn đóng khi bấm ngoài.
- Không `location.reload()` sau xoá máy (`askDelete` → splice DATA + `quAfterSave`), khôi phục thùng rác (`refreshOne` + `quAfterSave`), nạp Excel
  (`window.__reloadDelivery()` đọc lại toàn bộ tại chỗ). Tab, bộ lọc, `pageNo` giữ nguyên. Chỉ tải lại trang khi người dùng tự bấm (🔄, đổi ngôn ngữ, đăng xuất, mã hoá…).
- Danh mục `reload()`: giữ `scrollY`, `scrollTop` các `.tablewrap`, nhóm 🩺 đang mở. Test: `e2e_stay_put_test.py`.

## Tên gọi khác dưới tên + Mã máy chỉ sửa mã + Lấy tên Tiến độ (2026-11-14)
- Danh sách Danh mục: dòng nhỏ dưới tên = tên gọi khác (`aliasTxt(alias_names)` "a · b") + 🔗 nếu liên kết — KHÔNG còn model. Danh sách Tiến độ:
  máy đã liên kết có tên gọi khác bên Danh mục thì hiện thay dòng công suất (không có thì giữ công suất). `window.__dRender` vẽ lại Tiến độ sau `reload()` Danh mục.
- 📚 › 🏷 Mã máy: bấm tên không mở chi tiết nữa — chỉ ✏️ sửa mã.
- 🩺 nhóm `name_diff` có nút "🔄 Lấy tên Tiến độ cho N máy" (`syncLinkedNames`): xem trước rồi `CS.apply` chỉ với `name` + `alias_names` (không đụng trường khác). Test: `e2e_alias_show_test.py`.

## Đơn giá 1 set + chia giá trị khi tách máy (2026-11-14)
- Ô giá trong form = ĐƠN GIÁ 1 set; DB vẫn lưu TỔNG (= đơn giá × SL) nên báo cáo / Excel / đồng bộ không đổi. Dữ liệu cũ (user xác nhận) là tổng.
  Tiến độ: `f_vnd` / `f_usd` (`unitSet`, `totalOf`, `priceTot` → `#f_tot` "Tổng cho N set"); Danh mục: `m_amt` (`mmTotal`, `mmTot` → `#m_tot`).
  Mở Sửa: đơn giá = tổng ÷ SL, số chính xác giữ ở `dataset.exact` → lưu lại không đổi gì thì tổng giữ nguyên (không lệch do làm tròn).
- Hiển thị: SL ≥ 2 thì dưới giá tổng có `small.unit-p` "… / set" (danh sách Tiến độ: VNĐ + USD; danh sách Danh mục; chi tiết 2 phân hệ).
- ✂️ Tách máy: mỗi máy có ô Giá trị hợp đồng (`.sp-val`); ô trống chia đều phần còn lại (máy gốc / ô trống đầu nhận phần lẻ), gợi ý "≈ …";
  tổng các ô phải bằng giá trị ban đầu. Đồng bộ (`plan`): so giá trị Tiến độ với tổng máy gốc + các máy "Tách từ <mã>" cùng loại tiền. Test: `e2e_unit_price_test.py`.

## Xoá chuyền trả máy ra + tiền chỉ số nguyên (2026-11-14)
- `libDel('lines', …)` → `libDelLine`: không chặn khi còn máy; xác nhận "N máy trong chuyền sẽ được trả ra" → `mmtb_machines.line_id = null`
  (cột không mã hoá, mọi thông tin khác giữ nguyên) rồi xoá chuyền. Các thư viện khác vẫn chặn xoá khi đang dùng.
- Tiền hiển thị dạng đầy đủ chỉ số nguyên (giá trị hợp đồng, Giá trị USD, đơn giá 1 set, "Tổng cho N set", ô đơn giá Danh mục, chia giá trị khi tách
  `dec = 0`). Số rút gọn (6,5 tỷ · $1,25M) giữ 1 số lẻ — user chọn. Tỷ giá khoá vẫn 2 số lẻ (không phải tiền). Test: `e2e_line_del_test.py`.

## Báo giá theo VND / USD + 💱 Tỷ giá (2026-11-14, migration 21 `machines.gia_tien_te`)
- Form Tiến độ: hàng `#f_curRow` (radio `f_cur` VND/USD + `#f_rate` tỷ giá VNĐ/USD). Nhập đơn giá bên đã chọn, bên kia tự tính (`curSync`, ô `cur-auto` chỉ xem).
  Tỷ giá KHÔNG lưu: mở Sửa suy ra = VNĐ ÷ USD (`curLoad`); máy mới lấy USD mới nhất (`MM.rates` / v_latest_rates). Mở form không tính lại (giữ 2 số đang lưu).
  Máy cũ: có USD → USD, chỉ VNĐ → VND. Lưu `gia_tien_te` khi `hasGT()` (cột migration 21).
- Đồng bộ `want()`: `gia_tien_te === 'USD'` và có USD → hợp đồng Danh mục USD.
- Danh mục: `#m_conv` "≈ … ₫ / $ theo tỷ giá …" (tỷ giá khoá nếu có, không thì mới nhất).
- 📚 › 💱 Tỷ giá (`LIB.rates`, bảng `exchange_rates` có sẵn, admin sửa): loại tiền / tỷ giá / ngày áp dụng; `MM.xrates`. libInput thêm type `decimal`, `date`, `select`.
- `.add-grid > div.full` chiếm cả hàng (trước chỉ `label.full`). Test: `e2e_currency_test.py`.
