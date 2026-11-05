# ICQ New: ממצאי מחקר לשחזור הממשק וההתנהגות של לקוח הדסקטופ

מסמך זה מרכז ראיות על לקוח הדסקטופ של ICQ New (Mail.ru / VK, 2020 עד 2024) לצורך שחזור נאמן על הסטאק הקיים של openICQ: לקוח React 19, שרת Fastify + WebSocket + SQLite ומעטפת Electron. הפרוזה בעברית, ומחרוזות ממשק, שמות קבצים וטוקנים מצוטטים באנגלית כפי שהם מופיעים במקור. הקובץ המשלים, קריא למכונה: `docs/research/icq-new-ui-spec.json`.

## 1. מקורות, גרסאות ורישוי

### 1.1 טבלת מקורות

| מקור | ערך |
|---|---|
| קוד מקור | `github.com/mail-ru-im/im-desktop`, ענף יחיד `master`, אין תגיות. commit `78924d804fc38a5746a073d5bdb71c1c4cc97780` מ-2022-07-14 ("Delete .gitlab-ci.yml"). שוכפל עם `--depth 1` לסקראצ'פד |
| גרסה בקוד | `common.shared/version_info_constants.h`: Windows `10.0.1999`, Linux `10.0.3112`, mac `3.0.1234` (ערכי placeholder של ה-build). `products/icq/config.json`: `product_version_major` 10, `client_api_version` 83 |
| בינארי Windows (הגרסה האחרונה) | archive.org, פריטים `icqsetup_202610` ו-`icqsetup` (אותו קובץ). `icqsetup.exe`, 108,927,456 בתים, SHA-256 `e27a6d8c2b0a0668d2c262fee48a4a6ae84e0db25575980cddea5139106556ea`, FileVersion `23.2.0.48119`, CompanyName "Mail.ru LLC". חתימה "LLC Mail.Ru" (DigiCert, תוקף 2021-11-03 עד 2023-07-21, החתימה לא אומתה) |
| `icq.exe` הפנימי | SHA-256 `aa2a658d7a0783cd6cfec21fdfec385119ec3c019df7f84be96d92dc346b167d`, VS_VERSION `23.2.0.48119`, תאריכי קבצים 2023-04-12 |
| בינארי macOS | archive.org `icq_20250704`, `icq.dmg`, SHA-256 `91b08e582b97ff54de64409b986c619a20715f7c0c2f210f6cbafbefe23a971a`, `CFBundleShortVersionString` 23.2.0, build 37179, 2023-03-27, מינימום macOS 10.14 |
| בינארי Linux | Wayback, לכידה של `icq-www.hb.bizmrg.com/linux/x64/icq.tar.xz` מ-2024-06-26, גרסה `23.2.0.16909`, 2023-03-27 |
| רשת | ראו סעיף 12 |

### 1.2 שרשרת החילוץ (Observation)

1. קוד המקור שוכפל כקריאה בלבד. נתונים חולצו בסקריפטים נפרדים (`.../scratchpad/icq-new-scripts/`), שכל אחד מהם קורא קבצים לפי נתיב ורץ עם `python3 -I`.
2. `icqsetup.exe` הוא עטיפה: בתוכו `INSTALLER/INSTALLER.EXE`, בתוכו `FILES/FILES.7Z`, ובתוכו `icq.exe` וספריות Qt. משאבי Qt (rcc, דחוסים ב-zlib) נחתכו סטטית מתוך `icq.exe`: `themes/meta.json`, 12 קבצי `.qm`, 6 קבצי WAV, `config.json` וקבצי SVG.
3. ה-DMG וה-tar.xz נבדקו סטטית בלבד. אף בינארי שהורד לא הורץ.
4. כל הבדיקה הבינארית בוצעה ב-`npx -y rea-agents@6.8.0 ... --json`. מזהי הראיות בטבלה הבאה.

### 1.3 מפתח ראיות REA

| נושא | REA Evidence ID |
|---|---|
| `icqsetup.exe`, משאבים | `ev_b36c6d618316de16dffca38d618a71d952f3edb68ed9820e78dae70b31fecdec` |
| `icqsetup.exe`, תעודות | `ev_38591ae807cc2bec788ba028ab845addb35fa8fbb4ff4b86fcfdf35505a6a24c` |
| `INSTALLER.EXE` (SHA-256 `25ef2dce...84a3`) | `ev_072cfe4240484f0b9b255f324bfca0a2f55868fe6815d306392e40046c119f54` |
| `icq.exe` 23.2.0.48119, משאבים | `ev_3f33337b0d8b0df77c44a8cc6a5bcb1fc9767915c0dc229291328a68fdfbcc20` |
| `icq.dmg`, סיכום | `ev_135906ee1d9c2553d3dd6556bbbb6ebc3efee5b4f4c4c414ba58aa40175b58bc` |
| `icq.dmg`, ראיות | `ev_77e1b456ac1d9791aaa3335af6b1682611b61897279bd27818be8e0b06886e0a` |
| Linux `icq` ELF (SHA-256 `a33b4e4a...09c5`) | `ev_6870c4a3096a7553278ef5311a9d766ff62b9f220a33652b525727c69bf66625` |

קבצי ה-JSON המלאים של REA: `.../scratchpad/icq-new/rea-out/`.

### 1.4 תוויות

