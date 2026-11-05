# ICQ 2001b: ממצאי מחקר לשחזור ממשק ההתנהגות

מסמך זה מרכז ראיות מהקובץ המקורי של ICQ 2001b, לצד מחקר רשת ממוקד, לצורך שחזור נאמן של הלקוח כאפליקציית ווב. הפרוזה בעברית, וכל מחרוזת ממשק מצוטטת באנגלית בדיוק כפי שהיא מופיעה בבינארי. הקובץ המשלים, קריא למכונה: `docs/research/icq-ui-spec.json`.

## 1. מה נותח ומאיפה

| פריט | ערך |
|---|---|
| גרסה שנותחה | ICQ 2001b, client `5.1.8.3659` (VS_VERSION של `icq.exe`), חותמת PE של `icq.exe`: 2001-11-28 |
| מקור | archive.org, מזהה פריט `icq-2001b` (כותרת "ICQ 2001b", creator "ICQ Ltd.") |
| קובץ | `ICQ2001b.exe`, 4,312,600 בתים, FileDescription: `ICQ Installation (Ver 2001b Build 3659)` |
| SHA-256 | `3436e607cc2dfde7021f6f50d1f8f20e9da88dcb846d50fa9b88eecb9fa6d511` |
| SHA-1 (תואם ל-metadata של archive.org) | `01ecd76e1664240b6db8fd662a687fcb82be32f1` |
| REA Evidence של המתקין | `ev_c091d9cf0c29b0fe88ffc7829875a95fb91ab3d8596af6a0ca3ac8cb58fd5c4f` |
| בניית השוואה | ICQ 2000b, פריט archive.org `icq2000b_202206`, `icq2000b.exe` SHA-256 `9d5574cea30a8a0353d815555c59d589189b0fb98d9de63e74d908c16de3e11f` (CAB רגיל, 390 קבצים) |

### שרשרת החילוץ (Observation)

1. `ICQ2001b.exe` הוא מתקין Wise עם ZIP מוטמע. בתוכו `STANDARDCLIENT.EMO` (3.9MB) שהוא Microsoft Cabinet (חתימת `MSCF`).
2. ה-CAB מכיל קובץ יחיד `delta.mld` (18.7MB): מכולה של Red Bend (קיים `License/Red_Bend.txt`) בפורמט split-stream. כותרת: רשימת 281 שמות קבצים, רשימת 281 תיקיות, טבלת תכונות וזמנים, ואחריה 50 מקטעים באורך-מקודם.
3. מיפוי מקטעים שזוהה: מקטע 39 = כותרות PE של 111 הקבצים ברצף; מקטע 36 = מקטעי `.rsrc` הגולמיים של 110 קבצים ברצף (כל בלוק מתחיל בספריית משאבים, ה-base RVA וגודל הבלוק תואמים בדיוק לטבלת המקטעים בכותרת); מקטע 35 = נתוני קריאה בלבד (`.rdata`) של כל המודולים; מקטע 49 = קבצים שאינם PE בצורה גולמית (WAV, XML, TXT). קוד המכונה (`.text`) מפוצל למודלים דחוסים ולא שוחזר.
4. נבנו תמונות PE "משאבים בלבד": כותרת PE מקורית + מקטע `.rsrc` מקורי, שאר המקטעים אפסים. עליהן הורץ `npx -y rea-agents@6.8.0 inspect-pe-resources` וגם מפענח מקומי (pefile). כל חותמת Evidence של REA בהמשך מתייחסת לתמונה המשוחזרת הזו, שה-SHA-256 שלה מופיע ב-`icq-ui-spec.json` תחת `meta.rea_evidence_index`.
5. אף קובץ שהורד לא הורץ. כלים שנכתבו: `.../scratchpad/icq-artifacts/tools/`.

### מפתח ראיות REA (inspect-pe-resources)

| קובץ 2001b | תפקיד | REA Evidence ID |
|---|---|---|
| `icq.exe` | ליבת הלקוח: רשימת אנשי קשר, הודעות, סטטוסים, 836 מחרוזות, 55 דיאלוגים | `ev_0d21c061d2b7e449254c17cfd72206242e70ead2ea1a79ca3ef156f3f122f598` |
| `icqaddus.dll` | אשף הוספת משתמש והרשאות | `ev_75f8c9b9236fa37e2d96efe3149fbfd137fa9394e150f763f952964f5ef93cd2` |
| `icqstdlg.dll` | דפי העדפות ואבטחה | `ev_278801343520e0ed3634d746b5b5e0a013c67499cb3285e834e4e3f62a96ec60` |
| `icqpref.dll` | מסגרות העדפות, Answering Service | `ev_037fd6f075264e43db7e9c61748c79d98ed6e43963320cdcdde2b3a539eb9a0d` |
| `icqcool.dll` | שגיאות חיבור ושרת | `ev_8da50c1dcc98882e3c640e4120e3689ac6966e3087a02456d5fa97e9bca46342` |
| `icqlegal.dll` | הודעות מצב, רשימות פרטיות | `ev_f1544156e27c5d05e6111ececcefc5afee9ccc709adbeb5c7d9d34af3fd42b44` |
| `icqreg.dll` | אשף הרשמה | `ev_e0afd2d88daf740639271d29f617b6c07c153427121c230f0b8d88943a326e73` |
| `icqsearc.dll` | חיפוש במדריך | `ev_8b72bbc927fdd8ad936999ccbe5cb31d3d9670f3d64edfe475568e7dc9f5e94f` |
| `icqwhite.dll` | White Pages, Find a Friend | `ev_471ff839e9b31be8fea254e890b3a12524bbdf4dd7d3d8078f0bc1d8227a5cd7` |
| `icqusr.dll` | מסגרת User Info | `ev_afb1b9b3795c77b34d633c3504720d9e0e514cb3cffe531b962f5722ad0eb351` |
| `icqifdg.dll` | לשוניות פרטי משתמש | `ev_a240c0f37132a8818eb555af99a3a4de33f6e04ec5a433938de83a9b4af4c012` |
| `icqmcdgs.dll` | דיאלוגים שונים, סיסמה | `ev_907fbe29c825e3bea7d1ce38e5ff7a975c4d73d5ed34e8f73e5ce937ba2b7bbe` |
| `icqchte.dll` | צ'אט | `ev_6126feb1973f35e7bb405cf21aba7ed9161cb522aedade3b2bb92f271d96212d` |
| ICQ 2000b `ICQCore.dll` (PE אמיתי) | השוואה וערכי ברירת מחדל בקוד | `ev_1d2a27195b7f2c83db4122acfb79fc9898a7c41b02505667b8b4172b368b11ed` |

### תוויות

