# Viridi - Vietnam Price Alert System

A backend-only system that monitors Vietnamese gasoline and gold prices with intelligent email alerts.

## Quick Start

### 1. Setup Accounts

#### Upstash Redis
1. Create account at https://upstash.com/
2. Create a new Redis database
3. Copy the **REST URL** and **REST Token** from the dashboard

#### Resend Email
1. Create account at https://resend.com/
2. Add and verify your sending domain (or use default API domain)
3. Generate an **API key** from the dashboard

#### GitHub Secrets
In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

```
UPSTASH_REDIS_REST_URL      → Your Upstash REST endpoint URL
UPSTASH_REDIS_REST_TOKEN    → Your Upstash auth token
RESEND_API_KEY              → Your Resend API key
ALERT_FROM_EMAIL            → Sender email (e.g., alerts@yourdomain.com)
ALERT_TO_EMAIL              → Your recipient email
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

### 4. Test Locally

Create a `.env` file in the root directory:

```
UPSTASH_REDIS_REST_URL=<your_value>
UPSTASH_REDIS_REST_TOKEN=<your_value>
RESEND_API_KEY=<your_value>
ALERT_FROM_EMAIL=test@example.com
ALERT_TO_EMAIL=your-email@gmail.com
TZ=Asia/Ho_Chi_Minh
```

Then run:

```bash
npm run check:gas      # Test gasoline check
npm run check:gold     # Test gold check
npm run check:summary  # Test summary (may not send if no changes)
```

### 5. Deploy to GitHub Actions

Push your code to GitHub. The workflows will automatically run on schedule:

**Gasoline Check**: 08:00, 14:00, 20:00, 23:00 ICT  
**Gold Check**: Monday, Wednesday, Friday at 09:00 ICT  
**Daily Summary**: 23:30 ICT  

You can also manually trigger jobs in the **Actions** tab of your GitHub repository.

---

## Project Structure

```
viridi/
├── .github/
│   └── workflows/
│       ├── check-gas.yml      # Gasoline price checks (4x daily)
│       ├── check-gold.yml     # Gold price checks (3x weekly)
│       └── daily-summary.yml  # Daily summary email
├── src/
│   ├── jobs/
│   │   ├── checkGas.ts        # Gasoline job entry point
│   │   ├── checkGold.ts       # Gold job entry point
│   │   └── dailySummary.ts    # Summary job entry point
│   ├── parsers/
│   │   ├── gasolineParser.ts  # PVOil HTML parser
│   │   └── goldParser.ts      # PhuQuy HTML parser
│   ├── core/
│   │   ├── classification.ts  # Price change classification
│   │   └── state.ts           # Redis state management
│   ├── services/
│   │   └── emailService.ts    # Email templates and sending
│   ├── utils/
│   │   ├── logger.ts          # Structured logging
│   │   ├── validators.ts      # Data validation
│   │   └── datetime.ts        # Timezone utilities
│   ├── redis.ts               # Redis client wrapper
│   ├── config.ts              # Configuration management
│   └── types.ts               # TypeScript type definitions
├── docs/
│   └── PRODUCT_SPEC.md        # Complete specification
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## How It Works

### Gasoline Check (4x daily)
1. Fetches current prices from PVOil Vietnam
2. Compares with last known prices
3. **If major change** (≥1% or ≥1,000 VND/L): sends instant email alert
4. **If minor change**: logs to daily summary
5. **If unchanged**: skips

### Gold Check (3x weekly)
1. Fetches SJC gold buy/sell prices from PhuQuy Group
2. Compares with last known prices
3. **If major change** (≥3% or ≥300,000 VND/chỉ): sends instant email alert
4. **If minor change**: logs to daily summary
5. **If unchanged**: skips

### Daily Summary (once daily at 23:30 ICT)
1. Reads all minor changes logged during the day
2. **If no changes**: sends no email
3. **If changes exist**: sends aggregated summary email with:
   - All changes with timestamps
   - Net daily movement (last price - first price)
   - High/low for the day
4. Clears logs after successful send

---

## Email Alerts

### Major Alert Email
- Subject: `Viridi Alert: Major [Asset] Price Change`
- Contains: old price → new price, absolute change, percentage change
- Formatted: stylish card layout with green branding

### Daily Summary Email
- Subject: `Viridi Daily Summary: Gasoline and Gold`
- Contains: grouped by asset, all changes with times, net movement, high/low
- Formatted: clean table layout with green theme

---

## Monitoring and Debugging

### GitHub Actions Logs
- View in **Actions** tab of your repository
- Each job logs structured JSON output
- Check for error messages and job status

### Redis State (via Upstash Console)
Access your Redis keys directly:
- `gas:last:ron95`, `gas:last:e5` → Last known gasoline prices
- `gold:last:buy`, `gold:last:sell` → Last known gold prices
- `gas:daily:YYYY-MM-DD`, `gold:daily:YYYY-MM-DD` → Daily logs
- `health:success:gas`, `health:success:gold`, `health:success:summary` → Last successful run timestamps

### Manual Testing
Trigger workflows manually in GitHub:
1. Go to **Actions** tab
2. Select a workflow
3. Click **Run workflow**

---

## Customization

### Adjust Thresholds
Edit environment variables when running jobs:

```bash
GAS_MAJOR_PCT=1         # Percentage threshold
GAS_MAJOR_VND=1000      # Absolute VND threshold
GOLD_MAJOR_PCT=3
GOLD_MAJOR_VND=300000
```

### Change Schedule
Edit `.github/workflows/*.yml` cron expressions:

Format: `minute hour day-of-month month day-of-week`

Examples:
- Every 30 minutes: `*/30 * * * *`
- At 9 AM daily: `0 9 * * *`
- At 6 PM every Monday: `0 18 * * 1`

Times in **UTC** - remember Vietnam is UTC+7.

---

## Cost

With default schedules, this should stay within free tiers:
- **GitHub Actions**: ~50 minutes/month (free tier: 2,000 min/month)
- **Upstash Redis**: ~200 commands/day (free tier: 10k commands/day)
- **Resend Email**: ~5-10 emails/day (free tier: 100 emails/day)

**Estimated monthly cost: $0**

---

## Troubleshooting

### "Missing required environment variables"
- Ensure all secrets are set in GitHub Settings → Secrets
- Check that variable names match exactly (case-sensitive)

### "Parse failed" in logs
- Websites may have changed their HTML layout
- Check the HTML manually at the source URL
- Adjust CSS selectors in `src/parsers/*.ts`

### No emails sending
- Verify Resend API key is correct
- Check sending domain is verified in Resend
- Ensure threshold conditions are met (major changes only for instant alerts)
- Check GitHub Actions logs for errors

### Redis connection errors
- Verify Upstash REST URL and token are correct
- Check Redis quota at Upstash dashboard
- Ensure firewall allows HTTPS requests to Upstash

---

## License

MIT

---

## Support

For issues or improvements, check the specification in `docs/PRODUCT_SPEC.md`.
