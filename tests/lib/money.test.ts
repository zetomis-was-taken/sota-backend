import { describe, expect, it } from 'vitest';
import {
  formatMinorUnitsAsMoney,
  MAX_MONEY_MINOR_UNITS,
  MIN_MONEY_MINOR_UNITS,
  parseMoneyToMinorUnits,
} from '../../src/lib/money';

describe('VND minor-unit helpers', () => {
  it('parses and formats zero, decimal values, and the numeric(12,2) maximum exactly', () => {
    // Zero
    expect(parseMoneyToMinorUnits('0')).toBe(0n);
    expect(parseMoneyToMinorUnits('0.00')).toBe(0n);
    expect(formatMinorUnitsAsMoney(0n)).toBe('0.00');

    // Small decimals
    expect(parseMoneyToMinorUnits('0.01')).toBe(1n);
    expect(formatMinorUnitsAsMoney(1n)).toBe('0.01');

    expect(parseMoneyToMinorUnits('0.05')).toBe(5n);
    expect(formatMinorUnitsAsMoney(5n)).toBe('0.05');

    expect(parseMoneyToMinorUnits('0.5')).toBe(50n);
    expect(parseMoneyToMinorUnits('0.50')).toBe(50n);
    expect(formatMinorUnitsAsMoney(50n)).toBe('0.50');

    // Integer amounts (typical VND)
    expect(parseMoneyToMinorUnits('50000')).toBe(5000000n);
    expect(parseMoneyToMinorUnits('50000.00')).toBe(5000000n);
    expect(formatMinorUnitsAsMoney(5000000n)).toBe('50000.00');

    // Maximum numeric(12,2): 9,999,999,999.99
    expect(parseMoneyToMinorUnits('9999999999.99')).toBe(MAX_MONEY_MINOR_UNITS);
    expect(formatMinorUnitsAsMoney(MAX_MONEY_MINOR_UNITS)).toBe('9999999999.99');
  });

  it('does not introduce floating-point drift when summing line totals', () => {
    // 0.10 + 0.20 in JS float is 0.30000000000000004
    const item1 = parseMoneyToMinorUnits('0.10');
    const item2 = parseMoneyToMinorUnits('0.20');
    const sum = item1 + item2;
    expect(sum).toBe(30n);
    expect(formatMinorUnitsAsMoney(sum)).toBe('0.30');

    // Quantity multiplication: 3 * 19.99 in JS float is 59.970000000000006
    const unitPrice = parseMoneyToMinorUnits('19.99');
    const quantity = 3n;
    const lineTotal = unitPrice * quantity;
    expect(lineTotal).toBe(5997n);
    expect(formatMinorUnitsAsMoney(lineTotal)).toBe('59.97');

    // Accumulating line items
    const linePrices = ['150000.00', '75000.50', '25000.25'];
    const totalMinor = linePrices.reduce(
      (acc, price) => acc + parseMoneyToMinorUnits(price),
      0n
    );
    expect(totalMinor).toBe(25000075n);
    expect(formatMinorUnitsAsMoney(totalMinor)).toBe('250000.75');
  });

  it('rejects negative, malformed, over-precision, and overflow values', () => {
    // Negative values
    expect(() => parseMoneyToMinorUnits('-1')).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits('-0.01')).toThrow(RangeError);
    expect(() => formatMinorUnitsAsMoney(-1n)).toThrow(RangeError);

    // Over-precision (more than 2 decimal places)
    expect(() => parseMoneyToMinorUnits('10.123')).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits('0.001')).toThrow(RangeError);

    // Overflow values exceeding numeric(12,2) limit (9,999,999,999.99)
    expect(() => parseMoneyToMinorUnits('10000000000.00')).toThrow(RangeError);
    expect(() => parseMoneyToMinorUnits('99999999999.99')).toThrow(RangeError);
    expect(() => formatMinorUnitsAsMoney(MAX_MONEY_MINOR_UNITS + 1n)).toThrow(RangeError);

    // Malformed strings
    expect(() => parseMoneyToMinorUnits('')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('   ')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('abc')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('12.3.4')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('.50')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('50.')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('050')).toThrow(TypeError);
    expect(() => parseMoneyToMinorUnits('10,000')).toThrow(TypeError);

    // Invalid argument types
    // @ts-expect-error testing invalid type at runtime
    expect(() => parseMoneyToMinorUnits(100)).toThrow(TypeError);
    // @ts-expect-error testing invalid type at runtime
    expect(() => formatMinorUnitsAsMoney('100')).toThrow(TypeError);
  });
});
