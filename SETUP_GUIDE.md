# Web app Tiến Độ Máy Về (v2.1) — hướng dẫn triển khai

Giao diện giữ nguyên dashboard `Dashboard_TienDoMayVe.html`. Dữ liệu lưu trên **Supabase**, trang web đặt trên **GitHub Pages**. Người dùng mở link, đăng nhập bằng email và mật khẩu do quản trị cấp. Không cần Claude hay tài khoản Microsoft.

## Các file trong thư mục

| File | Dùng để |
|---|---|
| `index.html` | Trang web (dashboard + đăng nhập + nhập/sửa/xoá máy + nạp Excel) |
| `config.js` | Địa chỉ và khoá kết nối Supabase (bước 3) |
| `supabase/01_schema.sql` | Tạo bảng, phân quyền, nhật ký. Chạy 1 lần |
| `supabase/02_users.sql` | Cấp quyền người dùng. Chạy lại mỗi khi thêm người |
| `supabase/03a_real_data_84_machines.sql` | Nạp 84 máy **thật** từ Excel ngày 26/10/2026. Chỉ dùng khi IT/pháp chế đã đồng ý |
| `supabase/03b_anonymized_data_84_machines.sql` | Nạp 84 máy **ẩn danh** để chạy thử: người phụ trách → PT01…, nhà cung cấp → NCC01…, giá trị xáo trộn ±30%, giải trình đã ẩn |
| `supabase/04_model_serial.sql` | Thêm cột **Model** và **Số serial**. Chạy 1 lần nếu project đã tạo trước khi có 2 cột này |
| `supabase/05_mmtb_schema.sql` | Tạo phân hệ **Danh mục MMTB** (bảng `mmtb_machines`, `suppliers`, `production_lines`…). Không đụng tới bảng `machines` của Tiến độ máy về. Chạy 1 lần |
| `supabase/import/mmtb_import.sql` | Nạp 300 máy, 38 chuyền, 54 NCC từ `mmtb_export_2026-10-29.json`. Chạy sau `05`. Sinh lại bằng `mmtb_build_sql.py`. **Không dùng khi đã bật mã hoá** (gửi dữ liệu dạng thường) |
| `supabase/06_encryption.sql` | Bật **mã hoá trên trình duyệt**: dữ liệu nhạy cảm được mã hoá AES-256 bằng mật khẩu dữ liệu trước khi gửi lên, Supabase chỉ lưu chuỗi đã mã hoá. Chạy 1 lần, sau `05` |
| `supabase/07_library.sql` | Tab **📚 Thư viện** (Mã máy, NCC, Nhà máy, Nhà xưởng, Chuyền, Nhóm). Chỉ admin sửa thư viện. Chạy 1 lần, sau `06` |
| `supabase/import/mmtb_rows.json` | Cùng dữ liệu với `mmtb_import.sql`, để nạp bằng nút **📥 Nạp file dữ liệu** trong app (mã hoá trước khi gửi). Chứa dữ liệu thật dạng thường: chỉ giữ trên máy |

**Bật mã hoá (làm 1 lần, theo thứ tự)**
1. Chạy `06_encryption.sql` trong SQL Editor.
2. Mở app, đăng nhập bằng tài khoản admin → app hỏi **tạo mật khẩu dữ liệu** (≥ 12 ký tự). Mật khẩu này khác mật khẩu đăng nhập. **Quên là mất dữ liệu**, không ai khôi phục được.
3. Banner *"Còn N bản ghi chưa mã hoá"* → bấm **🔐 Mã hoá ngay**. App tải file sao lưu `Backup_BeforeEncrypt_….json` về máy trước, rồi mã hoá. Cất file sao lưu ở nơi an toàn rồi xoá khỏi thư mục Tải về.
4. Danh mục MMTB (đang trống) → bấm **📥 Nạp file dữ liệu** → chọn `supabase/import/mmtb_rows.json`.
5. Chạy lại mục 5 trong `06_encryption.sql`: cả 4 số phải bằng 0. Sau đó có thể chạy mục 6 (tuỳ chọn) để bỏ dữ liệu thường còn trong nhật ký sửa cũ.

