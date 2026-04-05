# Viridi - Final Locked Product Specification

**Date**: April 6, 2026  
**Status**: Final Implementation-Ready  
**Language**: English

---

## 1. Executive Summary

Viridi is a personal-use cron-driven price monitoring system for Vietnamese gasoline (RON95, E5) and gold (SJC) with intelligent two-tier alerting:
- **Major changes**: instant email notification
- **Minor changes**: aggregated in daily summary email
- **No changes**: no email

**Design Principle**: Signal over noise. Alert only on meaningful price movements.

---

## 2. Core Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js + TypeScript | Fast dev, strong typing, excellent HTTP/scraping ecosystem |
| HTTP Client | Native Fetch API | Built-in, no dependency |
| HTML Parsing | Cheerio | Lightweight, jQuery-like API, scraper-friendly |
| State Store | Upstash Redis | Managed, fast, minimal ops, free tier sufficient |
| Email Service | Resend | Developer-friendly, transactional focus, domain auth built-in |
| Scheduler | GitHub Actions cron | Free, reliable, no always-on server needed |
| Hosting | None (edge scheduling) | GitHub Actions provides compute, state lives in Upstash |
| Deployment | GitHub repository | Push code, Actions run on schedule |

---

## 3. Schedule (Finalized)

All times shown in both **ICT (Asia/Ho_Chi_Minh, UTC+7)** and **UTC** for GitHub Actions cron:

### A) Gasoline Price Check
- **08:00 ICT** → 01:00 UTC
- **14:00 ICT** → 07:00 UTC
- **20:00 ICT** → 13:00 UTC
- **23:00 ICT** → 16:00 UTC

Total: **4 checks per day**.

### B) Gold Price Check
- **Every 2 days at 09:00 ICT** → 02:00 UTC

Select one start date and run every 48 hours. Example: Monday and Wednesday and Friday at 09:00 ICT.

### C) Daily Summary
- **23:30 ICT** → 16:30 UTC

Runs once per day. Computes day boundary in **Asia/Ho_Chi_Minh timezone**.

---

## 4. Data Model (Redis - Upstash)

### Last Known Good Values
```
gas:last:ron95        → { price: NUMBER, timestamp: ISO8601 }
gas:last:e5           → { price: NUMBER, timestamp: ISO8601 }
gold:last:buy         → { price: NUMBER, timestamp: ISO8601 }
gold:last:sell        → { price: NUMBER, timestamp: ISO8601 }
```

### Daily Minor Change Logs
```
gas:daily:YYYY-MM-DD    → [ { ts, old, new, delta_vnd, delta_pct }, ... ]
gold:daily:YYYY-MM-DD   → [ { ts, old, new, delta_vnd, delta_pct }, ... ]
```

Format: JSON array, stored as Redis string. Each entry includes:
- `ts`: ISO8601 timestamp
- `old`: previous price
- `new`: current price
- `delta_vnd`: absolute change in VND
- `delta_pct`: percentage change

### Safety and Operations
```
lock:gas          → expires 5 mins (prevent overlap)
lock:gold         → expires 5 mins
lock:summary      → expires 5 mins

health:success:gas          → ISO8601 timestamp of last successful run
health:success:gold         → ISO8601 timestamp of last successful run
health:success:summary      → ISO8601 timestamp of last successful run

parser:error:gas            → { error, timestamp } (optional, for debugging)
parser:error:gold           → { error, timestamp }
```

---

## 5. Classification Rules (Unchanged from Spec)

### Gasoline
- **Major**: Δ ≥ max(1%, 1000 VND/L)
- **Minor**: Δ < max(1%, 1000 VND/L)

### Gold
- **Major**: Δ ≥ max(3%, 300,000 VND/chỉ)
- **Minor**: Δ < max(3%, 300,000 VND/chỉ)

Applied to both up and down movements.

---

## 6. Job Logic (Three Independent Jobs)

### Job A: Gasoline Price Check
**Trigger**: 08:00, 14:00, 20:00, 23:00 ICT  
**Input**: None  
**Output**: Email (if major) or log entry (if minor) or nothing (if unchanged)

