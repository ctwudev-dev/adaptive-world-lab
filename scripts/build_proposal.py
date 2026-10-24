"""Build the two-page decision brief from the shared sample business case."""

from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist/transfer-pilot-proposal.pdf"
CASE = json.loads((ROOT / "dist/business-case-sample.json").read_text())
assert CASE["schema"] == "transfer-business-case-v1"
assert CASE["outputs"]["deploymentApproved"] is False
INPUTS, RESULTS = CASE["inputs"], CASE["outputs"]
BATCHES = [json.loads((ROOT / "dist" / name).read_text()) for name in
           ("verified-benchmark.json", "verified-shift.json", "verified-mismatch.json")]
assert all(batch["engine"] == "mujoco" and batch["n"] == 100 for batch in BATCHES)

W, H = A4
M = 44
WIDTH = W - 2 * M
NAVY = colors.HexColor("#172536")
MUTED = colors.HexColor("#526579")
LINE = colors.HexColor("#dbe2e8")
ORANGE = colors.HexColor("#c87435")
PALE = colors.HexColor("#fff4e8")
TEAL = colors.HexColor("#176454")
BODY = ParagraphStyle("Body", fontName="Helvetica", fontSize=9.1, leading=13.1, textColor=NAVY)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=7.7, leading=10.7, textColor=MUTED)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=8.2, leading=11.4)
HEADER = ParagraphStyle("Header", parent=CELL, fontName="Helvetica-Bold", textColor=colors.white)

c = canvas.Canvas(str(OUTPUT), pagesize=A4, invariant=1)
c.setTitle("Adaptive Transfer Lab - Decision Brief")
c.setAuthor("Adaptive Transfer Lab")
c.setSubject("Illustrative one-station pilot proposal, simulation evidence, and decision gates")
c.setCreator("Adaptive Transfer Lab proposal builder")


def text(value, x, y, size=10, bold=False, color=NAVY):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, value)


def para(value, y, style=BODY, x=M, width=WIDTH, gap=9):
    p = Paragraph(value, style)
    _, height = p.wrap(width, H)
    if y - height < 53:
        raise ValueError("Proposal text exceeds the page content area.")
    p.drawOn(c, x, y - height)
    return y - height - gap


def section(label, y):
    text(label, M, y, 9, True, ORANGE)
    return y - 19