Mỗi lần mở app ở tab mới, app hỏi mật khẩu dữ liệu. Đóng tab hoặc đăng xuất là quên khoá.

**Thư viện (Danh mục MMTB › 📚 Thư viện, chỉ admin sửa)**
- **Mã máy** = mã nhà máy + dãy số kế toán, VD `DTR-104600041`. Chưa có số kế toán thì app cấp tạm 9 số ngẫu nhiên (nhãn *tạm*); mã cũ giữ ở cột *Mã cũ*.
  - Đổi mã cũ (DTR-004…) sang dạng mới: bấm **🎲 Cấp mã tạm dạng mới**.
  - Khi kế toán gửi số: bấm **📋 Dán mã kế toán**, dán 2 cột từ Excel (*mã hiện tại hoặc mã cũ* | *số kế toán*). Hoặc bấm ✏️ ở từng máy.
- **Nhà cung cấp, Nhà máy, Nhà xưởng, Chuyền sản xuất, Nhóm thiết bị**: thêm / sửa / xoá. Mục đang có máy dùng thì không xoá được. Đổi tên nhóm thì các máy trong nhóm đổi theo.

**Mã PIN 6 số (đặt bằng SQL, không có trên app):** trong SQL Editor chạy `select public.admin_set_pin('123456');` (thay bằng PIN của bạn). Đổi PIN: chạy lại lệnh với PIN mới. Nhập sai mật khẩu dữ liệu 5 lần thì ô nhập bị khoá, phải nhập đúng PIN mới được thử tiếp; sai PIN 5 lần thì chờ 15 phút. PIN băm bcrypt, kiểm tra và đếm số lần sai đều trên máy chủ. PIN **không** mở được dữ liệu. Bỏ PIN: `update public.app_pin set pin_hash = null;`

**Quyền người dùng**
- `viewer`: chỉ xem.
- `editor`: xem, nhập máy, sửa, xoá, nạp Excel ở cả 2 phân hệ.
- `catalog_editor`: chỉ thêm, sửa, xoá ở **Danh mục MMTB**; phần Tiến độ máy về chỉ xem. Có sau khi chạy `05_mmtb_schema.sql`.
- `admin`: như editor, thêm **Thùng rác** (khôi phục hoặc xoá hẳn máy).
- Người chưa được cấp quyền đăng nhập vào cũng không thấy dữ liệu nào.
- Chỉ cấp quyền được cho email `@duytanrecycling.com`, trừ email ngoại lệ `tiendungvo98@gmail.com`. Muốn thêm tên miền hoặc email ngoại lệ khác thì sửa dòng `check` trong `01_schema.sql`.

**Những gì bản v2 bảo vệ thêm**
- **Xoá mềm:** xoá máy chỉ chuyển vào thùng rác, admin khôi phục được.
- **Chống ghi đè:** hai người cùng sửa một máy thì người lưu sau được báo, không ai mất thay đổi.
- **Lịch sử từng máy:** bấm vào máy → 🕘 Lịch sử, xem ai sửa gì, lúc nào.
- **Xuất Excel:** file có cùng cấu trúc sheet `📝Cập nhật`, nạp lại được bằng 📂 Nạp Excel.
- **Tự sao lưu:** trước mỗi lần Nạp Excel, app tự tải về một file `SaoLuu_TruocKhiNap_….xlsx`.

---

## Bước 1. Tạo project Supabase (≈5 phút)

1. Vào https://supabase.com → **Start your project** → đăng nhập bằng GitHub hoặc email.
2. **New project**:
   - Name: `tien-do-may-ve`
   - Database password: đặt và **lưu lại**.
   - Region: **Southeast Asia (Singapore)**, gần Việt Nam nhất.
3. Chờ khoảng 1–2 phút cho project khởi tạo xong.

## Bước 2. Tạo bảng và nạp dữ liệu (≈5 phút)

Vào menu trái **SQL Editor** → **New query**, lần lượt làm 3 lần:

1. Mở `supabase/01_schema.sql` bằng VS Code, copy toàn bộ, dán vào SQL Editor rồi bấm **Run**. Kết quả là *Success. No rows returned*.
2. Mở `supabase/02_users.sql`, kiểm tra email admin là email của anh, rồi dán và **Run**.
3. Mở **`supabase/03b_anonymized_data_84_machines.sql`** (dữ liệu ẩn danh), dán và **Run**. Dòng cuối phải ra `so_may = 84`.
   Khi IT/pháp chế đồng ý dùng dữ liệu thật, chạy `03a_real_data_84_machines.sql` (thay toàn bộ danh sách), hoặc đăng nhập app và bấm 📂 Nạp Excel.

## Bước 3. Khoá đăng ký tự do và tạo tài khoản (≈5 phút)

1. **Authentication → Sign In / Providers → Email**: tắt **Allow new users to sign up** → Save.
   Từ giờ chỉ quản trị mới tạo được tài khoản.
   Cùng trang này, đặt **Minimum password length = 10** nếu có ô đó. Khi tạo tài khoản cho đồng nghiệp, dùng mật khẩu ít nhất 10 ký tự, có chữ hoa, chữ thường và số.
2. **Authentication → Users → Add user → Create new user**:
   - Nhập email và mật khẩu.
   - Tick **Auto Confirm User** → Create user.
   - Làm cho chính anh trước, dùng đúng email đã ghi trong `02_users.sql`.

## Bước 4. Dán khoá kết nối vào `config.js` (≈2 phút)

1. Supabase → **Project Settings → API** (hoặc **Data API / API Keys**).
2. Copy **Project URL** và khoá **anon public**. Ở một số giao diện mới, khoá này tên là *publishable key*.
3. Dán vào `config.js`:
   ```js
   SUPABASE_URL: 'https://abcdxyz.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...'
   ```

> ⚠️ **Không bao giờ** dán khoá `service_role` (secret) vào file này. Khoá *anon* thì được phép công khai, vì dữ liệu vẫn được khoá bằng đăng nhập và phân quyền.

## Bước 5. Chạy thử trên máy bằng VS Code (≈5 phút)

1. VS Code → **File → Open Folder** → chọn thư mục này.
2. Cài extension **Live Server** (tác giả Ritwick Dey).
3. Chuột phải `index.html` → **Open with Live Server**. Trình duyệt mở `http://127.0.0.1:5500`.
4. Đăng nhập bằng tài khoản ở bước 3. Dashboard hiện đủ 84 máy là kết nối đúng.
5. Thử nhanh: bấm một máy → ✏️ Sửa thông tin → lưu → 🕘 Lịch sử phải thấy dòng vừa sửa.

## Bước 6. Đưa lên mạng bằng GitHub Pages (≈10 phút)

1. Vào https://github.com → **New repository**:
   - Tên: ví dụ `TienDoMayVe`
   - Chọn **Public**, vì GitHub Pages miễn phí yêu cầu repo public. Chỉ mã giao diện là công khai. Dữ liệu máy nằm trên Supabase, không nằm trong repo.
2. Trong repo vừa tạo → **Add file → Upload files** → kéo thả `index.html` và `config.js` → **Commit changes**.
   - Thư mục `supabase/` và file Excel **không cần và không nên** đưa lên.
3. **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main`, thư mục `/ (root)` → Save.
4. Sau 1–2 phút, link có dạng `https://<tên-github>.github.io/TienDoMayVe/`. Gửi link này cho mọi người.
5. Supabase → **Authentication → URL Configuration** → **Site URL**: dán link ở trên → Save.

Khi sửa `index.html` sau này, chỉ cần **Upload files** đè lên trong repo. Khoảng 1 phút sau trang tự cập nhật.

## Thêm đồng nghiệp

1. Supabase → **Authentication → Users → Add user**: tạo email và mật khẩu, tick **Auto Confirm User**.
2. Mở `02_users.sql`:
   - Thêm 1 dòng: `, ('email@duytanrecycling.com', 'Họ tên', 'editor')`
   - Dán vào SQL Editor → **Run**.