- **Observation**: נצפה ישירות בקוד המקור (נתיב:שורה), או במשאב שחולץ מהבינארי (עם מזהה REA או נתיב בסקראצ'פד), או בדף רשת עם URL.
- **Inference**: מסקנה מבוססת אך לא מוכחת.
- **Unknown**: אין ראיה. לכל Unknown מצורפת הנחת עבודה לשחזור.

כל המידות בפיקסלים לוגיים בסקייל 100% (`Utils::scale_value`). הלקוח הציע סקייל ממשק של 100, 125, 150 ו-200 אחוז.

### 1.5 רישוי: מה מותר לנו לעשות

| רכיב | ממצא | תווית | מסקנה לשחזור |
|---|---|---|---|
| קוד המקור | `LICENSE.md`: "This source code is Copyright (C) 2016 ICQ LLC (Mail.Ru Group), published under Apache Public License 2.0, except third-party libraries". `NOTICE.md` מפרט ספריות צד שלישי (libcurl, FFmpeg LGPL, Boost, OpenSSL, RapidJSON, OpenAL LGPL, zlib, Sparkle, Qt LGPLv3, rlottie, VirtualDesktopAccessor) | Observation | מותר לקרוא, ללמוד ולהעתיק לוגיקה או ערכים, בתנאי Apache 2.0: שמירת הודעת זכויות, צירוף NOTICE ציון שינויים. אנחנו לא מעתיקים קוד C++ אלא ממירים מידות וטוקנים, וזה המסלול הבטוח |
| סימני מסחר | Apache 2.0 סעיף 6 לא מעניק זכות להשתמש בשמות ובסימני מסחר. הלוגו, הפרח והשם ICQ שייכים לבעלים | Observation (נוסח הרישיון) | אסור להשתמש בלוגו ובאייקוני האפליקציה. השם "openICQ" כבר קיים בפרויקט; כדאי לשקול ייעוץ על השם, זה Unknown משפטי |
| אייקוני SVG ו-PNG ב-`gui/resources` | אין להם רישיון נפרד. הם יושבים בתוך הריפו שמוכרז כ-Apache 2.0 "except third-party libraries" | Inference | ייתכן שמותר לשימוש תחת Apache 2.0, אבל הבעלות לא מוצהרת במפורש. לפי כלל הבעלים הם לא מועתקים לפרויקט. מציירים אייקונים משלנו לפי שמות ותפקידים (סעיף 10) |
| צלילים | 6 קבצי WAV, ללא רישיון נפרד. `incoming.wav` דומה במעטפת שלו ל-`Message.wav` של 2001b ("uh-oh") | Observation (קבצים), Inference (דמיון) | לא להעתיק. להקליט או לייצר צליל משלנו |
| גופנים | `SFProText-*.ttf` ו-`SF-Mono-*.otf`: טבלת name מכילה "This San Francisco Font (the Apple Font) is licensed to you by Apple Inc." | Observation | אסור להפיץ. ב-macOS להשתמש בגופן המערכת |
|  | `SourceSansPro-*.ttf`: "SIL Open Font License, Version 1.1", Adobe | Observation | מותר. מומלץ Source Sans 3 (היורש, OFL) |
|  | `RobotoMono-*.ttf`: "Licensed under the Apache License, Version 2.0" | Observation | מותר |
|  | `RoundedMplus1c-Bold.ttf` + `OFL.txt` | Observation | מותר (OFL 1.1). משמש לאות באווטאר ברירת מחדל |
| אימוג'י | בקוד הנתיב `:/apple_emoji/...` (`gui/cache/emoji/Emoji.cpp:64`), אבל התמונות לא בריפו. בבינארי 23.2.0 יש כ-2,668 SVG של אימוג'י בגודל 64x64. דף About מכיל "Emoji provided free by Emoji One" (`gui/main_window/settings/SettingsAboutUs.cpp:151`) | Observation (קיום), Unknown (סט ורישיון) | לא להשתמש. להשתמש באימוג'י של המערכת או בסט פתוח (Twemoji CC-BY 4.0, Noto Emoji) |
| סטיקרים | אין קבצי סטיקרים בריפו מלבד שני איורי חתול ל-placeholders. החנות והחבילות מגיעות מהשרת (`core/connections/wim/packets/get_stickers_store.cpp`) | Observation | אסור ולא זמין. סטיקרים הם יצירה מוגנת |
| מנוע שיחות | `CMakeLists.txt:783-800`: ספריית `voip3_${VOIP_LIBS_VERSION}_desktop` מורדת כ-zip בזמן build. אין לה קוד בריפו | Observation | לא ניתן לשימוש. שיחות דורשות WebRTC משלנו |
| טפטים (תמונות) | רק הצבעים ב-`meta.json`. התמונות מורדות מ-`/wallpaperlist/v2/windows` בשרת (`core/connections/wim/packets/get_themes_index.cpp:16`, `core/themes/wallpaper_loader.cpp:250`) | Observation | לא זמינים ולא שלנו. טפטים בצבע אחיד (1001, 1002) מספיקים |
| הבינארי 23.2.0 | אין EULA או קובץ הודעות צד שלישי בחבילת Windows או ב-DMG. האפליקציה מפנה ל-`privacy.icq.com/legal/terms` ו-`/legal/ppr` | Observation | הבינארי משמש רק כראיה להצלבה, לא כמקור נכסים |

## 2. הגרסה שעליה עוגנו

**Observation**: לריפו אין תגיות ויש לו ענף אחד. ה-commit האחרון הוא מ-2022-07-14, וקבועי הגרסה הם 10.0.x. `RELEASE_NOTES` מונה: Reactions, Statuses, New themes, Unreads counter in window title.

**Observation**: הבילד האחרון שפורסם הוא **23.2.0** (Windows `23.2.0.48119` מ-2023-04-12, macOS 23.2.0 build 37179 ו-Linux 23.2.0.16909 מ-2023-03-27). ב-Wayback, ל-`icq-www.hb.bizmrg.com/win/x32/icqsetup.exe` יש אותו SHA-1 בכל הלכידות מ-2023-07-08 ועד 2026-01, ו-`/mac/x64/icq.dmg` זהה בלכידות 2024-03-18, 2024-05-24 ו-2024-06-26. כלומר זה מה שהורד עד יום הסגירה.

**Inference**: VK עברה ממספור 10.x למספור 2x.x (שנה.רבעון) בסביבת 2023. הקוד הציבורי מקדים את הבינארי האחרון בכ-9 חודשים.

**ההחלטה**: צבעים, `config.json` ומחרוזות נלקחים מהבינארי 23.2.0. מידות, התנהגות והפניות לקבצים נלקחים מהקוד (10.0.x), ונבדקו מול הבינארי היכן שאפשר.

ההבדלים שנמצאו בין הקוד לבינארי (Observation, `.../scratchpad/icq-new/win-icqexe-rcc-zlib/`):

- ערכות נושא: אותן 10 ערכות. בקוד שש מהן מסומנות `hidden` (Violet, Dark Violet, Orange, Dark Orange, Pink, Dark Pink); בבינארי אף אחת לא מוסתרת. `primary` `#21D86A` ו-`chat_secondary` `#D6FFE0` זהים. השינוי היחיד בערך קיים: `app_primary` בערכות הבהירות עבר מ-`#F4F4F4` ל-`#FAFAFA`. נוספו 16 טוקני בסיס, בעיקר לשיחות ולתפריטים (למשל `text_solid_dark` `#DBDBDB`, `icon_negative` `#ff5f5f`). בטפט 1002 השתנו צבעי `newplate`.
- צלילים: ששת קבצי ה-WAV זהים ברמת הבית.
- `config.json`: דגלי הפיצ'רים זהים (`threads_enabled` false, `statuses_enabled` true, `show_reactions` true, כניסה בטלפון, ב-UIN ובאימייל מותרת). `client_api_version` עלה מ-83 ל-91. נוספו 11 דגלים, כולם false חוץ מ-`livechat_deeplink_enabled`, ובהם `enable_pin_message_in_private_chats: false`.
- מחרוזות: מול `gui/translations/en.ts`, 106 חדשות ו-68 שהוסרו. חדשות בולטות: תפריט מגש (Quick status, Chats, Hide, Minimize, Settings), "Mark all as read", לשונית הגדרות "Calls" שמחליפה את "Voice and video", "Change status", "Showcase section is available in ICQ Mobile only", "Based on VK Teams".
- אייקונים: 396 SVG זהים לקוד, 34 SVG מהקוד חסרים בבינארי, ועוד כ-2,668 SVG של אימוג'י שאינם בריפו.

## 3. החלון הראשי

**Observation** (`gui/main_window/MainWindow.cpp:262-276, 1161-1170`): גודל ברירת מחדל 1000x600, רוחב מינימלי 380, גובה מינימלי 580. ב-Windows יש שורת כותרת מצוירת עם כפתורים בגודל 44x28 (`getTitleButtonOriginalSize`), כפתור הסגירה צבוע `secondary_attention` בריחוף.

**Observation** (`gui/main_window/MainPage.cpp:88-120, 393-404, 650-662`; `gui/main_window/TabWidget.cpp:19-29`; `gui/main_window/sidebar/Sidebar.cpp:539-546`): הפריסה בשלוש עמודות.

| אזור | תוכן | מידות |
|---|---|---|
| עמודה שמאלית, כותרת | אווטאר שלי 32 עם סטטוס, הכותרת `Chats` (16, SemiBold), כפתור עיפרון `Write` שפותח תפריט: `Add contact`, `Create group`, `Create channel`, `Read all` | גובה 56 |
| עמודה שמאלית, חיפוש | שדה `Search` בצורת גלולה | גובה 32, רדיוס 16, רקע `base_bright_inverse` |
| עמודה שמאלית, רשימה | רשימת הצ'אטים (סעיף 4.2) | רוחב ברירת מחדל 328, טווח 280 עד 400 |
| עמודה שמאלית, תחתית | סרגל לשוניות: `Calls`, `Contacts`, `Chats`, `Settings`. ברירת מחדל `Chats` | גובה 52, אייקון 28, באדג' 18 |
| מפריד | splitter | 1 |
| עמוד הצ'אט | כותרת, היסטוריה על טפט, שורת "מקליד", שורת קלט | כותרת 56, רוחב היסטוריה עד 1100 |
| סרגל צד ימני | פרופיל איש קשר או קבוצה | 328 (380 עם threads), עד 581, החלקה 125ms |

**Inference**: הסדר הוויזואלי של הלשוניות משמאל לימין הוא סדר ה-`addTab`: Calls, Contacts, Chats, Settings. `TabWidget::addTab` מוסיף כל פריט לסוף ה-TabBar. צילומי App Store מבילד מוקדם יותר מראים שלוש לשוניות בלבד: Contacts, Chats, Settings (סעיף 12.5). הבאדג' של הלשוניות אדום (`secondary_attention`, `TabBar.cpp:498`), בעוד באדג' לא-נקראו ברשימה ירוק (`primary`).

**Observation** (התנהגות רספונסיבית, `MainPage.cpp:103-115, 2441-2442, 2647-2652`): מתחת ל-660 העמודה השמאלית מתכווצת למצב mini ברוחב 68 (אווטארים בלבד). לחיצה על כפתור ההרחבה פותחת אותה כשכבה צפה ברוחב 360. מתחת לרוחב שלוש עמודות (660 ועוד רוחב הסרגל) הסרגל הימני צף מעל הצ'אט.

**Observation** (`gui/main_window/history_control/HistoryControl.cpp:121`): כשאין צ'אט פתוח, האזור מציג `Please select a chat to start messaging`.

## 4. מסכים וזרימות

### 4.1 כניסה והרשמה

**Observation** (`products/icq/config.json`): `login_by_phone_allowed: true`, `login_by_uin_allowed: true`, `login_by_mail_default: false`, `login_by_oauth2_allowed: false`, `otp_login: false`, `forgot_password: true`, `need_gdpr_window: true`, `need_introduce_window: true`, `show_attach_phone_number_popup: true`. ICQ New הציע אפוא טלפון + קוד SMS כברירת מחדל, ומסלול חלופי של ICQ# או אימייל עם סיסמה.

**Observation**: אין כניסה בקוד QR בקוד הדסקטופ (חיפוש `qr` ב-`gui` ו-`core` לא החזיר תוצאה). זהו Observation שלילי מוגבל לקוד 10.0.x.

זרימת טלפון (`gui/main_window/LoginPage.cpp`):

1. מסך `Phone` (ברירת מחדל, `login_page_last_login_type` = `SUBPAGE_PHONE_LOGIN_INDEX`). רמז: `Check the country code and enter your phone number for registration and authorization`. בורר מדינה (231 מדינות בהקשר `countries`) ושדה מספר. אותו מסך משמש להרשמה ולכניסה.
2. מסך `SMS code`: `Verification code was sent to` + המספר + `Change`. אורך הקוד 6 כברירת מחדל (`codeLength_(6)`, השרת יכול לשנות). כפתור `Resend code in m:ss` שהופך ל-`Resend code` אחרי 60 שניות (`sms_result_waiting_time`, `gui/utils/features.cpp:188`). תפריט חלופי `Dictate over the phone`.
3. וריאנט אימות בשיחה: השרת יכול לבחור `checks` של שיחה. אז הכותרת `Enter last 6 digits of number that called you`, הרמז `We called the number`, והכפתור `Recall in m:ss` / `Recall` (`LoginPage.cpp:1213-1235`).
4. שגיאות: `Incorrect code`, `You have entered an invalid code. Please try again.`, `Invalid phone number`, `Error occurred, try again later`.

זרימת סיסמה:

1. `Sign in by password`, רמז `Enter your login and password`, שדות `Login` ו-`Password`, תיבת סימון `Keep me signed in` (ברירת מחדל true, `settings_keep_logged_in_default`), כפתור `Sign in`, קישור `Forgot password?` אל `icq.com/password`, וקישור חזרה `Sign in via phone`.
2. שגיאות ב-23.2.0: `Invalid login or password` (במקום `Wrong login or password` של 10.0.x).
   לפי דפי העזרה, כניסה באימייל וסיסמה בוטלה ב-2023, והכניסה בסיסמה נשארה ל-UIN בלבד (סעיף 12.3).
3. אחרי כניסה בסיסמה לחשבון בלי טלפון: חלון `For security reasons you need to confirm your phone number.` (`gui/utils/features.cpp:216`) עם טלפון + קוד. בהגדרות `attach_phone_number_popup_modal: true`, ומרווח הצגה של 86400 שניות (`default_show_timeout_attach_phone_number_popup`).

אחרי כניסה מוצלחת (Observation, `gui/my_info.cpp:130-147`, `gui/main_window/MainWindow.cpp:2953-2996`, `LoginPage.cpp:745, 1557`):

- אם השרת דורש הסכמה (`userAgreement` מכיל `gdpr_pp`), מוצג `TermsPrivacyWidget`: איור `gdpr_*`, כותרת `Welcome to ICQ`, טקסט עם קישורים ל-Terms ו-Privacy Policy, וכפתור `Accept and agree`.
- אם לחשבון אין שם (משתמש חדש), מוצג `IntroduceYourself`: `Add a name and avatar`, `your contacts will see them`, `First name*`, `Last name`, `Continue`.

בשורת הכפתורים העליונה של מסך הכניסה (גובה 44) יש מעבר בין סוגי כניסה, הגדרות proxy ו-`Report a problem` (`LoginPage.cpp:249-283`). רוחב הפקדים 300, כפתור `Next` בגובה 40.

### 4.2 רשימת הצ'אטים

**Observation** (`gui/main_window/contact_list/RecentsModel.cpp:1299-1313`, `RecentItemDelegate.cpp`, `ContactListUtils.cpp:150-220`, `ContactListWidget.cpp:1169-1184`):

- סקציות: `PINNED`, `UNIMPORTANT`, `RECENTS`. ההצגה של סקציית הלא-חשובים נשמרת ב-`unimportant_visible` (ברירת מחדל true).
- `Favorites` (הודעות שמורות, צ'אט עם עצמי) מוצמד בהפעלה הראשונה (`favorites_pinned_on_start`). טקסט פתיחה: `%1, this is your personal space!` (`FavoritesUtils.cpp:70`).
- הודעות ממי שאינו איש קשר מתקבצות בפריט `New contacts` (`unknown_contacts: true`, `stranger_contacts: true`).
- פריט: אווטאר 52, שם (16), שורת הודעה אחרונה (14) או `is typing...` / `are typing...`, שעה (12, `base_tertiary`), באדג' לא-נקראו (גלולה בגובה 20, `primary`, ובצ'אט מושתק `base_tertiary`), באדג' אזכור, אייקון השתקה, אייקון נעיצה, `Draft` כשיש טיוטה. נבחר: רקע `primary_selected` וטקסט `text_solid_permanent`. ריחוף: `base_bright_inverse`.
- תפריט קליק ימני: `Mark as read` / `Mark as unread`, `Pin` / `Unpin`, `Move to unimportant` / `Remove from unimportant`, `Turn off notifications` / `Turn on notifications`, `Clear history`, `Block` / `Unblock`, `Report`, `Report and block`, `Leave and delete`, `Hide`.
- מצב קומפקטי (`Chat list compact mode`): פריט 48 עם אווטאר 32 ובלי שורת הודעה.

**Observation שלילי**: אין תיקיית ארכיון בקוד הדסקטופ. המילה archive מופיעה רק בהקשר קבצים. התחליף הקרוב הוא Unimportant.

**חיפוש** (Observation, `ContactListUtils.cpp:763-766`, `config.json`): חיפוש גלובלי עם הסקציות `Contacts and groups` ו-`Messages`. חיפוש בשרת מתחיל מ-4 תווים לאנשי קשר (`server_search_contacts_min_symbols`) ו-2 תווים להודעות. בתוך צ'אט: כפתור `Search for messages` בכותרת. הגדרה `Close search after result selection` (`fast_drop_search_results`, ברירת מחדל כבוי) סוגרת את החיפוש אחרי בחירת תוצאה.

### 4.3 השיחה

**כותרת** (Observation, `history_control/top_widget/DialogHeaderPanel.cpp`): גובה 56, אווטאר 32, שם (16) ושורת סטטוס (14, `base_primary`). כפתורים מימין: `Search for messages`, `Chat gallery`, `Waiting for approval` (רק לאדמין כשיש בקשות), `Add member`, כפתור שיחה (`Audio call` / `Video call`), `Information` (פותח את הסרגל הימני).

**בועות** (Observation, `history_control/MessageStyle.cpp`, `complex_message/ComplexMessageItem.cpp:2065-2105`, `gui/utils/utils.cpp:3577-3599`):

| מאפיין | ערך |
|---|---|
| רדיוס | 12. בהודעות רצופות של אותו שולח הפינה בצד השולח הסמוכה להודעה השכנה קטנה ל-4 |
| ריפוד | 12 אופקי, 8 אנכי. גובה מינימלי 36 |
| רוחב מקסימלי | 600 (קוד: 1100) |
| מרווח עליון | 8 בין קבוצות, 2 בתוך רצף |
| שוליים | נכנסת: 54 משמאל (כולל מקום לאווטאר השולח, 32, בקבוצות). יוצאת: 32 מימין. השוליים בצד הנגדי גדלים עם רוחב החלון (נקודות שבירה 396 ו-440, ראו JSON) |
| צבע | נכנסת `chat_primary`, יוצאת `chat_secondary` |
| צל | שני מילויים של צורת הבועה, מוזזים 2 ו-1 פיקסלים למטה, `rgba(0,0,0,0.01)` ו-`rgba(0,0,0,0.08)`, רק ב-12 הפיקסלים התחתונים |
| שם שולח בקבוצה | 14, גובה שורה 18, צבע מטבלת האווטארים (סעיף 5.3) |
| שעה בתוך הבועה | 10px. נכנסת `base_primary`, יוצאת `primary_pastel`. על מדיה: גלולה בגובה 20 וטקסט `text_solid_permanent`. אחרי עריכה: `edited` |

**מפרידי תאריך** (Observation, `ServiceMessageItem.cpp:12-41, 85-101, 215-235`): גלולה לבנה (`base_globalwhite`) בגובה 24 עם צל, טקסט 12 SemiBold. התוכן: `Today`, `Yesterday`, או תאריך (בלי שנה כשזו השנה הנוכחית). יש גם גלולה צפה בראש הגלילה (מרווח 12). לוחית `New messages`: גובה 20, שוליים 52/8/52/0, רדיוס 4, צבע `newplate_background`.

**סימני מסירה וקריאה** (Observation, `LastStatusAnimation.cpp`, `HistoryControlPageItem.cpp:763-781`, `resources/message_statuses/*.svg`):

- `sending` (שעון): מוצג רק אם השליחה לוקחת יותר מ-500ms.
- `sent` (וי אחד): הגיע לשרת.
- `delivered` (שני וי): הגיע לנמען.
- נקרא: אין וי שלישי. מתחת להודעה האחרונה שנקראה מוצגים אווטארים קטנים (16) של מי שקרא ("heads"). כשיש heads, אייקון הסטטוס לא מצויר. בקבוצות זה תלוי בהגדרה `Show read status in groups`.
- צבע האייקונים `base_primary`, גודל 16x16.

**מקליד** (Observation, `TypingWidget.cpp`): שורה בגובה 32 מעל הקלט. 6 פריימים של SVG (`history/typing_icon_1..6`) בגודל 16 במחזור של 1000ms, ואחריהם `%1 is typing` או `are typing`, בגודל 12 ובצבע `typing_text`. ברשימת הצ'אטים: `is typing...`.

**תפריט הודעה** (Observation, `ComplexMessageItem.cpp:3060-3330`), לפי הסדר: `Reply`, `Copy link` / `Copy email` / `Copy`, `Copy to clipboard` (קבצים), `Forward`, `Select`, `Pin` / `Unpin`, `Save as...`, `Open in browser`, `Show in folder`, `Edit`, `Delete for me`, `Delete for all`, `Report`, `Add to favorites`. בבחירה מרובה: `Reply`, `Copy`, `Forward`, `Delete`, `Add to favorites`, וכותרת `%1 message selected`.

- **תשובה**: בלוק ציטוט מעל הקלט, ובבועה בלוק ציטוט (רוחב רצוי 108).
- **העברה**: בלוק `Forwarded from %1` או `Forwarded message` (`QuoteBlock.cpp:399-403`).
- **עריכה**: הודעה יוצאת שלי, או של אדמין בערוץ (`HistoryControlPageItem.cpp:1139-1145`). פאנל `Edit message` מעל הקלט, הכפתור הופך ל-`Edit`. בקוד הלקוח אין מגבלת זמן לעריכה. מגבלה בשרת: Unknown, הנחת עבודה: בלי מגבלה.
- **מחיקה**: `Delete for me` תמיד. `Delete for all` להודעות יוצאות שלי או לאדמין. ב-Favorites מופיע רק `Delete`. במחיקה מרובה: דיאלוג `Messages will be deleted only for you` (`HistoryControlPage.cpp:1168`). מגבלת זמן למחיקה לכולם: Unknown.
- **נעיצה**: רק לאדמין בקבוצה או בערוץ (`areYouAdmin`, `ContactListModel.cpp:1160`). ב-23.2.0 `enable_pin_message_in_private_chats: false`. בראש הצ'אט פס `Pinned message` עם `Roll` / `Unroll`.

**ריאקציות** (Observation, `reactions/DefaultReactions.cpp:14-22`): שש ברירות מחדל, עם tooltip: U+1F44D `Like`, U+2764 U+FE0F `Super`, U+1F923 `Funny`, U+1F633 `Oops`, U+1F622 `Sad`, U+1F621 `Scandalous`. השרת יכול להחליף את הסט (`reactions_initial_set_json`). רשימת המגיבים מציגה לשונית `All` ולשונית לכל ריאקציה. הגדרה `Show reactions to messages` (ברירת מחדל true). ב-23.2.0 נוספו `You cannot view list of reactions` ו-`You cannot view subscribers and those who had added reactions` (ערוצים).

**אימוג'י וסטיקרים** (Observation, `smiles_menu/*`, `resources/smiles_menu/*`): תפריט אחד `Emoji and stickers` עם לשוניות `EMOJI` ו-`RECENTS`, קטגוריות: people, nature, food, activity, travel, objects, symbols, flags. סטיקרים: חנות עם `TRENDING` ו-`MY`, הצעות סטיקרים לפי אימוג'י ולפי מילים (`Show stickers suggests for emoji` / `for words`). `Big emoji in chat` ו-`Automatically replace emojis` פעילים כברירת מחדל.

**קבצים ותמונות** (Observation, `MessageStyle.cpp`, `FilesWidget.cpp`, `DragOverlayWindow.cpp`, `input_widget/AttachFilePopup.cpp:245-264`): תפריט צירוף: `Photo or Video`, `File`, `Camera`, `Poll`, `Contact`, `Location`, `Voice Message` (`Task` ו-`Webinar` כבויים ב-ICQ). חלון שליחה עם `Add caption` ו-`Send files`. גרירה לחלון מציגה שני אזורים: `Quick send` ו-`Send with caption`. תצוגה מקדימה עד 360x360, placeholder 320x240, רדיוס פנימי 8. כרטיס קובץ ברוחב 320 (עד 580) עם אייקון סוג קובץ. סטיקר עד 160x160.

**הודעות קוליות** (Observation, `media/ptt/AudioUtils.h:45-53`, `PanelPttImpl.cpp`, `PttLock.cpp`, `PttBlock.cpp:754-776`): הקלטה בין שנייה ל-15 דקות. הכפתור בקלט מתחלף בין `Send` ל-`Voice message`. צליל `ptt_start` לפני התחלה, `ptt_limit` בסוף הזמן, `ptt_remove` בביטול. נעילה להקלטה בלי להחזיק (`Lock`, החלקה 425ms). בבועה: היסטוגרמה וכפתור טקסט (`ptt/text_icon`) לתמלול (`ptt_recognition: true`, `speechToText`). תמלול שנכשל: `Unclear message`.

**תצוגה מקדימה לקישורים** (Observation, `MessageStyle.cpp` namespace `Snippet`): רוחב עד 420, תמונה עד 180 גובה, favicon 16, שם האתר בצבע `primary_pastel`. הגדרה `Preview links`.

**אזכורים** (Observation, `MentionCompleter.cpp`, `contact_list/MentionModel.cpp:206`, `tray/TrayIcon.cpp:569`): השלמה אחרי `@`, חברים שאינם בצ'אט מסומנים `not in this chat`. התראה עם כותרת U+1F44B `You have been mentioned`. כפתור קפיצה לאזכור (`history/mention`) ליד כפתור הגלילה למטה (`history/to_bottom`).

**תשובות חכמות** (Observation, `smartreply/*`, `config.json` `smartreplies: true`): פס הצעות (טקסט וסטיקרים) מעל הקלט, `Show smart replies` / `Hide smart replies`, הגדרה `Show smart reply`.

**קלט** (Observation, `input_widget/InputWidgetUtils.cpp:28-63`, `HistoryTextEdit.cpp:68`): גובה ברירת מחדל 52, שוליים צדדיים 52, אנכיים 8, בועת קלט ברדיוס 18 עם צל, טקסט 15, placeholder `Message`. שליחה ב-Enter כברירת מחדל, וחלופות Ctrl+Enter ו-Shift+Enter (`gui/utils/utils.cpp:1705-1728`). טיוטה נשמרת אחרי 5 שניות, עד 10,000 תווים (`draft_timeout`, `draft_max_len`).

### 4.4 אנשי קשר

**Observation** (`ContactsTab.cpp:84`, `AddNewContactWidget.cpp`, `AddContactDialogs.cpp:75-80`, `ContactListWithHeaders.cpp:131-139`): כפתור `Add contact`. הוספה לפי טלפון: `New contact`, `First name`, `Last name`, `Phone number`, ומונה `%1 digits left`. אם המספר לא רשום: `Unfortunately, %1 with phone number %2 has not joined ICQ yet.`. הוספה לפי כינוי או אימייל: `Add contact by phone number or nickname?`. הרשימה מחולקת ל-`TOP CONTACTS` ו-`ALL CONTACTS`, פריט בגובה 48 עם אווטאר 32. אין יבוא פנקס כתובות בדסקטופ (Inference: הטקסט "contacts from your phone book" מתייחס לסנכרון מהמובייל).

### 4.5 פרופיל וכינוי

**Observation** (`sidebar/MyProfilePage.cpp:527-591`, `EditNicknameWidget.cpp`, `controls/NickLineEdit.cpp`, `common.shared/constants.h:161-162`):

- הפרופיל שלי: אווטאר (`Change avatar`, `View avatar`, מינימום 200x200, `Image should be at least 200x200 px`), שם (`Edit name`: First, Middle, Last), `About me` (עד 120 תווים), `Phone number` / `Attach phone`, `Nickname` / `Add nickname`, `Email`, `Who can see my data`, `Sign out`.
- כינוי: 5 עד 30 תווים (ברירת מחדל, השרת יכול לשנות), התווים המותרים `a-z`, `0-9`, `.`, `_`, ומתחיל באות לטינית. בדיקה בשרת שנייה אחרי הקלדה (`Checking...`, `Nickname available`, `This nickname is taken`). קישור `icq.im/<nick>` עם `This link will open a chat with you in ICQ`.
- סטטוס: אימוג'י וטקסט עם משך (29 ברירות מחדל ב-`gui/resources/statuses/statuses_eng.json`, למשל Working 9 שעות, Busy שעה, Vacation ללא הגבלה). משכים: `Show always`, `Week`, `Select custom time`. סטטוס מותאם (`custom_statuses_enabled`) כבוי ב-ICQ.
- נוכחות: `Online`, `Seen just now`, `Seen %1 minutes ago`, `Seen yesterday at ...`, `Have never been here`, `Bot` (`gui/types/lastseen.cpp`). המחרוזות `Away`, `Do not disturb`, `Invisible` קיימות בקוד (`contact_list/Common.cpp:347-353`). Inference: הן שייכות למוצרים אחרים בקוד המשותף; ICQ New לא הציע בחירה ידנית של סטטוס קלאסי.

**פרופיל של איש קשר** (סרגל ימני, `sidebar/UserProfile.cpp`): `Message`, `Call`, כינוי, טלפון, אודות, `Share contact`, `Notifications`, מדיה (`Photo and video`, `Video`, `Files`, `Links`, `Voice messages`), `Common groups`, `Create common group`, `Block`, `Report`, `Remove contact`.

### 4.6 קבוצות וערוצים

**Observation** (`GroupChatOperations.cpp:134-236`, `sidebar/GroupProfile.cpp`, `contact_list/ContactListItemDelegate.cpp:397-406`, `ContactListModel.cpp:1160-1172`, `gui/types/chat.cpp:158-171`):

- יצירה: `Group name` / `Channel name` ואווטאר, `Join with Approval` (`New members are waiting for admin approval`), `Public chat` (`Public group can be found in the search`). ערוצים ציבוריים כברירת מחדל (`Channels are public by default, but you can change it after in settings`). אחר כך בחירת חברים; בלי חברים: אזהרה.
- תפקידים בשרת: `admin`, `moder`, `member`, `readonly`, `pending`, `notamember`. בממשק: `Creator` (דגל `isCreator`), `Admin` (`admin` או `moder`), `Read only`, וחבר רגיל בלי תווית. בערוץ מנוי הוא `readonly`.
- פעולות על חבר: `Assign admin role` / `Revoke admin role`, `Ban to write` / `Allow to write` (בין `member` ל-`readonly`), `Delete` (עם אפשרות למחוק את ההודעות שלו), `Report`.
- סרגל הקבוצה: `About the group`, `Rules`, `Link`, `Share group link` / `Copy link to group`, `Notifications`, `Group settings`, `Waiting for approval` + `Approve All`, `Your invites`, `Admins`, `All members` / `All subscribers`, `Deleted and blocked`, `Pin`, `Wallpapers`, `Clear history`, `Leave and delete`.
- קישור הזמנה: `The link will open the group in %1`, `Generate new link` עם `The old link will stop working`. הפיכה לפרטית משנה את הקישור.
- הצטרפות: `Join` / `Subscribe`, ובקבוצה עם אישור `Wait for join request approval`, `Your join request was rejected`, `Cancel request`.
- פרטיות: `Who can add me to groups` עם רשימת חריגים. אם מישהו לא יכול להוסיף אותך: `Send them invite link`.
- אירועי שירות: יותר מ-140 מחרוזות בהקשר `chat_event` (הצטרפות, הסרה, שינוי שם, תיאור, כללים, קישור, אישור הצטרפות, מינוי אדמין). המלא ב-JSON.
- מגבלת גודל קבוצה: אין בקוד הלקוח. לפי דף הדסקטופ עד 25,000 חברים (Observation, סעיף 12.2). לפי העזרה, רק ה-Owner ממנה אדמינים, ואי אפשר למחוק קבוצה (סעיף 12.4).

### 4.7 הגדרות

**Observation** (`settings/SettingsTab.cpp:78-100`): הסדר: שורת הפרופיל שלי, `Favorites`, `General`, `Notifications`, `Privacy`, `Appearance`, `Stickers`, `Voice and video` (ב-23.2.0 `Calls`), `Shortcuts`, `Language`, `Contact Us`, `About app`. לכל שורה אייקון על אריח צבעוני: Favorites `secondary_rainbow_yellow`, General `secondary_rainbow_mint`, Notifications `secondary_attention`, Privacy `base_primary`, Appearance `secondary_rainbow_cold`, Stickers `secondary_rainbow_orange`, Voice and video `secondary_rainbow_aqua`, Shortcuts `secondary_rainbow_purple`, Language `secondary_rainbow_pink`, Contact Us `secondary_rainbow_blue`, About app `secondary_rainbow_green`.

| דף | פריטים (ברירות מחדל לפי `common.shared/constants.h`) |
|---|---|
| General | `Launch when system starts`, `Launch minimized`, `Show taskbar icon`, `Preview links`, `Auto play videos`, `Turn on video sound on hover` (כבוי), `Auto play GIFs`, `Show read status in groups`, `Show smart reply`, `Use system spell checker`, `Close search after result selection`, הצעות סטיקרים, `Automatically replace emojis`, `Big emoji in chat`, `Show reactions to messages`, `Show statuses`, `Save files to:`, `Warn about disabled microphone`, `Show popular contacts`, `Connection settings` |
| Notifications | `Play sounds` (פעיל), `Outgoing messages sound` (כבוי), `Notification volume`, `Show notifications`, `Show notifications when app in focus` (כבוי), `Hide message text in notifications`, `Hide sender name in notifications`, `Animate taskbar icon` (כבוי), `Show unreads counter in window title` |
| Privacy | `Who can add me to groups` ו-`Who can call me`, כל אחד עם `Everybody` / `People you have corresponded with and contacts from your phone book` / `Nobody`, ו-`Exceptions list`. `Disable SMS notifications`. `Session List`: `Active sessions`, `Current session`, `Close all other sessions`, `Close session`. `Local passcode`, `Change passcode`, `Auto lock` (Off, 1, 5, 10 דקות, שעה). `Ignore list`. `Don't ask when opening external links`. `Do not ask when running executable files`. `Delete account` (`To delete an account, you must attach a phone number`) |
| Appearance | `Themes` (10), `Chats wallpaper`, `Font size` (Small -1, Medium, Large +2), `Bold text`, `Chat list compact mode`, `Interface scale:` |
| Shortcuts | `Send message by` (Enter, Ctrl + Enter, Shift + Enter), פעולת Esc (`Minimize the window`, `Minimize the window and minimize the chat`, `Close chat`), פעולת חיפוש (`Search in chat`, `Global search`), רשימת קיצורים |
| Language | 11 שפות ברשימה: ru, en, uk, de, pt, cs, fr, zh, tr, vi, es (`SettingsLanguage.cpp:21-31`). קובץ `ar.qm` קיים במשאבים אבל לא ברשימה |

### 4.8 התראות

**Observation** (`tray/RecentMessagesAlert.cpp:28-31`, `tray/TrayIcon.cpp:544-800`): ב-Windows ו-Linux חלון התראה מותאם בפינה: עד 3 התראות הודעה בערימה ועוד `View all`, כל אחת מוצגת 5 שניות ונעלמת באנימציה של 2 שניות. ב-macOS התראות מערכת. התראות לא מוצגות כשהחלון בפוקוס, אלא אם `Show notifications when app in focus` פעיל. אזכור מקבל כותרת `You have been mentioned`. צליל ההודעה הנכנסת מתנגן יחד עם ההתראה (סעיף 9).

### 4.9 מגש ושורת המשימות

**Observation** (`MainWindow.cpp:829, 2148-2160, 3220-3232`, `tray/TrayIcon.cpp:365-470, 983-1008`, `products/icq/app/resources/main_window/*.ico`):

- כפתור הסגירה מסתיר לחלון למגש בכל המערכות (`hideWindow`). יציאה דרך תפריט המגש.
- תפריט המגש ב-10.0.x: `Open`, `Close`. ב-23.2.0 נוספו `Quick status` (עם סטטוסים כמו "Eating", "Calling", "Away"), `Chats`, `Hide`, `Minimize`, `Settings`.
- אייקונים: `appicon_tray.ico` ו-`appicon_tray_unread.ico`; ב-macOS אייקוני menubar בשחור ולבן, online / offline / unread.
- מונה לא-נקראו: באדג' על אייקון ה-Dock ב-macOS (`NotificationCenterManager::updateBadgeIcon`). ב-Windows overlay על אייקון שורת המשימות, והבהוב `FlashWindowEx` רק כשההגדרה `Animate taskbar icon` פעילה. אופציה למונה בכותרת החלון.

### 4.10 שיחות

**Observation** (`gui/voip/*`, `CallsTab.cpp`, `contact_list/CallsModel.cpp:56-66`, `config.json`): לשונית `Calls` עם `Group call`, `Create call link` והיסטוריית שיחות. מגבלות ברירת מחדל 30 משתתפים ו-5 וידאו (`voip_call_user_limit`, `voip_video_user_limit`). שיחה נכנסת: `DECLINE` / `AUDIO` / `VIDEO`. בשיחה: מיקרופון, מצלמה, שיתוף מסך, משתתפים, `Grid` / `Speaker`, חלון מוקטן. אירועי שיחה בצ'אט: `Missed call`, `Outgoing call`, `Incoming call`. המנוע הוא ספריית voip קניינית שאינה בריפו.

## 5. טוקנים עיצוביים

### 5.1 מבנה

**Observation** (`gui/styles/ThemesContainer.cpp:141-230`, `gui/styles/Theme.cpp:120-135`): לכל ערכה = `style` בסיסי (106 טוקנים בקוד, 122 בבינארי) + `style` של הערכה + `style` של הטפט ברירת המחדל (`typing_*`, `chatevent_*`, `newplate_*`). צבעים בפורמט Qt: `#RRGGBB` או `#AARRGGBB` (אלפא ראשון). ב-JSON כל טוקן מופיע גם כ-CSS `#rrggbbaa` (אלפא אחרון). מקור הערכים: `meta.json` מתוך 23.2.0.

### 5.2 הערכות העיקריות (23.2.0)

| טוקן | Green (`default`) | Dark Green | Blue | Dark Blue (`black`) |
|---|---|---|---|---|
| `primary` | `#21D86A` | `#0ADC5E` | `#3F8AE0` | `#1984FA` |
| `primary_hover` | `#1EC360` | `#0BF468` | `#3C85D7` | `#3291FA` |
| `primary_active` | `#16A14D` | `#3CF686` | `#2975CC` | `#258BFA` |
| `primary_selected` | `#1DCF67` | `#383838` | `#3F8AE0` | `#383838` |
| `primary_bright` | `#C8F9D4` | `#4C8959` | `#AAD7FF` | `#30578A` |
| `primary_pastel` | `#0BCE4D` | `#0BCE4D` | `#4772A6` | `#92BDE8` |
| `text_primary` (קישורים) | `#0FC44C` | `#0ADC5E` | `#4986CC` | `#59ACFF` |
| `text_solid` | `#111111` | `#DBDBDB` | `#111111` | `#DBDBDB` |
| `text_solid_permanent` | `#FFFFFF` | `#E1E3E6` | `#FFFFFF` | `#E1E3E6` |
| `base_primary` (טקסט משני) | `#838690` | `#9EA1A3` | `#818C99` | `#9EA1A3` |
| `base_secondary` | `#B7BCC9` | `#8C8C8C` | `#99A2AD` | `#8C8C8C` |
| `base_tertiary` | `#CCCFD8` | `#525252` | `#B8C1CC` | `#525252` |
| `base_bright` (קווים) | `#ECEEF3` | `#363636` | `#ECEEF3` | `#363636` |
| `base_bright_inverse` (חיפוש, ריחוף) | `#F3F5F8` | `#2E2E2E` | `#F1F3F7` | `#2E2E2E` |
| `base_globalwhite` (משטחים) | `#FFFFFF` | `#212121` | `#FFFFFF` | `#212121` |
| `app_primary` | `#FAFAFA` | `#2B2B2B` | `#FAFAFA` | `#2B2B2B` |
| `chat_environment` / טפט | `#F6F6F6` | `#1C1C1D` | `#F6F6F6` | `#1C1C1D` |
| `chat_primary` (נכנסת) | `#FFFFFF` | `#2A2A2C` | `#FFFFFF` | `#2A2A2C` |
| `chat_secondary` (יוצאת) | `#D6FFE0` | `#2A4533` | `#C7E6FF` | `#264069` |
| `chat_tertiary` | `#EAFFEF` | `#3F5847` | `#E3F2FF` | `#365381` |
| `secondary_attention` | `#F83E33` | `#EF4362` | `#FF3347` | `#EF4362` |
| `secondary_rainbow_warning` (הדגשת חיפוש) | `#FEF7AC` | `#E3D3AC` | `#F4E7C3` | `#E3D3AC` |
| `typing_text` | `#838690` | `#7E848F` | `#838690` | `#7E848F` |
| `newplate_background` | `#0D000000` | `#0DFFFFFF` | `#0D000000` | `#0DFFFFFF` |

ערכות נוספות (`primary` / `chat_secondary` בהיר, ואז כהה): Violet `#AD7FEE` / `#E9E5FF`, Dark Violet `#A67BFE` / `#3C2E5B`; Orange `#FF814C` / `#FFEFE5`, Dark Orange `#FF6D33` / `#5E312E`; Pink `#DAA2CF` / `#FFEDFB`, Dark Pink `#EDC1E4` / `#4F3449`. בערכות הכהות קישורים מסומנים בקו תחתון (`underline: true`). כל 142 הטוקנים של כל ערכה אחרי המיזוג (122 בסיס, טוקני ערכה כמו `gradient_primary`, וטוקני הטפט) ב-JSON תחת `themes`.

### 5.3 תפקידים סמנטיים (Observation)

| רכיב | טוקן | ראיה |
|---|---|---|
| רקע חלון | `base_globalwhite` | `MainWindow.cpp` `getBgColor()` |
| רקע אזור הצ'אט | צבע הטפט (1001 `#F6F6F6`, 1002 `#1C1C1D`) | `ThemeParameters.cpp` |
| טקסט הודעה / קישור / בחירת טקסט | `text_solid` / `text_primary` / `primary_bright_hover` | `MessageStyle.cpp` |
| פריט נבחר / ריחוף ברשימה | `primary_selected` / `base_bright_inverse` | `contact_list/Common.cpp` |
| לשונית רגילה / ריחוף / פעילה | `base_secondary` / `base_secondary_hover` / `primary` | `TabBar.cpp` |
| כפתור ראשי / מחיקה / ביטול | `primary` / `secondary_attention` / מסגרת `base_secondary` | `controls/DialogButton.cpp` |
| תפריט הקשר | רקע `base_globalwhite`, נבחר `base_bright_inverse`, מפריד `base_bright`, מושבת `base_tertiary` | `ThemeParameters.cpp` `getContextMenuQss()` |
| שדה טקסט בפוקוס | קו `primary`, שגיאה `secondary_attention`, placeholder `base_primary` | `ThemeParameters.cpp` |
| פס גלילה | מסלול `ghost_light_inverse`, ידית `ghost_secondary_inverse` | `ThemeParameters.cpp` |

**אווטאר ברירת מחדל** (Observation, `gui/utils/utils.cpp:125-153, 335-338, 760-900`): עיגול עם גרדיאנט ליניארי מהפינה השמאלית העליונה לימנית התחתונה, אות ראשונה בלבן בגופן Rounded Mplus 1c Bold בגודל 54 אחוז (64 אחוז בגודל 16 ומטה). הצבע נבחר לפי `crc32(uin) % 11` מטבלה של 11 זוגות (Windows/Linux שונה מעט מ-macOS). העמודה השלישית בטבלה היא צבע השם של אותו איש קשר. הטבלה המלאה ב-JSON תחת `avatar_palette`.

## 6. טיפוגרפיה

**Observation** (`gui/fonts.cpp:108-127, 228-246, 321-330`; טבלאות name של הגופנים):

- Windows ו-Linux: `Source Sans Pro` לממשק, `Roboto Mono` לקוד. macOS: `SF Pro Text` ו-`SF Mono`, עם ריווח אותיות -0.25 בטקסט הודעה ובקלט.
- משקלים: Light 300, Normal 400, SemiBold 600, Bold 700. Medium משמש רק ב-macOS.
- הגדרת משתמש: Small מוריד 1px, Large מוסיף 2px. `Bold text` מעלה כל משקל בדרגה.

| רכיב | גודל | משקל |
|---|---|---|
| טקסט הודעה | 15 (Linux 16) | Normal |
| קוד בהודעה | 14 | mono |
| שם שולח בקבוצה | 14 | Normal (mac SemiBold) |
| שעה בבועה | 10 (גדול 11) | Normal |
| שם ברשימה | 16 | Normal (mac Medium) |
| שורת הודעה ברשימה | 14 | Normal |
| שעה ברשימה | 12 | Normal |
| באדג' לא-נקראו | 13 | SemiBold |
| כותרת `Chats` | 16 | SemiBold |
| שם בכותרת צ'אט / סטטוס | 16 / 14 | Normal |
| מפריד תאריך | 12 | SemiBold |
| מקליד | 12 | Normal |
| קלט | 15 | Normal |
| שדה חיפוש | 14 | Normal |
| תווית לשונית / באדג' לשונית | 12 / 11 | Normal |
| תפריט הקשר | 15 | Normal |
| כפתור דיאלוג | 14 | SemiBold |

**המלצה לשחזור**: Source Sans 3 בכל הפלטפורמות (OFL, זמין ב-Google Fonts), Roboto Mono לקוד, ו-Rounded M+ 1c (או גופן מעוגל פתוח אחר) לאות באווטאר.

## 7. מידות

הטבלה המלאה ב-JSON תחת `metrics`. העיקר (Observation, הפניות לקבצים ב-JSON):

| אלמנט | ערך |
|---|---|
| חלון | 1000x600 ברירת מחדל, מינימום 380x580 |
| עמודה שמאלית | 328 (280 עד 400), mini 68, שכבה צפה 360 |
| כותרות עליונות | 56 |
| שדה חיפוש | 32, רדיוס 16 |
| סרגל לשוניות | 52, אייקון 28 |
| פריט ברשימה | 72 (mac 68), אווטאר 52, ריפוד 8; קומפקטי 48 עם אווטאר 32 |
| באדג' לא-נקראו | גובה 20, רוחב מינימלי 20 |
| פריט איש קשר | 48, אווטאר 32 |
| בועה | רדיוס 12/4, ריפוד 12x8, מינימום 36, מקסימום 600 |
| אווטאר שולח בקבוצה | 32, מרווח 6 |
| heads של קריאה | 16 |
| מפריד תאריך | 24, גלולה |
| לוחית New messages | 20, רדיוס 4 |
| שורת מקליד | 32 |
| קלט | 52, רדיוס 18 |
| תפריט הקשר | שורה 36, ריפוד 4, בלי רדיוס |
| דיאלוג | רוחב 360, כפתורים 32 (mac 33), מינימום 80, גלולה |
| סרגל ימני | 328, עד 581 |
| מסך כניסה | פקדים 300, כפתור 40 |

## 8. מחרוזות

**Observation**: יש 1,833 מחרוזות ייחודיות ב-95 הקשרים בקוד (`QT_TRANSLATE_NOOP`), ועוד 106 שקיימות רק ב-23.2.0. ב-JSON כל מחרוזת מופיעה עם הערך האנגלי הסופי (`en`, מתוך `en.qm` של 23.2.0 כשקיים, אחרת מ-`en.ts`, אחרת המקור), עם הערך ב-`en.ts` של 10.0.x, עם דגל `in_binary_23_2` ועם עד שלוש הפניות `file:line`. במסמך הזה מחרוזות מצוטטות לרוב לפי מפתח המקור. לפעמים הערך האנגלי שמוצג בפועל שונה, למשל `Show smart reply` מוצג כ-`Show smart answers`, `Delete Account` כ-`Delete account`, `Read only` כ-`Read Only`, `Auto lock` כ-`Auto-lock`, `Warn about disabled microphone` כ-`Warn about muted microphone`, `Smileys and stickers` כ-`Emoji and stickers`. בשחזור יש להציג את הערך של `en` מה-JSON.

ההקשרים הגדולים: `countries` (231), `popup_window` (200), `chat_event` (148), `settings` (129), `sidebar` (98), `context_menu` (64), `login_page` (50), `input_widget` (45). מחרוזות מפתח:

| מקום | מחרוזות |
|---|---|
| לשוניות | `Chats`, `Calls`, `Contacts`, `Settings` |
| כותרות סקציה | `PINNED`, `UNIMPORTANT`, `RECENTS`, `NEW CONTACTS`, `TOP CONTACTS`, `ALL CONTACTS` |
| קלט | `Message`, `Send`, `Voice message`, `Edit message`, `Emoji and stickers`, `Attach` |
| היסטוריה | `Today`, `Yesterday`, `New messages`, `is typing`, `are typing`, `edited`, `Pinned message` |
| מקומות ריקים | `Chat list is empty`, `Contact list is empty`, `Nothing found`, `Please select a chat to start messaging` |
| קבוצות | `%1 members`, `%1 subscribers`, `Creator`, `Admin`, `Read only`, `Join`, `Subscribe` |

## 9. צלילים

**Observation** (`gui/main_window/sounds/SoundsManager.cpp:29-48, 262-480`; קבצי WAV; `TrayIcon.cpp:798`; `InputWidget.cpp:976`; `PanelPttImpl.cpp:156, 201, 410`):

| מזהה | קובץ | פורמט | מתי מתנגן |
|---|---|---|---|
| `incoming` | `products/icq/app/resources/sounds/incoming.wav` | 16-bit סטריאו 44.1kHz, 0.404s | עם התראת הודעה נכנסת, אם `Play sounds` פעיל. לכל היותר פעם ב-3 שניות. לא בזמן שיחה ולא כשצליל אחר מתנגן. מושתק ב-Do Not Disturb של macOS |
| `outgoing` | `gui/resources/sounds/sound_outgoing.wav` | 16-bit סטריאו 44.1kHz, 0.058s | שליחת הודעה חדשה (לא עריכה), רק אם `Outgoing messages sound` פעיל (כבוי כברירת מחדל) |
| `mail` | `gui/resources/sounds/sound_mail.wav` | 8-bit מונו 22.05kHz, 0.446s | אימייל חדש ב-Mail.ru. לא רלוונטי |
| `ptt_start` | `gui/resources/sounds/sound_ptt_start.wav` | 16-bit 48kHz, 0.520s | תחילת הקלטה קולית |
| `ptt_limit` | `gui/resources/sounds/sound_ptt_limit.wav` | 16-bit 44.1kHz, 1.308s | ההקלטה הגיעה ל-15 דקות |
| `ptt_remove` | `gui/resources/sounds/sound_ptt_remove.wav` | 16-bit 48kHz, 0.481s | ביטול הקלטה |
| צלילי שיחה | בתוך ספריית voip (`core/Voip/call_dial.h`, `call_busy.h`, `call_connected.h`, `call_end.h`) | Unknown | חיוג, תפוס, חיבור, ניתוק |

**Inference**: `incoming.wav` הוא קידוד מחדש של "uh-oh" הקלאסי. מעטפת העוצמה שלו (הברה קצרה, שקט, הברה ארוכה וחזקה) תואמת את `13_Message.wav` של 2001b מהמחקר הקודם. ששת הקבצים זהים ברמת הבית ב-23.2.0. העתקים בסקראצ'פד: `.../scratchpad/icq-new/win-icqexe-wav/`, והמקור ב-`.../scratchpad/icq-new/im-desktop-src/im-desktop/gui/resources/sounds/`. לא להעתיק לפרויקט.

## 10. אייקונים

**Observation** (`gui/resource.qrc`, 883 רשומות; `products/icq/app/resources/product.qrc`, 49): 881 תמונות (SVG, PNG, ICO) עם alias. רשימה מלאה (alias, קובץ, גודל, קבוצה, תפקיד) ב-JSON תחת `icons`. הקבצים עצמם בסקראצ'פד בלבד: `.../scratchpad/icq-new/im-desktop-src/im-desktop/gui/resources/` ו-`.../products/icq/app/resources/`.

| קבוצה | כמות | תפקיד |
|---|---|---|
| `voip` | 222 | חלון שיחה |
| `videoplayer` | 142 | נגן וידאו |
| שורש (ללא קבוצה) | 126 | אייקונים כלליים: `send`, `smile`, `attach_file`, `search_icon`, `pin_icon`, `mute_icon`, `favorites_icon`, `reaction_icon`, `message_type_*` לתצוגה מקדימה ברשימה, `online_*` |
| `context_menu` | 52 | `reply`, `copy`, `forward`, `edit`, `delete`, `deleteall`, `pin`, `unpin`, `favorites`, `select`, `mark_read`, `mark_unread`, `mute`, `block`, `spam`, `quote`, `bold` ועוד |
| `themes` | 45 | אייקוני שיתוף קבצים ברסטר לפי סקייל |
| `gallery` | 31 | מציג מדיה |
| `controls` | 31 | `back_icon`, `close_icon`, `more_icon`, `switch_on_icon`, `checkbox_icon`, `radio_button`, באדג'ים |
| `tab` | 28 | `chats`, `calls`, `contacts`, `settings`, כל אחד ב-line ו-`_active` (מלא) |
| `filesharing` | 20 | סוגי קבצים (pdf, word, excel, archive, sound ועוד) ומצבי אנטי-וירוס |
| `input` | 15 | `attach_photo`, `attach_documents`, `attach_ptt`, `attach_camera`, `attach_contact`, `attach_poll` |
| `smiles_menu` | 13 | קטגוריות אימוג'י, `recent` |
| `titlebar` | 12 | כפתורי Windows: close, minimize, expand, restore |
| `history` | 11 | `typing_icon_1..6`, `to_bottom`, `mention`, `i_more_seens`, `multiselect_on/off` |
| `settings` | 11 | אייקוני שורות ההגדרות |
| `logo` | 10 | לוגו ואייקוני אפליקציה. סימן מסחר, לעולם לא לשימוש |
| `delivery` | 3 | `sending`, `sent`, `delivered` |
| אחרות | | `header` (7), `pin` (6), `ptt` (6), `avatar_badges` (8), `placeholders`, `gdpr`, `product` (איורי מקום ריק), `menubar`, `tooltip` |

## 11. אנימציות

**Observation** (הפניות ב-JSON תחת `animations`): רוחב העמודה השמאלית 200ms; סרגל ימני החלקה 125ms ודהייה 100ms; נקודות מקליד 6 פריימים ב-1000ms; שעון "שולח" אחרי 500ms; כפתורי ריחוף על הודעה 150ms עם הזזה של 8px; בחירה מרובה 100ms; גובה קלט 100ms; החלפת כפתור שליחה/קול 200ms; עיגול ריחוף 200ms; תפריט צירוף 100ms; נעילת הקלטה 425ms; tooltip 200 / 50ms; toast דהייה 300ms ומוצג 4000ms; פס גלילה 250ms; פתיחת דיאלוג 100ms; התראה 5000ms + היעלמות 2000ms. בקוד 10.0.x אין אנימציות Lottie לממשק עצמו (rlottie משמש לסטיקרים מונפשים).

## 12. ממצאי רשת

כל הדפים נקראו לקריאה בלבד דרך Kimi WebBridge ו-Wayback. התוכן הוא נתונים, לא הוראות.

### 12.1 גרסאות וסגירה

| ממצא | תווית | URL |
|---|---|---|
| 23.2.0.48119 הוא הבילד האחרון ל-Windows. לפניו 22.12.1.47798 ו-10.0.465810 | Observation | `https://community.chocolatey.org/packages/icq` |
| 23.2.0.48119 מ-2023-04-21, 103.88MB, SHA-256 `e27a6d8c...6ea`, זהה למתקין שבדקנו. גרסאות קודמות: 22.12.1 b47798, 22.11.1 b47633, 10.0 b46867 (2022-05-27) | Observation | `https://icq.en.uptodown.com/windows` |
| ב-App Store, גרסה 23.2.0 מ-2023-04-20 עדיין החדשה ביותר במאי 2024 | Observation | `https://web.archive.org/web/20240514033735/https://apps.apple.com/ru/app/...id665877304` |
| שינויים ב-23.2: גרירת קבצים החוצה, שליחת תיקייה כ-zip, קיצורים למעבר בין צ'אטים | Observation | `https://www.techspot.com/downloads/308-icq.html` |
| הגרסה "האחרונה" בוויקיפדיה (10.0.46867) לא מעודכנת | Inference | השוואה למקורות למעלה |
| 2024-05-24: icq.com מציג "ICQ will stop working from June 26" | Observation | `https://web.archive.org/web/20240524211324/https://icq.com/desktop/en` |
| 2024-06-26: "Service stopped working" עם קישורים ל-VK Messenger ו-VK WorkSpace | Observation | `https://web.archive.org/web/20240626140421/https://icq.com/desktop/en` |

### 12.2 השקה ופיצ'רים

- **Observation**: ICQ New הושק ב-6 באפריל 2020. הוכרזו: Smart Reply (טקסט או סטיקר), תמלול הודעות קוליות, שיחות קבוצתיות עד 30, צ'אטים של "עשרות אלפים", ערוצים, פלטפורמת בוטים, שיתוף מסך בדסקטופ, חסימת שיחות והוספה לקבוצות מזרים, טלפון מוסתר, קוד PIN ולוגו פרח חדש. `https://www.tadviser.com/index.php/Product:ICQ_New`
- **Observation**: דף הדסקטופ מוסיף: קבוצות **עד 25,000 חברים**, סקרים, "נצפה על ידי", הצטרפות באישור, הוספה ב-QR (מהמובייל), תשובה לכמה הודעות בבת אחת, כינוי במקום טלפון, ותמונות ווידאו בלי דחיסה. `https://web.archive.org/web/20230710033809/https://icq.com/desktop/en`

### 12.3 כניסה, פרטיות וחשבון (help.mail.ru, דרך Wayback)

- **Observation**: בדסקטופ: `Accept and Continue`, ואז כניסה במספר טלפון עם קוד SMS, או UIN וסיסמה. `.../20230802051229/https://help.mail.ru/icq_en/account/create`, `.../20220822171049/https://help.mail.ru/icq_en/account/signin`
- **Observation**: כניסה באימייל וסיסמה בוטלה (2023). `.../20230926212851/https://help.mail.ru/icq_en/trouble_signin/email`. זה מתיישב עם `login_by_mail_default: false`, אבל שדה `Login` בקוד עדיין מקבל אימייל. Inference: השרת דחה כניסה באימייל.
- **Observation**: אחרי יותר מדי בקשות SMS יש להמתין 24 שעות (`.../trouble_signin/sms_limit`).
- **Observation**: מחיקת חשבון ב-Settings > Privacy עם אישור ב-SMS. חשבון שלא היה פעיל יותר משנה נמחק.
- **Unknown**: כניסה בקוד QR לדסקטופ. אף מקור לא מזכיר אותה, וגם בקוד אין.
- **Observation**: פרטיות: "Who can add to groups" ו-"Who can call", כל אחד עם הכל, אנשים שהתכתבת איתם ואנשי קשר מהטלפון, או אף אחד. נעילה מקומית ב-Ctrl+L או Cmd+L עם נעילה אוטומטית אחרי 1, 5, 10 או 60 דקות, תואם ל-`MainWindow.cpp:2283`. `Ignore List`, `Session List` עם `Close All Other Sessions`. `.../20220822171052/https://help.mail.ru/icq_en/settings/privacy`
- **Observation**: אחרים רואים אווטאר, שם, פעילות אחרונה, כינוי ו-About me. הטלפון גלוי רק דרך פנקסי טלפון הדדיים. `https://web.archive.org/web/20210203133824/https://icq.com/help/visibility/en`

### 12.4 הודעות, קבוצות, שיחות והתראות

- **Observation**: Enter שולח, וניתן לשנות. לחיצה כפולה על הודעה מצטטת אותה, תואם ל-`ComplexMessageItem.cpp` (`mouseDoubleClickEvent`, `emitQuote`). בחירת טקסט וקליק ימני מאפשרים לצטט חלק. העברה לכמה נמענים, ריאקציות בריחוף, בחירה מרובה, `Delete From Everyone` / `Delete From Myself` בלי מגבלת זמן מוצהרת, `Add to Favorites`, אזכורים. צירוף: Photo or Video, File (בלי דחיסה), Contact, Poll, Call Link. גרירה: "Send with description" או "Send fast". סטיקרים: הוספה, סידור, יצירת חבילה דרך בוט, יבוא מ-Telegram. מקורות: `help.mail.ru/icq_en/chat/messages`, `/chat/actions`, `/chat/files`.
- **Observation**: קבוצות וערוצים: תפקידים Owner, Admin וחבר, ועוד "Ban to Write". רק ה-Owner ממנה אדמינים. ציבורי או פרטי; פרטי מצטרפים בקישור שאפשר לחדש. כתובת: אותיות לטיניות, ספרות, `.` ו-`_`, עד 30 תווים. "Join with Approval". אי אפשר למחוק קבוצות וערוצים. ויטרינת "Interesting" לערוצים וקבוצות. מקורות: `help.mail.ru/icq_en/channels/admins`, `/channels/settings`, `/channels/user`.
- **Observation**: שיחות: עד 30 משתתפים, וידאו לכולם רק עד 5, שיחה בקישור עד 100. פקדים: השתקה, מצלמה, הוספת אנשים, שיתוף מסך, "Show All" או הדובר הפעיל. מקורות: `help.mail.ru/icq_en/calls/group`, `/calls/link`.
- **Observation**: התראות: toast בפינה הימנית התחתונה, מונה אדום על אייקון שורת המשימות, שלא מופיע כשהחלון נסגר ב-X. הגדרות "Play sounds" ו-"Animation when a new message is received". צ'אט מושתק מציג רמקול עם קו. `help.mail.ru/icq_en/faq/notification`.

### 12.5 צילומי מסך (בסקראצ'פד בלבד)

**Observation** על התמונות, **Inference** על הפריסה:

- `.../scratchpad/icq-new/web-macappstore-screens/mas-1.jpg` עד `mas-7.jpg` (2560x1600, App Store, macOS, ממשק ברוסית, ערכה ירוקה בהירה, כותרת חלון "ICQ New"). העמודה השמאלית: כותרת עם `...`, `Чаты` במרכז ואייקון כתיבה; חיפוש בצורת גלולה; סקציות מתקפלות "ИЗБРАННОЕ" ו-"НЕДАВНИЕ"; שורה נבחרת בירוק מלא עם טקסט לבן, תואם ל-`primary_selected` `#1DCF67` (`contact_list/Common.cpp:259-263`); עיגולי לא-נקראו ירוקים, באדג' `@`, אייקון נעיצה ליד השעה. **בתחתית שלוש לשוניות בלבד: Контакты, Чаты (באדג' אדום 46), Настройки**. בכותרת הצ'אט: אווטאר, שם ו-"Онлайн" בירוק, וחיפוש, וידאו ו-`...`. בועה נכנסת לבנה, יוצאת ירוקה חיוורת עם שעה ירוקה, ושורת אווטארים של קוראים מתחת להודעה האחרונה. שורת קלט: `+` משמאל, placeholder "Сообщение", אימוג'י ומיקרופון מימין. נושאי התמונות: 1 תמלול קולי, 2 הצעות סטיקרים, 3 תשובות חכמות, 4 קבוצה של 22.5K חברים, 5 שיחת וידאו, 6 תפריט צירוף, 7 תשובה לכמה הודעות.
- **Inference**: אלה צילומים של בילד מוקדם (2020 עד 2021). בקוד 2022 הסקציה הראשונה מתורגמת "ЗАКРЕПЛЕННЫЕ" (`gui/translations/ru.ts`) ולא "ИЗБРАННОЕ", ויש ארבע לשוניות כולל Calls. הבאדג' האדום בלשונית תואם לקוד (`TabBar.cpp:498`, `Color::Red` = `secondary_attention`).
- `.../scratchpad/icq-new/web-icqcom-landing/eng_section1-img-dekstop.png`: ערכה כהה עם הדגשה כחולה, באנגלית. רשימת צ'אטים קומפקטית ("FAVORITES", "RECENT", "typing...", באדג'ים כחולים) ליד חלון שיחה (Mute, Disabled Sound, Start Video, Share Screen, Invite, Zoom to full Window, Go to Chat, End Meeting).
- `.../scratchpad/icq-new/web-icqcom-landing/eng_features-3.png`: בועות בהירות מקרוב, שמות שולחים צבעוניים, אווטארים של קוראים, וי כפול, פס הקלטה קולית ירוק ("00:34,52", פח, חץ שליחה).
- `.../scratchpad/icq-new/web-uptodown-screens/uptodown-win-1.jpg` הוא ICQ של 2016 עד 2019, לפני ICQ New. להשוואה בלבד.
- גיליונות מגע: `.../scratchpad/icq-new/web-contact-sheets/`. טקסט מלא של דפי העזרה: `.../scratchpad/icq-new/web-helpmailru/*.txt`.

