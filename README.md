# Acoustic Matrix Solver — Android & Windows

Aplikasi simulasi software terpisah untuk Android dan Windows, dibuat dari konsep **Acoustic Matrix Solver** pada catatan pengguna. Kedua target memakai antarmuka dan algoritme lokal yang sama; UI disertakan dalam masing-masing paket agar dapat dipakai offline.

## Fitur

- Editor sistem persamaan linear **Ax = b**, ukuran 2×2 hingga 5×5, dengan contoh siap pakai.
- Solver eliminasi Gauss dengan partial pivoting, deteksi matriks singular/hampir singular, nilai solusi, dan residual maksimum.
- Koefisien dipetakan secara deterministik menjadi frekuensi dan fase sintetis.
- Animasi interferensi konstruktif/destruktif dalam ruang oktagonal virtual.
- Waveform sintesis dan analisis spektrum menggunakan FFT radix-2 2048 sampel.
- Aplikasi tidak memerlukan jaringan, tidak meminta izin mikrofon, dan tidak mengakses perangkat audio atau chamber fisik.

## Batas model

Ini adalah simulasi edukatif berbasis software. Visualisasi interferensi dan respons resonansi adalah ilustrasi 2D dan sinyal sintetis yang dibuat lokal; **bukan simulasi akustik fisik yang tervalidasi**, bukan rekaman mikrofon, dan bukan hasil pengukuran chamber. Solusi **Ax = b** diperoleh langsung dengan solver numerik; FFT hanya menganalisis waveform sintetis dan tidak dipakai untuk menentukan solusi linear.

## Menjalankan dan membangun

- **Android:** bangun APK debug dengan instruksi di bawah. APK debug ditujukan untuk instalasi/pengujian privat dan tidak diterbitkan dalam rilis ini.
- **Windows:** unduh dan ekstrak [Acoustic-Matrix-Solver-Windows-1.0.0-x64.zip](https://github.com/Anggass-piw/acoustic-matrix-solver/releases/download/v1.0.0/Acoustic-Matrix-Solver-Windows-1.0.0-x64.zip), kemudian jalankan `Acoustic Matrix Solver.exe` dari folder hasil ekstrak. Pertahankan semua file runtime di folder yang sama. Ini paket x64 portabel dan tidak memerlukan instalasi; karena build tidak ditandatangani, Windows dapat menampilkan peringatan SmartScreen.

Build Android memerlukan Java 17+ dan Android SDK API 35:

```bash
cd android
ANDROID_HOME=/path/to/android-sdk ./gradlew assembleDebug
```

Build paket Windows memerlukan Node.js dan npm:

```bash
cd windows
npm install
npm run build:win
```

Untuk menyinkronkan UI yang sama ke paket:

```bash
cp shared/* android/app/src/main/assets/
cp shared/* windows/web/
```

## Verifikasi

APK Android dapat dibangun dan diperiksa dengan Android SDK. Windows ZIP dibuat sebagai paket Electron x64 lintas-platform; aplikasi Windows perlu dibuka di Windows 10/11 untuk uji runtime akhir. Tidak ada perangkat akustik fisik yang dipakai.

## License

Released under the MIT License. See `LICENSE`.
