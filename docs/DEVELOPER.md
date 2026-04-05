# Viridi Developer Reference

Quick reference for development, debugging, and maintenance.

## File Structure

```
src/
├── jobs/                   # Entry points triggered by GitHub Actions
│   ├── checkGas.ts        # Gasoline check: fetch → classify → alert/log
│   ├── checkGold.ts       # Gold check: fetch → classify → alert/log
│   └── dailySummary.ts    # Summary: aggregate logs → email or skip
│
├── parsers/               # HTML parsing and data extraction
│   ├── gasolineParser.ts  # PVOil.com.vn → prices
│   └── goldParser.ts      # PhuQuyGroup.vn → prices
│
├── core/                  # Business logic
│   ├── classification.ts  # Determine major vs minor changes
│   └── state.ts          # Redis operations (read/write)
│
├── services/              # External integrations
│   └── emailService.ts   # Resend API → emails
│
├── utils/                 # Utilities
│   ├── logger.ts         # JSON structured logs
│   ├── validators.ts     # Data path validation
│   └── datetime.ts       # Timezone handling (Asia/Ho_Chi_Minh)
│
├── redis.ts              # Upstash REST client wrapper
├── config.ts             # Env var loading
└── types.ts              # TypeScript definitions
```

## Data Flow

### Gasoline Job
```
PVOil.com → HTML
↓
Parse (cheerio)
↓
classifyGasChange(old, new)
↓
isMajor? → sendMajorAlert() : addDailyGasLog()
↓
setLastGasPrice()
↓
Redis ← stored
```

### Gold Job
```
PhuQuyGroup.vn → HTML
↓
Parse (cheerio)
↓
classifyGoldChange(old, new)
↓
isMajor? → sendMajorAlert() : addDailyGoldLog()
↓
setLastGoldPrice()
↓
Redis ← stored
```

### Daily Summary Job
```
Redis: gas:daily:YYYY-MM-DD
Redis: gold:daily:YYYY-MM-DD
↓
Empty? → Exit : Continue
↓
Compute: netChange, high, low
↓
buildSummary()
↓
sendDailySummary()
↓
Success? → clearDaily() : Retry next time
```

## Key Functions by Module

### classification.ts
- `classifyGasChange(old, new)` → ClassificationResult
  - Checks: change >= max(1%, 1000 VND/L)
- `classifyGoldChange(old, new)` → ClassificationResult
  - Checks: change >= max(3%, 300,000 VND/chỉ)
- `formatPriceChange(delta)` → "+1,200" or "-500"
- `formatPercentChange(delta)` → "+2.50%" or "-1.80%"

### state.ts (Redis)
```typescript
// Prices
getLastGasPrice() → {ron95, e5}
setLastGasPrice(ron95, e5)

// Daily logs
getDailyGasLog(date?) → DailyChangeLog[]
addDailyGasLog(change, date?)
clearDailyGasLog(date?)

// Locks (distributed)
acquireLock("gas"|"gold"|"summary") → boolean
releaseLock("gas"|"gold"|"summary")

// Health
recordHealthSuccess("gas"|"gold"|"summary")
recordHealthError("gas"|"gold"|"summary", error)
getHealthStatus("gas"|"gold"|"summary")
```

### emailService.ts
- `sendMajorAlert(alert)` → boolean
- `sendDailySummary(summary)` → boolean
- HTML templates generated in `generateMajorAlertHTML()`
- HTML templates generated in `generateSummaryHTML()`

### parsers
- `fetchGasolinePrices()` → ParseResult<GasPrice>
- `parseGasolineHTML(html)` → ParseResult<GasPrice>
- `parseGasolineRegex(html)` → ParseResult<GasPrice> (fallback)

- `fetchGoldPrices()` → ParseResult<GoldPrice>
- `parseGoldHTML(html)` → ParseResult<GoldPrice>
- `parseGoldRegex(html)` → ParseResult<GoldPrice> (fallback)

## Common Tasks

### Test a Parser Locally

```typescript
// src/test-parser.ts
import { fetchGasolinePrices } from "./parsers/gasolineParser.js";

const result = await fetchGasolinePrices();
console.log(result);
```

