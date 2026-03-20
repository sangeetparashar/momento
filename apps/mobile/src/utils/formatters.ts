/**
 * Format a number with compact suffixes (1.2K, 3.4M, etc.).
 */
export function formatNumber(value: number): string {
  if (value < 0) return `-${formatNumber(-value)}`;

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return value.toFixed(0);
}

/**
 * Format a number as USD currency.
 * - Values >= $1 are shown with 2 decimal places.
 * - Values < $1 are shown with up to 4 significant decimal places.
 */
export function formatCurrency(value: number): string {
  if (value >= 1) {
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
  if (value > 0) {
    return `$${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
  return '$0.00';
}

const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 3600;
const SECONDS_IN_DAY = 86400;
const SECONDS_IN_WEEK = 604800;
const SECONDS_IN_MONTH = 2592000; // ~30 days
const SECONDS_IN_YEAR = 31536000; // ~365 days

/**
 * Format a date string or Date as a human-readable relative time (e.g. "2h ago", "3d ago").
 */
export function formatTimeAgo(date: string | Date): string {
  const now = Date.now();
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 0) return 'just now';
  if (diffSeconds < SECONDS_IN_MINUTE) return 'just now';
  if (diffSeconds < SECONDS_IN_HOUR) {
    const minutes = Math.floor(diffSeconds / SECONDS_IN_MINUTE);
    return `${minutes}m ago`;
  }
  if (diffSeconds < SECONDS_IN_DAY) {
    const hours = Math.floor(diffSeconds / SECONDS_IN_HOUR);
    return `${hours}h ago`;
  }
  if (diffSeconds < SECONDS_IN_WEEK) {
    const days = Math.floor(diffSeconds / SECONDS_IN_DAY);
    return `${days}d ago`;
  }
  if (diffSeconds < SECONDS_IN_MONTH) {
    const weeks = Math.floor(diffSeconds / SECONDS_IN_WEEK);
    return `${weeks}w ago`;
  }
  if (diffSeconds < SECONDS_IN_YEAR) {
    const months = Math.floor(diffSeconds / SECONDS_IN_MONTH);
    return `${months}mo ago`;
  }
  const years = Math.floor(diffSeconds / SECONDS_IN_YEAR);
  return `${years}y ago`;
}

/**
 * Format a number as a percentage string with a +/- sign.
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format distance in meters to a human-readable string.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m away`;
  }
  return `${(meters / 1000).toFixed(1)}km away`;
}

/**
 * Truncate a Solana (or any) address to a short display format.
 * e.g. "7nY...xK3" with configurable start/end lengths.
 */
export function truncateAddress(
  address: string,
  startChars = 4,
  endChars = 3,
): string {
  if (!address) return '';
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}
