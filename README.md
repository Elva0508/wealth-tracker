# Personal Wealth Tracker — V1a

個人資產負債與淨資產追蹤 PWA。V1a 包含：登入、資產與負債項目（手動金額）、多幣別與自動匯率、首頁平衡長條、每日快照、匯出 CSV／Excel、完整備份與還原。

規格文件：Personal Wealth Tracker — V1a 規格（Claude 文件）

## 專案結構

```
wealth-tracker/
├─ supabase/
│  ├─ functions/
│  │  ├─ _shared/core/        ← 共用計算模組（純 TypeScript、零相依）★ 審核從這裡開始
│  │  │  ├─ decimal.ts        定點小數，避免浮點誤差
│  │  │  ├─ fx.ts             匯率解析、挑選、狀態判斷
│  │  │  ├─ balance.ts        總額、分類小計、平衡長條比例
│  │  │  ├─ snapshot.ts       每日快照內容
│  │  │  ├─ validation.ts     表單檢查
│  │  │  ├─ export.ts         CSV 與 .xlsx 產生
│  │  │  ├─ backup.ts         備份檔格式與檢查
│  │  │  └─ __tests__/        Vitest 測試（50 個）
│  │  ├─ _shared/auth.ts      Edge Function 共用：辨識排程或使用者
│  │  ├─ fetch-fx/            更新匯率
│  │  └─ daily-snapshot/      每日快照
│  ├─ migrations/             資料表、RLS、資料庫函式
│  ├─ setup/schedule.sql      排程設定（部署後執行一次）
│  └─ tests/                  資料庫行為測試（SQL）
└─ web/                       React + TypeScript + Vite PWA
   └─ src/
      ├─ lib/api.ts           所有資料庫存取
      ├─ hooks/               登入狀態、共用資料
      ├─ components/          平衡長條、項目表單、導覽…
      └─ pages/               首頁、設定、登入…
```

前端用 `@core` 匯入共用模組；Edge Function 用相對路徑匯入同一份檔案。`_shared` 是 Supabase 官方建議放共用程式碼的位置，部署時會一起打包。

## 第一次設定

> **不能安裝 Supabase CLI？** 全部步驟都可以在 Supabase 後台網頁完成，請看下方「只用瀏覽器設定 Supabase」。

### 1. 建立 Supabase 專案

