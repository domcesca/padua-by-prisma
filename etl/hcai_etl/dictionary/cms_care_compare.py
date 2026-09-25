"""Plain-language dictionary for the CMS Care Compare hospital measures the app uses.

Source: CMS Provider Data Catalog, Hospitals theme (Care Compare), quarterly
archived snapshots. Each measure covers a rolling period (up to three years), so
the app files a value under the year its period ENDS and shows the period.
"""

from __future__ import annotations

_COVID_GAP = (
    "CMS left January–June 2020 out of these measures because of COVID-19, so no published period ends in 2020 and "
    "periods around it overlap less."
)
_ROLLING = "Each value covers a rolling multi-year period, so neighboring years share most of their patients; read the trend, not single-year jumps."

READM_DRIVERS = [
    "Discharge planning and follow-up: medication reconciliation, follow-up visits booked before discharge, transitional care calls.",
    "Access to post-acute care (skilled nursing, home health) and primary care in the community.",
    "Patient social risk (housing, income, language), which CMS's risk adjustment only partly captures.",
    "Observation stays and ED treat-and-release visits, which don't count as readmissions.",
]
MORT_DRIVERS = [
    "Timeliness and reliability of treatment protocols for the condition.",
    "Transfers: hospitals that send sick patients elsewhere, or receive them, see different risk.",
    "Hospice and palliative care use near the end of life.",
    "Coding completeness of patients' other conditions, which feeds CMS's risk adjustment.",
]
HCAHPS_DRIVERS = [
    "Nurse and physician communication, responsiveness, and discharge information.",
    "Staffing levels and turnover.",
    "Facility factors: noise at night, cleanliness, private rooms.",
    "Patient mix: survey responses differ by age, language, and health status (CMS adjusts for some of this).",
]