## 13. היקף מומלץ לשחזור על הסטאק שלנו

### 13.1 חובה לגרסה הראשונה

| פריט | סיבה | תלויות |
|---|---|---|
| פריסה ראשית: עמודה שמאלית (כותרת, חיפוש, רשימה, לשוניות Chats, Contacts, Settings; Calls מוסתרת), עמוד צ'אט, סרגל פרופיל | זה מה שמגדיר את המראה | לקוח React, שרת WebSocket קיים |
| ערכות Green (ברירת מחדל) ו-Dark Green מהטוקנים, טפטים 1001 / 1002 | הצבעים המדויקים ידועים מהבינארי | משתני CSS מ-`themes` |
| כניסה עם מספר ICQ או אימייל + סיסמה, `Keep me signed in` | ICQ New הציע את זה, ובלי עלות SMS | auth קיים בשרת |
| הרשמה בלי SMS (כינוי + סיסמה) במקום הרשמה בטלפון | הרשמה בטלפון דורשת ספק SMS בתשלום | טבלת משתמשים |
| `Introduce yourself` ופרופיל: שם, אודות, כינוי לפי הכללים (5 עד 30) | זרימת הפעלה ראשונה וזהות | העלאת קבצים לאווטאר |
| רשימת צ'אטים: נעיצה, מונה לא-נקראו, השתקה, סימון כנקרא/לא-נקרא, "מקליד" ברשימה, טיוטות, חיפוש | זה הלב של הממשק | סמני קריאה ואירועי הקלדה בשרת |
| שיחה 1:1: בועות עם שרשור פינות, גלולות תאריך, לוחית New messages, סימני מסירה (שולח, נשלח, נמסר), heads של קריאה | הודעות הן הליבה | אישורי מסירה וקריאה בשרת |
| תשובה, העברה, עריכה עם `edited`, מחיקה לי או לכולם | צפוי ב-ICQ New | גרסאות הודעה ומצבות (tombstones) בשרת |
| שש ריאקציות ברירת מחדל | קטן ומוגדר היטב | טבלת ריאקציות |
| בורר אימוג'י עם אימוג'י מערכת או סט פתוח | האימוג'י המקוריים לא ברישיון | נתוני אימוג'י |
| קבצים ותמונות עם תצוגה מקדימה (עד 360), גרירה לחלון | צורך בסיסי | אחסון העלאות, מגבלת גודל |
| קבוצות: יצירה, חברים, תפקידים (Creator, Admin, Member, Read only), קישור הזמנה, הצטרפות באישור | הפיצ'ר המרכזי אחרי 1:1 | מודל קבוצות והרשאות בשרת |
| הגדרות: General (חלקי), Notifications, Appearance (ערכה, קומפקטי, גודל גופן), Privacy (מי יכול להוסיף אותי לקבוצות), Sessions | משתמשים מצפים להן, ורובן בצד לקוח | רשימת sessions בשרת |
| התראות Electron עם צליל נכנס משלנו, מגש עם אייקון לא-נקראו, סגירה למגש | התנהגות דסקטופ | מעטפת Electron, קובץ צליל מקורי שלנו |