**Steps**:
1. Acquire lock `lock:gas` with 5-min expiry. If exists, exit gracefully.
2. Fetch gasoline page from pvoil.com.vn.
3. Parse RON95-III and E5 RON92-II prices.
4. Validate: not empty, numeric, in sane range (10k–100k VND/L).
5. Load previous values from Redis.
6. For each fuel type (RON95, E5):
   - If price == previous, skip.
   - Compute delta_vnd and delta_pct.
   - Classify as major or minor.
   - If major:
     - Send instant alert email.
     - Do NOT append to daily log.
   - If minor:
     - Append { ts, old, new, delta_vnd, delta_pct } to gas:daily:YYYY-MM-DD.
   - Update gas:last:ron95 or gas:last:e5.
7. Update health:success:gas timestamp.
8. Release lock `lock:gas`.

**Error Handling**:
- If fetch fails: log error, do not update state, exit.
- If parse fails: log error with HTML snippet, do not update state, exit.
- If validation fails: log and discard, do not update state.

---

### Job B: Gold Price Check
**Trigger**: Every 2 days at 09:00 ICT  
**Input**: None  
**Output**: Email (if major) or log entry (if minor) or nothing (if unchanged)

**Steps**:
1. Acquire lock `lock:gold` with 5-min expiry. If exists, exit gracefully.
2. Fetch gold page from phuquygroup.vn.
3. Parse SJC buy and sell prices.
4. Validate: not empty, numeric, in sane range (400k–900k VND/chỉ).
5. Load previous values from Redis.
6. For each price (buy, sell):
   - If price == previous, skip.
   - Compute delta_vnd and delta_pct.
   - Classify as major or minor.
   - If major:
     - Send instant alert email.
   - If minor:
     - Append to gold:daily:YYYY-MM-DD.
   - Update gold:last:buy or gold:last:sell.
7. Update health:success:gold timestamp.
8. Release lock `lock:gold`.

**Error Handling**:
- Same as gasoline job.

---

### Job C: Daily Summary
**Trigger**: 23:30 ICT (16:30 UTC)  
**Input**: None  
**Output**: Email (if any minor changes exist) or nothing

**Steps**:
1. Acquire lock `lock:summary` with 5-min expiry. If exists, exit gracefully.
2. Determine current date in Asia/Ho_Chi_Minh timezone.
3. Load gas:daily:YYYY-MM-DD and gold:daily:YYYY-MM-DD.
4. If both are empty:
   - Release lock.
   - Exit without email.
5. If not empty:
   - Build summary email with both assets (or single asset if one is empty).
   - For each asset:
     - List all minor change entries with timestamps.
     - Compute net daily movement = last price − first price of day.
     - Compute high/low of the day.
   - Send summary email.
6. Upon successful send:
   - Clear gas:daily:YYYY-MM-DD and gold:daily:YYYY-MM-DD.
7. Update health:success:summary timestamp.
8. Release lock `lock:summary`.

**Error Handling**:
- On email send failure: do NOT clear daily logs. Exit and retry on next run.
- On fetch failure: log error, do not clear logs, exit.

---

## 7. Email System (Two Template Types)

### A) Instant Major Alert Email (Gasoline or Gold)

**Subject**:
```
Viridi Alert: Major [Asset Type] Price Change
```

**Design Spec**:
- Brand header: Viridi logo/name in green
- Alert badge: "MAJOR CHANGE"
- Primary metric card:
  - Asset name and type (e.g., "Gasoline - RON 95")
  - Old price → New price (clear visual arrow)
  - Absolute change: +1,200 VND/L or −500 VND/chỉ
  - Percentage change: +2.5% or −1.8%
- Timestamp row: "Updated at [HH:MM:SS] on [YYYY-MM-DD] (Vietnam Time)"
- Rule explanation: "Change exceeds threshold: max(X%, Y VND/unit)"
- Footer: "Sent by Viridi Price Monitor"
- Colors:
  - Green accent for brand
  - Up movement: green arrow + background tint
  - Down movement: amber/red arrow + background tint

**Mobile Optimized**: Max width 600px, single column, readable on phone.

**Plain Text Fallback**: Simple key=value format for email clients that don't render HTML.

---

### B) Daily Summary Email (Gasoline + Gold)

**Subject**:
```
Viridi Daily Summary: Gasoline and Gold
```