- **Observation**: נצפה ישירות במשאב (סוג, מזהה, קובץ, ו-REA Evidence ID), או במחרוזות הקבועות של מקטע 35, או בקוד המפורק של 2000b.
- **Inference**: מסקנה מבוססת אך לא מוכחת, למשל מצילום מסך מהרשת או מהקשר.
- **Unknown**: אין ראיה. לכל Unknown מצורפת הנחת עבודה לשחזור.

המרת פיקסלים בכל המסמך: גופן MS Sans Serif 8pt ב-96 DPI, יחידות בסיס 6x13: `px_x = dlu_x * 6 / 4`, `px_y = dlu_y * 13 / 8`. המידות הן של אזור הלקוח של הדיאלוג, בלי שורת כותרת ומסגרת.

## 2. מצב רשימת השאלות

| # | נושא | מצב |
|---|---|---|
| 1 | חלון רשימת אנשי קשר | partial (פריסה ורכיבים: answered; גודל ברירת מחדל של החלון בזמן ריצה: Inference) |
| 2 | עץ Main ועץ סטטוס | partial (סטטוס: answered; Main: כיתובים בלבד, הסדר Unknown) |
| 3 | תפריט קליק ימני על איש קשר | partial (כיתובים answered, סדר Inference מ-ICQ 2000) |
| 4 | רשימת סטטוסים ואייקונים | answered |
| 5 | זרימת הודעת היעדרות | answered (ערך ספירה לאחור התחלתי: partial) |
| 6 | Auto-away / Auto-N/A | answered (ערכים מקוד 2000b, Inference ל-2001b) |
| 7 | חלון הודעה | partial (פריסה, מגבלת 450 תווים, Occupied/DND: answered; Enter מול Ctrl+Enter: Inference) |
| 8 | התנהגות הודעה נכנסת | partial |
| 9 | הרשמה וכניסה | answered |
| 10 | הוספה/חיפוש והרשאות | answered |
| 11 | User Details | answered |
| 12 | חלון היסטוריה | partial (שמות הלשוניות Unknown) |
| 13 | העדפות ואבטחה | partial (ברירות מחדל של בחירת הרשאה ו-Web Aware: Unknown) |
| 14 | צלילים | partial (מיפוי וקבצים answered; תיאור שמיעתי של Online.wav: Unknown) |
| 15 | התחברות כפולה ומגבלת קצב | answered (אין טקסט "שליחה מהירה מדי" ייעודי) |
| 16 | מראה החלונות | partial |
| 17 | הודעת "מקליד" | answered (אין תמיכה, Observation שלילי מוגבל) |
| 18 | תזמונים | partial (מרווח הבהוב: Inference, התראות בעת התחברות: Unknown) |

## 3. ממצאים לפי שאלה

### Q1. חלון רשימת אנשי הקשר

**Observation**: התבנית היא `icq.exe` RT_DIALOG `2010` (REA `ev_0d21c061...`), DIALOGEX בגודל 110x199 DLU = 165x323.4 px, גופן `MS Sans Serif` 8, סגנונות `WS_CAPTION | WS_THICKFRAME | WS_POPUP | WS_BORDER`, exstyle `0x10080` (`WS_EX_TOOLWINDOW` + `WS_EX_CONTROLPARENT`): חלון כלים עם כותרת צרה וניתן לשינוי גודל. רכיבים קבועים בתבנית (כולם `BUTTON` מסוג owner-draw, כלומר מצוירים בקוד):

| id | טקסט | DLU (x,y,w,h) | px |
|---|---|---|---|
| 1109 | `ICQ` (הכפתור שמוצג כ-"Main") | 0,186,35,13 | 0,302.2,52.5,21.1 |
| 1116 | (כפתור סטטוס) | 51,186,56,13 | 76.5,302.2,84,21.1 |
| 5087 | (בשורה מעל: Services) | 3,154,55,13 | 4.5,250.2,82.5,21.1 |
| 5088 | (בשורה מעל: My ICQ) | 74,154,36,13 | 111,250.2,54,21.1 |
| 5013 | EDIT מוסתר (סרגל "Enter word to translate") | 0,170,83,13 | |
| 5051 | owner-draw מוסתר (כפתור `GO!`, ביטמפ 2182) | 86,170,24,14 | |
| 1112 | owner-draw מוסתר | 0,168,83,13 | |

`icq.exe` RT_DIALOG `2165` (100x28 DLU) הוא לוח הכפתורים: `Add User` (0,1,100,13), `Services` (0,15,50,13), `My` (50,15,50,13).

מחרוזות (Observation, `icq.exe` STRINGTABLE): `6244` = `System Notice - Click here`, `6245` = `Main Menu`, `7031` = `Online`, `15826` = `Show Only Online Users`, `15845` = `Separators`, `15816` = `Remove Separators`, `15817` = `Restore Separators`, `15818..15822` = `By Name`, `By Last Event`, `By Pin`, `By Online Status`, `Sort`, `15807` = `Close All Groups`, `15808` = `Open All Groups`, `15801` = `Create New Group`, `15828` = `Default Group`, `9540` = `Contact List Groups`. כותרות מקטעים קבועות במחלקה `BCContactListBox` (מקטע 35, נתוני קריאה של `icq.exe`, היסט 395060-395264): `Last %s`, `Future Users Watch`, `Awaiting Authorization`, `Non ICQ Contacts`, `Others`, `Web Message`, `Random`, `Not In List`. ליד הן `System Notice`, `Visible List`, `Invisible List` (היסט 407596-407688).

צבעי ברירת מחדל (Observation בקוד 2000b `ICQCore.dll`, שגרת רישום מאפיינים ב-VA `0x2191fdbb`, ערכי COLORREF; Inference שזהים ב-2001b כי אותם שמות מאפיינים קיימים ב-2001b): `OnlineUserColor` = `#0000FF` (כחול), `OfflineUserColor` = `#FF0000` (אדום), `GroupUserColor` = `#800080`, `NotifyUserColor` = `#800080`, `AuthorizeUserColor` = `#800040`, `AnonymousUserColor`/`RandomUserColor`/`FromWebUserColor` = `#000080`, `OwnerUserColor`/`ExternalUserColor`/`PhoneUserColor` = `#000000`, `LinkColor` = `#0000FF`, `ContactListColor` = `GetSysColor(COLOR_BTNFACE)` (`#C0C0C0` ב-Win9x קלאסי). דף ההעדפות `icqstdlg.dll` RT_DIALOG `3019` מאשר את הקטגוריות: `Online`, `Offline`, `Authorize`, `Not In List`, `Future Users`, `Non ICQ contacts`, `Web Users`, `Group Name`, `Link`, `Chat With a Friend Users`, ותיבת `Background color`.

