# Đưa Nicky's Blocks lên TestFlight và App Store

Phần em đã làm sẵn: ứng dụng iOS, biểu tượng, màn hình chờ, khai báo riêng tư, trang chính sách riêng tư, ảnh chụp màn hình, toàn bộ chữ cho App Store, và quy trình tự động ký rồi gửi lên TestFlight.
Phần anh cần làm: những việc cần tài khoản Apple và thẻ thanh toán. Làm theo thứ tự dưới đây.

Tên các nút của Apple có thể đổi chút theo thời gian. Nếu khác, tìm nút gần giống.

## Bước 1. Đăng ký Apple Developer (anh làm)

1. Cần một Apple ID có bật xác thực hai lớp.
2. Vào https://developer.apple.com/programs/enroll/ và đăng nhập.
3. Chọn **Individual** (cá nhân). Không cần mã D-U-N-S như tài khoản công ty.
4. Điền họ tên đúng như giấy tờ. Apple có thể yêu cầu xác minh giấy tờ.
5. Trả 99 đô một năm. Kích hoạt thường trong vài giờ, đôi khi tới 2 ngày.

Khi xong, mở https://developer.apple.com/account, mục **Membership details**, ghi lại **Team ID** (10 ký tự chữ và số). Đây là `APPLE_TEAM_ID`.

## Bước 2. Đăng ký mã ứng dụng (anh làm)

1. Vào https://developer.apple.com/account/resources/identifiers/list
2. Bấm dấu **+**, chọn **App IDs**, bấm Continue, chọn **App**, Continue.
3. Description: `Nicky's Blocks`. Bundle ID: chọn **Explicit** và gõ `net.mcforce.banhhoikhoi`.
4. Không cần bật thêm khả năng nào. Bấm Continue, rồi Register.

Nếu muốn mã khác (ví dụ `com.tenanh.bankhoi`), báo em để em đổi trong dự án trước khi build.

## Bước 3. Tạo ứng dụng trên App Store Connect (anh làm)

1. Vào https://appstoreconnect.apple.com, mục **Apps**, bấm **+**, **New App**.
2. Platforms: iOS. Name: `Nicky's Blocks`. Primary Language: Vietnamese.
3. Bundle ID: chọn `net.mcforce.banhhoikhoi`. SKU: `banhkhoi001`. User Access: Full Access.
4. Bấm Create.

## Bước 4. Tạo khóa API để máy tự đăng bản lên (anh làm)

1. App Store Connect, **Users and Access**, tab **Integrations**, **App Store Connect API**, **Team Keys**.
2. Bấm **+**. Name: `github-actions`. Access: **App Manager**. Bấm Generate.
3. Bấm **Download API Key**. File `AuthKey_XXXXXXXXXX.p8`. **Chỉ tải được một lần.** Cất kỹ, không gửi cho ai.
4. Ghi lại hai mã trên trang đó: **Key ID** (cột Key ID) và **Issuer ID** (dòng trên cùng của bảng).

## Bước 5. Đưa 4 giá trị vào GitHub (anh làm)

Cách dễ nhất: mở terminal trên máy anh đã đăng nhập `gh`, chạy 4 lệnh (thay chữ in hoa):

```
gh secret set APPLE_TEAM_ID --repo wayarmy/ban-khoi --body "TEAMID"
gh secret set APPSTORE_KEY_ID --repo wayarmy/ban-khoi --body "KEYID"
gh secret set APPSTORE_ISSUER_ID --repo wayarmy/ban-khoi --body "ISSUERID"
base64 -w0 AuthKey_XXXXXXXXXX.p8 | gh secret set APPSTORE_KEY_P8 --repo wayarmy/ban-khoi
```

Trên máy Mac, lệnh `base64` không có `-w0`: dùng `base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' | gh secret set APPSTORE_KEY_P8 --repo wayarmy/ban-khoi`.

Hoặc làm bằng trình duyệt: GitHub, repo `ban-khoi`, Settings, Secrets and variables, Actions, New repository secret.

Lưu ý: gửi **nội dung khóa** cho em là không nên. Anh tự nhập vào GitHub, em không cần thấy.

