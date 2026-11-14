# Ghi chú cho Apple (App Review) và TestFlight

Dán nguyên văn tiếng Anh (người xét duyệt đọc tiếng Anh).

## Review Notes (mục "App Review Information")

Điền thông tin liên hệ thật của anh: First name, Last name, Phone (ví dụ +84...), Email.
Sign-in required: **tắt** (không cần tài khoản).

```
Nicky's Blocks is an offline 3D learning game for young children (ages 4-7). No account, login, server or network connection is needed. No ads, no in-app purchases, no analytics, no external links, no data collection.

How to test (about 2 minutes):
1. Launch the app and tap the large green play button. Optionally pick one of six characters on the first screen first.
2. Use the round stick at the bottom left to walk. Walk toward the glowing yellow beam (the arrow at the top points to it; a small map is at the top left).
3. Near the beam a large yellow button appears at the bottom right. Tap it once: the character runs to fetch each wooden block, carries it overhead and places it on the wall to form a number or letter. A voice reads the number or letter aloud (the device text-to-speech voice, language vi-VN).
4. When finished the player receives a card. Cards unlock word quests in the city (east of the start).
5. A race track for cars is in the amusement park (west); tap the red button quickly to race.

The app speaks using the system text-to-speech (AVSpeechSynthesizer through WKWebView speechSynthesis). The app never records audio and never uses the microphone or camera.

The game is made with a web rendering engine (Three.js) packaged with Capacitor. All content is bundled inside the app and runs fully offline. It is a real-time 3D game with original art, not a wrapped website.
```

## TestFlight: Test Information

| Mục | Điền |
|---|---|
| Beta App Description | Nicky's Blocks is a 3D learning game for young children. Build numbers and letters from blocks, explore a big island. |
| Feedback Email | quanpc294@gmail.com |
| What to Test | Walk with the stick, build a number or letter with the yellow button, check that the voice reads aloud, try a race, plant and harvest on the farm. Tell us about lag, crashes, or anything confusing for a child. |
| Beta App Review: Notes | Dùng lại đoạn Review Notes ở trên |
| Sign-in required | Tắt |

## Thử nội bộ và thử bên ngoài

| Loại | Cách làm | Có chờ Apple xét? |
|---|---|---|
| Internal Testing | App Store Connect, tab TestFlight, Internal Testing, dấu cộng, đặt tên nhóm, thêm người. Người thử phải là thành viên trong Users and Access | Không |
| External Testing | Tạo nhóm bên ngoài, thêm email hoặc bật Public Link, chọn build | Có, chỉ lần đầu của mỗi phiên bản, thường 1 đến 2 ngày |

Bản thử hết hạn sau 90 ngày.
