# תוכנית ארכיטקטורה: openICQ

Status: approved (Pairing, אושר להמשך מימוש ע"י Sahar: "אל תעצור בשלב התכנון")

## מטרה

שחזור נאמן של לקוח ICQ 2001b כאפליקציית ווב: לקוח React שמצייר שולחן עבודה בסגנון Windows 98/2000 עם חלונות ICQ, שרת Node שמחזיק משתמשים, רשימות קשר, הרשאות, הודעות ונוכחות, ושכבת נתונים SQLite. התקשורת בזמן אמת עוברת ב-WebSocket.

## הקשר

### מקורות
- דרישות: ההודעה של Sahar מ-4.11.2026 (שחזור מלא, לא mockup, בלי נתוני דמה).
- מחקר: `docs/research/icq-2001b-findings.md` ו-`docs/research/icq-ui-spec.json`, תוצר של סקיל REA (Reverse Engineer Anything) על קובץ ההתקנה המקורי.
- חוזה: `packages/protocol/src/*` (כבר ממומש ונבדק).

### אילוצים
- Node 26 מריץ TypeScript ישירות (type stripping). לכן בשרת רק תחביר שניתן למחיקה: בלי `enum`, בלי parameter properties, בלי namespaces. כל import יחסי עם סיומת `.ts`.
- כל קובץ מתחת ל-500 שורות. אין `console.log` בקוד, רק ה-logger של Fastify (pino).
- כל קריאת רשת עם timeout. אין catch ריק ואין fallback שמסתיר כשל.
- בלי emojis ובלי em dash בשום תוכן שמשתמש קורא.

### הנחות
- **ASM-001**: גרסת היעד היא ICQ 2001b. *למה*: זו הגרסה האחרונה בעיצוב הקלאסי לפני 2002a/2003a, והחלון המפוצל (היסטוריה למעלה, כתיבה למטה) שלה הוא מה שרוב האנשים זוכרים. ביטחון: MEDIUM.
- **ASM-002**: הממשק נשאר באנגלית, כמו המקור. ביטחון: HIGH.
- **ASM-003**: היסטוריית ההודעות נשמרת בשרת ולא מקומית כמו במקור. *למה*: דפדפן אינו מקום אמין לנתונים וכך ההיסטוריה עוקבת אחרי המשתמש. ביטחון: HIGH.
- **ASM-004**: "Save password" מתורגם ל-cookie עמיד ל-30 יום. הסיסמה עצמה לעולם לא נשמרת בדפדפן. ביטחון: HIGH.
- **ASM-005**: סיסמאות באורך 6 עד 64 (במקור הוגבלו ל-8 תווים). חריגה מכוונת לטובת אבטחה.
- **ASM-006**: אייקונים מצוירים מחדש כ-SVG פיקסלי, והצלילים מסונתזים ב-Web Audio. הנכסים המקוריים מוגנים בזכויות יוצרים ומשמשים רק כרפרנס מקומי. ביטחון: HIGH.
- **ASM-007**: הקצאת UIN רציפה, החל מ-`UIN_START` (ברירת מחדל 100000), כמו במקור. ביטחון: HIGH.

### שאלות פתוחות
- **OQ-001**: Visible List / Invisible List (פרטיות לפי איש קשר) לא נכנסים לגרסה הזו. Ignore List כן נכנס. *השפעה*: מצב Invisible מסתיר מכולם.

---

## רכיבים

### Protocol (`packages/protocol/`)
**אחריות:** אוצר המילים והחוזה היחיד בין לקוח לשרת: טיפוסים, סכמות zod, מגבלות אורך, מסגרות WebSocket ו-REST.
- חושף: `requestPayloadSchemas`, `requestResultSchemas`, `serverEventSchema`, `clientFrameSchema`, `serverFrameSchema`, סכמות REST, `LIMITS`.
- תלוי ב: zod בלבד.
- החלטה: מפה אחת של request type אל payload ו-result. *למה*: מוסיפים פעולה במקום אחד, והראוטר בשרת והלקוח הטיפוסי מקבלים אותה אוטומטית (DRY, Open/Closed).

### Server Domain (`apps/server/src/domain/`)
**אחריות:** ישויות, חוקי עסק טהורים (מי רואה את הסטטוס של מי), שגיאות דומיין וממשקי repository (ports).
- חושף: טיפוסים, `DomainError` עם קוד מתוך `ERROR_CODES`, ממשקי `UserRepository`, `SessionRepository`, `ContactRepository`, `MessageRepository`, `NoticeRepository`, `IgnoreRepository`, `PasswordHasher`, `Clock`, `Notifier`.
- תלוי ב: protocol (טיפוסים בלבד).
- החלטה: חוק הנראות כפונקציה טהורה `visibleStatus(viewer, target)`. *למה*: החוק החשוב ביותר במערכת נבדק בבידוד מלא.

### Server Application (`apps/server/src/application/`)
**אחריות:** use cases: הרשמה, התחברות, נוכחות, רשימת קשר והרשאות, הודעות והיסטוריה, חיפוש, פרטים, הגדרות.
- חושף: `AuthService`, `PresenceService`, `ContactService`, `MessagingService`, `DirectoryService` (חיפוש ופרטים), `SettingsService`.
- תלוי ב: ports מה-domain בלבד, לעולם לא ב-SQLite או ב-WebSocket.
- החלטה: השירותים מודיעים למשתמשים דרך port בשם `Notifier.notify(uin, ServerEvent)`. *למה*: היפוך תלות. שכבת האפליקציה לא יודעת מה זה socket, ובבדיקות מחליפים אותו ב-mock (London school).
- החלטה: מצב הנוכחות (מי מחובר ובאיזה סטטוס) נשמר בזיכרון ב-`PresenceRegistry` מאחורי ממשק. *למה*: נוכחות היא מצב חי ולא נתון עסקי. מעבר לכמה שרתים יחליף את המימוש ב-Redis בלי לגעת בשירותים.

### Server Infrastructure (`apps/server/src/infrastructure/`)
**אחריות:** מימושי ה-ports: SQLite דרך `node:sqlite`, migrations, hashing עם scrypt, שעון.
- החלטה: SQLite במצב WAL עם foreign keys, migrations ממוספרות שרצות בעלייה בתוך transaction. *למה*: מנוע אמיתי בלי תשתית חיצונית (KISS). ה-repositories מבודדים, כך שמעבר ל-Postgres נוגע רק בתיקייה הזו.
- החלטה: אין מחיקה קשה של נתונים עסקיים. הודעות לא נמחקות, notices נסגרות עם `resolved_at`, ואיש קשר שהוסר מקבל `removed_at`.

### Server Transport (`apps/server/src/transport/`)
**אחריות:** HTTP (Fastify), WebSocket gateway, אימות cookie, בדיקת Origin, rate limiting, הגשת ה-build של הלקוח וכותרות אבטחה.
- חושף: `buildApp(deps)` שמחזיר מופע Fastify (משמש את `main.ts` ואת בדיקות האינטגרציה).
- החלטה: ראוטר שמבוסס על מפת handlers לפי request type: parse של המסגרת, ולידציה מול `requestPayloadSchemas[type]`, קריאה ל-handler ומיפוי `DomainError` לתשובת `error`. *למה*: Command pattern פשוט. אין switch ענק וכל handler קטן.
- החלטה: `ConnectionRegistry` שומר חיבור אחד לכל UIN. התחברות חדשה סוגרת את הקודמת עם `session.kicked` וקוד 4002, כמו "used from another location" במקור.

### Server Composition (`apps/server/src/main.ts`, `config.ts`)
**אחריות:** קריאת env עם zod (נכשל בקול אם חסר משהו), חיווט כל התלויות, האזנה, וכיבוי מסודר.

### Client Net (`apps/client/src/net/`)
**אחריות:** `ApiClient` ל-REST (fetch עם timeout) ו-`IcqConnection` ל-WebSocket: request/response עם correlation id ו-timeout, ולידציה של כל מסגרת נכנסת, אירועים, וחיבור מחדש עם backoff.

### Client State (`apps/client/src/state/`)
**אחריות:** store אחד (zustand) עם slices: session, contacts, conversations, notices, windows, preferences.
- החלטה: אירועי שרת עוברים דרך reducer טהור `applyServerEvent(state, event)`. *למה*: מעבר מצב מפורש וקל לבדיקה (סגנון event sourcing בצד הלקוח), ואין מוטציות מפוזרות.

### Client UI Kit (`apps/client/src/ui/`)
**אחריות:** שולחן עבודה, מנהל חלונות (גרירה, פוקוס, z-order, מזעור), taskbar עם tray, רכיבי Win9x מעל 98.css, אייקוני סטטוס SVG, ומנגנון צלילים.

### Client Features (`apps/client/src/features/`)
**אחריות:** החלונות של ICQ: login, registration wizard, contact list, message dialog, add/find user, system notice ובקשת הרשאה, away message, user details, history, preferences/security.
- כל feature מדבר עם השרת רק דרך net ו-state, לעולם לא ישירות עם WebSocket.

---

## ממשקים

### Client ↔ Server (REST)
- `POST /api/auth/register` ← `registerBodySchema` → `201 {uin}`
- `POST /api/auth/login` ← `loginBodySchema` → `200 SessionInfo` + `Set-Cookie: icq_session` (HttpOnly, SameSite=Strict, Secure בייצור)
- `POST /api/auth/logout` → `204`, `GET /api/auth/session` → `200 SessionInfo | 401`
- שגיאות: `{ error: { code, message } }`.
- אינווריאנטים: כל בקשה שמשנה מצב בודקת Origin. ההודעה על כשל התחברות זהה לכל סיבה (בלי user enumeration).

### Client ↔ Server (WebSocket `/ws`)
- ה-upgrade מאומת לפי cookie ו-Origin. בלי session תקף החיבור נסגר עם 4001.
- הבקשה הראשונה היא `session.start {status}`, והתשובה היא `SessionSnapshot`. לפני כן כל בקשה אחרת נדחית.
- כל בקשה מקבלת בדיוק תשובה אחת: `result` או `error`, עם `replyTo`.
- אירועים נשלחים רק למי שמורשה לראות אותם, לפי חוק הנראות.

### Application → Transport (`Notifier`)
- `notify(uin, event)`: מסירה best-effort לחיבור החי של המשתמש. אם אין חיבור, לא קורה כלום, כי כל מה שחשוב נשמר ב-DB ומגיע ב-snapshot הבא.

### Application → Infrastructure (repositories)
- ממשקים סינכרוניים (`node:sqlite` סינכרוני). כל כתיבה מרובת צעדים עוברת דרך `transaction(fn)`.

---

## זרימות נתונים

```
Login:  LoginWindow → ApiClient POST /login → AuthService.login → SessionRepo → Set-Cookie
Connect: IcqConnection(ws) → Gateway(cookie→uin) → session.start → PresenceService.connect
         → snapshot ל-client, ו-presence לכל הצופים המורשים (Notifier)
Message: MessageDialog → conn.request('message.send') → MessagingService (ignore? → store)
         → Notifier.notify(to, message) אם מחובר, אחרת נשאר unread ויגיע ב-snapshot
         → result {message, autoResponse} לשולח (autoResponse כשהנמען Away/N/A/Occupied/DND)
Add contact: FindUser → contact.add → ContactService:
         authRequired ? notice auth_request לנמען : notice added_you לנמען + presence לבעלים
Auth respond: SystemNotice → auth.respond → grant ? contact.updated + notice auth_granted : notice auth_denied
Presence: status.set/disconnect → PresenceService → visibleStatus לכל צופה → presence events
```

### חוק הנראות (`visibleStatus(viewer, target)`)
מחזיר `offline` אם: היעד לא מחובר, או היעד ב-Invisible, או היעד חוסם את הצופה (ignore), או שהצופה עדיין מחכה להרשאה מהיעד. אחרת מחזיר את הסטטוס של היעד. הצופים של T הם הבעלים של רשומות contact פעילות שבהן `contact_uin = T`.

---

## נושאים רוחביים

| נושא | גישה |
|------|------|
| שגיאות | `DomainError(code, message)` בדומיין. הראוטר ממפה אותה לתשובת `error`. שגיאה לא צפויה נרשמת בלוג עם ה-stack ומוחזרת כ-`internal` בלי פרטים פנימיים. בלקוח כל כשל מוצג בחלון שגיאה בסגנון ICQ ולא נבלע. |
| אבטחה | scrypt עם salt, השוואה ב-`timingSafeEqual`. טוקן session אקראי של 32 בתים, וב-DB נשמר רק ה-SHA-256 שלו. cookie HttpOnly, SameSite=Strict. בדיקת Origin ב-REST וב-WS. rate limit ל-login ולהרשמה לפי IP, ולהודעות לפי חיבור ("sending messages too fast"). הגבלת גודל מסגרת. CSP וכותרות אבטחה. React מבצע escaping, אין `dangerouslySetInnerHTML`, וקישורים רק http/https. |
| תצפית | pino דרך Fastify. כל בקשת WS נרשמת ברמת debug עם type ומשך. שגיאות ברמת error. |
| קונפיגורציה | `apps/server/.env` (לא ב-git): `PORT`, `HOST`, `DATABASE_PATH`, `UIN_START`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`, `CLIENT_DIST_DIR`, `LOG_LEVEL`. הכל נבדק ב-zod בעלייה, וקובץ `.env.example` מתעד. |
| בדיקות | protocol: סכמות. שרת: unit לשירותים עם mocks ל-ports, ובדיקות אינטגרציה עם SQLite אמיתי ב-`:memory:` ולקוחות `ws` אמיתיים. לקוח: reducer ורכיבים מרכזיים (Testing Library). E2E: Playwright עם שני משתמשים בשני contexts. |

---

## פירוק לתחומים

### Scope 1: Protocol
**Done when:** כבר הושלם. `pnpm --filter @openicq/protocol test` ירוק ו-typecheck נקי.

### Scope 2: Server (domain, application, infrastructure, transport)
**Boundary:** כל `apps/server`. לא נוגע בלקוח.
**Done when:** בדיקות האינטגרציה מוכיחות מקצה לקצה עם שני לקוחות `ws` אמיתיים: הרשמה, התחברות, הוספה עם הרשאה ובלעדיה, presence, הודעה חיה, הודעה offline שמגיעה ב-snapshot, auto-response, היסטוריה עם paging, חיפוש, ignore, kick מ-location אחר, rate limit. `pnpm --filter @openicq/server test` ו-typecheck ירוקים.
**Depends on:** Scope 1.

### Scope 3: Client (net, state, ui, features)
**Boundary:** כל `apps/client`. מדבר עם השרת רק לפי הפרוטוקול.
**Done when:** כל החלונות שבמחקר עובדים מול שרת אמיתי, יש בדיקות reducer ורכיבים ירוקות, ו-typecheck ו-build נקיים.
**Depends on:** Scope 1. ממשק מול Scope 2 דרך הפרוטוקול בלבד.

### Scope 4: E2E ו-QA
**Done when:** Playwright מריץ שני משתמשים מול השרת והלקוח האמיתיים ועובר: הרשמה, הוספה עם הרשאה, צ'אט דו כיווני, סטטוס Away עם auto-response, והודעה offline.
**Depends on:** Scopes 2 ו-3.

### כיסוי דרישות

| דרישה | Scope |
|-------|-------|
| עיצוב נאמן, חלונות, אייקונים, אנימציות וצלילים | 3 (על בסיס המחקר) |
| רשימת קשר וסטטוסים | 2, 3 |
| חלונות צ'אט והיסטוריה | 2, 3 |
| משתמשים עם UIN ייחודי | 2 |
| הוספה, חיפוש, הודעות והתראות | 2, 3 |
| זמן אמת | 1, 2, 3 |
| אבטחה ובדיקות | 2, 3, 4 |