3. Gửi link, email và mật khẩu cho người đó.

**Thu hồi quyền:** chạy lệnh `delete` ở cuối file `02_users.sql`, hoặc xoá user trong Authentication → Users.

## Dùng hằng ngày

- **➕ Nhập máy, ✏️ Sửa thông tin, 🗑 Xoá máy:** ghi thẳng vào Supabase. Ai đang mở trang sẽ thấy thông báo *"Có người vừa cập nhật"*.
- **📂 Nạp Excel:** thay toàn bộ danh sách bằng file `TienDoMayVe.xlsx`. App đọc sheet `📝Cập nhật` và tự tính ngày về KH/NM giống công thức Excel. App tự tải file sao lưu trước khi nạp. Nếu lỗi giữa chừng thì không có gì bị thay đổi. Máy trong thùng rác được giữ nguyên.
- **🗑 Xoá máy:** máy vào thùng rác. Admin bấm nút 🗑 trên thanh công cụ để khôi phục hoặc xoá hẳn.
- **🕘 Lịch sử:** bấm vào máy để xem. Toàn bộ nhật ký nằm ở Supabase → **Table Editor → audit_log**.
- **⬇️ Excel:** tải toàn bộ danh sách ra Excel (dành cho editor và admin).

**Sao lưu định kỳ (quan trọng với gói Free):** mỗi thứ 6, bấm ⬇️ Excel rồi lưu file vào OneDrive công ty. Khi cần khôi phục, bấm 📂 Nạp Excel và chọn file đó.

## Lưu ý gói miễn phí của Supabase

- Project **tự tạm dừng nếu 7 ngày không ai truy cập**. Khi đó vào supabase.com bấm **Restore project**. Dữ liệu không mất.
- Giới hạn 500 MB dữ liệu. Danh sách máy chỉ chiếm vài trăm KB.
- Gói miễn phí không có sao lưu tự động. Hãy sao lưu bằng nút ⬇️ Excel như trên, hoặc nâng lên gói Pro (từ 25 USD/tháng, có sao lưu hằng ngày) khi dùng chính thức.

## Lưu ý về dữ liệu và pháp lý

- Dữ liệu nằm trên máy chủ Supabase (AWS Singapore), được mã hoá khi lưu và khi truyền. Supabase có chứng nhận SOC 2 Type 2 và ISO 27001.
- App có chứa dữ liệu cá nhân: tên người phụ trách, email đăng nhập, nhật ký. Theo Luật Bảo vệ dữ liệu cá nhân 2025 và Nghị định 356/2025 (hiệu lực từ 01/01/2026), đưa dữ liệu cá nhân ra nước ngoài cần hồ sơ đánh giá tác động. **Hãy hỏi IT/pháp chế trước khi nạp dữ liệu thật.** Trong lúc chờ, dùng bộ dữ liệu ẩn danh `03b`.

## Khi gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Trang báo *"Chưa cấu hình máy chủ"* | Chưa dán URL/khoá vào `config.js`, hoặc chưa upload `config.js` lên GitHub |
| *"Sai email hoặc mật khẩu"* | Kiểm tra lại user trong Authentication → Users, đã tick Auto Confirm chưa |
| *"Chưa được cấp quyền"* | Email chưa có trong `app_users`: chạy lại `02_users.sql` có email đó |
| Không thấy nút Nhập máy / Nạp Excel / Excel | Tài khoản đang là `viewer` |
| Không thấy nút 🗑 Thùng rác | Chỉ tài khoản `admin` mới có |
| Báo *"Máy này vừa được người khác sửa hoặc xoá"* | Có người vừa sửa máy đó. Bấm 🔄 Làm mới rồi sửa lại |
| Báo lỗi khi cấp quyền trong `02_users.sql` | Email không phải `@duytanrecycling.com` |
| Dashboard trống, báo không tải được dữ liệu | Project Supabase đang tạm dừng: vào supabase.com → Restore |
