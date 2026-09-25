"""Facility-level helpers shared by every dataset pipeline.

HCAI identifies a hospital by its 9-digit facility number (FAC_NO, e.g.
106190555) in every dataset, so outputs from different pipelines join on it.
"""

from __future__ import annotations

import re

# HCAI financial TYPE_CNTRL and utilization LICEE_TOC -> app ownership group.
OWNERSHIP_LABELS = {
    # Annual Financial Data (TYPE_CNTRL)
    "Non-Profit": "nonprofit",
    "Investor": "investor",
    "District": "district",
    "City/County": "government",
    "Government": "government",
    "State": "state",
    # Annual Utilization (LICEE_TOC — licensee type of control)
    "Non-Profit Corporation (including church-related)": "nonprofit",
    "Investor - Corporation": "investor",
    "Investor - Limited Liability Company": "investor",
    "Investor - Partnership": "investor",
    "Investor - Individual": "investor",
    "District": "district",
    "City or County": "government",
    "University of California": "government",
}


def ownership_group(value) -> str:
    if not isinstance(value, str):
        return "other"
    return OWNERSHIP_LABELS.get(value.strip(), "other")


def title_case(value):
    if not isinstance(value, str):
        return value
    return " ".join(w.capitalize() for w in value.split())


# Tokens kept upper-case when prettifying ALL-CAPS HCAI facility names.
ACRONYMS = {
    "UC", "UCLA", "UCSF", "UCI", "USC", "LAC", "MLK", "VA", "CHOC", "CPMC", "LLC", "II", "III",
    "EHS", "DBA", "SF", "SJ", "HCA", "PHF", "UCSD", "UCD", "OC", "CMC", "LP", "NICU", "RCH", "AHMC", "BHC", "PIH", "SRM", "CA",
    "APH",
}
SMALL_WORDS = {"of", "and", "the", "at", "in", "for", "on"}


def _pretty_token(token: str) -> str:
    core = re.sub(r"[^A-Za-z]", "", token)
    if core.upper() in ACRONYMS or (
        len(core) > 1 and "." not in token and not re.search(r"[AEIOUY]", core.upper())
    ):
        return token.upper()
    return token[:1].upper() + token[1:].lower() if token else token


def display_name(value: str) -> str:
    """'KAISER FOUNDATION HOSPITAL - SAN JOSE' -> 'Kaiser Foundation Hospital - San Jose'."""
    out = []
    for i, word in enumerate(value.split()):
        if i > 0 and word.lower() in SMALL_WORDS:
            out.append(word.lower())
            continue
        # Treat "LAC/HARBOR" and "UCI HEALTH-LAKEWOOD" parts independently.
        parts = re.split(r"([-/])", word)
        out.append("".join(p if p in "-/" else _pretty_token(p) for p in parts))
    return " ".join(out)
