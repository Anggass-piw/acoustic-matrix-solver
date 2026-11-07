# Catatan review lokal

Proyek terpisah Android dan Windows untuk konsep Acoustic Matrix Solver. Frontend bersama berjalan sepenuhnya lokal; Android memakai WebView terbatas tanpa izin jaringan/mikrofon dan Windows memakai Electron dengan sandbox/context isolation.

Solver numerik mengerjakan Ax=b dengan eliminasi Gauss ber-pivot. Lapisan gelombang, ruang oktagonal, echo/resonansi sederhana, dan FFT adalah simulasi/software sintetis; tidak mengklaim mewakili chamber fisik atau pemecahan persamaan lewat suara fisik.

Periksa hasil build di folder `android/release/` dan `windows/release/`. Build native target tidak dapat dianggap sebagai pengujian runtime pada perangkat Android/Windows kecuali benar-benar dijalankan di OS tersebut.
