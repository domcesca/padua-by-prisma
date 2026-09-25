"""Plain-language dictionary for CDPH healthcare-associated infection (HAI) data.

Source: CDPH annual HAI datasets on the CHHS Open Data Portal, one per infection
type, reported by hospitals through CDC's National Healthcare Safety Network
(NHSN) under Health and Safety Code 1288.55.
"""

from __future__ import annotations

# Infection types: id -> labels, exposure measure, and rate convention.
# Rate units follow CDPH/NHSN: CLABSI per 1,000 central-line days, the rest per
# 10,000 patient days. VRE has no SIR: there is no national risk adjustment for it.
INFECTIONS: dict[str, dict] = {
    "clabsi": {
        "hai_prefix": "Central Line-Associated",
        "name": "Central line-associated bloodstream infection",
        "short": "CLABSI",
        "exposure": "central-line days",
        "exposure_column": "Central_Line_Days",
        "per": 1000,
        "has_sir": True,
        "why": "Bloodstream infections in ICU and ward patients with a central line. Largely preventable with insertion and maintenance bundles.",
        "drivers": [
            "Central-line insertion and maintenance practices (bundles, chlorhexidine bathing, daily review of whether the line is still needed).",
            "ICU census and acuity: more line days, sicker patients.",
            "Nurse staffing and use of travel or registry nurses unfamiliar with local protocols.",
            "Surveillance: how rigorously infection preventionists apply the NHSN definition.",
        ],
    },
    "cdi": {
        "hai_prefix": "Clostridioides difficile",
        "name": "C. difficile infection",
        "short": "C. diff",
        "exposure": "patient days",
        "exposure_column": "Patient_Days",
        "per": 10000,
        "has_sir": True,
        "why": "Hospital-onset C. difficile, a diarrheal infection spread in health care settings and driven by antibiotic use.",
        "drivers": [
            "Antibiotic stewardship: fewer and narrower antibiotics mean less C. diff.",
            "Testing practice: sensitive PCR testing without diagnostic stewardship finds colonized patients, raising reported rates.",
            "Environmental cleaning and contact precautions.",
            "Admission of more patients already carrying C. diff from nursing homes.",
        ],
    },
    "mrsa": {
        "hai_prefix": "Methicillin-Resistant",
        "name": "MRSA bloodstream infection",
        "short": "MRSA",
        "exposure": "patient days",
        "exposure_column": "Patient_Days",
        "per": 10000,
        "has_sir": True,
        "why": "Hospital-onset bloodstream infections with methicillin-resistant Staphylococcus aureus.",
        "drivers": [
            "Line and device care, since many MRSA bloodstream infections start at a catheter.",
            "Screening and decolonization of high-risk patients.",
            "Hand hygiene and contact precautions.",
            "Community MRSA prevalence among admitted patients.",
        ],
    },
    "vre": {
        "hai_prefix": "Vancomycin-Resistant",
        "name": "VRE bloodstream infection",
        "short": "VRE",
        "exposure": "patient days",
        "exposure_column": "Patient_Days",
        "per": 10000,
        "has_sir": False,
        "why": "Hospital-onset bloodstream infections with vancomycin-resistant enterococci, common in transplant, oncology, and ICU patients.",
        "drivers": [
            "Service mix: transplant, oncology, and dialysis patients carry much higher risk, so large academic centers run higher.",
            "Antibiotic use, especially vancomycin and broad-spectrum agents.",
            "Environmental cleaning and contact precautions.",
        ],
    },
}

_SIR_SUMMARY = (
    "Standardized infection ratio: infections the hospital reported divided by the number predicted for a hospital like it "
    "(NHSN's 2015 national baseline, adjusted for hospital type, size, and patient mix). Below 1 means fewer than predicted."
)
_SIR_CAUTION = (
    "An SIR is only calculated when at least 0.2 infections were predicted; below 1 predicted it's imprecise, so small "
    "hospitals swing a lot. Better / worse than predicted is decided by the 95% confidence interval, not by the SIR alone."
)

SECTIONS: dict[str, dict] = {
    "infections": {
        "title": "Healthcare-associated infections",
        "summary": "Hospital-onset infections reported to CDC's NHSN and published by CDPH each calendar year.",
        "drivers": [],
    },
}

METRICS: dict[str, dict] = {}
for key, info in INFECTIONS.items():
    rate_label = f"{info['short']} rate"
    rate_unit = f"per {info['per']:,} {info['exposure']}"
    if info["has_sir"]:
        METRICS[f"{key}Sir"] = {
            "category": "quality",
            "group": "Infections",
            "label": f"{info['short']} infection ratio (SIR)",
            "unit": "number",
            "decimals": 2,
            "summary": f"{info['name']}: {_SIR_SUMMARY}",
            "formula": f"Infections reported ÷ infections predicted ({info['short']}, NHSN 2015 baseline)",
            "inputs": [],
            "higherIsBetter": False,
            "caution": _SIR_CAUTION,
            "comparedTo": "predicted",
            "reference": 1,
            "companion": f"{key}Rate",
            "drivers": info["drivers"],
        }
    METRICS[f"{key}Rate"] = {
        "category": "quality",
        "group": "Infections",
        "label": rate_label,
        "unit": "number",
        "decimals": 2,
        "unitLabel": rate_unit,
        "summary": f"{info['name']}: infections reported {rate_unit}. {info['why']}",
        "formula": f"Infections reported ÷ {info['exposure']} × {info['per']:,}",
        "inputs": [],
        "higherIsBetter": False,
        "caution": (
            "Not risk-adjusted: no national method exists for VRE, so hospitals with transplant, oncology, and ICU services "
            "run higher. CDPH compares each hospital with the average rate for its hospital type and size."
            if not info["has_sir"]
            else "Not risk-adjusted. Use the SIR to compare hospitals; the rate shows the raw frequency."
        ),
        **({"companionOf": f"{key}Sir"} if info["has_sir"] else {"comparedTo": "the average for similar California hospitals"}),
        "drivers": info["drivers"],
    }


def export() -> dict:
    return {
        "dataset": "cdph-hai",
        "source": "CDPH Healthcare-Associated Infections in California Hospitals (annual datasets and data dictionaries)",
        "sections": [{"id": k, **v} for k, v in SECTIONS.items()],
        "fields": [],
        "metrics": [{"id": k, **v} for k, v in METRICS.items()],
        "payerGroups": [],
    }
