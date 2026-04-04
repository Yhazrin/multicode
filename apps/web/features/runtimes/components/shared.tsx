import { Monitor, Cloud, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