### 13.2 אחר כך

| פריט | סיבה | תלויות |
|---|---|---|
| ערוצים (מנויים, קריאה בלבד) | נבנה מעל קבוצות | קבוצות |
| הודעות קוליות (עד 15 דקות, היסטוגרמה) | דורש הקלטה וקידוד | MediaRecorder, Opus, העלאה |
| תצוגה מקדימה לקישורים | דורש fetcher בטוח בשרת | fetch עם timeout והגנת SSRF |
| אזכורים עם `@` ובאדג' אזכור | דורש אינדקס חברים | קבוצות |
| הודעה נעוצה בקבוצות, חיפוש הודעות בשרת | פיצ'רים משניים | אינדקס חיפוש |
| שמונה הערכות הנותרות, בורר טפטים עם תמונות משלנו | הטוקנים מוכנים, התמונות לא שלנו | מנוע ערכות |
| סטטוסים עם אימוג'י ומשך | נחמד, לא ליבה | מודל נוכחות |
| קוד נעילה מקומי ונעילה אוטומטית | צד לקוח בלבד | אין |
| תשובות חכמות | דורש מודל הצעות | כללים או ML בשרת |
| Favorites (הודעות שמורות) | צ'אט עם עצמי, פשוט | אין |

### 13.3 לא אפשרי או לא מותר