**Inference (צילומי מסך רשמיים של icq.com ל-2001b, מקורות: demorgen.be, sbbo.ru, lifehacker.ru, rosipov.com, riko.ws)**, סדר מלמעלה למטה:
1. שורת כותרת כהה צרה עם מזער וסגור בלבד.
2. באנר `What's New In 2001b?` עם פרח.
3. שורת כלים: שני כפתורי אייקון קטנים ולשונית `ICQ 2001b` (ביטמפ `2196`/`2226`).
4. אזור הרשימה: מפריד `Online` במרכז שורה עם קו אופקי משני הצדדים; שמות מחוברים בכחול; אייקון סטטוס משמאל ואייקוני יכולות מימין לשם (טלפון סלולרי, ICQphone, תיקיית Shared Files עם `ON`); אחר כך מפריד `Offline` עם שמות באדום (צילום 2002a מאשר אדום, וצבע ברירת המחדל `#FF0000`). במצב קבוצות: שורות `Family - 0/1`, `General - 2/8` בצבע סגול מודגש עם משולש כחול, ספירה מחוברים/סה"כ.
5. בתחתית הרשימה כפתורי טקסט רחבים: `How to Start`, `Add Features`, `Chat With A Friend`. משמאל לרשימה גלילה, מימין סרגל `ICQuick` אנכי (ביטמפ `2157`) עם אייקוני קיצור.
6. כפתור `System Notice` ברוחב מלא עם אייקון.
7. כפתור `Add/Invite Users` מודגש ברוחב מלא.
8. שורה: `Services` | `My ICQ`.
9. שורה: `Main` | כפתור סטטוס עם אייקון ופרח וטקסט (למשל `Online`).
10. שורת `Enter word to translate` עם `GO!` וחץ.

הקבוצה "Not In List": מקטע נפרד בתחתית הרשימה (Inference ממחרוזות `icq.exe` RT_DIALOG `2214`: `Contacts moved to the ‘Not In List’ section ... will be lost`), מחזיק שולחים שאינם ברשימה, ונמחק בסגירת התוכנה.

כפתור System Notice: הטקסט `System Notice`; באירוע מערכת ממתין האייקון מתחלף לאייקון האירוע ומהבהב (Inference מצילום riko.ws שבו מוצג אייקון אירוע במקום הפרח, ומ-strip `2047` שבו לכל אייקון אירוע יש מסגרת "כבויה" לבנה). מחרוזת `7236` מאשרת: `Open The OutBox by double-clicking the system button.`

כפתור Main: אנימציה `icq.exe` RT_BITMAP `2059`, 1300x19 = 25 פריימים של 52x19 (רוחב הכפתור 35 DLU = 52.5 px, Observation): המילה `Main` נדחסת, הטקסט `ICQ` עם חיפושית אדומה גולל, ובחזרה ל-`Main`. הטריגר והקצב: Unknown.

**הנחות לשחזור**: גודל ברירת מחדל 165x323 px לאזור הלקוח (מתבנית 2010), רוחב מינימלי זהה; רקע רשימה `#C0C0C0` (או בהיר יותר כמו בצילום, `#E7E9E6` נמדד בצילום JPEG); פריסה לפי הסדר שבצילום; אנימציית Main מופעלת בריחוף עכבר בקצב 80ms לפריים.

### Q2. תפריט Main ותפריט הסטטוס

**תפריט סטטוס** (Inference לסדר מצילום רשמי של 2001b; Observation לכיתובים מ-`icq.exe` STRINGTABLE):

1. `Chat With A Friend` עם חץ תת-תפריט (אייקון דמות עם סימן שאלה אדום, `2150` תא 35)
2. כותרת מפריד ממורכזת: `Online Status` (`8104`)
3. `Available/Connect` (`7220`)
4. `Free For Chat` (`6297`)
5. `Away` (`7222`)
6. `N/A (Extended Away)` (`6258`)
7. `Occupied (Urgent Msgs)` (`6257`)
8. `DND (Do not Disturb)` (`7223`)
9. `Privacy (Invisible)` (`7224`)
10. `Offline/Disconnect` (`7221`)

התפריטים ב-2001b נבנים בקוד ומצוירים owner-draw: אייקון 16x16 משמאל, כותרות מפריד ממורכזות עם קו (`Online Status`, `Communication`, `Directories`...), ופס צד אנכי עם גרדיאנט כחול-לבן (Observation: `icq.exe` RT_BITMAP `2222` = `ICQ 2001B`, `1503` = `SERVICES`, `1502` = `MY ICQ`, `1505` = `ICQ`, כולם 22x207).

**תפריט Main**: Unknown לסדר (אין RT_MENU, נבנה בקוד גם ב-2000b). Observation לכיתובים הקיימים ב-`icq.exe`: `8098` `ICQ Main`, `8068` `Add / Invite Users`, `8069` `Find User - Add To List`, `8109` `Preferences`, `8110` `Security & Privacy`, `8079` `Settings Center`, `8058` `Change The Active User`, `7018` `Add/Change Current User`, `8059` `Add Another Registered User`, `8063` `Register A New User`, `8106` `Remove ICQ# From Computer`, `8107` `Unregister Existing User`, `8067` `History & Outbox`, `8116` `View Message History`, `8117` `Advanced Find`, `9540` `Contact List Groups`, `7904` `Save / Load Contact List`, `8091` `Contact List Position` (`8092` `Floating`, `8093` `Left`, `8112` `Right`), `8080` `To Simple Mode`, `8111` `To Advanced Mode`, `8114` `Web, Help & Tutorials`, `8081` `Help`, `8115` `Help Topics`, `8082` `Help Cards`, `8085` `ICQ F.A.Q`, `8086` `User To User Help`, `8089` `Reactivate Dialogs`, `8090` `About`, `8217` `Add / Remove Features`, `8094` `Standby`, `8095` `Shut Down`, `8175` `Exit`.

תפריט Services (Inference, צילום רשמי): `Communication` [`My Communication Center`, `Answering Service`, `SMS Message`, `ICQphone` >, `Email` >, `Phone "Follow Me"` >], `Directories` [`ICQ White Pages` >, `Search The Web`], `Communities` [`ICQ Topics Directory Bar` >, `Shared Files` >], `Others` [`ICQ Free Info`, `Newsletter` >, `Translation` >, `ICQMail` >], `More Features` [`Add More Features`]. המבנה המלא ב-JSON.

**הנחה לשחזור (Main)**: סדר מוצע ב-`menus[main_menu].proposed_order`: `Add / Invite Users`, `Find User - Add To List`, מפריד, `Preferences`, `Security & Privacy`, `Contact List Groups` >, `Contact List Position` >, מפריד, `Change The Active User` >, `View Message History`, `Save / Load Contact List` >, מפריד, `To Simple Mode`, `Web, Help & Tutorials` >, `About`, מפריד, `Standby`, `Shut Down`. יש לאמת מול צילום אמיתי אם יימצא.

### Q3. תפריט קליק ימני על איש קשר

