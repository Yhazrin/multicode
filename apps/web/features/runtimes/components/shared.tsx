import { Monitor, Cloud, Wifi, WifiOff, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ApprovalStatus } from "@/shared/types";

export function RuntimeModeIcon({ mode }: { mode: string }) {
  return mode === "cloud" ? (
    <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const isOnline = status === "online";
  return (
    <Badge
      variant="secondary"
      className={isOnline ? "bg-success/10 text-success" : ""}
    >
      {isOnline ? (
        <Wifi className="h-3 w-3" aria-hidden="true" />
      ) : (
        <WifiOff className="h-3 w-3" aria-hidden="true" />
      )}
      {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const config = {
    pending: { icon: Clock, className: "bg-warning/10 text-warning", label: "Pending" },
    approved: { icon: CheckCircle2, className: "bg-success/10 text-success", label: "Approved" },
    rejected: { icon: XCircle, className: "bg-destructive/10 text-destructive", label: "Rejected" },
    revoked: { icon: AlertTriangle, className: "bg-muted text-muted-foreground", label: "Revoked" },
  }[status] ?? { icon: Clock, className: "bg-muted text-muted-foreground", label: status };

  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

export function InfoField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-sm truncate ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

export function TokenCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
