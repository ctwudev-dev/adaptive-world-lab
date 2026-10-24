import test from 'node:test';
import assert from 'node:assert/strict';
import { CASE_DEFAULTS, calculateCase, sensitivityCases, exportBusinessCase } from '../dist/business-case.js';

test('the sample case includes extra time, support, and upfront cost', () => {
  const r = calculateCase(CASE_DEFAULTS);
  assert.equal(r.avoidedExceptions, 4800);
  assert.equal(r.grossAnnualBenefit, 57600);
  assert.equal(r.annualNetBenefit, 46600);
  assert.equal(r.firstYearNetValue, 11600);
  assert.ok(Math.abs(r.paybackMonths - 35000 / 46600 * 12) < 1e-10);
  assert.equal(r.financialTargetMet, true);
  assert.equal(r.deploymentApproved, false);
});

test('a worse outcome retains losses and never shows a payback', () => {
  const r = calculateCase({ ...CASE_DEFAULTS, afterPerThousand: 13 });
  assert.equal(r.avoidedExceptions, -1200);
  assert.equal(r.annualNetBenefit, -25400);
  assert.equal(r.paybackMonths, null);
  assert.equal(r.financialTargetMet, false);
});

test('no improvement does not hide the operating cost of calibration', () => {
  const r = calculateCase({ ...CASE_DEFAULTS, afterPerThousand: 12 });
  assert.equal(r.annualNetBenefit, -11000);
  assert.equal(r.firstYearNetValue, -46000);
});

test('zero investment and zero benefit avoid misleading ratios', () => {
  const r = calculateCase({ ...CASE_DEFAULTS, upfrontCost: 0 });
  assert.equal(r.firstYearRoi, null);
  assert.equal(r.paybackMonths, 0);
  const empty = calculateCase({
    ...CASE_DEFAULTS, costPerException: 0, annualExtraTimeCost: 0,
    annualSupportCost: 0, upfrontCost: 0
  });
  assert.equal(empty.paybackMonths, null);
  assert.equal(empty.breakEvenAfterPerThousand, null);
  assert.equal(empty.financialTargetMet, false);
});

test('the break-even rate matches the entered payback target', () => {
  const original = calculateCase(CASE_DEFAULTS);
  const edge = calculateCase({ ...CASE_DEFAULTS, afterPerThousand: original.breakEvenAfterPerThousand });
  assert.ok(Math.abs(edge.paybackMonths - 12) < 1e-9);
  assert.equal(edge.financialTargetMet, true);
  const impossible = calculateCase({ ...CASE_DEFAULTS, upfrontCost: 1e9 });
  assert.ok(impossible.breakEvenAfterPerThousand < 0);
});

test('invalid or incomplete values fail instead of keeping stale results', () => {
  for (const patch of [
    { annualTransfers: 0 }, { annualTransfers: 1.5 }, { beforePerThousand: 1001 },
    { annualSupportCost: -1 }, { afterPerThousand: NaN }, { upfrontCost: Infinity },
    { costPerException: '12' }, { targetPaybackMonths: 0 }, { annualTransfers: undefined }
  ]) assert.throws(() => calculateCase({ ...CASE_DEFAULTS, ...patch }), RangeError);
});

test('exports preserve assumptions and cannot turn simulation into deployment approval', () => {
  const exported = exportBusinessCase({ ...CASE_DEFAULTS, productionSuccess: 100, privateContact: 'unused' });
  assert.equal(exported.schema, 'transfer-business-case-v1');
  assert.match(exported.inputStatus, /not verified production data/);
  assert.equal(exported.outputs.deploymentApproved, false);
  assert.equal(exported.inputs.privateContact, undefined);
  assert.equal(exported.inputs.productionSuccess, undefined);
  assert.ok(Object.values(exported.pilotGates).every(value => value === 'Not assessed'));
  assert.equal(sensitivityCases(CASE_DEFAULTS)[0].result.annualNetBenefit, -11000);
  assert.equal(JSON.stringify(exported).includes('Infinity'), false);
});