def table(rows, widths, y, font=CELL):
    cells = [[Paragraph(str(v), HEADER if i == 0 else font) for v in row] for i, row in enumerate(rows)]
    t = Table(cells, colWidths=widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f3f6f8"), colors.white]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ]))
    _, height = t.wrap(WIDTH, H)
    if y - height < 53:
        raise ValueError("Proposal table exceeds the page content area.")
    t.drawOn(c, M, y - height)
    return y - height - 13


def footer(page):
    c.setStrokeColor(LINE)
    c.line(M, 40, W - M, 40)
    text("Simulation prototype | No customer production results", M, 26, 7.4, color=MUTED)
    c.setFont("Helvetica", 7.4)
    c.drawRightString(W - M, 26, "Decision brief / " + str(page) + " of 2")


def header(kicker, title, subtitle=None):
    text("ADAPTIVE TRANSFER LAB", M, H - 39, 9.2, True, NAVY)
    c.setStrokeColor(ORANGE)
    c.setLineWidth(2)
    c.line(W - M - 130, H - 35, W - M, H - 35)
    text(kicker, M, H - 72, 8, True, ORANGE)
    text(title, M, H - 108, 26, True)
    y = H - 126
    if subtitle:
        y = para(subtitle, y, gap=15)
    return y


def money(n):
    return ("-$" if n < 0 else "$") + format(abs(n), ",.0f")


# Page 1: decision and economics.
y = header(
    "OPERATIONS / PROPOSED PILOT",
    "Less guesswork at the transfer station.",
    "Test whether a small calibration assistant can reduce manual tuning and positioning exceptions "
    "at one material-transfer station - while paying for the time it spends learning.",
)
y = section("01 / DECISION REQUEST", y)
y = para(
    "<b>Approve discovery and guarded bench validation.</b> Define one station and one product family. "
    "Use six weeks as a planning window and <b>$35,000 as an illustrative allowance</b>, "
    "to be re-estimated after the baseline and fit check. This is not a production rollout request.",
    y,
)
y = para(
    "<b>Owners:</b> Operations sponsor and Automation Engineering lead, with a station owner, Quality, and Finance. "
    "<b>First comparison:</b> mechanical guides, a stable fixed recipe, and passive learning. "
    "Reject the idea if a simpler option offers better total value.",
    y, SMALL, gap=17,
)
y = section("02 / SAMPLE ECONOMICS - ASSUMPTIONS, NOT ACHIEVED SAVINGS", y)

card_h = 62
gap = 12
card_w = (WIDTH - 2 * gap) / 3
cards = [
    ("Annual net benefit", money(RESULTS["annualNetBenefit"])),
    ("Simple value payback", format(RESULTS["paybackMonths"], ".1f") + " months"),
    ("First-year net value", money(RESULTS["firstYearNetValue"])),
]
for i, (label, value) in enumerate(cards):
    x = M + i * (card_w + gap)
    c.setFillColor(PALE)
    c.roundRect(x, y - card_h, card_w, card_h, 5, fill=1, stroke=0)
    text(label, x + 12, y - 17, 8.1, color=MUTED)
    text(value, x + 12, y - 43, 18, True, TEAL)
y -= card_h + 16

y = table([
    ["Entered input", "Sample assumption"],
    ["Transfers per year", format(INPUTS["annualTransfers"], ",")],
    ["Exceptions per 1,000 transfers", str(INPUTS["beforePerThousand"]) + " before / " + str(INPUTS["afterPerThousand"]) + " target"],
    ["Incremental value per avoided case", money(INPUTS["costPerException"])],
    ["Added time and support per year", money(INPUTS["annualExtraTimeCost"]) + " + " + money(INPUTS["annualSupportCost"])],
    ["Pilot and integration, one time", money(INPUTS["upfrontCost"])],
], [WIDTH * .58, WIDTH * .42], y)

y = para(
    "<b>Calculation:</b> " + format(RESULTS["avoidedExceptions"], ",.0f") + " avoided cases x "
    + money(INPUTS["costPerException"]) + " = " + money(RESULTS["grossAnnualBenefit"]) + " gross annual benefit. "
    "Subtract " + money(INPUTS["annualExtraTimeCost"]) + " added time and " + money(INPUTS["annualSupportCost"])
    + " support for " + money(RESULTS["annualNetBenefit"]) + " annual net benefit. Subtract "
    + money(INPUTS["upfrontCost"]) + " upfront for " + money(RESULTS["firstYearNetValue"]) + " first-year net value.",
    y, SMALL,
)
y = para(
    "<b>Downside:</b> a target of " + format(CASE["sensitivity"][1]["afterPerThousand"], ".0f")
    + " exceptions per 1,000 gives " + money(CASE["sensitivity"][1]["result"]["annualNetBenefit"])
    + " annual net benefit and " + format(CASE["sensitivity"][1]["result"]["paybackMonths"], ".1f")
    + "-month payback. With no improvement, annual net value is "
    + money(CASE["sensitivity"][0]["result"]["annualNetBenefit"]) + ". At these costs, a "
    + format(INPUTS["targetPaybackMonths"], ".0f") + "-month payback needs an after rate no higher than about "
    + format(RESULTS["breakEvenAfterPerThousand"], ".1f") + " per 1,000.",
    y, SMALL,
)
y = para(
    "Time saved is capacity, not cash, unless Finance confirms an avoided cost. "
    "Avoid double-counting downtime. The simple model excludes taxes, financing, and discounting. "
    "All cost and rate inputs are unverified placeholders; no simulation percentage is used as a production rate.",
    y, SMALL, gap=0,
)
footer(1)
c.showPage()

# Page 2: technical evidence, pilot sequence, and acceptance gates.
y = header(
    "EVIDENCE / VALIDATION PLAN",
    "Earn the next stage with evidence.",
    "The prototype models one-dimensional free sliding with known release speed. "
    "It has no live conveyor, PLC, camera, or physical safety integration.",
)
y = section("03 / OBSERVED IN SIMULATION", y)
evidence_rows = [["Successful runs / 100", "Fixed", "Passive", "Active", "Robust"]]
for label, batch in zip(("Unknown fixed friction", "Friction changes", "Extra unmodeled drag"), BATCHES):
    evidence_rows.append([label] + [str(batch["summary"][method]["successes"])
                                  for method in ("fixed", "passive", "active", "robust")])
y = table(evidence_rows, [WIDTH * .42] + [WIDTH * .145] * 4, y)
active = BATCHES[0]["summary"]["active"]["actions"]
passive = BATCHES[0]["summary"]["passive"]["actions"]
y = para(
    "1,200 MuJoCo runs. A run can use up to six glides; it is not one production transfer. "
    "On fixed friction, Active used " + format(active, ".2f") + " moves and Passive used "
    + format(passive, ".2f") + ". The extra " + format(active - passive, ".2f")
    + " moves must earn their cost. No between-strategy significance test was run.",
    y, SMALL, gap=15,
)
y = section("04 / SIX-WEEK PLANNING WINDOW", y)
y = table([
    ["Phase", "Required output"],
    ["Week 1 / Baseline", "Confirm intervention cost, cycle time, product groups, and cheaper alternatives. Agree on the minimum worthwhile effect."],
    ["Week 2 / Guarded bench", "Measure release speed and stopping error. Check model fit, fallback, and a safe test envelope."],
    ["Weeks 3-4 / Controlled trial", "Start with operator-reviewed recommendations. Use approved windows and matched or randomized product/shift blocks."],
    ["Weeks 5-6 / Decision", "Review all exceptions, added time, overrides, damage, uncertainty, and cost. Stop, extend, or separately approve a next stage."],
], [WIDTH * .29, WIDTH * .71], y)
y = section("05 / PROPOSED ACCEPTANCE AND STOP GATES", y)
for value in [
    "<b>Effect:</b> at least 20% lower intervention rate in matched groups, with pre-agreed uncertainty analysis.",
    "<b>Guardrails:</b> no more than 2% throughput loss; no worsening of damage, jams, or stop events.",
    "<b>Value:</b> measured costs meet the agreed payback target, including probe time and support.",
    "<b>Ownership:</b> approved equipment envelope, rollback, setting changes, and incident handling.",
]:
    y = para("- " + value, y, SMALL, gap=4)
y = para(
    "<b>Stop or redesign</b> if the model cannot explain real motion, release speed is unreliable, "
    "a simpler alternative wins, or added time removes the benefit. A positive calculator result never approves deployment.",
    y - 5, SMALL,
)
y = para(
    "Size the trial from measured baseline rarity, the minimum useful effect, and product/shift clustering. "
    "Six weeks is not a sample-size guarantee. Pricing and willingness to pay remain unvalidated.",
    y, SMALL,
)
y = para(
    'Industry context only: <link href="https://www.dornerconveyors.com/asia/blog/which-product-transfer-is-best-pros-and-cons-of-6-transfer-methods" color="#176454">Dorner: product-transfer methods</link>; '
    '<link href="https://blogs.sw.siemens.com/tecnomatix/virtual-commissioning-for-material-handling-in-just-minutes-for-free/" color="#176454">Siemens: virtual commissioning for material handling</link>. '
    "These sources support the problem domain and test workflow, not this prototype's performance.",
    y, SMALL, gap=0,
)
footer(2)
c.save()
print("Built " + OUTPUT.name + " (2 pages).")
