const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 604_800_000;
const MONTH = 2_592_000_000;
const YEAR = 31_536_000_000;

export function formatDistanceToNow(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();

  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(diff / YEAR);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min. ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr. ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(date),
  );
}
