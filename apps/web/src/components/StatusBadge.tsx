export function readableLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function badgeTone(value: string): string {
  if (["CRITICAL", "BLOCKED", "RECALLED", "OPEN"].includes(value)) {
    return "badge-red";
  }

  if (["HIGH", "WARNING", "IN_REVIEW", "ACTIVE"].includes(value)) {
    return "badge-amber";
  }

  if (["VERIFIED", "RESOLVED", "COMPLETED", "CLOSED"].includes(value)) {
    return "badge-neutral-strong";
  }

  return "badge-neutral";
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge ${badgeTone(value)}`}>{readableLabel(value)}</span>;
}
