/**
 * Email service using Resend
 * Sends grouped major alerts and daily summary emails
 */

import { Resend } from "resend";
import { config } from "../config.js";
import {
  AlertEmailData,
  GroupedAlertEmailData,
  SummaryEmailData,
  SubtypeSummary,
} from "../types.js";
import { formatDateTimeInVietnam, formatTimeInVietnam } from "../utils/datetime.js";
import { formatPriceChange, formatPercentChange } from "../core/classification.js";

const resend = new Resend(config.resend.apiKey);

/**
 * Backward-compatible wrapper for single-item major alerts.
 */
export async function sendMajorAlert(alert: AlertEmailData): Promise<boolean> {
  return sendMajorGroupedAlert({
    assetType: alert.assetType,
    timestamp: alert.timestamp,
    changes: [
      {
        subtype: alert.assetSubtype || "Unknown",
        oldPrice: alert.oldPrice,
        newPrice: alert.newPrice,
        delta_vnd: alert.delta_vnd,
        delta_pct: alert.delta_pct,
      },
    ],
  });
}

/**
 * Send grouped major price alert email.
 */
export async function sendMajorGroupedAlert(alert: GroupedAlertEmailData): Promise<boolean> {
  try {
    const assetLabel = alert.assetType === "gasoline" ? "Gasoline" : "Gold";
    const subject = `Viridi Alert: Major ${assetLabel} Price Change`;

    const htmlContent = generateMajorAlertHTML(alert, assetLabel);

    const result = await resend.emails.send({
      from: config.email.fromAddress,
      to: config.email.toAddress,
      subject,
      html: htmlContent,
      text: generateMajorAlertText(alert, assetLabel),
    });

    return !result.error;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to send major grouped alert email:", message);
    return false;
  }
}

/**
 * Send daily summary email.
 */
export async function sendDailySummary(summary: SummaryEmailData): Promise<boolean> {
  try {
    const subject = "Viridi Daily Summary: Gasoline and Gold";

    const htmlContent = generateSummaryHTML(summary);

    const result = await resend.emails.send({
      from: config.email.fromAddress,
      to: config.email.toAddress,
      subject,
      html: htmlContent,
      text: generateSummaryText(summary),
    });

    return !result.error;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to send summary email:", message);
    return false;
  }
}