| פריט | סיבה | תלויות |
|---|---|---|
| כניסה בטלפון + קוד SMS | דורש ספק SMS בתשלום והגנה מפני ניצול | שער SMS |
| כניסה בשיחה (6 ספרות אחרונות) | דורש ספק טלפוניה | ספק call-check |
| שיחות קול ווידאו, קישורי שיחה | המנוע המקורי קנייני; שלנו ידרוש WebRTC עם שרתי TURN | WebRTC, TURN |
| סטיקרים וחנות הסטיקרים של ICQ | האיורים מוגנים והוגשו משרתי Mail.ru | אין |
| תמונות האימוג'י המקוריות | לא ברישיון לשימוש חוזר | אין |
| לוגו, שם, פרח, צלילים ואיורים מקוריים כנכסים | סימני מסחר מוחרגים ב-Apache 2.0 סעיף 6, ורישיון הנכסים לא ברור | אין |
| גופני SF Pro / SF Mono | רישיון Apple אוסר הפצה | אין |
| מייל, ענן, משימות ולוח שנה של Mail.ru, תמלול קולי | תלויים בשירותי Mail.ru או במודלי דיבור | אין |
| תאימות לרשת ICQ האמיתית (WIM API) | השירות נסגר ב-26 ביוני 2024 | אין |

