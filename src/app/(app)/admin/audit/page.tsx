import type { Metadata } from "next";
import { listAuditLog } from "@/lib/dal/audit-log";
import { AUDIT_ACTION_LABELS } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { loadPage } from "@/lib/page-guard";
import { Badge, ErrorState, PageHeader, Table, Td, Th } from "@/components/ui/kit";

// דף אישי לפי המשתמש המחובר – נטען בשרת בכל בקשה
export const instant = false;

export const metadata: Metadata = { title: "יומן פעולות" };

const SENSITIVE = new Set(["ACCESS_DENIED", "ROLE_CHANGED", "CYCLE_CLOSED", "USER_DEACTIVATED", "EMPLOYEES_IMPORTED"]);

export default async function AuditPage() {
  const result = await loadPage(() => listAuditLog({ limit: 300 }));
  if (!result.ok) return <ErrorState message={result.message} />;

  return (
    <div className="space-y-6">
      <PageHeader title="יומן פעולות (Audit Log)" description="300 הפעולות האחרונות במערכת: מי ביצע, מה, ומתי" />
      <Table>
        <thead>
          <tr>
            <Th>מועד</Th>
            <Th>משתמש</Th>
            <Th>פעולה</Th>
            <Th>ישות</Th>
            <Th>כתובת IP</Th>
          </tr>
        </thead>
        <tbody>
          {result.data.map((row) => (
            <tr key={row.id}>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Td>
              <Td>{row.actorName ?? <span className="text-muted-foreground">מערכת</span>}</Td>
              <Td>
                <Badge tone={SENSITIVE.has(row.action) ? "warning" : "neutral"}>{AUDIT_ACTION_LABELS[row.action]}</Badge>
              </Td>
              <Td className="text-xs text-muted-foreground">{row.entityType}</Td>
              <Td className="text-xs ltr-nums text-start">{row.ipAddress ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