function generateMajorAlertHTML(alert: GroupedAlertEmailData, assetLabel: string): string {
  const anyUp = alert.changes.some((change) => change.delta_vnd > 0);
  const anyDown = alert.changes.some((change) => change.delta_vnd < 0);
  const directionLabel = anyUp && anyDown ? "MIXED" : anyUp ? "UP" : anyDown ? "DOWN" : "UNCHANGED";
  const timeFormatted = formatDateTimeInVietnam(alert.timestamp);

  const rows = alert.changes
    .map((change) => {
      const color = change.delta_vnd > 0 ? "#15803d" : change.delta_vnd < 0 ? "#a16207" : "#6b7280";
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px; font-weight: 600;">${change.subtype}</td>
          <td style="padding: 10px; text-align: right;">${change.oldPrice.toLocaleString()}</td>
          <td style="padding: 10px; text-align: right;">${change.newPrice.toLocaleString()}</td>
          <td style="padding: 10px; text-align: right; color: ${color};">${formatPriceChange(change.delta_vnd)}</td>
          <td style="padding: 10px; text-align: right; color: ${color};">${formatPercentChange(change.delta_pct)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; }
        .content { background: white; padding: 24px; }
        .tag { display: inline-block; background: #fef3c7; color: #a16207; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .meta { margin: 12px 0 16px 0; color: #6b7280; font-size: 13px; }
        .table-wrap { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f3f4f6; text-align: left; padding: 10px; }
        .footer { text-align: center; padding: 20px; background: #f3f4f6; color: #666; font-size: 12px; border-radius: 0 0 12px 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Viridi Alert</h1>
          <p>Major ${assetLabel} price movement detected</p>
        </div>

        <div class="content">
          <div class="tag">MAJOR CHANGE (${directionLabel})</div>
          <div class="meta">Updated at: <strong>${timeFormatted}</strong> (ICT)</div>

          <p style="margin: 0 0 12px 0; color: #4b5563;">
            This email includes all tracked ${assetLabel.toLowerCase()} values in one grouped alert.
          </p>

          <div class="table-wrap">
            <table>
              <tr>
                <th>Type</th>
                <th style="text-align: right;">Old</th>
                <th style="text-align: right;">New</th>
                <th style="text-align: right;">Delta (VND)</th>
                <th style="text-align: right;">Delta (%)</th>
              </tr>
              ${rows}
            </table>
          </div>
        </div>

        <div class="footer">
          <p>Sent by <strong>Viridi</strong> Price Monitor</p>
          <p style="margin: 8px 0 0 0; color: #999;">Vietnam Gasoline and Gold Price Alert System</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateMajorAlertText(alert: GroupedAlertEmailData, assetLabel: string): string {
  let text = `Viridi Price Alert\n\n`;
  text += `Asset Group: ${assetLabel}\n`;
  text += `Time: ${formatDateTimeInVietnam(alert.timestamp)} (Vietnam Time)\n\n`;
  text += `Values:\n`;

  for (const change of alert.changes) {
    text += `- ${change.subtype}: ${change.oldPrice} -> ${change.newPrice} (${formatPriceChange(change.delta_vnd)}, ${formatPercentChange(change.delta_pct)})\n`;
  }

  text += `\nSent by Viridi Price Monitor`;
  return text;
}

function renderSummaryGroupHTML(group: SubtypeSummary): string {
  const netIsUp = group.netChange >= 0;
  const netColor = netIsUp ? "#15803d" : "#a16207";

  return `
    <div style="margin: 18px 0; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #111827;">${group.subtype}</h3>
      <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Net Daily Movement:</div>
      <div style="font-size: 18px; font-weight: 700; color: ${netColor}; margin-bottom: 6px;">
        ${formatPriceChange(group.netChange)} (${formatPercentChange(group.netChangePct)})
      </div>
      ${group.high !== undefined && group.low !== undefined ? `<div style="font-size: 12px; color: #999; margin-bottom: 12px;">High: ${group.high.toLocaleString()} | Low: ${group.low.toLocaleString()}</div>` : ""}
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="background: #f3f4f6;">
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb;">Time</th>
          <th style="text-align: right; padding: 8px; border-bottom: 1px solid #e5e7eb;">Old</th>
          <th style="text-align: right; padding: 8px; border-bottom: 1px solid #e5e7eb;">New</th>
          <th style="text-align: right; padding: 8px; border-bottom: 1px solid #e5e7eb;">Change</th>
        </tr>
        ${group.changes
          .map(
            (change) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px;">${formatTimeInVietnam(change.ts)}</td>
            <td style="text-align: right; padding: 8px;">${change.old.toLocaleString()}</td>
            <td style="text-align: right; padding: 8px;">${change.new.toLocaleString()}</td>
            <td style="text-align: right; padding: 8px; color: ${change.delta_vnd >= 0 ? "#15803d" : "#a16207"};">${formatPriceChange(change.delta_vnd)}</td>
          </tr>
        `
          )
          .join("")}
      </table>
    </div>
  `;
}

function renderSummaryAssetHTML(title: string, groups: SubtypeSummary[]): string {
  if (groups.length === 0) {
    return "";
  }

  return `
    <div style="margin: 24px 0;">
      <h2 style="color: #10b981; margin: 0 0 16px 0; font-size: 18px;">${title}</h2>
      ${groups.map((group) => renderSummaryGroupHTML(group)).join("")}
    </div>
  `;
}

function generateSummaryHTML(summary: SummaryEmailData): string {
  const dateStr = summary.date;

  const gasolineSection = summary.gasoline
    ? renderSummaryAssetHTML("Gasoline", summary.gasoline.groups)
    : "";
  const goldSection = summary.gold ? renderSummaryAssetHTML("Gold", summary.gold.groups) : "";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; }
        .content { background: white; padding: 24px; }
        .footer { text-align: center; padding: 20px; background: #f3f4f6; color: #666; font-size: 12px; border-radius: 0 0 12px 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Viridi Daily Summary</h1>
          <p>${dateStr} (Vietnam Time)</p>
        </div>

        <div class="content">
          <p style="color: #666; margin-bottom: 24px;">Here is your grouped price movement summary for today.</p>
          ${gasolineSection}
          ${goldSection}
        </div>

        <div class="footer">
          <p>Sent by <strong>Viridi</strong> Price Monitor</p>
          <p style="margin: 8px 0 0 0; color: #999;">Times shown in ICT (UTC+7)</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateSummaryText(summary: SummaryEmailData): string {
  let text = `Viridi Daily Summary - ${summary.date}\n`;
  text += `${"=".repeat(40)}\n\n`;

  if (summary.gasoline && summary.gasoline.groups.length > 0) {
    text += `GASOLINE\n`;
    for (const group of summary.gasoline.groups) {
      text += `${group.subtype}\n`;
      text += `Net Change: ${formatPriceChange(group.netChange)} (${formatPercentChange(group.netChangePct)})\n`;
      for (const change of group.changes) {
        text += `  ${formatTimeInVietnam(change.ts)}: ${change.old} -> ${change.new} (${formatPriceChange(change.delta_vnd)})\n`;
      }
      text += "\n";
    }
  }

  if (summary.gold && summary.gold.groups.length > 0) {
    text += `GOLD\n`;
    for (const group of summary.gold.groups) {
      text += `${group.subtype}\n`;
      text += `Net Change: ${formatPriceChange(group.netChange)} (${formatPercentChange(group.netChangePct)})\n`;
      for (const change of group.changes) {
        text += `  ${formatTimeInVietnam(change.ts)}: ${change.old} -> ${change.new} (${formatPriceChange(change.delta_vnd)})\n`;
      }
      text += "\n";
    }
  }

  text += `${"=".repeat(40)}\n`;
  text += "Sent by Viridi Price Monitor\nTimes shown in ICT (UTC+7)";

  return text;
}