**Design Spec**:
- Brand header: Viridi name and date
- Introduction line: "Here's your price movement summary for [YYYY-MM-DD] (Vietnam Time)"
- Section 1: Gasoline Summary
  - Subheader: "⛽ Gasoline"
  - If no changes:
    - Card: "No price changes today"
  - If changes exist:
    - Summary metric: "Net change: +1,500 VND/L (1.8%)" or "No net change"
    - High/Low note: "High: 85,000 | Low: 83,500"
    - Compact table of minor changes (timestamp | old | new | delta | %)
- Section 2: Gold Summary
  - Subheader: "🪙 Gold"
  - Same layout as gasoline
- Footer: "Times shown in ICT (UTC+7) | Sent by Viridi Price Monitor"

**Colors**:
- Asset headers in Viridi green
- Up movement rows: light green background
- Down movement rows: light amber background
- Neutral text for "no change" state

**Mobile Optimized**: Responsive table on desktop, stacked layout on mobile.

---

## 8. Configuration and Secrets

### GitHub Secrets (Required)
Store in GitHub repository settings under Secrets:

```
UPSTASH_REDIS_REST_URL      (Your Upstash REST endpoint URL)
UPSTASH_REDIS_REST_TOKEN    (Your Upstash auth token)
RESEND_API_KEY              (Your Resend API key)
ALERT_FROM_EMAIL            (Sending address, e.g., alerts@yourdomain.com)
ALERT_TO_EMAIL              (Your recipient address, e.g., you@gmail.com)
```

### Environment Variables (Set in Workflows or .env)
```
TZ=Asia/Ho_Chi_Minh         (For correct date/time boundaries)
NODE_ENV=production         (For cleaner logs)
```

### Optional Threshold Overrides
If you want to customize thresholds later, add:
```
GAS_MAJOR_PCT=1             (percentage)
GAS_MAJOR_VND=1000          (VND per liter)
GOLD_MAJOR_PCT=3
GOLD_MAJOR_VND=300000
```

### Local Development (.env)
Create `.env` in project root (Git-ignored):
```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RESEND_API_KEY=...
ALERT_FROM_EMAIL=test@example.com
ALERT_TO_EMAIL=yourtest@example.com
TZ=Asia/Ho_Chi_Minh
```

---

## 9. Reliability and Safety Rules

1. **Idempotency**: Re-running the same job at the same time should not produce duplicate emails or state corruption.
   - Solution: Distributed lock per job.

2. **State Integrity**: Never overwrite last known good value on parse failure.
   - Solution: Validate before write. On failure, exit and keep previous state.

3. **Anomaly Guard** (optional, can add later):
   - If price jump is > 10% from previous, log and flag for manual review.
   - Do not update until next run confirms again or manual override.

4. **Retry Strategy**:
   - Max 2 retries for transient network failures.
   - 1-second backoff between retries.
   - Fail-open: if all retries fail, log and exit without changing state.

5. **Daily Summary Idempotency**:
   - Only clear logs after successful email send.
   - If send fails, next run will retry with same data.

6. **Lock Expiry**: All locks expire after 5 minutes to prevent deadlock if runner crashes.

---

## 10. Logging and Observability

### Structured Logs
Every job writes JSON logs with fields:
```json
{
  "timestamp": "ISO8601",
  "job": "gas|gold|summary",
  "action": "fetch|parse|classify|email|error",
  "status": "success|partial|fail",
  "details": { "price": 85000, "delta_pct": 2.5, ... },
  "error": null or error message
}
```

### Visibility Points
1. View GitHub Actions log in repo > Actions tab.
2. See email records in Resend dashboard.
3. Check Redis state manually via Upstash console for debugging.

### Health Checks (Manual, future)
- Monitor `health:success:gas` and `health:success:gold` timestamps.
- Alert if any exceed 24 hours without success.

---

## 11. Implementation Rollout Plan

### Phase 1: Setup (Day 1)
- [ ] Create GitHub repository.
- [ ] Create Upstash Redis instance.
- [ ] Create Resend account and verify sending domain.
- [ ] Add GitHub secrets.

### Phase 2: Core Code (Days 2–3)
- [ ] Implement gas parser and classification.
- [ ] Implement gold parser and classification.
- [ ] Implement Redis state management.
- [ ] Implement email formatting and Resend integration.

### Phase 3: Job Implementations (Days 4–5)
- [ ] Implement gasoline job script.
- [ ] Implement gold job script.
- [ ] Implement summary job script.
- [ ] Add locks, retries, and error handling.

