# FAITH — Windows ilovasi

FAITH platformasining kompyuter (Windows) ilovasi. U jonli saytni
(https://faith-platform-green.vercel.app) alohida oynada ochadi. Shuning uchun
saytda nima yangilansa, ilovada ham shu zahoti ko'rinadi. Ilovani qayta
o'rnatish kerak emas.

Platforma kodi (`..\FAITH`) bu yerda o'zgartirilmaydi va ishlatilmaydi.

## Tayyor fayllar (`dist\`)

| Fayl | Nima uchun |
|---|---|
| `FAITH-Setup-x64.exe` | O'rnatuvchi: papka tanlash, Ish stoli va Start menyusida yorliq, Windows'dan o'chirish |
| `FAITH-Portable-x64.exe` | O'rnatmasdan ishga tushadigan bitta fayl (fleshkada olib yurish mumkin) |
| `win-unpacked\FAITH.exe` | Tekshirish uchun ochilgan nusxa |

Ilova imzolanmagan (kod imzolash sertifikati yo'q). Shuning uchun birinchi
ochilishda Windows SmartScreen "Windows protected your PC" deydi:
**More info → Run anyway** bosiladi.

## Nimalar bor

- Qora splash oyna (FAITH belgisi + neon yashil chiziq), sayt yuklanguncha.
- Oyna o'lchami va joyi eslab qolinadi; Windows sarlavha paneli qora.
- Ilova faqat bitta nusxada ishlaydi: qayta ochilsa, mavjud oyna oldinga chiqadi.
- Kirish holati (cookie) saqlanadi: har safar qayta kirish shart emas.
- Google / Apple orqali kirish va to'lov sahifalari ilova ichida ochiladi.
  Boshqa tashqi havolalar odatiy brauzerda ochiladi.
- Internet uzilsa, FAITH uslubidagi "aloqa yo'q" sahifasi chiqadi. U 15 soniyada
  o'zi qayta uriniladi, internet qaytganda darhol ochiladi.
- Yuklab olishlar (Excel eksport, cheklar, fayllar) "Yuklanmalar" papkasini
  taklif qiladi. Tugagach bildirishnoma chiqadi, bosilsa fayl papkada ko'rsatiladi.
- O'ng tugma menyusi (nusxalash, qo'yish, havolani brauzerda ochish va h.k.), o'zbekcha.
- Klaviatura: `Ctrl+R`/`F5` yangilash, `Ctrl+Shift+R` keshsiz yangilash,
  `Ctrl +`/`Ctrl -`/`Ctrl 0` masshtab, `F11` to'liq ekran, `Alt+←`/`Alt+→`
  orqaga/oldinga (sichqonchaning yon tugmalari ham), `Alt+Home` bosh sahifa,
  `Ctrl+Shift+C` joriy sahifa havolasini nusxalash. `Alt` menyuni ko'rsatadi.
- Ekran himoyasi: FAITH oynasi skrinshot, ekran yozish (OBS, Game Bar, Snipping Tool) va
  ekran namoyishida (Zoom, Telegram, Discord) bo'sh/qora ko'rinadi (`WDA_EXCLUDEFROMCAPTURE`).
  O'rnatilgan versiyada dasturchi vositalari (DevTools) o'chirilgan.
- Xavfsizlik: sahifalar sandbox'da, Node.js'ga kirish yo'q, kamera/mikrofon/joylashuv
  ruxsatlari berilmaydi.

## Boshqa manzilga ulash

Standart manzil — jonli sayt. O'zgartirish uchun (birinchisi ustun):

1. Buyruq qatori: `FAITH.exe --url=https://yangi-domen.uz`
2. Muhit o'zgaruvchisi: `FAITH_URL=https://yangi-domen.uz`
3. Fayl `%APPDATA%\FAITH\config.json`:
   ```json
   { "url": "https://yangi-domen.uz", "inAppHosts": ["pay.example.uz"] }
   ```
   `inAppHosts` — ilova ichida ochilishi kerak bo'lgan qo'shimcha domenlar
   (masalan, yangi to'lov provayderi).

Faqat `https://` qabul qilinadi; `http://` faqat `localhost` uchun.

Saytga o'z domeni ulansa, `src/config.js` dagi `DEFAULT_URL` ni almashtirib,
qayta yig'ish kifoya.

## Yangi versiya chiqarish

Fayl nomlari o'zgarmaydi (`FAITH-Setup-x64.exe`, `FAITH-Portable-x64.exe`), shuning uchun saytdagi
`/download` sahifasi `releases/latest/download/...` orqali doim eng yangisini beradi.

Bitta buyruq: `npm run release` (1.0.0 dan 1.0.1 ga), `npm run release -- minor` yoki `npm run release -- 2.0.0`.
U versiyani oshiradi, ikkala .exe ni yig'adi, GitHub release yaratadi va saytdagi versiya/o'lchamni
(`FAITH/apps/web/src/lib/desktop.ts`) yangilab push qiladi. Bir marta `gh auth login` qilingan bo'lishi kerak.

## Dasturchi uchun

Node.js 22+ kerak.

```powershell
npm install
node node_modules/electron/install.js   # npm install-skriptlarni bloklasa, Electron'ni yuklab oladi
npm start                               # jonli saytga ulanib ochiladi
npm run start:local                     # lokal FAITH (http://localhost:3100) bilan
npm run dist                            # dist\ ichida Setup + Portable .exe
```

`npm start` VS Code terminalidagi `ELECTRON_RUN_AS_NODE` o'zgaruvchisini o'zi
olib tashlaydi. `electron .` ni to'g'ridan-to'g'ri ishlatsangiz, avval uni o'chiring.

Versiyani oshirish: `package.json` dagi `version`, keyin `npm run dist`.

Fayllar:

- `src/main.js` — oyna, splash, navigatsiya qoidalari, menyu, yuklab olish, ruxsatlar
- `src/config.js` — manzil va ilova ichida ochiladigan domenlar ro'yxati
- `src/splash.html`, `src/offline.html` — yuklanish va aloqa yo'q sahifalari
- `assets/`, `build/icon.png` — FAITH belgisi (platformaning `apps/web/public` dan nusxa)