**Observation** (כיתובים ב-`icq.exe`): `7003` `Message`, `7007` `File`, `7004` `Web Page Address (URL)`, `7383` `Contacts`, `7005` `Email`, `7013` `ICQ Chat`, `7006` `Homepages`, `7020` `Message History`, `7009` `User's Details`, `7008` `Alert/Accept Modes`, `6731` `User Options`, `7011` `Delete `, `7012` `Rename`, `7186` `"Floating" On`, `7181` `"Floating" Off`, `6221` `Add to invisible list`, `6228` `Remove From Invisible List`, `7021` `Re-Request Authorization`, `15814` `Move To Group`. מחלקת `MCUserContextMenu` קיימת במקטע 35, כלומר בנוי בקוד. דיאלוג `2081` `User Menu Selection` מאשר שהמשתמש בוחר כפתור שמאלי או ימני לתפריט: `Either the left or the right mouse button can be used to access the user menus.`

**Inference** (צילום ICQ 2000, computerbase.de; מבנה 2001b ככל הנראה זהה): כותרת `Send`: `Message`, `File`, `Web Page Address (URL)`, `Contacts`, `Email` >; כותרת `Invite`: `ICQ Chat`, `Phone - "Follow Me"` >, `More Services (Plugins)` >, `Internet Telephony/Games` >; מפריד; `History` >, `Homepages` >, `Info`; מפריד; `More (Rename, Delete...)` >.

**הנחה לשחזור**: זה הסדר; תת-תפריט `More` מכיל `Rename`, `Delete`, `Move To Group`, `"Floating" On`, `Add to invisible list`, `Alert/Accept Modes`.

### Q4. סטטוסים ואייקונים

כל האייקונים 16x16, 4bpp, מפתח שקיפות מגנטה `#FF00FF` (Observation: `icq.exe` RT_BITMAP `2047` ו-`2150`, REA `ev_0d21c061...`; התאמה ויזואלית לצילום תפריט הסטטוס הרשמי). הפרח הבסיסי: מתאר שחור `#000000`, עלי כותרת עם הדגשה לבנה `#FFFFFF`, מרכז צהוב `#FFFF00` (5 פיקסלים), ממוקם בעמודות 5-15 של התא.

| סטטוס | שם פנימי / מחרוזות | אייקון | תיאור פיקסלים |
|---|---|---|---|
| Online | `Available/Connect`, `Online` | `2047` תא 23 | עלים ירוקים `#00FF00` (38 px) + לבן (34 px) + מתאר שחור (105 px) + מרכז `#FFFF00` |
| Free For Chat | `Free For Chat`, `Chat` | `2150` תא 38 | פרצוף סמיילי צהוב `#FFFF00` במרכז עם עיניים ופה `#000080`, עלים ירוק-לבן |
| Away | `Away` | `2047` תא 24 | דף/פתק לבן `#FFFFFF` עם הצללה `#C0C0C0` מכסה את הפרח, קצות עלים ירוקים |
| N/A | `N/A (Extended Away)`, `N/A` | `2150` תא 48 | שלט לבן עם מסגרת אדומה `#FF0000` ואותיות שחורות `N/A`, קצות עלים ירוקים מעל ומתחת |
| Occupied | `Occupied (Urgent Msgs)`, `Occupied`, פנימי `Busy` | `2150` תא 16 | צורת יד/דמות לבנה במרכז עם הדגשות אדומות `#FF0000` |
| DND | `DND (Do not Disturb)`, `DND` | `2150` תא 44 | עיגול אדום `#FF0000`/`#800000` עם X לבן במרכז הפרח |
| Privacy / Invisible | `Privacy (Invisible)`, `Invisible` | `2150` תא 18 | מרכז הפרח צללית שחורה, עלים ירוק-לבן |
| Offline | `Offline/Disconnect`, `Disconnected` | `2047` תא 25 | זהה ל-Online עם עלים אדומים `#FF0000` |

שמות פנימיים במאפיינים (Observation, מקטע 35): `RealAwayMessage`, `RealOutMessage` (N/A = "Out"), `RealBusyMessage` (Occupied = "Busy"), `RealDNDMessage`, `RealChatMessage` (FFC = "Chat"). מחרוזות קצרות: `6466` `Away/Not Available`, `6467` `Occupied/DND`, `6468` `Privacy/Off`, `7035` `Connecting`.

אייקונים נוספים: `2047` תאים 35-42 = אנימציית התחברות (צבעי עלים מסתובבים); `2047` תא 33 = פרח לבן עם מתאר שחור, מסגרת ה"כבויה" של ההבהוב. בצילומי icq.com הרשמיים של 2001b אנשי קשר מחוברים מוצגים דווקא עם הפרח הלבן הזה (Inference); בצילום 2002a אנשי קשר מנותקים מוצגים בפרח אדום. `2047` תא 26 (פרח מעורב אדום-ירוק-זית): משמעות Unknown. אייקוני מגש: `icq.exe` RT_GROUP_ICON `1083` (פרח צבעוני, 16 ו-20 px) ו-`1084` (פרח לבן-אפור).

**הנחה לשחזור**: באזור הרשימה, Online = תא 23 (ירוק); אם רוצים להיות זהים לצילומי icq.com, להציג תא 33. החלטה זו צריכה אימות.

### Q5. זרימת הודעת היעדרות

**Observation**:
- הסטטוסים שמבקשים הודעה: Away, N/A, Occupied, DND, Free For Chat. Online, Invisible, Offline לא (אין להם `Real...Message`).
- דיאלוג `icq.exe` RT_DIALOG `2064`, כותרת `Change / Confirm Away Message`, 200x95 DLU = 300x154.4 px: טקסט עליון (4,2,190,34) `This message will be displayed to users when you are marked "away".\nThe message may be modified in your preferences.`; תיבת עריכה רב-שורתית (4,39,193,34); `&Select Message` (4,76,60,14); כפתור ברירת מחדל עם ספירה לאחור, טקסט בתבנית `&Closing in 7 sec` (129,76,62,14). תבנית בזמן ריצה: `6327` `Closing in %d Secs`.
- אותו דיאלוג עם טקסטים אחרים ל-N/A (`6264` `Change/Confirm N/A Message`, `6265`), DND (`6262` `Change/Confirm DND Message`, `6263`), Occupied (`7256` `Change / Confirm Occupied Message`, `7255`).
- FFC: `2079` `Change / Confirm Chat Mode Message`: `Chat Room Name:` עם ברירת מחדל `My Chat Session`, תיבה `&Auto add users to chat room when requesting chat`, `Select a &Preset Message`, `&Free For Chat Guide`, `&OK`.
- טקסטי ברירת מחדל (מקטע 35, היסט 163033-163265, בדיוק):
  - Away: `User is currently away\r\nYou can leave him/her a message`
  - N/A: `User is currently N/A\r\nYou can leave him/her a message`
  - Occupied: `User is currently Occupied`
  - DND: `User is currently in DND mode`
  - Free For Chat: `I would like to chat about anything`