### Phase 4: GitHub Actions Workflows (Day 6)
- [ ] Create gas workflow (.github/workflows/check-gas.yml).
- [ ] Create gold workflow (.github/workflows/check-gold.yml).
- [ ] Create summary workflow (.github/workflows/daily-summary.yml).
- [ ] Add manual run triggers for testing.

### Phase 5: Testing and Validation (Days 7–8)
- [ ] Test parsers against live pages.
- [ ] Test classification logic with edge cases.
- [ ] Send test alerts and summary emails.
- [ ] Run dry mode (log decisions, no real emails) for 2 days.

### Phase 6: Production Launch (Day 9)
- [ ] Switch from test inbox to main inbox.
- [ ] Monitor actions tab for first week.
- [ ] Adjust thresholds if needed.

---

## 12. Cost Estimate (Free Tier)

| Service | Free Tier | Your Usage | Cost |
|---------|-----------|-----------|------|
| GitHub Actions | 2,000 min/month | ~45 min/month | $0 |
| Upstash Redis | 10k commands/day | ~200/day | $0 |
| Resend | 100 emails/day | ~5–10/day | $0 |
| **Total** | – | – | **$0** |

Assumptions:
- No major outages causing repeated retries.
- Thresholds keep email volume to 5–10 per day.
- No manual testing in production.

---

## 13. Success Criteria

### Launch Ready When:
- [ ] Parsers extract correct prices from both sources.
- [ ] Classification correctly identifies major vs minor.
- [ ] Email templates render cleanly in Gmail, Outlook, mobile.
- [ ] Dry run produces no duplicate emails over 48 hours.
- [ ] All three jobs complete successfully at least once each.
- [ ] GitHub Actions logs are clear and useful.

### Production Success:
- [ ] Receive expected major alerts (≥1 per week based on volatility).
- [ ] Receive daily summary only on days with changes.
- [ ] No missing days or duplicate email records.
- [ ] All jobs complete within 1 minute.

---

## 14. Future Extensions (Out of Scope for v1)

1. Web dashboard showing price history and alerts.
2. Configurable alert thresholds via UI.
3. Multiple user support with per-user preferences.
4. SMS alerts in addition to email.
5. Price change predictions or trend analysis.

---

## 15. Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions                           │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐         │
│  │ Gas 08:00  │  │ Gold 09:00 │  │ Summary 23:30│         │
│  │ Gas 14:00  │  │ (2-day)    │  │ (daily)      │         │
│  │ Gas 20:00  │  └────────────┘  └──────────────┘         │
│  │ Gas 23:00  │                                             │
│  └────────────┘                                             │
└─────────────────────────────────────────────────────────────┘
           │                  │                      │
           ▼                  ▼                      ▼
    ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
    │ PVOil.com.vn│  │PhuQuyGroup.vn│  │ (Read + Notify) │
    └──────────────┘  └──────────────┘  └─────────────────┘
           │                  │                      
           └──────────────────┼──────────────────────┘
                              ▼
                    ┌──────────────────────┐
                    │  Upstash Redis       │
                    │ (State + Daily Logs) │
                    └──────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │   Resend Email API   │
                    │ (Send Alerts + Daily)│
                    └──────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │  Your Inbox (Gmail)  │
                    └──────────────────────┘
```

---

## 16. Locked Definitions

### Viridi Brand
- **Name**: Viridi (Latin for "green", reflecting nature and growth)
- **Color**: Soft green (#10b981 or similar)
- **Tagline**: "Vietnam Price Monitor" (implicit in email context)

### Time Boundaries
- All times in **Asia/Ho_Chi_Minh (UTC+7)** for user-facing display.
- All cron schedules in **UTC** for GitHub Actions.
- Daily summary computes day boundary in **Asia/Ho_Chi_Minh**.

### Data Sources (Fixed)
- **Gasoline**: https://www.pvoil.com.vn/tin-gia-xang-dau
- **Gold**: https://phuquygroup.vn/

### Alert Recipients
- Sender domain: verified with Resend
- Recipient: single email (configurable)

---

**Document Version**: 1.0  
**Last Updated**: April 6, 2026  
**Status**: LOCKED FOR IMPLEMENTATION
