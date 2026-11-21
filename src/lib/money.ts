/** Maximum numeric(12,2) value in minor units: 9,999,999,999.99 * 100 */
export const MAX_MONEY_MINOR_UNITS = 999_999_999_999n;
export const MIN_MONEY_MINOR_UNITS = 0n;

const MONEY_REGEX = /^(0|[1-9]\d*)(\.(\d{1,2}))?$/;

/**
 * Parses a decimal string representation of VND money into integer minor units (bigint).
 * Rejects negative values, malformed strings, excessive precision (> 2 decimals),
 * and values exceeding the Postgres numeric(12,2) limit (9,999,999,999.99).
 */
export function parseMoneyToMinorUnits(value: string): bigint {
  if (typeof value !== 'string') {
    throw new TypeError('Money value must be a string');
  }

  if (value.startsWith('-')) {
    throw new RangeError('Money value cannot be negative');
  }

  const match = value.match(MONEY_REGEX);
  if (!match) {
    if (/\.\d{3,}$/.test(value)) {
      throw new RangeError('Money value has more than 2 decimal places');
    }
    throw new TypeError(`Malformed money value: "${value}"`);
  }

  const intPart = match[1];
  const decPart = (match[3] ?? '').padEnd(2, '0');
  const minorUnits = BigInt(intPart) * 100n + BigInt(decPart);

  if (minorUnits > MAX_MONEY_MINOR_UNITS) {
    throw new RangeError('Money value exceeds maximum numeric(12,2) limit of 9,999,999,999.99');
  }

  return minorUnits;
}

/**
 * Formats integer minor units (bigint) into a decimal string with exactly 2 decimal places.
 * Rejects negative minor units or values exceeding the numeric(12,2) limit.
 */
export function formatMinorUnitsAsMoney(minorUnits: bigint): string {
  if (typeof minorUnits !== 'bigint') {
    throw new TypeError('Minor units must be a bigint');
  }

  if (minorUnits < MIN_MONEY_MINOR_UNITS) {
    throw new RangeError('Minor units cannot be negative');
  }

  if (minorUnits > MAX_MONEY_MINOR_UNITS) {
    throw new RangeError('Minor units exceed maximum numeric(12,2) limit of 9,999,999,999.99');
  }

  const intPart = (minorUnits / 100n).toString();
  const decPart = (minorUnits % 100n).toString().padStart(2, '0');
  return `${intPart}.${decPart}`;
}
