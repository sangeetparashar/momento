/**
 * Base-unit / USD / bps formatting helpers.
 *
 * Money on the wire is a base-unit STRING (integer, no decimal point). All
 * conversion to/from human display uses BigInt — never float arithmetic on
 * base units (precision loss). Display formatting may use Number only AFTER
 * the integer/fraction split, where the magnitudes are safe.
 */

export const USDC_DECIMALS = 6;

interface BaseToDisplayOpts {
  /** Maximum fraction digits to render. Default: all (up to `decimals`). */
  maxFracDigits?: number;
  /** Group the integer part with thousands separators. Default false. */
  group?: boolean;
}

function groupInteger(intStr: string): string {
  // Insert thousands separators into a (possibly signed) integer string.
  const neg = intStr.startsWith('-');
  const digits = neg ? intStr.slice(1) : intStr;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${grouped}` : grouped;
}

/**
 * Convert a base-unit amount to a human-readable decimal string.
 *
 * @example baseToDisplay('1500000', 6) -> '1.5'
 * @example baseToDisplay('1500000', 6, { maxFracDigits: 2 }) -> '1.5'
 * @example baseToDisplay('1000000000', 9, { group: true }) -> '1'
 */
export function baseToDisplay(
  base: string | bigint,
  decimals: number,
  opts: BaseToDisplayOpts = {},
): string {
  const { maxFracDigits, group = false } = opts;

  let value: bigint;
  try {
    value = typeof base === 'bigint' ? base : BigInt(base ?? '0');
  } catch {
    value = 0n;
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const divisor = 10n ** BigInt(Math.max(0, decimals));
  const intPart = abs / divisor;
  const fracPart = abs % divisor;

  let intStr = intPart.toString();
  if (group) intStr = groupInteger(intStr);

  let fracStr = '';
  if (decimals > 0) {
    // Zero-pad the fraction to full precision, then trim/clamp.
    fracStr = fracPart.toString().padStart(decimals, '0');
    if (maxFracDigits !== undefined) {
      fracStr = fracStr.slice(0, Math.max(0, maxFracDigits));
    }
    // Trim trailing zeros for a clean display.
    fracStr = fracStr.replace(/0+$/, '');
  }

  const sign = negative && (intPart !== 0n || fracStr !== '') ? '-' : '';
  return fracStr ? `${sign}${intStr}.${fracStr}` : `${sign}${intStr}`;
}

/**
 * Convert a human-readable decimal string to a base-unit string.
 * Throws if there are more fraction digits than `decimals` allows.
 *
 * @example displayToBase('1.5', 6) -> '1500000'
 */
export function displayToBase(display: string, decimals: number): string {
  const trimmed = (display ?? '').trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '.') return '0';

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  if (!/^\d*\.?\d*$/.test(unsigned)) {
    throw new Error(`Invalid amount: "${display}"`);
  }

  const [intRaw = '0', fracRaw = ''] = unsigned.split('.');
  if (fracRaw.length > decimals) {
    throw new Error(
      `Too many decimal places: "${display}" exceeds ${decimals} for this token.`,
    );
  }

  const intPart = intRaw === '' ? '0' : intRaw;
  const fracPadded = fracRaw.padEnd(decimals, '0');
  const combined = `${intPart}${fracPadded}`.replace(/^0+(?=\d)/, '');

  let value: bigint;
  try {
    value = BigInt(combined === '' ? '0' : combined);
  } catch {
    throw new Error(`Invalid amount: "${display}"`);
  }
  if (negative) value = -value;
  return value.toString();
}

/**
 * Alias of {@link baseToDisplay} (the D-trade / D-vesting name).
 */
export function formatBaseUnits(base: string, decimals: number, maxFrac?: number): string {
  return baseToDisplay(base, decimals, { maxFracDigits: maxFrac, group: true });
}

/**
 * Format a USDC base-unit amount as a "$"-prefixed display string (2 dp).
 */
export function usdcToDisplay(base: string): string {
  return `$${baseToDisplay(base, USDC_DECIMALS, { maxFracDigits: 2, group: true })}`;
}

/**
 * Format a base-unit amount as a "$"-prefixed display string (D-vesting name).
 * Defaults to USDC's 6 decimals.
 */
export function formatUsd(base: string, decimals: number = USDC_DECIMALS): string {
  return `$${baseToDisplay(base, decimals, { maxFracDigits: 2, group: true })}`;
}

/**
 * Convert basis points to a percent display string.
 * @example bpsToPct(100) -> '1%'  bpsToPct(50) -> '0.5%'
 */
export function bpsToPct(bps: number): string {
  if (!Number.isFinite(bps)) return '0%';
  const pct = bps / 100;
  // Trim trailing zeros (e.g. 1.0 -> "1", 0.50 -> "0.5").
  const str = pct.toFixed(2).replace(/\.?0+$/, '');
  return `${str}%`;
}

/**
 * Clamp a number into the inclusive 0..100 range.
 */
export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
