/** Scenario economics. Simulation success rates are never used as production rates. */
export const CASE_DEFAULTS = Object.freeze({
  annualTransfers: 1200000,
  beforePerThousand: 12,
  afterPerThousand: 8,
  costPerException: 12,
  annualExtraTimeCost: 5000,
  annualSupportCost: 6000,
  upfrontCost: 35000,
  targetPaybackMonths: 12
});

const RULES = Object.freeze({
  annualTransfers: [1, 1e9],
  beforePerThousand: [0, 1000],
  afterPerThousand: [0, 1000],
  costPerException: [0, 1e6],
  annualExtraTimeCost: [0, 1e12],
  annualSupportCost: [0, 1e12],
  upfrontCost: [0, 1e12],
  targetPaybackMonths: [1, 120]
});

export function validateCase(input) {
  const clean = {};
  for (const [key, [low, high]] of Object.entries(RULES)) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
      throw new RangeError('Enter a valid value for ' + key + ' (' + low + ' to ' + high + ').');
    }
    clean[key] = value;
  }
  if (!Number.isInteger(clean.annualTransfers)) throw new RangeError('Annual transfers must be a whole number.');
  return clean;
}

export function calculateCase(input) {
  const c = validateCase(input);
  const avoidedExceptions = c.annualTransfers * (c.beforePerThousand - c.afterPerThousand) / 1000;
  const grossAnnualBenefit = avoidedExceptions * c.costPerException;
  const annualOperatingCosts = c.annualExtraTimeCost + c.annualSupportCost;
  const annualNetBenefit = grossAnnualBenefit - annualOperatingCosts;
  const firstYearNetValue = annualNetBenefit - c.upfrontCost;
  const paybackMonths = annualNetBenefit > 0 ? 12 * c.upfrontCost / annualNetBenefit : null;
  const firstYearRoi = c.upfrontCost > 0 ? firstYearNetValue / c.upfrontCost : null;
  const requiredAnnualBenefit = annualOperatingCosts + c.upfrontCost * 12 / c.targetPaybackMonths;
  const breakEvenAfterPerThousand = c.costPerException > 0
    ? c.beforePerThousand - 1000 * requiredAnnualBenefit / (c.annualTransfers * c.costPerException)
    : null;
  return {
    avoidedExceptions, grossAnnualBenefit, annualOperatingCosts, annualNetBenefit,
    firstYearNetValue, paybackMonths, firstYearRoi, breakEvenAfterPerThousand,
    financialTargetMet: paybackMonths !== null && paybackMonths <= c.targetPaybackMonths + 1e-9,
    evidenceBasis: 'Unverified scenario inputs. No production benefit has been demonstrated.',
    deploymentApproved: false
  };
}

export function sensitivityCases(input) {
  const c = validateCase(input);
  return [
    { label: 'No change in exceptions', afterPerThousand: c.beforePerThousand },
    { label: 'Half the entered change', afterPerThousand: (c.beforePerThousand + c.afterPerThousand) / 2 },
    { label: 'Entered scenario', afterPerThousand: c.afterPerThousand }
  ].map(row => ({ ...row, result: calculateCase({ ...c, afterPerThousand: row.afterPerThousand }) }));
}

export function exportBusinessCase(input) {
  const inputs = validateCase(input);
  return {
    schema: 'transfer-business-case-v1',
    currency: 'USD',
    inputStatus: 'User-supplied scenario; not verified production data.',
    inputs,
    outputs: calculateCase(inputs),
    sensitivity: sensitivityCases(inputs),
    pilotGates: {
      matchedBaseline: 'Not assessed',
      physicalValidation: 'Not assessed',
      throughputAndQuality: 'Not assessed',
      operationalApproval: 'Not assessed'
    }
  };
}