- אורך מרבי להודעת היעדרות: 500 תווים (Observation בקוד 2000b: טווח `0..0x1f4` עבור `RealAwayMessage`).
- תפריט presets: `icq.exe` RT_MENU `2051`: `Preset1` עד `Preset8`, מפריד, `Edit Messages`. עורך: `icqpref.dll` `9040` `ICQ Answering Service For: %s` עם `Restore ICQ Default Status Messages`.
- הודעות מעבר מצב (`icqlegal.dll`): `29050` `You are now in  "Away" , or unavailable status.  Users will receive an "away" message when trying to send you events.`; `29086` N/A; `29088` Occupied; `29051` DND; `29090` FFC (הנוסחים המלאים ב-JSON).
- אצל האחרים: פריט תפריט `7197` `Read Away-message`, `6251` `Read N/A-Message`, `6250` `Read DND-Message`, `7234` `Read Occupied-Message`, `6298` `Read Chat Room-Message`; תוך כדי שליפה `7198` `Retrieving User's Away Message`, כותרת `7199` `Away Message`.
- תגובה אוטומטית לשולח: דיאלוג `2517` (215x95 DLU = 322.5x154.4 px): אייקון, טקסט עליון (למשל `7242` `User %s Is Away`), תווית `Away message:`, תיבת הטקסט עם הודעת ההיעדרות, כפתורים `Leave a &Message` (ברירת מחדל), `OK`, `&OK`, ו-`&Don't show again`. טקסטים: `7241` `User is away.\nYour event has been saved on his/her Contact List.`, `6259` N/A, `7245` Occupied, `7267` DND. תוויות `7240` `Away message:`, `7244` `Occupied message:`, `6268` `DND message:`, `6260` `User Is in N/A mode:`. כותרת חלון הודעה מקבלת סיומת `7189` ` [User Is Away]`, `6256` ` [User Is in N/A mode]`, `7248` ` [User Is Occupied]`, `6255` ` [User Is in DND mode]`.

**Inference**: הדיאלוג נסגר ומאשר לבד בסוף הספירה. ערך ההתחלה: התבנית מציגה 7, ובמקומות אחרים 10 (`9502` `Close in 10sec`, `6740` `This window will close in %d seconds.`).

**הנחה**: ספירה מ-10 שניות, צעד של שנייה, בסיום אישור אוטומטי; בטל ספירה כשהמשתמש מקליד.

### Q6. Auto-away / Auto-N/A

**Observation**: `icqstdlg.dll` RT_DIALOG `3018`, קבוצה `Availability-Status Mode Settings`: `Set "Away" status after` [EDIT+spin] `minutes of not using the computer `; `Set "N/A" status after` [EDIT+spin] `minutes of "Away" mode`; `Allow users to see how long I've been idle`; `Show messages in tray in all status modes. Incoming event icon will flash in your desktop tray regardless of your status mode`; `Disable "Online Alert" messages in "Away","DND","N/A" and "Occupied" `.

**Observation בקוד 2000b** (`ICQCore.dll`, שגרת רישום מאפיינים, היסטי קובץ `0x9f560-0x9fb80`): `MoveToAway` = TRUE, `MoveToAwayDelay` = 10 דקות (טווח 2-1000); `MoveFromAwayToOut` = TRUE, `MoveFromAwayToOutDelay` = 20 דקות (טווח 2-1000); `DisableOnlineAlert` = TRUE; `AutoHide` = FALSE, `AutoHideTime` = 30 שניות. **Inference**: 2001b זהה (אותם שמות מאפיינים ב-`icq.exe` של 2001b, מקטע 35 היסט 162353-162701).

### Q7. חלון ההודעה

**Observation**:
- מצב יחיד (classic): `icq.exe` RT_DIALOG `2507`, 397x132 DLU = 595.5x214.5 px (כולל עמודת `Select Recipients` שנפתחת מימין מ-x=328). שורת `To` (קבוצה 0,0,325,24): `ICQ# :`, `Nick:`, `EMail:` ושדות, כפתור owner-draw (310,9). אזור טקסט נוצר בזמן ריצה. תחתית: `&Cancel` (1,112,41,15), `&Talk` (48,112,34,15), `&Video` (86,112,37,15), קבוצה `Send by:` עם `ICQ`/`SMS`/`E-mail`, `&Send` (234,112,60,15), אנימציה (300,109). `Multiple >>` (283,26). 
- מצב מפוצל (2001b חדש): `2566` `Initiating Message`, 329x182 DLU = 493.5x295.8 px, ניתן לשינוי גודל. שורת `To:  ICQ# ` + פרח סטטוס (`2573`), סרגל `Chars:` מונה, `User Menu`, `Msg Mode`, `History` (`2572`), חלונית היסטוריה (3,16,323,85), אזור כתיבה (3,102,323,19 ומטה), תחתית: `&Cancel`, `&Talk`, `&Video`, `ICQ`/`SMS`/`E-mail`, `&Send` (263,161,34,18). כותרת בזמן ריצה בצילום: `<nick> (Online) - Message Session`.
- בחירת מצב: `2570` `Split / Single Message Mode Window Selection`: `Single Message Mode Window` (`Displays one window in which you enter your text. `) ו-`Split Message Mode Window` (`Displays two windows in which you enter text and view the correspondance.`), אזהרה `Important Note: Switching to Single Mode in the middle of a message session will delete the session text written up to that point.`
- עיצוב היסטוריה: תבניות RTF ב-`icq.exe`: `9858` כחול מודגש `\red0\green0\blue255 ... \b %s`, `9859` אדום מודגש `\red255\green0\blue0 ... \b %s`, `9876` טקסט שחור; גופן `MS Sans Serif` `\fs20` (10pt).
- מגבלת אורך: `6478` `Message exceeds server limit (450 chars).\nPlease edit your message before sending`; `6465` `User cannot receive messages of more than 450 characters. ...`; `icqcool.dll` `11` `Limit to offline messages is 450 chars.` (ישירות בין לקוחות 2001b אפשר יותר).
- שליחה ל-Occupied/DND: כפתור `7243` `Send Urgent` ו-`7247` `Send To Contact List`; `7245` `User is in Occupied mode. Urgent Events  will blink. Other events will be indicated on his/her contact list.`; `7267` `User is in DND mode and selected not to accept urgent events. Send this event to his/her Contact List.`
- עורך הטקסט הוא AOL ATE (`icqateres.dll`); טבלת קיצורים `100` כוללת `Enter`, `Shift+Enter`, `Ctrl+Enter` כפקודות נפרדות (601/602/603). קיצורי עיצוב: `&Bold\tCtrl+B`, `&Italic\tCtrl+I`, `&Underline\tCtrl+U`, סמיילים `:-)    Ctrl+1` עד ` :)    Ctrl+4`.

