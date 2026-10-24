import { CASE_DEFAULTS, calculateCase, sensitivityCases, exportBusinessCase } from './business-case.js';

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const number = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
const keys = Object.keys(CASE_DEFAULTS);
const ids = key => 'case-' + key;
let current = null;

function readInputs() {
  return Object.fromEntries(keys.map(key => {
    const raw = $(ids(key)).value.trim();
    return [key, raw === '' ? NaN : Number(raw)];
  }));
}

function renderCase() {
  try {
    const input = readInputs(), result = calculateCase(input);
    current = input;
    $('case-input-error').hidden = true;
    $('case-export').disabled = false;
    $('case-gross').textContent = money(result.grossAnnualBenefit);
    $('case-net').textContent = money(result.annualNetBenefit);
    $('case-payback').textContent = result.paybackMonths === null ? 'No payback' : number(result.paybackMonths) + ' months';
    $('case-first-year').textContent = money(result.firstYearNetValue);
    $('case-avoided').textContent = number(result.avoidedExceptions) + ' fewer cases per year';
    $('case-extra-cost').textContent = money(-input.annualExtraTimeCost);
    $('case-support-cost').textContent = money(-input.annualSupportCost);
    $('case-upfront-cost').textContent = money(-input.upfrontCost);
    $('case-status').textContent = result.financialTargetMet
      ? 'Meets the entered financial target'
      : result.paybackMonths === null ? 'No financial payback in this scenario' : 'Misses the entered financial target';
    $('case-status').dataset.state = result.financialTargetMet ? 'positive' : 'caution';
    $('case-roi').textContent = result.firstYearRoi === null
      ? 'First-year ROI is undefined when upfront cost is zero.'
      : 'First-year ROI: ' + number(result.firstYearRoi * 100) + '%. This includes upfront cost.';
    const threshold = result.breakEvenAfterPerThousand;
    $('case-threshold').textContent = threshold === null
      ? 'A zero exception cost cannot support an exception-reduction business case.'
      : threshold < 0
        ? 'Even zero exceptions would miss the entered payback target at these costs.'
        : 'For payback within ' + number(input.targetPaybackMonths) + ' months, the post-pilot rate must be no higher than ' + number(threshold) + ' per 1,000 transfers.';
    const tbody = $('case-sensitivity');
    tbody.replaceChildren();
    for (const row of sensitivityCases(input)) {
      const tr = document.createElement('tr');
      for (const value of [
        row.label, number(row.afterPerThousand), money(row.result.annualNetBenefit),
        row.result.paybackMonths === null ? 'No payback' : number(row.result.paybackMonths) + ' months'
      ]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      tbody.append(tr);
    }
  } catch (error) {
    current = null;
    $('case-input-error').hidden = false;
    $('case-input-error').textContent = error.message;
    $('case-export').disabled = true;
    for (const id of ['case-gross', 'case-net', 'case-payback', 'case-first-year']) $(id).textContent = '—';
    $('case-status').textContent = 'Fix the inputs to calculate this scenario';
    $('case-status').dataset.state = 'caution';
    $('case-avoided').textContent = '';
    $('case-extra-cost').textContent = '—';
    $('case-support-cost').textContent = '—';
    $('case-upfront-cost').textContent = '—';
    $('case-threshold').textContent = '';
    $('case-roi').textContent = '';
    $('case-sensitivity').replaceChildren();
  }
}

function setInputs(input) {
  for (const key of keys) $(ids(key)).value = input[key];
  renderCase();
}

for (const key of keys) $(ids(key)).addEventListener('input', renderCase);
$('case-scenario').addEventListener('change', event => {
  const after = { base: 8, conservative: 10, downside: 13 }[event.target.value];
  setInputs({ ...CASE_DEFAULTS, afterPerThousand: after });
});
$('case-reset').addEventListener('click', () => {
  $('case-scenario').value = 'base';
  setInputs(CASE_DEFAULTS);
});
$('case-export').addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(exportBusinessCase(current), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = 'transfer-pilot-business-case.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('case-scroll').addEventListener('click', () => $('business-calculator').scrollIntoView?.({ behavior: 'smooth' }));

async function loadEvidence() {
  try {
    const names = ['verified-benchmark.json', 'verified-shift.json', 'verified-mismatch.json'];
    const data = await Promise.all(names.map(async name => {
      const response = await fetch(name);
      if (!response.ok) throw new Error('Saved simulation data is unavailable.');
      const value = await response.json();
      if (value.schema !== 'awm-benchmark-v1' || value.engine !== 'mujoco' || value.n !== 100) {
        throw new Error('Unexpected simulation evidence format.');
      }
      return value;
    }));
    const labels = ['Unknown fixed friction', 'Friction changes', 'Extra drag'];
    const tbody = $('business-evidence');
    tbody.replaceChildren();
    data.forEach((batch, index) => {
      const tr = document.createElement('tr');
      for (const text of [labels[index], ...['fixed', 'passive', 'active', 'robust'].map(method => batch.summary[method].successes + ' / ' + batch.n)]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      tbody.append(tr);
    });
    const passive = data[0].summary.passive, active = data[0].summary.active;
    $('business-probe-cost').textContent = 'In the fixed-friction set, Active used ' + active.actions.toFixed(2)
      + ' moves on average; Passive used ' + passive.actions.toFixed(2)
      + '. A probe cost ' + (active.actions - passive.actions).toFixed(2)
      + ' extra moves on average. The pilot must show when that cost is worth paying.';
    $('business-evidence-note').textContent = '1,200 recorded MuJoCo runs. Success means reaching a simulated target within six moves. These are not production exception rates.';
  } catch (error) {
    $('business-evidence-note').textContent = error.message + ' Do not use missing evidence as a basis for rollout.';
  }
}

setInputs(CASE_DEFAULTS);
loadEvidence();
