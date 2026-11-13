# Bạn Khối

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
- Nhân vật và động tác: [Mesh2Motion](https://mesh2motion.org) (CC0), một số động tác người từ Quaternius.
- Khối, cây, đồi, mây: tự vẽ bằng code, không dùng hình của Minecraft.
