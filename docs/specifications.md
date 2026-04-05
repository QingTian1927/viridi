# 🌿 Viridi - Vietnam Price Alert System

## 🎯 Purpose

A backend-only system that monitors Vietnamese gasoline and gold prices and sends **intelligent email alerts** by filtering meaningful changes from noise.

Designed for **personal use first**, with potential to expand later.

---

## 🧩 Core Data Sources

### ⛽ Gasoline

* Source: [https://www.pvoil.com.vn/tin-gia-xang-dau](https://www.pvoil.com.vn/tin-gia-xang-dau)
* Target: **Xăng RON 95-III, Xăng E5 RON 92-II**
* Data format: HTML table (price + change + timestamp)

---

### 🪙 Gold

* Source: [https://phuquygroup.vn/](https://phuquygroup.vn/)
* Target: **SJC gold – buying & selling price (per chỉ)**
* Data format: HTML table (buy/sell prices)

---

## 🔄 System Behavior

### ⚖️ Two-Tier Alert System (Applied to BOTH assets)

All price changes are classified relative to the **last observed price**.

---

### 🚨 Major Changes

Trigger conditions:

#### ⛽ Gasoline

* Change ≥ **max(1%, 1000 VND per liter)**

#### 🪙 Gold

* Change ≥ **max(3%, 300,000 VND per chỉ)**

Action:

* Send **instant email alert**
* Do NOT include in daily summary

---

### 📊 Minor Changes

Trigger:

* Any change **below major threshold**

Action:

* Store in daily log
* No immediate alert

---

## 📬 Daily Summary (Gasoline + Gold)

* Runs once per day (evening)

### If minor changes exist:

Send one aggregated email including:

* List of changes (with timestamps)
* Net daily change = **last price − first price of the day**
* Optional: highest / lowest point of the day

### If no changes:

* Send nothing

---

## ⚙️ System Flow

### ⛽ Gasoline Cron Job (configurable frequency)

1. Fetch latest prices
2. If price == last stored price → **skip**
3. Else:

   * Calculate % change and absolute delta
   * If **major**:

     * Send instant alert
   * Else:

     * Append to daily log
4. Update stored price

---

### 🪙 Gold Cron Job (configurable frequency)

1. Fetch SJC buy & sell price
2. If price == last stored price → **skip**
3. Else:

   * Calculate % change and absolute delta
   * If **major**:

     * Send instant alert
   * Else:

     * Append to daily log
4. Update stored price

---

### 📊 Daily Summary Cron (once/day)

1. Retrieve daily logs (gasoline + gold)
2. If not empty:

   * Send summary email
3. Clear logs

---

## 🗄️ Data Storage (Minimal – Redis)

* `gas_last_price`
* `gold_last_price`
* `gas_daily_changes`
* `gold_daily_changes`

### Log Structure (for both gas & gold)

Each entry includes:

* `timestamp`
* `old_price`
* `new_price`
* `absolute_change` (VND)
* `percentage_change` (%)

---

## 📧 Email Strategy

### 🚨 Instant Alerts (Major Only)

Includes:

* Asset type (Gasoline / Gold)
* Old price → New price
* Absolute change (VND)
* Percentage change

---

### 📊 Daily Summary

Includes:

* Grouped by asset (Gasoline / Gold)
* List of minor changes with timestamps
* Net daily movement
* Optional: simple trend note (↑ / ↓)

---

## ⚠️ Reliability & Safeguards

* Validate parsed data before use
* Skip update if:

  * Price missing or abnormal
* Do not overwrite last known good value on failure
* Retry failed fetches
* Detect layout breaks (empty table, missing fields)
* Log parsing errors for debugging

---

## 🧠 Design Principles

* Prioritize **signal over noise**
* Avoid alert fatigue and unnecessary email cost
* Keep system **minimal and robust**
* Avoid assumptions about:

  * Price behavior
  * Update frequency
  * External control mechanisms
* Let **thresholds define significance**, not hardcoded logic

---

## 🏁 Summary

A cron-driven alert system that:

* Uses **reliable, scrape-friendly VN sources**
* Filters changes using **clear, well-calibrated thresholds**
* Sends:

  * Immediate alerts for **meaningful movements**
  * Clean daily summaries for **minor fluctuations**

Focused on being **practical, efficient, and noise-resistant**.