Then: `npm run build && node dist/test-parser.js`

### Add a New Threshold Override

1. Add env var to `src/config.ts`:
```typescript
GAS_SUPER_MAJOR_PCT: parseInt(process.env.GAS_SUPER_MAJOR_PCT ?? "2"),
```

2. Use in classification:
```typescript
if (absDelta_pct >= config.thresholds.gas.superMajorPct) {
  // Super major alert
}
```

3. Set in GitHub Actions or .env

### Change Email Template

Edit `src/services/emailService.ts`:
- `generateMajorAlertHTML()` for instant alerts
- `generateSummaryHTML()` for daily summary

Colors used:
- Green: `#10b981` (brand)
- Light green bg: `#dcfce7`
- Light amber bg: `#fef3c7`

### Debug Regex Parser

If HTML parser fails, the fallback regex parser attempts to extract prices using patterns.

Edit patterns in:
- `src/parsers/gasolineParser.ts` → `parseGasolineRegex()`
- `src/parsers/goldParser.ts` → `parseGoldRegex()`

Test with raw HTML from the source:
```typescript
const html = `<downloaded HTML>`;
const result = parseGasolineRegex(html);
console.log(result);
```

### Check Redis State Directly

Via Upstash console or command-line:

```
# Get last known gasoline price
GET gas:last:ron95

# Get today's gas changes
GET gas:daily:2026-04-06

# Get health status
GET health:success:gas
```

### Adjust Workflow Timing

Edit `.github/workflows/*.yml`:

```yaml
schedule:
  # Format: minute hour day-of-month month day-of-week
  - cron: '0 9 * * *'     # 09:00 UTC = 16:00 ICT
```

Use https://crontab.guru to test expressions.

## Error Messages

### "Lock already held"
- Job run overlapped (unlikely unless GitHub is slow)
- Safe to ignore; will retry next scheduled run

### "Missing prices: RON95=null"
- Website layout changed
- Update CSS selectors in `parseGasolineHTML()`
- Test with actual HTML from browser

### "Redis request failed"
- Upstash credentials wrong in .env or GitHub secrets
- Upstash service down
- Network error (GitHub Actions firewall?)

### "Resend error"
- API key invalid
- Sending domain not verified
- Rate limit exceeded (unlikely)

## Testing Checklist

Before production:
- [ ] Local `.env` file works
- [ ] `npm run check:gas` succeeds
- [ ] `npm run check:gold` succeeds
- [ ] `npm run check:summary` succeeds (logs "no changes" is OK)
- [ ] GitHub Actions workflows run manually (click "Run workflow")
- [ ] Test email sent successfully (manual trigger should send test alert)
- [ ] Redis keys visible in Upstash console after runs
- [ ] 48 hours of dry-run logs look good

## Performance Expectations

- **Gasoline job**: < 10 seconds
- **Gold job**: < 10 seconds
- **Summary job**: < 10 seconds
- **Parsing**: < 2 seconds per source
- **Redis ops**: < 1 second per call
- **Email send**: < 2 seconds

If jobs take > 30 seconds, check logs for timeouts.

## Monitoring Commands

Run locally to check state:

```bash
# Build and run gas check
npm run build && npm run check:gas

# View live workflow log
gh run list --repo YOUR_USERNAME/viridi
gh run view <RUN_ID>

# View raw Redis data
# (Use Upstash console at https://console.upstash.com)
```

## Future Enhancements

Ideas for v1.1+:
1. **Web dashboard**: Show historical prices and alerts
2. **Mobile notifications**: SMS alerts in addition to email
3. **Multiple users**: Per-user thresholds and email addresses
4. **Trend analysis**: Price prediction based on history
5. **Webhook integration**: IFTTT, Slack, Discord
6. **Database**: Store price history (SQLite or PostgreSQL)
7. **Alerts history**: View past alerts in web UI

## Support Resources

- **Upstash docs**: https://upstash.com/docs
- **Resend docs**: https://resend.com/docs
- **GitHub Actions cron**: https://crontab.guru
- **Cheerio API**: https://cheerio.js.org/
- **Fetch API**: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API

---

**Last updated**: April 6, 2026  
**Viridi Version**: 1.0.0