**Inference**: צילום "Message Session" (pikabu.ru): שורת תאריך מודגשת, אחריה `Nick:` מודגש וצבוע, והטקסט באותו צבע; המשתמש המקומי בכחול כהה, הצד השני באדום. שליחה: Ctrl+Enter שולח, Enter יורד שורה (ידע כללי על ICQ 2000/2001, לא הוכח בקוד).

**הנחות**: Ctrl+Enter = שליחה, Enter = שורה חדשה; מגבלת 450 תווים להודעות דרך השרת עם המונה `Chars:`; עצמי כחול `#0000FF`, אחר אדום `#FF0000`.

### Q8. הודעה נכנסת

**Observation**: חלון `2503`, כותרת תבנית `[ICON] Incoming Action Type Event`, 264x198 DLU = 396x321.8 px, ניתן לשינוי גודל. קבוצה `From` עם `Nick Name:`, `EMail:`, `ICQ# :`, `Date:`, `Time:`; גוף ההודעה; `More Functions`, `Close`, `&Read Next` (owner-draw, מושבת כשאין עוד). ילד `2505`: `Re&ply` (ברירת מחדל), `&Forward`, `Add To Ignore List`, `Request &Chat`, `Send Contacts`, `&History`. כותרת: `9832` `%s - (Incoming) %s [%d Event(s) Left]` ו-`9833` `%s - (Incoming) %s [No More Events]`. `7353` `Other incoming event(s) are waiting. In order to receive the next one please click "Read Next" or hit "Close".`. העדפות אירועים (`icqstdlg.dll` `3038`): `Open and minimize incoming event to the Taskbar `, `Blink incoming event on Contact List`, `Pop-Up incoming event on the Desktop`, `Highlight a sender's name on Contact List upon receipt of an incoming `, `Play a sound upon receipt of an event`. מחרוזת `9856` `Automatically pop-up incoming message`. ברירות מחדל בקוד 2000b: `BlinkTray` = FALSE, `BlinkTrayAwayBusy` = TRUE.

**Inference**: אייקון האירוע ברשימה מתחלף בין האייקון הצבעוני (למשל `2047` תא 0, בועת הודעה צהובה) לגרסת מתאר לבנה (תא 27), וגם במגש. לחיצה כפולה על השם פותחת את האירוע (`2081`: `To receive incoming events, double click on the flashing ic...`).

**הנחה**: Pop-Up כבוי כברירת מחדל, הבהוב ברשימה פעיל.

### Q9. הרשמה וכניסה

**Observation** (`icqreg.dll`, REA `ev_e0afd2d8...`): מסגרת `3017` `ICQ Registration`, 337x255 DLU = 505.5x414.4 px, פס תמונה משמאל, כפתורי תמונה `Back`, `Next`, `Start`. דפים 279x220 DLU = 418.5x357.5 px:
1. `8553`: `Connection Type` (`Modem (dial-up connection)`, `Permanent (Lan, Cable Modem, etc.)`), `NEW ICQ#` + `Click here to register and receive a new ICQ#.`, `EXISTING USER` + `I already have my own ICQ# and would like to use it on this computer.` (צילום הרשת מאשר, רקע דף `#B1CAE9`).
2. משתמש קיים `8529`: `Enter your existing ICQ# and password to use ICQ on this computer then just click the 'Next' button.`, `ICQ#:`, `Password:`, `&Auto Save Password`, `Have you forgotten your password?`, `Retrieve Password`.
3. משתמש חדש: רישיון `8557`, פרטים `8556` (`First Name:`, `Last Name:`, `Nickname: `, `Email (i.e. john@isp.com):`, `Password:`, `Confirm Password:`, `Auto Save Password`), פרטים אישיים `8555`, סטטוס הרשמה `8551` (`Registering User`, קבוצה `Your ICQ#` עם `Your ICQ# is a unique number that identifies you as a registered ICQ user. `, ו-`Privacy && Security Settings`), שירותים `8554` (`Click on the Start button to accept the above checked Services and launch ICQ`).
4. שגיאות: `14` `You did not select a password. ...`, `15` `Confirm password does not match !`, `6412` `Could not complete registration! ...`.

כניסה: `icq.exe` `1007` `Connect to The ICQ Network`, 161x93 DLU = 241.5x151.1 px: `User:` (שם בסטטי או combobox מוסתר), `Password:` (שדה סיסמה), `&Save password`, `&Retrieve Password`, `&Cancel`, `&OK`, כותרת `Password does not match. Try again:`. מחרוזות: `7292` `Login to server`, `7293` `Please enter your password`, `6201` `Password incorrect`, `6202` `Password incorrect. Please re-enter your password`.

### Q10. הוספה, חיפוש והרשאות

**Observation**:
- חיפוש (`icqsearc.dll`): אשף `2066` `ICQ Global Directory - Contact List Wizard`, דף `2012`: `Search by Email - the preferred search criteria`, `Search by any of the following parameters` (`Nickname:`, `First Name:`, `Last Name:`), `Search by ICQ#`, `Search by Keyword`, `Show Only &Online Usres` (כך במקור). תוצאות `2011`: `These registered ICQ users were found. Choose user by left clicking an...`, `More User's &Details`, `Send &Message`, `Add to contact list - to start receiving user's online/offline status `. לא נמצא `2013`: `No User Was Found`, `Invite A Friend`.
- עמודות תוצאות (מקטע 35, `BCFindUserList`): `Nickname`, `First`, `Last`, `ICQ #`; ובצילום 2000: `ICQ #`, `Nick ...`, `F...`, ו-`Authorization` (Inference).
- אשף הוספה (`icqaddus.dll`): `110` `Add User to Contact List` עם `ICQ#:`, `Display Name:`, `Email:`, `<< &Back`, `&Next >>`, `&Done`, `&Close`; `111` בחירת קבוצה ו-`&Grant the user Authorization to add you to his/her Contact List`; `102` כשנדרשת הרשאה: `Can't add user to your Contact List. The user must first authorize your request \n \n Enter request reason:` ו-`&Set ICQ to submit this authorization request again in seven days.`; `114` `Request For Authorization was sent`. טקסט ברירת מחדל לבקשה: `12` `Please authorize my request and add me to your Contact List. %s ICQ#%s`.
- הודעות מערכת (שמות סוג אירוע, מקטע 35): `Request For Authorization`, `"Authorization" Request Accepted`, `"Authorization" Request Denied`, `"You Were Added"`, `"Future User Has Registered" Message`.
- בקשה נכנסת: `106`: `This user has requested your authorization to add you to his/her Contact List.` + `&Authorize`, `Decline/&Ignore`, `Send &Message`, `&Add To Contact List`. סירוב: `7134` `Decline user request.  Enter a reason for refusal:`; התעלמות: `6377` `User will receive no response to his/her Authorization request. Are you sure you wish to ignore his/her request?`.
- אושר: `21` `The user has accepted your request to add him/her to your Contact List.`
- נדחה: `22` `The user has declined your request to add him/her to your Contact List.\r\nNo reason was given.` או `23` עם `The following reason was given:\r\n`.
- נוספת: `115`/`35`: `The user added you to his/her Contact List.\n\nYou can share the details of your mutual contacts by clicking on the "Send Contacts" button.` + `&Add To Contact List`, `&Send Contacts`, `User &Info`, `&Request Contacts`.
- `15811` `%s has been added to your Contact List.\nICQ servers will alert you when user is online.`