1. 到 [supabase.com](https://supabase.com) 建立專案（免費方案即可），區域建議選 Tokyo 或 Singapore。
2. 安裝 Supabase CLI，然後在專案根目錄：
   ```bash
   supabase login
   supabase init          # 會產生 supabase/config.toml，已有的檔案不會被覆蓋
   supabase link --project-ref <你的 project ref>
   supabase db push       # 套用 migrations/
   ```
   不想用 CLI 的話，也可以把 `supabase/migrations/20261019000000_v1a_init.sql` 整份貼到後台 SQL Editor 執行。

### 2. 設定登入

後台 → Authentication → URL Configuration：

- **Site URL**：Cloudflare Pages 的網址，例如 `https://wealth-tracker.pages.dev`
- **Redirect URLs**：加入 `https://wealth-tracker.pages.dev/**` 和 `http://localhost:5173/**`

Email 確認信與重設密碼信會導回這些網址。

### 3. 部署 Edge Functions

```bash
# 產生排程用的密鑰，記下來，第 4 步也要用
openssl rand -hex 32

supabase secrets set CRON_SECRET=<剛剛產生的密鑰>
supabase functions deploy fetch-fx --no-verify-jwt
supabase functions deploy daily-snapshot --no-verify-jwt
```

`--no-verify-jwt` 是因為排程呼叫時沒有登入 token；兩個函式都會自行檢查 `x-cron-secret` 或使用者 token，未通過一律回 401。

### 4. 設定排程

打開 `supabase/setup/schedule.sql`，把 `<PROJECT_URL>` 和 `<CRON_SECRET>` 換成你的值，貼到 SQL Editor 執行一次。會建立三個排程：

| 排程               | 台灣時間                     | 做什麼           |
| ------------------ | ---------------------------- | ---------------- |
| fx-business-hours  | 週一至週五 9:00–16:00 每小時 | 更新匯率         |
| fx-before-snapshot | 每天 05:50                   | 快照前更新匯率   |
| daily-snapshot     | 每天 06:00                   | 保存前一天的快照 |

設定完可以手動觸發一次確認：`select public.call_edge_function('fetch-fx');`，再到 `net._http_response` 看回應。

### 只用瀏覽器設定 Supabase（不安裝 CLI）

1. **建立資料表**：後台 → SQL Editor → New query，把 `supabase/migrations/20261019000000_v1a_init.sql` 整份貼上 → Run。
2. **設定登入網址**：同上方第 2 步。
3. **設定密鑰**：後台 → Edge Functions → Secrets，新增 `CRON_SECRET`，值是一串夠長的亂碼（至少 32 個英數字）。
4. **部署 Edge Functions**：後台 → Edge Functions → Deploy a new function → Via Editor：
   - 函式名稱 `fetch-fx`，把 `supabase/dashboard-deploy/fetch-fx.ts` 整份貼上取代預設內容 → Deploy
   - 函式名稱 `daily-snapshot`，貼上 `supabase/dashboard-deploy/daily-snapshot.ts` → Deploy
   - 部署後進入每個函式的設定，**關閉「Verify JWT」（Enforce JWT verification）**
5. **設定排程**：同上方第 4 步，在 SQL Editor 執行 `supabase/setup/schedule.sql`。

`dashboard-deploy/` 裡的檔案是把函式和共用計算模組打包成單一檔案的版本，內容與 `functions/` 相同。修改原始碼後需要重新產生（請 Claude 重新打包即可）。

### 5. 本機開發

```bash
cp web/.env.example web/.env.local   # 填入 Supabase URL 與 publishable/anon key
npm install
npm run dev                           # http://localhost:5173
```

### 6. 部署到 Cloudflare Pages

Cloudflare 後台 → Workers & Pages → 建立 → Pages → 連結 GitHub repo：

| 設定                   | 值                                                          |
| ---------------------- | ----------------------------------------------------------- |
| Framework preset       | None                                                        |
| Root directory         | （留空，用 repo 根目錄）                                    |
| Build command          | `npm run build`                                             |
| Build output directory | `web/dist`                                                  |
| 環境變數               | `VITE_SUPABASE_URL`、`VITE_SUPABASE_KEY`、`NODE_VERSION=22` |

`web/public/_redirects` 已設定好單頁應用的路由。

6-1. 把程式碼放上 GitHub（瀏覽器操作）
登入 github.com → 右上角「＋」→ New repository
名稱例如 wealth-tracker，選 Private，然後 Create repository
在新 repo 頁面點「uploading an existing file」
把 wealth-tracker 資料夾裡面的所有檔案拖進去。repo 第一層要直接看到 package.json、web/、supabase/，不要多包一層資料夾
按 Commit changes
6-2. 建立 Cloudflare Pages 專案
登入 dash.cloudflare.com（沒有帳號就免費註冊）
Workers & Pages → Create application → Pages → Connect to Git
授權 GitHub，選 wealth-tracker repo
Project name 填你想要的名稱，這個名稱就是網址
建置設定：
設定 值
Production branch main
Framework preset None
Build command npm run build
Build output directory web/dist
Root directory 留空
在 Environment variables 新增三個變數：
名稱 值
VITE_SUPABASE_URL Supabase → Project Settings → API → Project URL
VITE_SUPABASE_KEY 同一頁的 publishable key（或 anon key），不要用 secret key
NODE_VERSION 22
按 Save and Deploy，等 2 到 3 分鐘。完成後畫面會顯示網址，打開應該會看到登入頁
6-3. 回 Supabase 填網址

Authentication → URL Configuration：

Site URL：https://你的名稱.pages.dev
Redirect URLs：新增 https://你的名稱.pages.dev/\*\*

## 測試

```bash
npm test          # 共用計算模組的 50 個測試
npm run typecheck # 前端型別檢查
```

資料庫行為測試（RLS 隔離、修改紀錄、快照一天一筆、備份還原）可以在任何 PostgreSQL 15+ 上跑：

```bash
createdb wt_test
psql -d wt_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_supabase_stub.sql \
  -f supabase/migrations/20261019000000_v1a_init.sql \
  -f supabase/tests/v1a_behavior.sql
# 最後一行應顯示 ALL SQL TESTS PASSED
```

規格驗收案例與測試的對應：

| 規格案例                 | 測試位置                                                     |
| ------------------------ | ------------------------------------------------------------ |
| 1、2、3、5、6 總額與匯率 | `core/__tests__/balance.test.ts`                             |
| 4、5 匯率狀態            | `core/__tests__/fx.test.ts`                                  |
| 7、8 平衡長條            | `core/__tests__/balance.test.ts`                             |
| 9 隱藏金額               | 前端 `components/Amount.tsx`（需手動確認）                   |
| 10 快照一天一筆          | `supabase/tests/v1a_behavior.sql`                            |
| 11 快照不回頭改寫        | `core/__tests__/snapshot.test.ts`                            |
| 12 小數精度              | `core/__tests__/decimal.test.ts`                             |
| 13 資料隔離              | `supabase/tests/v1a_behavior.sql`                            |
| 14 匯出                  | `core/__tests__/export-backup.test.ts`                       |
| 15 備份還原              | `supabase/tests/v1a_behavior.sql`、`export-backup.test.ts`   |
| 16 負數拒絕              | `core/__tests__/validation.test.ts`、資料庫 check constraint |

## 設計決策備忘

- **金額精度**：資料庫用 `numeric`，讀取時一律 `::text` 轉字串，計算時轉成 `bigint` 定點小數（6 位）。不使用 JavaScript 浮點數做任何金額運算。
- **找不到匯率**：該項目不計入總額，首頁顯示警告；絕不當成 0。
- **匯率歷史**：同一天、同一來源重複抓取時更新同一列，每天保留一筆。
- **項目不刪除**：資料庫沒有開放 delete，只能封存；修改由 trigger 自動記錄到 `balance_item_changes`。
- **快照**：使用者只能讀取；寫入只能透過 `save_snapshot()`，且只有 service role 能呼叫。
- **還原**：在資料庫函式 `restore_backup()` 內以單一交易完成；前端呼叫前會先自動下載一份目前資料。匯率是共用資料，不還原。

## 上線前需要實際確認的事

- **臺灣銀行 CSV 格式**：解析器依標題列找出兩個「即期」欄位，認不出格式時會改用備援來源，不會存入錯誤數字。第一次部署後請到 `fx_rates` 確認 `source = 'bot'` 的資料與臺灣銀行網站一致。
- **Supabase 免費方案閒置暫停**：每日排程是否算作專案活動，上線後觀察。
