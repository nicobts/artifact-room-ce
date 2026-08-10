import { Card, CardContent } from "@/components/ui/card";

export interface ForwardingAlert {
  shareId: string;
  artifactTitle: string;
  recipientLabel: string | null;
  forwards: number;
}

export function ForwardingAlerts({ alerts }: { alerts: ForwardingAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <Card className="border-warning/50 bg-warning/10">
      <CardContent className="flex flex-col gap-2 py-4">
        <p className="text-sm font-medium text-warning">
          ⚠ Forwarding detected on {alerts.length}{" "}
          {alerts.length === 1 ? "share" : "shares"}
        </p>
        <ul className="flex flex-col gap-1 text-sm text-warning/90">
          {alerts.map((a) => (
            <li key={a.shareId}>
              {a.artifactTitle}
              {a.recipientLabel ? ` → ${a.recipientLabel}` : ""} ·{" "}
              {a.forwards} suspected
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