# id -> definition. `source` names the Care Compare file, `cms` the measure IDs
# (first match wins; renamed IDs listed together), `value` the column holding it.
MEASURES: dict[str, dict] = {
    # -- readmissions --------------------------------------------------------
    "readmHospitalWide": {
        "source": "unplanned", "cms": ["READM_30_HOSP_WIDE"], "group": "Readmissions",
        "label": "Hospital-wide readmission rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare fee-for-service patients readmitted to any hospital for any reason within 30 days of discharge, risk-standardized. One-year period.",
        "caution": "CMS retired this claims-based measure after the period ending June 2023 and replaced it with the hybrid measure (claims plus EHR data), shown separately because the two aren't comparable.",
        "drivers": READM_DRIVERS,
    },
    "readmHybrid": {
        "source": "unplanned", "cms": ["Hybrid_HWR"], "group": "Readmissions",
        "label": "Hospital-wide readmission rate (hybrid)", "unit": "pct", "higherIsBetter": False,
        "summary": "CMS's replacement hospital-wide readmission measure, risk-adjusted with clinical data from the hospital's EHR as well as claims. One-year period.",
        "caution": "Started with the period ending June 2024; not comparable with the older claims-based rate.",
        "drivers": READM_DRIVERS,
    },
    "readmHf": {
        "source": "unplanned", "cms": ["READM_30_HF"], "group": "Readmissions",
        "label": "Heart failure readmission rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare heart failure patients readmitted within 30 days, risk-standardized. Three-year period. Penalized under the Hospital Readmissions Reduction Program.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": READM_DRIVERS,
    },
    "readmPn": {
        "source": "unplanned", "cms": ["READM_30_PN"], "group": "Readmissions",
        "label": "Pneumonia readmission rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare pneumonia patients readmitted within 30 days, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP} CMS withheld pneumonia results for the period ending June 2021.", "drivers": READM_DRIVERS,
    },
    "readmAmi": {
        "source": "unplanned", "cms": ["READM_30_AMI"], "group": "Readmissions",
        "label": "Heart attack readmission rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare heart attack (AMI) patients readmitted within 30 days, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": READM_DRIVERS,
    },
    "readmCopd": {
        "source": "unplanned", "cms": ["READM_30_COPD"], "group": "Readmissions",
        "label": "COPD readmission rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare COPD patients readmitted within 30 days, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": READM_DRIVERS,
    },
    "readmHipKnee": {
        "source": "unplanned", "cms": ["READM_30_HIP_KNEE"], "group": "Readmissions",
        "label": "Hip/knee replacement readmission rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare elective hip or knee replacement patients readmitted within 30 days, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": READM_DRIVERS,
    },
    # -- mortality & safety --------------------------------------------------
    "mortHybrid": {
        "source": "complications", "cms": ["Hybrid_HWM"], "group": "Mortality & safety",
        "label": "Hospital-wide mortality rate (hybrid)", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare patients who died within 30 days of admission for any condition, risk-standardized with claims and EHR data. One-year period.",
        "caution": "New measure; first published for the period ending June 2024.",
        "drivers": MORT_DRIVERS,
    },
    "mortHf": {
        "source": "complications", "cms": ["MORT_30_HF"], "group": "Mortality & safety",
        "label": "Heart failure mortality rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare heart failure patients who died within 30 days of admission, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": MORT_DRIVERS,
    },
    "mortPn": {
        "source": "complications", "cms": ["MORT_30_PN"], "group": "Mortality & safety",
        "label": "Pneumonia mortality rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare pneumonia patients who died within 30 days of admission, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP} CMS withheld pneumonia results for the period ending June 2021.", "drivers": MORT_DRIVERS,
    },
    "mortAmi": {
        "source": "complications", "cms": ["MORT_30_AMI"], "group": "Mortality & safety",
        "label": "Heart attack mortality rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare heart attack (AMI) patients who died within 30 days of admission, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": MORT_DRIVERS,
    },
    "mortCopd": {
        "source": "complications", "cms": ["MORT_30_COPD"], "group": "Mortality & safety",
        "label": "COPD mortality rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare COPD patients who died within 30 days of admission, risk-standardized. Three-year period.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": MORT_DRIVERS,
    },
    "mortStroke": {
        "source": "complications", "cms": ["MORT_30_STK"], "group": "Mortality & safety",
        "label": "Stroke mortality rate", "unit": "pct", "higherIsBetter": False,
        "summary": "Share of Medicare stroke patients who died within 30 days of admission, risk-standardized.",
        "caution": f"{_ROLLING} {_COVID_GAP}", "drivers": MORT_DRIVERS,
    },
    "psi90": {
        "source": "complications", "cms": ["PSI_90", "PSI_90_SAFETY"], "group": "Mortality & safety",
        "label": "Patient safety composite (PSI 90)", "unit": "number", "decimals": 2, "higherIsBetter": False, "reference": 1,
        "summary": "AHRQ's composite of serious in-hospital complications (pressure ulcers, falls with fracture, post-op sepsis, blood clots, and others), as a ratio to the expected number. Below 1 is better than expected. Two-year period.",
        "caution": f"Feeds the Hospital-Acquired Condition Reduction Program penalty. Driven by coding: how completely complications and present-on-admission conditions are documented. {_ROLLING}",
        "drivers": [
            "Clinical documentation and coding of complications and present-on-admission conditions.",
            "Surgical volume and complexity.",
            "Fall, pressure injury, and VTE prevention programs.",
        ],
    },
    # -- patient experience --------------------------------------------------
    "hcahpsStar": {
        "source": "hcahps", "cms": ["H_STAR_RATING"], "value": "Patient Survey Star Rating", "group": "Patient experience",
        "label": "Patient experience star rating", "unit": "number", "decimals": 0, "unitLabel": "stars (1–5)", "higherIsBetter": True,
        "summary": "CMS's 1–5 star summary of the HCAHPS patient survey across all its topics. Four quarters of surveys.",
        "caution": "Stars are relative: CMS sets cut points so the national distribution is spread across 1–5. California hospitals typically score below the national average on HCAHPS.",
        "drivers": HCAHPS_DRIVERS,
    },
    "hcahpsRating": {
        "source": "hcahps", "cms": ["H_HSP_RATING_9_10"], "value": "HCAHPS Answer Percent", "group": "Patient experience",
        "label": "Patients rating the hospital 9–10", "unit": "pct", "higherIsBetter": True,
        "summary": "Share of surveyed patients who rated the hospital 9 or 10 out of 10. Four quarters of surveys.",
        "drivers": HCAHPS_DRIVERS,
    },
    "hcahpsRecommend": {
        "source": "hcahps", "cms": ["H_RECMND_DY"], "value": "HCAHPS Answer Percent", "group": "Patient experience",
        "label": "Patients who would definitely recommend", "unit": "pct", "higherIsBetter": True,
        "summary": "Share of surveyed patients who would definitely recommend the hospital to friends and family. Four quarters of surveys.",
        "drivers": HCAHPS_DRIVERS,
    },
    # -- timely & effective care ---------------------------------------------
    "edTimeToDeparture": {
        "source": "timely", "cms": ["OP_18b"], "group": "Timely care",
        "label": "ED time to departure (median)", "unit": "number", "decimals": 0, "unitLabel": "minutes", "higherIsBetter": False,
        "summary": "Median minutes from arrival to departure for ED patients who were sent home (not admitted). About a year of visits.",
        "drivers": [
            "Boarding: admitted patients waiting for beds tie up ED rooms.",
            "Triage, fast-track, and provider-in-triage processes.",
            "Lab and imaging turnaround.",
            "ED volume and staffing.",
        ],
    },
    "sepsisBundle": {
        "source": "timely", "cms": ["SEP_1"], "group": "Timely care",
        "label": "Sepsis care bundle compliance", "unit": "pct", "higherIsBetter": True,
        "summary": "Share of severe sepsis and septic shock patients who got every element of CMS's SEP-1 bundle (lactate, cultures, antibiotics, fluids, reassessment) on time.",
        "caution": "All-or-nothing: missing one element or its documentation fails the case, so documentation practices move this a lot.",
        "drivers": [
            "Sepsis screening and order sets in the ED and on the floors.",
            "Documentation of each bundle element and its timing.",
            "Abstraction sample size at smaller hospitals.",
        ],
    },
    "overallStar": {
        "source": "general", "cms": [], "value": "Hospital overall rating", "group": "Overall",
        "label": "CMS overall star rating", "unit": "number", "decimals": 0, "unitLabel": "stars (1–5)", "higherIsBetter": True,
        "summary": "CMS's 1–5 star summary across mortality, safety, readmission, patient experience, and timely and effective care. Filed under the year CMS published it.",
        "caution": "Built from measures covering several earlier years. Hospitals without enough measures get no rating.",
        "drivers": [
            "Every underlying measure group, weighted: mortality, safety, readmission, patient experience (22% each), timely and effective care (12%).",
            "Peer grouping: CMS compares hospitals that report a similar number of measure groups.",
        ],
    },
}

SECTIONS: dict[str, dict] = {
    "care_compare": {
        "title": "CMS Care Compare",
        "summary": "Hospital quality measures CMS publishes quarterly on Care Compare, mostly for Medicare patients.",
        "drivers": [],
    },
}

METRIC_KEYS = ("group", "label", "unit", "decimals", "unitLabel", "reference", "summary", "higherIsBetter", "caution", "drivers")


def export() -> dict:
    metrics = []
    for key, m in MEASURES.items():
        entry = {"id": key, "category": "quality", **{k: m[k] for k in METRIC_KEYS if k in m}}
        entry["formula"] = f"CMS measure {' / '.join(m['cms'])}" if m["cms"] else "CMS Hospital overall rating"
        entry["inputs"] = []
        if m["source"] in ("unplanned", "complications"):
            entry["comparedTo"] = "the national rate"
        metrics.append(entry)
    return {
        "dataset": "cms-care-compare",
        "source": "CMS Provider Data Catalog — Hospitals (Care Compare), archived quarterly snapshots",
        "sections": [{"id": k, **v} for k, v in SECTIONS.items()],
        "fields": [],
        "metrics": metrics,
        "payerGroups": [],
    }