### Q11. User Details

**Observation**: `icqusr.dll` `9055` `User Info %s` (385x204 DLU = 577.5x331.5 px), פנים `9056` עם `&Update from ICQ Directory`, `&More Options`, `&OK`, `&Cancel`, `&Apply`. לשוניות (`icqusr.dll` strings): `Main`, `More`, `Home`, `Work`, `About`, `Group/Past/Interests`, `Info Summary`. דפים (`icqifdg.dll`, שיוך לפי תוכן = Inference): Main `8505` (`Nickname:`, `First:`, `Last:`, `ICQ#:`, `Display:`, `Email Addresses`); More `8504` (`Gender:`, תאריך לידה, `Age:`, `Homepage:`, `Spoken Languages:`, `Zodiac Sign:`); Home `8507` (`Street Address:`, `City:`, `State:`, `Zip Code:`, `Country:`, `GMT Offset:`, `User Time:`, `Your Time:`); Work `8512` (`Company:`, `Div/Dept: `, `Position:`, `Occupation:`, `Web Site:`); About `8508`; Group/Past `8514`; Interests `8517`.

### Q12. Message History

**Observation**: `icq.exe` `2020`, כותרת תבנית `History Of Events: The ICQ Server`, 348x158 DLU = 522x256.8 px, ניתן לשינוי גודל: `SysTabControl32` עם `SysListView32` (1,3,343,115), `&Delete`, `Delete &All`, `&Save As`, `&Find`, `&Deleted Items Folder`, `Delete &Old ICQ Database`, `Display &Last Event First`, `Do Not Log Event History`. `1005` `Event Details`: `Date:`, `Time:`, `Type:`, `NickName:`, `ICQ #:`, `EMail:`, `First Name:`, `Last Name:`, קבוצת `Content`, `&Close`, `&Reply`, `&Forward`, `&Previous`, `&Next`. ברירת מחדל `HistorySortLastEventFirst` = TRUE (קוד 2000b). שמות לשוניות: Unknown. **הנחה**: לשוניות `Incoming` ו-`Outgoing` (או `Receive`/`Send` לפי `15809`/`15810`), ועמודות תאריך, שעה, סוג, תוכן.

### Q13. העדפות ואבטחה

**Observation** (`icqstdlg.dll` `3005`): `Contact List Authorization`: `All users may add me to their Contact List and see my Online / Offline status` / `My authorization is required before users add me to their Contact List`; `Security Level`: `Low - most ICQ operations will be carried out without a password`, `Medium - ...`, `High - ...`; `Web Aware`: `Allow others to view my Online / Offline status from the Web and from my ICQ Web Front page`. Ignore `3039` (`Add To Ignore List`, `Remove From Ignore List`), Invisible `3040` (`The following users will not be aware of your online status, until you...`), Visible `3041` (`Your status will be visible on the following users' Contact Lists, eve...`). רמת הרשאות `3055`: `High`, `Medium (Default)`, `Low`, `Custom`. קבלת הודעות `3057`: `Accept messages only from users on my Contact List`. עץ העדפות (`icqpref.dll`): `Contact List`, `Miscellaneous`, `Status Mode`, `Connections`, `Events`, `Telephony/Data/Games`, `ICQ Adds on`, `Email`, `Shortcut Bar`, `Security & Privacy Permission`.

**Unknown**: איזו אפשרות הרשאה ו-Web Aware מסומנות כברירת מחדל. **הנחה**: הרשאה לא נדרשת, Web Aware כבוי, Security Level נמוך, Permission Level בינוני.

### Q14. צלילים

**Observation**: טבלת אירועים בנתוני `icq.exe` (מקטע 35, היסט 426216-427312, שלשות תיאור, קובץ, מפתח; השיוך בין שכנים = Inference). קבצי WAV מ-`/Sounds/` חולצו ממקטע 49; השיוך לשם לפי סדר מקור, מאומת ב-14 קבצים זהים ל-2000b.

| אירוע | קובץ | מפתח | משך | פורמט |
|---|---|---|---|---|
| `Incoming Message` | `Message.wav` ("Uh-oh!") | `ICQMessage` | 0.451s | 22050Hz 8bit mono |
| `Online Alert` | `Online.wav` | | 1.190s | 11025Hz 8bit |
| `System Message` | `System.wav` | | 0.722s | 11025Hz |
| `Authorization Message` | `Auth.wav` | `ICQPIN` | 2.313s | 8000Hz |
| `Contacts Message` | `Contact.wav` | `ICQContact` | 1.245s | 8000Hz |
| `Incoming URL` | `URL.wav` | `ICQURL` | 0.483s | 8000Hz |
| `Notification Message` | `Notify.wav` | `ICQNotify` | 1.521s | 8000Hz |
| `ICQ Startup` | `Startup.wav` | `ICQStartup` | 2.429s | 8000Hz |
| `Global Online Alert` | `Global.wav` | | 0.434s | 11025Hz |
| (Chat request) | `Chat.wav` | `ICQChat` | 1.380s | 16000Hz |
| (File request) | `File.wav` | `ICQFile` | 1.462s | 16000Hz |
| `ICQ File Transfer Done` | `FileDone.wav` | `ICQFtDone` | 0.783s | 11025Hz |
| (Birthday) | `Birthday.wav` | `ICQBirthday` | 2.934s | 8000Hz |
| `Phone Request` | `Phone.wav` | `ICQPhone` | 0.905s | 8000Hz |
| `ICQ HomePage Hit` | `HomePage.wav` | `ICQHomePage` | 1.670s | 8000Hz |
| `Message Typing` | `MsgType.wav` | | 0.168s | 11025Hz |
| `Message Sent` | `MsgSent.wav` | | 0.310s | 11025Hz |
| `Message Bell` | `MsgBell.wav` | | 0.486s | 8000Hz |
| `Message Backspace` | `MsgBack.wav` | | 0.175s | 11025Hz |
| `Default Plugin` | `Plugin.wav` | `ICQPlugin` | 1.198s | 8000Hz |
| `ICQ WebSearch Sent` | `WebSearch.wav` | | 0.394s | 8000Hz |
| `ICQ Reminder`, `Picture Request`, `ICQ Email Notify`, `ICQ Chat Beep`, `ICQ Chat LOL`, `ICQ Chat Emote`, `ICQ Chat Action`, `External Application Request` | `Reminder.wav`, `Picture.wav`, `EMail.wav`, `ChatBeep.wav`, ... | | לא נשלחים ב-2001b | |

