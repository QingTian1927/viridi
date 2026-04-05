# Viridi Production Runbook

## 1) Service Overview
- App: Viridi price monitor (gasoline and gold)
- Runtime: GitHub Actions scheduled workflows
- Storage: Upstash Redis
- Email: Resend
- Timezone: ICT (UTC+7)

## 2) Schedules (Production)
- Gasoline check: 08:00, 14:00, 20:00, 23:00 ICT
- Gold check: every 2 days at 09:00 ICT
- Daily summary: 23:30 ICT

## 3) Expected Behavior
- First run: initialize baseline only (no comparison alert)
- Major changes: send grouped instant alert per asset (1 gas email, 1 gold email)
- Minor changes: log to daily summary
- Summary: grouped by subtype; skip email when no logs

## 4) Quick Health Check (2 mins)
1. Open GitHub Actions and confirm latest 3 workflows are green.
2. Confirm at least one recent successful run per workflow.
3. Check Resend dashboard for recent sends/bounces.
4. Spot-check Upstash keys exist and are updating:
   - gas:last:ron95
   - gas:last:e5
   - gold:last:buy
   - gold:last:sell

## 5) Incident Triage

### A) Workflow failed
1. Open failed run logs.
2. Identify failing step: build, parse, redis, email.
3. Re-run workflow once.
4. If still failing, create hotfix branch and patch.

### B) Parser failure (layout changed)
1. Check logs for Missing prices or parse errors.
2. Compare live HTML with parser selectors.
3. Patch parser selector or column extraction.
4. Run local build and manual workflow run.
5. Merge hotfix.

### C) Wrong old values in alerts
1. Confirm baseline guard logs in run output.
2. Check Upstash baseline keys for unrealistic values.
3. If needed, clear only Viridi keys and rerun gas/gold once to re-baseline.

### D) No emails received
1. Check workflow success first.
2. Check Resend activity and suppression/bounce.
3. Verify secrets in GitHub:
   - RESEND_API_KEY
   - ALERT_FROM_EMAIL
   - ALERT_TO_EMAIL
4. Confirm thresholds were actually met.

## 6) Safe Redis Cleanup (Pre-GoLive / Recovery)
Delete only Viridi keys:
- gas:last:*
- gold:last:*
- gas:daily:YYYY-MM-DD
- gold:daily:YYYY-MM-DD
- lock:*
- health:success:*
- health:error:*

Then run gas and gold once to reinitialize baselines.

## 7) Release Checklist
1. npm run build passes.
2. Manual run order:
   - Check Gasoline Prices
   - Check Gold Prices
   - Daily Summary
3. Confirm no bogus alerts on baseline init.
4. Confirm grouped alert format and summary grouping.
5. Merge/push and monitor next scheduled cycle.

## 8) Emergency Contacts / Ownership
- Owner: QingTian1927
- Repo: QingTian1927/viridi
- On-call email: <fill_me>
- Last updated: 2026-04-06