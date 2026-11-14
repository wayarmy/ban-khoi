# Nicky's Blocks

Game 3D cho bé 5 tuổi chưa biết đọc: đi quanh một hòn đảo khối vuông, xếp khối gỗ thành số và chữ cái.
Có giọng nói hướng dẫn, không có chữ để đọc, không quảng cáo, không thu dữ liệu.
Chạy bằng Three.js, đóng gói Android bằng Capacitor.

## Chạy thử trên web
```
npm install
npx vite
```

## Build APK (cần JDK 17 và Android SDK)
```
npx vite build && npx cap sync android
cd android && ./gradlew assembleDebug
```

## Nguồn tài sản
- Nhân vật "Bạn Khối": tự thiết kế, ghép từ các khối, động tác viết bằng code (`src/blockhero.js`).
- Khối, cây, đồi, mây: tự vẽ bằng code, không dùng hình của Minecraft.
