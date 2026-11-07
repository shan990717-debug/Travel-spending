# TripSplit 旅行记账

和朋友一起旅行时用的记账 app：

- **每次旅行一个账本**：设定目标旅费，每记一笔自动扣，随时看到还剩多少钱
- **拍收据自动记账**：AI（Claude）读取金额、货币、日期、店名；也可以手动输入
- **任何货币**：自动抓当天汇率换算成记账货币（可手动修改）
- **记录谁付的钱**：可以平分，也可以按金额自定义分
- **自动分账**：算出每个人付了多少、应摊多少，以及用最少转账次数的「谁给谁多少钱」，还钱后点 ✓ 记录
- **分享账本**：发邀请链接 / 6 位邀请码 / WhatsApp 给朋友，朋友登录后可以一起记账，大家实时看到同一份账目
- 只有旅行成员看得到该旅行的账目和收据（数据库层面的权限控制）
- 中文 / English，手机上可以「添加到主屏幕」当 app 用

技术：React + Vite + Tailwind（前端，部署到 Vercel），Supabase（数据库、登录、照片存储、实时同步），Claude API（收据识别，跑在 Supabase Edge Function 里，API key 不会暴露给用户）。

---

## 一次性设置（约 15 分钟）

### 1. 建 Supabase 项目

1. 到 <https://supabase.com> 注册，**New project**（免费版就够用）。
2. 左边 **SQL Editor** → New query → 把 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 全部内容贴进去 → **Run**。
3. **Project Settings → API**，记下 `Project URL` 和 `anon public` key。

### 2. 登录设置

- **Authentication → URL Configuration**：
  - Site URL 填你部署后的网址（例如 `https://trip-split.vercel.app`）
  - Redirect URLs 加上 `https://trip-split.vercel.app/**` 和 `http://localhost:5173/**`
- 邮箱登录链接默认就能用（免费版每小时有寄信数量限制）。
- **Google 登录（建议开）**：Authentication → Providers → Google，按页面说明填 Google Cloud 的 OAuth Client ID / Secret。

### 3. 收据识别（Claude）

需要 [Anthropic API key](https://console.anthropic.com/)，以及 [Supabase CLI](https://supabase.com/docs/guides/cli)：

```bash
npx supabase login
npx supabase link --project-ref <你的 project ref>
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy scan-receipt
```

只有已登录、而且是该旅行成员的人能调用识别。

### 4. 部署前端到 Vercel

1. 到 <https://vercel.com> 用 GitHub 登录 → **Add New → Project** → 选这个 repo。
2. Environment Variables 加两个：
   - `VITE_SUPABASE_URL` = 第 1 步的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 第 1 步的 anon public key
3. **Deploy**。完成后把网址填回第 2 步的 Site URL / Redirect URLs。

---

## 本地开发

```bash
cp .env.example .env.local   # 填入 Supabase URL 和 anon key
npm install
npm run dev                  # http://localhost:5173
npm test                     # 分账算法单元测试
npm run lint
```

## 文件结构

```
supabase/migrations/0001_init.sql     数据表、权限（RLS）、加入旅行、收据存储、实时同步
supabase/functions/scan-receipt/      Claude 收据识别
src/lib/trips.js                      货币、汇率、分账 / 最少转账算法
src/lib/api.js                        所有 Supabase 读写
src/pages/                            Trips 列表 / 新建编辑旅行 / 旅行详情 / 记账 / 加入
```

## 说明

- 汇率来自免费的 [open.er-api.com](https://open.er-api.com)（不需要 key，每 6 小时更新缓存）。抓不到时可以手动输入。
- 每笔账会同时保存原币金额、当时用的汇率和换算后的金额，之后汇率变动不会改到旧账。
- 已有账目的成员不能被删除；已有账目后记账货币不能再改。
