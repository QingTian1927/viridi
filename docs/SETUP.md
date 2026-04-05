# Viridi Setup Guide

Complete step-by-step instructions to get Viridi running end-to-end.

## Phase 1: Service Setup (15 minutes)

### Step 1: Create Upstash Redis Account

1. Go to https://upstash.com/
2. Sign up with GitHub or email
3. Create a new database:
   - Click "Create Database"
   - Choose region closest to you (or default)
   - Copy the database name
4. Go to database details page
5. Under **REST API** section, copy:
   - **UPSTASH_REDIS_REST_URL** (looks like `https://...redis.upstash.io`)
   - **UPSTASH_REDIS_REST_TOKEN** (looks like `AXXvNXX...`)
6. Save these for later (Step 3)

### Step 2: Create Resend Email Account

1. Go to https://resend.com/
2. Sign up with GitHub or email
3. Verify your email address
4. Go to **Settings → API Keys**
5. Click "Create API Key"
6. Copy the key (looks like `re_...`)
7. If you want to use a custom domain:
   - Go to **Settings → Domains**
   - Add your domain (e.g., alerts@yourdomain.com)
   - Follow DNS verification steps
   - Otherwise, use Resend's default domain (resend.dev)
8. Save your API key for later (Step 3)

### Step 3: Add GitHub Secrets

1. Go to your GitHub repository: https://github.com/YOUR_USERNAME/viridi
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **New repository secret** and add these ones by one:

| Name | Value | Example |
|------|-------|---------|
| `UPSTASH_REDIS_REST_URL` | From Step 1 | `https://abc-123.redis.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | From Step 1 | `AXXvNXXXXXXX...` |
| `RESEND_API_KEY` | From Step 2 | `re_XXX...` |
| `ALERT_FROM_EMAIL` | Your sending address | `alerts@yourdomain.com` or `onboarding@resend.dev` |
| `ALERT_TO_EMAIL` | Your personal email | `yourname@gmail.com` |

5. Click "Add secret" for each one
6. Verify all 5 are listed on the Secrets page

**Done with Phase 1!**

---

## Phase 2: Local Testing (10 minutes)

### Step 4: Clone and Install

```bash
cd /path/to/viridi
npm install
```

### Step 5: Create .env File

Create a file called `.env` in the root directory:

```
UPSTASH_REDIS_REST_URL=<paste from Step 1>
UPSTASH_REDIS_REST_TOKEN=<paste from Step 1>
RESEND_API_KEY=<paste from Step 2>
ALERT_FROM_EMAIL=<from Step 3>
ALERT_TO_EMAIL=<from Step 3>
TZ=Asia/Ho_Chi_Minh
```

### Step 6: Build

```bash
npm run build
```

You should see no errors. If errors occur, check your .env file.

### Step 7: Test Gasoline Job

```bash
npm run check:gas
```

Expected output:
- JSON logs showing fetch, parse, classify steps
- Should print something like:
  ```json
  {"timestamp":"2026-04-06T...","job":"gas","action":"parse","status":"success","details":{"ron95":75000,"e5":73000}}
  ```

If this succeeds, your setup is working!

### Step 8: Test Gold Job

```bash
npm run check:gold
```

Same as above, but for gold prices.

### Step 9: Test Summary Job

```bash
npm run check:summary
```

This will likely show "no changes today" since there's no real data yet. That's fine!

**Done with Phase 2! Your local setup is working.**

---

## Phase 3: Deploy to GitHub (5 minutes)

### Step 10: Push Code to GitHub

```bash
cd /path/to/viridi
git add .
git commit -m "Initial Viridi setup"
git push origin main
```

### Step 11: Verify Workflows

1. Go to your GitHub repo
2. Click **Actions** (top menu)
3. You should see three workflows listed:
   - Check Gasoline Prices
   - Check Gold Prices
   - Daily Summary

If not visible, refresh the page.

### Step 12: Test Workflows Manually

1. Click on **Check Gasoline Prices** workflow
2. Click **Run workflow** → **Run workflow**
3. Wait 30-60 seconds, then refresh
4. You should see a green checkmark ✓

**Your GitHub Actions are working!**

---

## Phase 4: Enable Automatic Scheduling (2 minutes)

Workflows are now enabled and will automatically run on schedule:

**Gasoline checks**: 08:00, 14:00, 20:00, 23:00 ICT (daily)  
**Gold checks**: Mon/Wed/Fri at 09:00 ICT  
**Daily summary**: 23:30 ICT (daily)  

No further action needed. They'll run automatically.

---

## Phase 5: Monitor and Iterate (Ongoing)

### Dry Run (Optional but Recommended)

To test without sending real emails, modify temporarily:

1. Edit `src/services/emailService.ts`
2. In `sendMajorAlert()` and `sendDailySummary()`, comment out the `resend.emails.send()` call
3. Add a console.log instead
4. Rebuild and test

This lets you verify alerts are triggering without actual emails.

### Daily Checks

- Check GitHub **Actions** tab weekly for errors
- Check Upstash dashboard to see Redis keys being written
- After first real alerts, confirm they arrive in your inbox

### Adjust if Needed

- **Thresholds too sensitive?** Increase GAS_MAJOR_PCT or GOLD_MAJOR_PCT
- **Missing alerts?** Decrease thresholds
- **Schedule wrong?** Edit `.github/workflows/*.yml` cron expressions and push

---

## Emergency Troubleshooting

### Workflows not running?

1. Go to **Actions** tab
2. Click workflow name
3. Look for recent runs
4. If red ✗, click to see error logs

### Not receiving emails?

1. Check spam folder in email client
2. Verify Resend domain is configured correctly
3. Run `npm run check:gas` locally and check for errors

### Redis connection failure?

1. Verify Upstash URL and token in `.env`
2. Check Upstash dashboard - database still active?
3. Verify GitHub secrets match exactly (case-sensitive)

### Parser failing?

Websites change HTML layout sometimes. If parsing fails:

1. Check the live website manually (https://www.pvoil.com.vn, https://phuquygroup.vn/)
2. Update the CSS selectors in `src/parsers/*.ts`
3. Rebuild and redeploy

---

## Summary

✅ Phase 1: Services created  
✅ Phase 2: Local testing passed  
✅ Phase 3: Code deployed to GitHub  
✅ Phase 4: Workflows enabled  
✅ Phase 5: Monitoring active  

Viridi is now running and will alert you on major price changes!

---

## Next Steps

- **Monitor**: Check GitHub Actions for the first week
- **Adjust**: Fine-tune thresholds based on real alerts
- **Extend**: Add features from product spec as needed
