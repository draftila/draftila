import type { StrokeDashPattern } from '@draftila/shared';

export function StrokeWidthIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" />
      <line x1="1" y1="11.5" x2="13" y2="11.5" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function CapButtIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1="4"
        y1="8"
        x2="14"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="butt"
      />
    </svg>
  );
}

export function CapRoundIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1="4"
        y1="8"
        x2="14"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CapSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1="4"
        y1="8"
        x2="13"
        y2="8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function JoinMiterIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13L3 3L13 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  );
}

export function JoinRoundIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13L3 6C3 4.34315 4.34315 3 6 3L13 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function JoinBevelIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 13L3 6L6 3L13 3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="bevel"
        fill="none"
      />
    </svg>
  );
}

export function AlignCenterIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

export function AlignInsideIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

export function AlignOutsideIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.5"
        y="3.5"
        width="9"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

export function EndpointNoneIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function EndpointLineArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polyline
        points="6,4 2,8 6,12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EndpointTriangleArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="2,8 7,4.5 7,11.5" fill="currentColor" />
    </svg>
  );
}

export function EndpointReversedTriangleIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="7,8 2,4.5 2,11.5" fill="currentColor" />
    </svg>
  );
}

export function EndpointCircleArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <line x1="6" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="3" cy="8" r="3" fill="currentColor" />
    </svg>
  );
}

export function EndpointDiamondArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="3.5,4.5 7,8 3.5,11.5 0,8" fill="currentColor" />
    </svg>
  );
}

export function DashPreview({
  pattern,
  className,
}: {
  pattern: StrokeDashPattern;
  className?: string;
}) {
  const dashArrayMap: Record<StrokeDashPattern, string> = {
    solid: '',
    dash: '6 3',
    dot: '2 3',
    'dash-dot': '6 3 2 3',
  };
  return (
    <svg
      width="48"
      height="8"
      viewBox="0 0 48 8"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line
        x1="0"
        y1="4"
        x2="48"
        y2="4"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dashArrayMap[pattern]}
        strokeLinecap="round"
      />
    </svg>
  );
}
