// Display formatting. Storage is always inches; unit conversion is display-only.

const CM_PER_IN = 2.54;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const money2 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export const fmtMoney = (v) => money.format(Math.round(v));
export const fmtMoneyExact = (v) => money2.format(v);

/** Trim trailing zeros: 34.50 -> "34.5", 30.00 -> "30". */
function trim(n) {
  return String(Math.round(n * 100) / 100);
}

/** Format an inch measurement in the active display unit. */
export function fmtLen(inches, units) {
  return units === 'cm'
    ? `${trim(inches * CM_PER_IN)} cm`
    : `${trim(inches)}″`;
}

/** Linear feet, for countertop and run readouts. */
export function fmtFeet(inches, units) {
  return units === 'cm'
    ? `${trim((inches * CM_PER_IN) / 100)} m`
    : `${trim(inches / 12)} lf`;
}

/** Rate as a percentage, keeping meaningful decimals: 0.0825 -> "8.25%". */
export const pct = (v) => `${trim(v * 100)}%`;
