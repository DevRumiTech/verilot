export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      focusable="false"
      viewBox="0 0 48 48"
    >
      <rect width="48" height="48" rx="12" fill="currentColor" />
      <path
        d="M14 14h10c6 0 10 4 10 10s-4 10-10 10H14"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <circle cx="14" cy="14" r="3.5" fill="white" />
      <circle cx="34" cy="24" r="3.5" fill="white" />
      <circle cx="14" cy="34" r="3.5" fill="white" />
    </svg>
  );
}
