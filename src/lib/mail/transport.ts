import "server-only";

/**
 * שליחת מיילים.
 *
 * MAIL_TRANSPORT="graph"   → Microsoft Graph (sendMail) מתיבת Outlook 365 של הארגון.
 * MAIL_TRANSPORT="console" → לא נשלח דבר; המייל נרשם ביומן השרת (פיתוח / לפני חיבור Graph).
 *
 * Graph משתמש ב-client credentials של אותה אפליקציה ב-Entra שמשמשת להתחברות:
 *   - הרשאת Application: Mail.Send + Admin consent
 *   - מומלץ להגביל את האפליקציה לתיבת השולח בלבד (Application Access Policy / RBAC for Applications)
 */

export interface MailMessage {
  to: { address: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

export interface MailTransport {
  readonly name: "graph" | "console";
  send(message: MailMessage): Promise<void>;
}

export class MailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailConfigurationError";
  }
}

// -----------------------------------------------------------------------------
// Console (פיתוח)
// -----------------------------------------------------------------------------

class ConsoleMailTransport implements MailTransport {
  readonly name = "console" as const;

  async send(message: MailMessage): Promise<void> {
    console.info(
      [
        "──────── [mail:console] ────────",
        `To:      ${message.to.name ?? ""} <${message.to.address}>`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "────────────────────────────────",
      ].join("\n"),
    );
  }
}

// -----------------------------------------------------------------------------
// Microsoft Graph
// -----------------------------------------------------------------------------

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

const TOKEN_SAFETY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

function tenantFromIssuer(issuer: string | undefined): string | null {
  const match = issuer?.match(/login\.microsoftonline\.com\/([^/]+)\//);
  return match?.[1] && match[1] !== "<TENANT_ID>" ? match[1] : null;
}

function readGraphConfig(): GraphConfig {
  const tenantId = process.env.GRAPH_TENANT_ID || tenantFromIssuer(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  const sender = process.env.MAIL_SENDER_ADDRESS;

  const missing = [
    !tenantId && "GRAPH_TENANT_ID (או AUTH_MICROSOFT_ENTRA_ID_ISSUER עם Tenant ID)",
    !clientId && "AUTH_MICROSOFT_ENTRA_ID_ID",
    !clientSecret && "AUTH_MICROSOFT_ENTRA_ID_SECRET",
    !sender && "MAIL_SENDER_ADDRESS",
  ].filter(Boolean);
  if (missing.length > 0 || !tenantId || !clientId || !clientSecret || !sender) {
    throw new MailConfigurationError(`Missing mail configuration: ${missing.join(", ")}`);
  }
  return { tenantId, clientId, clientSecret, sender };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

class GraphMailTransport implements MailTransport {
  readonly name = "graph" as const;
  private token: CachedToken | null = null;

  constructor(private readonly config: GraphConfig) {}

  private async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && this.token.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) {
      return this.token.value;
    }
    const response = await fetchWithTimeout(
      `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Graph token request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Graph token response did not include access_token");
    this.token = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  async send(message: MailMessage): Promise<void> {
    const body = JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: [{ emailAddress: { address: message.to.address, name: message.to.name } }],
      },
      saveToSentItems: false,
    });
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.sender)}/sendMail`;

    const post = async (token: string) =>
      fetchWithTimeout(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      });

    let response = await post(await this.getToken());
    if (response.status === 401) {
      response = await post(await this.getToken(true));
    }
    if (response.status !== 202) {
      const retryAfter = response.headers.get("retry-after");
      const detail = await response.text();
      throw new Error(
        `Graph sendMail failed (${response.status})${retryAfter ? ` retry-after=${retryAfter}s` : ""}: ${detail.slice(0, 300)}`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// בחירת Transport
// -----------------------------------------------------------------------------

let cachedTransport: MailTransport | null = null;

export function getMailTransport(): MailTransport {
  if (cachedTransport) return cachedTransport;
  const mode = (process.env.MAIL_TRANSPORT ?? "console").toLowerCase();
  if (mode === "graph") {
    cachedTransport = new GraphMailTransport(readGraphConfig());
  } else if (mode === "console") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[mail] MAIL_TRANSPORT=console in production – emails are logged, not sent.");
    }
    cachedTransport = new ConsoleMailTransport();
  } else {
    throw new MailConfigurationError(`Unknown MAIL_TRANSPORT "${mode}" (expected "graph" or "console")`);
  }
  return cachedTransport;
}