## 14. פערים ו-Unknown

| נושא | מצב | הנחת עבודה |
|---|---|---|
| מגבלת זמן לעריכה ולמחיקה לכולם | Unknown (אין בלקוח) | בלי מגבלה בגרסה הראשונה |
| מגבלת גודל קובץ | Unknown | 100MB בשרת שלנו, ניתן לשינוי |
| מגבלת חברים בקבוצה | Observation מהרשת: 25,000. אין אכיפה בלקוח | מגבלה ניתנת להגדרה בשרת |
| כניסה ב-QR | Unknown: אין בקוד ואין במקורות | לא לממש |
| מבנה הלשוניות בבילד האחרון (3 או 4) | Inference: 4 בקוד 2022, 3 בצילומי 2020 | 3 לשוניות כל עוד אין שיחות |
| סט האימוג'י ב-23.2.0 ורישיונו | Unknown | אימוג'י מערכת |
| מה הוסר מהממשק בין 10.0.x ל-23.2.0 מלבד המחרוזות | Unknown חלקי | לבנות לפי הקוד ולתקן לפי צילומי מסך |
| הסדר הוויזואלי של הלשוניות | Inference | Calls, Contacts, Chats, Settings |
| מידות ב-23.2.0 | Unknown (לא נבדקו בבינארי) | כמו בקוד 10.0.x |