## Bước 6. Gửi bản đầu lên TestFlight (tự động)

Cách A, trên trang GitHub: repo `ban-khoi`, tab **Actions**, chọn **iOS**, bấm **Run workflow**, chọn nhánh `ios`, tích **upload**, bấm Run.

Cách B, bằng lệnh (phải đang ở nhánh `ios`):

```
git tag v1.0.0
git push origin v1.0.0
```

Chờ khoảng 10 phút. Xong thì bản build hiện trong App Store Connect, tab **TestFlight**, trạng thái **Processing** rồi **Ready to Submit**, mất thêm 10 đến 30 phút.

Nếu bước này lỗi, gửi em chữ lỗi trong tab Actions, em sửa.

## Bước 7. Thử trên iPhone qua TestFlight

1. Cài ứng dụng **TestFlight** từ App Store trên iPhone.
2. Thử nội bộ (không phải chờ Apple xét): App Store Connect, **TestFlight**, **Internal Testing**, dấu **+**, tạo nhóm, thêm Apple ID của anh. Anh phải là thành viên trong **Users and Access** (anh mặc định đã là).
3. Mở email mời hoặc mở TestFlight, bấm **Install**.
4. Thử đủ: đi, xếp số, nghe giọng nói, xoay màn hình, đua xe, nông trại.
5. Muốn cho người khác thử: **External Testing**, điền **Test Information** (xem `store/review-and-testflight.md`), nộp xét. Chờ 1 đến 2 ngày, chỉ lần đầu.

## Bước 8. Điền thông tin App Store (anh làm, em đã soạn sẵn chữ)

Mở `store/listing.vi.md`, sao chép vào đúng ô. Trong App Store Connect, vào ứng dụng, mục **1.0 Prepare for Submission**:

| Việc | Lấy ở đâu |
|---|---|
| Ảnh chụp màn hình iPhone 6.9" | thư mục `store/screenshots/iphone-6.9/` (8 ảnh) |
| Promotional Text, Description, Keywords, What's New | `store/listing.vi.md` |
| Support URL, Privacy Policy URL | `https://wayarmy.github.io/ban-khoi/` và `.../privacy.html` (đã mở được) |
| Copyright | `2026 Wayarmy` |
| Age Rating (trả lời toàn bộ "None") | `store/listing.vi.md`, mục "Trả lời các câu hỏi của Apple" |
| Category: Kids, tuổi 5 and Under | cùng file |
| App Privacy: Data Not Collected | cùng file |
| Pricing: Free | mục **Pricing and Availability** |
| App Review Information: liên hệ và ghi chú | `store/review-and-testflight.md` |
| Build | bấm **+** cạnh Build, chọn bản đã đăng ở bước 6 |

Cuối cùng bấm **Add for Review**, rồi **Submit to App Review**.

## Bước 9. Chờ Apple xét

Thường 1 đến 3 ngày. Có thể bị trả lại kèm lý do. Các lý do hay gặp với app như thế này:

| Lý do | Cách tránh hoặc sửa |
|---|---|
| 4.2 "Minimum functionality": app giống trang web đóng gói | Ghi rõ trong Review Notes đây là game 3D chạy offline (đã ghi). Nếu bị hỏi, trả lời lại nêu các tính năng |
| 1.3 Kids Category: có liên kết ra ngoài, quảng cáo, thu dữ liệu | App không có cả ba. Không thêm sau này |
| 2.1 App sập hoặc lỗi | Thử kỹ qua TestFlight trên iPhone thật trước khi nộp |
| 5.1.1 Thiếu chính sách riêng tư | Đã có trang, phải luôn mở được |
| Giọng đọc im lặng | Máy iPhone cần có giọng tiếng Việt. Thu giọng thật vào app sẽ chắc hơn |

## Việc về sau

- Muốn gửi bản cập nhật: sửa mã, đẩy tag mới `v1.0.1`. Số build tự tăng.
- Hết hạn: bản TestFlight sau 90 ngày, tài khoản Apple Developer sau 1 năm (nhớ gia hạn, không thì app bị gỡ khỏi cửa hàng).
