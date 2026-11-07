/**
 * עטיפת HTML למיילים: RTL, עברית, ותואם ל-Outlook (טבלאות ו-inline styles בלבד).
 * גוף ההתראה נשמר כטקסט רגיל; כאן הוא עובר escape, וקישורים הופכים לכפתור.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/;
const FONT_STACK = "'Segoe UI', Arial, 'Helvetica Neue', sans-serif";
const BRAND_COLOR = "#1d4ed8";

function renderLine(line: string): string {
  if (line.trim() === "") return "";
  const match = line.match(URL_PATTERN);
  if (!match) {
    return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(line)}</p>`;
  }
  const url = match[1];
  const label = line.replace(url, "").replace(/[:\s]+$/, "").trim() || "מעבר למערכת";
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr>`,
    `<td style="background:${BRAND_COLOR};border-radius:6px;">`,
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 22px;font-family:${FONT_STACK};font-size:15px;color:#ffffff;text-decoration:none;font-weight:600;">${escapeHtml(label)}</a>`,
    `</td></tr></table>`,
  ].join("");
}

export function renderEmailHtml(subject: string, body: string): string {
  const content = body.split("\n").map(renderLine).join("\n");
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;" dir="rtl">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;" dir="rtl">
<tr><td style="padding:20px 28px;border-bottom:3px solid ${BRAND_COLOR};font-family:${FONT_STACK};font-size:18px;font-weight:700;color:#111827;text-align:right;">מערכת הערכת עובדים</td></tr>
<tr><td style="padding:24px 28px;font-family:${FONT_STACK};text-align:right;" dir="rtl">
<h1 style="margin:0 0 16px;font-size:19px;color:#111827;">${escapeHtml(subject)}</h1>
${content}
</td></tr>
<tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:${FONT_STACK};font-size:12px;color:#6b7280;text-align:right;border-radius:0 0 10px 10px;">הודעה זו נשלחה אוטומטית ממערכת הערכת העובדים. אין להשיב למייל זה.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