`Message.wav`: שתי הברות (קצרה, הפסקה, ארוכה), תואם "Uh-oh!" (Inference ממעטפת אנרגיה). `Online.wav`: כמה פעימות ב-1.19 שניות; תיאור שמיעתי Unknown. קבצי פלאגינים: `icqcheck.wav`, `ICQEmail.wav`, `ICQGreet.wav`, `incomingsms.wav`, `mail.wav`, `pictaut.wav`, `RingIn.wav`, `smsreceipt.wav`. `MsgType.wav` הוא צליל הקלדה מקומי, לא התראת "מקליד". הקבצים: `<local-extraction>/icq-artifacts/sounds/` (לעיון בלבד, לא להעתיק לפרויקט).

**הנחה**: הצלילים MsgType/MsgBack/MsgSent/MsgBell כבויים כברירת מחדל.

### Q15. התחברות כפולה ומגבלת קצב

**Observation** (`icqcool.dll`): `34` `Your ICQ# is being used on another computer`; `32` `Rate limit exceeded.\nPlease try to reconnect in a few minutes`; `36` `The number of users connected to the ICQ server from this IP address has reached the maximum. Please contact ICQ support at support@icq.com`; `33` `This ICQ# does not exist`; `19` `Password Error`; `1` `You are currently not connected to the ICQ Network.\nIf you did not choose the "Offline/Disconnect" mode from the status flower button the service will automatically try to re-connect.`; `2` `Disconnection Detected.  Try to Reconnect`. לא נמצא טקסט ייעודי ל"שליחה מהירה מדי" (חיפוש תחום במחרוזות ודיאלוגים). **הנחה**: להשתמש ב-`32` גם כאזהרת קצב הודעות.

### Q16. מראה החלונות

**Observation**: כל הדיאלוגים ב-`MS Sans Serif` 8 (חריגים: `About ICQ` ב-`Comic Sans MS` 9, `Select Directory` ב-`Helv` 8). ללא skin; חלונות Win32 סטנדרטיים (`DS_3DLOOK`, `DS_MODALFRAME`), כפתורי הרשימה owner-draw, תפריטים owner-draw עם פסי צד. רקע הרשימה `COLOR_BTNFACE`. **Inference מצילומים**: כפתורי הרשימה שטוחים בסגנון 3D עם טקסט מודגש; דפי הרשמה ברקע תכלת `#B1CAE9`; כותרת החלון בגרדיאנט כחול כהה. **הנחה**: לוח Win98: `#C0C0C0` פנים, `#FFFFFF`/`#808080`/`#000000` לבליטה, כותרת `#000080` לגרדיאנט `#1084D0`, גופן 11px Tahoma/MS Sans Serif ללא החלקה.

### Q17. התראת "מקליד"

**Observation (שלילי, תחום)**: אין במחרוזות, בדיאלוגים או בנתוני הקריאה של 2001b שום טקסט "is typing"; המופעים היחידים: צליל `Message Typing` (`MsgType.wav`) ו-`6716` `Auto Check When Typing` של בודק האיות. **Inference**: 2001b לא תומך בהתראת הקלדה. **הנחה**: לא לממש, או לממש כאפשרות כבויה.

### Q18. תזמונים

**Inference** (קוד 2000b, קריאות `SetTimer` עם `nElapse` מיידי: 500ms, 490ms, 1000ms, 125ms, 100ms, 50ms): ההבהוב כ-500ms. **Unknown**: האם התראות Online נורות לאנשי קשר שכבר מחוברים בזמן ההתחברות. **הנחות**: הבהוב 500ms; בהתחברות, בלי התראות לאנשי קשר שכבר מחוברים בתחילת החיבור (פתיחת חיבור שקטה), רק `Startup.wav`; `Online.wav` רק במעבר מ-Offline ל-Online לאחר הסנכרון.

## 4. אייקונים לציור מחדש (לעיון בלבד, לא להעתיק לפרויקט)

תיקייה: `<local-extraction>/icq-artifacts/rendered/key_icons/` (לכל קובץ יש גם גרסה מוגדלת `_x8.png`).

- פרחי סטטוס: `<local-extraction>/icq-artifacts/rendered/key_icons/status_online.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_offline.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_away.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_na.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_occupied.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_dnd.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_ffc.png`, `<local-extraction>/icq-artifacts/rendered/key_icons/status_invisible.png`
- פרח לבן (הבהוב/צילומי icq.com): `<local-extraction>/icq-artifacts/rendered/key_icons/flower_white_outline_blinkoff.png`
- אנימציית התחברות: `<local-extraction>/icq-artifacts/rendered/key_icons/connecting_anim_0.png` עד `connecting_anim_7.png` באותה תיקייה
- פתק הודעה: `<local-extraction>/icq-artifacts/rendered/key_icons/event_message.png` ומסגרת ההבהוב `<local-extraction>/icq-artifacts/rendered/key_icons/event_message_blinkoff.png`
- System Notice: אייקון האירוע הממתין (כמו למעלה) והפרח הלבן כשאין אירוע
- כפתור Main: `<local-extraction>/icq-artifacts/rendered/icq.exe/bitmap_2059.png` וגיליון הפריימים `<local-extraction>/icq-artifacts/rendered/sheet_icq_2059_main_anim.png`
- אייקון יישום ומגש: `<local-extraction>/icq-artifacts/rendered/icq.exe/icon_1001_32x32_8bpp_id4.png`, `<local-extraction>/icq-artifacts/rendered/icq.exe/icon_1083_16x16_8bpp_id7.png`, `<local-extraction>/icq-artifacts/rendered/icq.exe/icon_1084_16x16_8bpp_id9.png`
- פסי צד לתפריטים: `<local-extraction>/icq-artifacts/rendered/icq.exe/bitmap_2222.png` (Main), `bitmap_1503.png` (Services), `bitmap_1502.png` (My ICQ) באותה תיקייה
- רצועות מלאות: `<local-extraction>/icq-artifacts/rendered/sheet_icq_2047.png` ו-`<local-extraction>/icq-artifacts/rendered/sheet_icq_2150.png`

## 5. מגבלות

- קוד 2001b לא שוחזר (הזרם הדחוס של `.text`), לכן סדר תפריטים, טיימרים וברירות מחדל נלקחו מ-2000b או מצילומים וסומנו Inference.
- כל ממצאי REA הם על תמונות PE משוחזרות (כותרת + `.rsrc` מקוריים). ה-payload של כל משאב זהה למקור, ושאר המקטעים אפס.
- צילומי המסך מהרשת הם בעיקר תמונות שיווק של icq.com ל-2001b; חלקם (חלון "Send Offline Message", תפריט קליק ימני) מגרסה 2000, והם מסומנים כך.
- שיוך WAV לשמות לפי סדר המקור במכולה, מאומת חלקית מול 2000b.