## 15. נכסים בסקראצ'פד (לא בפרויקט)

כל הנתיבים תחת `<local-extraction>/icq-new/`:

| נתיב | תוכן |
|---|---|
| `im-desktop-src/im-desktop/` | שכפול הקוד (commit `78924d8`) |
| `im-desktop-src/im-desktop/gui/resources/` | אייקונים, צלילים, גופנים, איורים |
| `im-desktop-src/im-desktop/products/icq/app/resources/` | `themes/meta.json`, `incoming.wav`, אייקוני אפליקציה ומגש, איורי מקום ריק |
| `installer-win/icqsetup.exe` | המתקין 23.2.0.48119 |
| `installer-win-extracted/` | `icq.exe` וספריות Qt |
| `win-icqexe-rcc-zlib/` | `meta.json` (`json_00619d25b.json`), 12 קבצי `.qm`, השוואת מחרוזות, 37 SVG |
| `win-icqexe-wav/` | 6 WAV מהבינארי |
| `win-icqexe-config/config.json` | ההגדרות של 23.2.0 |
| `installer-mac/icq.dmg`, `installer-mac-plist/Info.plist` | בינארי macOS |
| `installer-linux/icq.tar.xz`, `installer-linux-extracted/icq` | בינארי Linux |
| `rea-out/` | פלטי REA |

סקריפטים: `<local-extraction>/icq-new-scripts/` (`themes_merge.py`, `ts_parse.py`, `noop_extract.py`, `qrc_inventory.py`, `build_spec.py` ועוד).
