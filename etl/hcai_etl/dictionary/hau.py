"""Data dictionary for the HCAI Hospital Annual Utilization Report.

Sources:
  * HCAI "Instructions for Completing the Annual Utilization Report of
    Hospitals" (11/01/2024) and the 2024 reporting form — page/line numbers
    below refer to that form.
  * The data file's own "Page.Column.Line" header rows.
  * Plain-language labels, summaries, and "why it moves" drivers are written for
    hospital administrators and are editorial, not HCAI reporting instructions.

The inpatient table (report page 3) is a grid of bed types × measures, so those
~110 fields are generated from BED_TYPES and BED_MEASURES; everything else is
listed explicitly.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Sections
# --------------------------------------------------------------------------- #

SECTIONS: dict[str, dict] = {
    "report": {
        "title": "Report information",
        "summary": "Which report the numbers came from and the period it covers.",
        "drivers": [],
    },
    "profile": {
        "title": "Hospital profile",
        "summary": "License, ownership, location, and designations (page 1–2).",
        "drivers": [],
    },
    "beds": {
        "title": "Licensed beds",
        "summary": "Beds on the hospital's license by type on December 31, filled in by HCAI from CDPH licensing data (page 3, column 1).",
        "drivers": [
            "License changes: units opened, closed, or converted from one bed type to another.",
            "Beds placed in suspense (temporarily out of service, e.g. for seismic work) still count as licensed.",
            "A campus consolidated onto another hospital's license moves its beds to that license.",
        ],
    },
    "bed_days": {
        "title": "Licensed bed days",
        "summary": "Licensed beds × the days each was licensed during the year — the denominator for occupancy (page 3, column 2).",
        "drivers": [
            "Changes in licensed beds, prorated by when during the year they happened.",
            "Leap years add a day for every bed.",
        ],
    },
    "discharges": {
        "title": "Discharges & transfers",
        "summary": "Patients discharged (including deaths) from each type of bed, and transfers out of critical care units (page 3, columns 3–4).",
        "drivers": [
            "Admission volume: service-line growth, physician recruitment or departures, a competitor opening or closing.",
            "Moving a patient to a different type of care (e.g. acute to skilled nursing) counts as a discharge and a new admission.",
            "Respiratory-virus seasons and the 2020–21 COVID surges.",
        ],
    },
    "census_days": {
        "title": "Patient (census) days",
        "summary": "Total inpatient days by bed type; a patient admitted and discharged the same day counts as one day (page 3, column 5).",
        "drivers": [
            "Admissions × length of stay: either one moving shifts days.",
            "Discharge delays — waiting for a skilled nursing or psychiatric placement — add days without adding patients.",
            "Units opening, closing, or converting.",
        ],
    },
    "alos": {
        "title": "Average length of stay",
        "summary": "Patient days ÷ discharges for each bed type; critical care units also count transfers out (page 3, column 6).",
        "drivers": [
            "Case mix: sicker or more complex patients stay longer.",
            "Placement delays for patients who no longer need acute care.",
            "Care management and discharge planning programs.",
        ],
        "caution": "Recalculated here from days and discharges, so it matches HCAI's figure for single-campus hospitals and correctly combines campuses on one license.",
    },
    "psych": {
        "title": "Acute psychiatric patients",
        "summary": "A snapshot of acute psychiatric inpatients on December 31, by unit type, age, and payer (page 3, lines 43–65).",
        "drivers": [
            "A single-day count, so it moves with that day's census and can swing a lot for small units.",
            "County contracts (Short-Doyle) and Medi-Cal managed-care behavioral health changes shift the payer split.",
        ],
    },
    "programs": {
        "title": "Hospice & palliative care",
        "summary": "Whether the hospital runs inpatient hospice or palliative care programs, and the program's staffing (page 3, lines 70–90).",
        "drivers": ["Program launches or closures; staff certification drives."],
    },
    "ed": {
        "title": "Emergency department",
        "summary": "ED designation, visits by severity, admissions, treatment stations, walkouts, and ambulance diversion (page 4).",
        "drivers": [
            "Respiratory-virus seasons, the 2020 COVID drop, and nearby urgent-care or ED openings and closures.",
            "Medi-Cal enrollment swings (the 2023–24 end of continuous coverage, the 2024 expansion to undocumented adults).",
            "Coding changes: the 2023 CPT revision of ED visit levels (99281–99285) shifted visits between severity levels.",
            "Inpatient bed availability: boarding admitted patients in the ED causes walkouts and diversion.",
        ],
    },
    "surgery": {
        "title": "Surgery",
        "summary": "Surgical operations, operating room minutes, and operating rooms (page 5, lines 1–15).",
        "drivers": [
            "Surgeon recruitment and departures; new service lines (robotics, orthopedics, spine).",
            "Cases moving to ambulatory surgery centers, often owned by the same system but reported separately.",
            "Elective surgery shutdowns in 2020 and staffing-related cancellations.",
        ],
    },
    "births": {
        "title": "Births",
        "summary": "Live births and low-birth-weight births (page 5, lines 20–37).",
        "drivers": [
            "Falling California birth rates and labor & delivery unit closures, especially at rural hospitals.",
        ],
        "caution": "HCAI's public data files leave these fields blank from 2022 on.",
    },
    "cardiac": {
        "title": "Cardiac surgery & catheterization",
        "summary": "Open-heart surgery, cardiac cath lab visits, and cath procedures by type (page 5, lines 41–84).",
        "drivers": [
            "Cardiologist and cardiac surgeon recruitment; opening or closing a cath lab or heart program.",
            "Procedures shifting to outpatient settings.",
        ],
    },
    "capital": {
        "title": "Major equipment & capital projects",
        "summary": "Equipment over $500,000 acquired and capital projects over $1 million in the year (page 6).",
        "drivers": ["Construction cycles, seismic compliance projects (SB 1953), and major imaging or robotics purchases."],
    },
}


def f(section, hcai, label, summary, unit, drivers=None, caution=None):
    entry = {"section": section, "hcaiLabel": hcai, "label": label, "summary": summary, "unit": unit}
    if drivers:
        entry["drivers"] = drivers
    if caution:
        entry["caution"] = caution
    return entry


# --------------------------------------------------------------------------- #
# Inpatient grid (page 3): bed types × measures
# --------------------------------------------------------------------------- #

# prefix -> (plain label, HCAI line label, prefix variants used by specific measures)
BED_TYPES: dict[str, tuple[str, str]] = {
    "MED_SURG": ("Medical/surgical", "Medical/Surgical"),
    "PERINATAL": ("Perinatal (obstetrics)", "Perinatal"),
    "PEDIATRIC": ("Pediatric", "Pediatric"),
    "IC": ("Intensive care (ICU)", "Intensive Care"),
    "CORONARY_CARE": ("Coronary care (CCU)", "Coronary Care"),
    "ACUTE_RESPIRATORY_CARE": ("Acute respiratory care", "Acute Respiratory Care"),
    "BURN": ("Burn unit", "Burn"),
    "IC_NEWBORN": ("Neonatal intensive care (NICU)", "Intensive Care Newborn Nursery"),
    "REHAB_CTR": ("Acute rehabilitation", "Rehabilitation Center"),
    "GAC_SUBTOT": ("General acute care, all units", "General Acute Care Subtotal"),
    "CHEM_DEPEND_RECOVERY": ("Chemical dependency recovery hospital beds", "Chemical Dependency Recovery Hospital"),
    "ACUTE_PSYCHIATRIC": ("Acute psychiatric", "Acute Psychiatric"),
    "SN": ("Skilled nursing", "Skilled Nursing"),
    "INTERMEDIATE_CARE": ("Intermediate care", "Intermediate Care"),
    "INTERMEDIATE_CARE_DEV_DIS": ("Intermediate care, developmentally disabled", "Intermediate Care/Developmentally Disabled"),
    "TOT": ("All bed types", "Total"),
    "GAC_CDRS": ("Chemical dependency services in general acute beds", "Chemical Dependency Recovery Services in Licensed GAC Beds"),
    "ACUTE_PSYCH": ("Chemical dependency services in acute psychiatric beds", "Chemical Dependency Recovery Services in Licensed Acute Psychiatric Beds"),
}

# Irregular column prefixes: (variant, canonical BED_TYPES key, suffixes that use it).
PREFIX_VARIANTS = [
    ("CHEM_DEPEND_RECOV", "CHEM_DEPEND_RECOVERY", ("_CEN_DAYS", "_ALOS_CY")),
    ("ACUTE_PSYCH_CDRS", "ACUTE_PSYCH", ("_ALOS_CY",)),
]

CRITICAL_CARE = {"IC", "CORONARY_CARE", "ACUTE_RESPIRATORY_CARE", "BURN", "IC_NEWBORN"}

# suffix -> (section, measure label, HCAI column label, unit, summary template)
BED_MEASURES: dict[str, tuple[str, str, str, str, str]] = {
    "_LIC_BEDS": ("beds", "licensed beds", "Licensed Beds", "beds", "{label} beds on the hospital's license on December 31."),
    "_LIC_BED_DAYS": ("bed_days", "licensed bed days", "Licensed Bed Days", "days", "{label} beds × days licensed during the year; the denominator for occupancy."),
    "_DISCHARGES": ("discharges", "discharges", "Hospital Discharges", "count", "Patients discharged from {lower} beds, including deaths and transfers to another type of care."),
    "_INTRA_TRANSFERS": ("discharges", "transfers out", "Intra-Hospital Transfers", "count", "Patients moved from {lower} to a general acute bed before leaving the hospital."),
    "_CEN_DAYS": ("census_days", "patient days", "Patient (Census) Days", "days", "Inpatient days in {lower} beds during the year."),
    "_ALOS_CY": ("alos", "average length of stay", "Average Length of Stay", "days", "Average days per stay in {lower} beds: patient days ÷ discharges{transfers}."),
}


def _bed_grid() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for suffix, (section, measure, hcai_measure, unit, template) in BED_MEASURES.items():
        for prefix, (label, hcai_label) in BED_TYPES.items():
            if suffix == "_INTRA_TRANSFERS" and prefix not in CRITICAL_CARE | {"SN"}:
                continue
            if suffix in {"_LIC_BED_DAYS"} and prefix in {"GAC_CDRS", "ACUTE_PSYCH"}:
                continue
            lower = label[0].lower() + label[1:] if not label.startswith(("NICU", "ICU")) else label
            summary = template.format(
                label=label,
                lower=lower,
                transfers=" (+ transfers out)" if prefix in CRITICAL_CARE else "",
            )
            if prefix == "SN" and suffix == "_INTRA_TRANSFERS":
                summary = "Patients moved from skilled nursing back to a general acute bed."
            caution = None
            if prefix == "GAC_SUBTOT":
                summary += " Sum of the nine general acute bed types."
            if prefix == "TOT":
                summary = summary.replace("all bed types beds", "all beds").replace("in all bed types beds", "across all beds")
            if prefix in {"GAC_CDRS", "ACUTE_PSYCH"}:
                caution = "Already included in the general acute or acute psychiatric totals — don't add it again."
            out[f"{prefix}{suffix}"] = f(
                section,
                f"{hcai_label} — {hcai_measure}",
                f"{label[0].upper() + label[1:]} {measure}" if prefix != "TOT" else f"Total {measure}",
                summary,
                unit,
                caution=caution,
            )
    # Column names that use the irregular prefixes.
    for variant, canonical, suffixes in PREFIX_VARIANTS:
        for suffix in suffixes:
            key = f"{canonical}{suffix}"
            if key in out:
                out[f"{variant}{suffix}"] = out.pop(key)
    return out


# --------------------------------------------------------------------------- #
# Everything else, explicitly
# --------------------------------------------------------------------------- #

ED_DRIVERS = SECTIONS["ed"]["drivers"]

EXPLICIT: dict[str, dict] = {
    # -- Report information
    "FAC_OPERATED_THIS_YR": f("report", "Facility Operated This Year", "Operated this year", "Whether the hospital operated at any point in the year.", "text"),
    "FAC_OP_PER_BEGIN_DT": f("report", "Operation Period Begin Date", "Period start", "First day of the period this report covers — January 1 unless the hospital opened mid-year.", "date"),
    "FAC_OP_PER_END_DT": f("report", "Operation Period End Date", "Period end", "Last day of the period — December 31 unless the hospital closed or changed licensee.", "date"),
    "REPT_PREP_NAME": f("report", "Report Prepared By", "Prepared by", "Person who prepared the report.", "text"),
    "SUBMITTED_DT": f("report", "Submitted Date", "Submitted", "Date the report was submitted in SIERA.", "date"),
    "REV_REPT_PREP_NAME": f("report", "Revised Report Prepared By", "Revised by", "Person who prepared a revision.", "text"),
    "REVISED_DT": f("report", "Revised Date", "Revised", "Date of the latest revision.", "date"),
    "CORRECTED_DT": f("report", "Corrected Date", "Corrected", "Date of the latest HCAI correction.", "date"),
    # -- Profile
    "FAC_NO": f("profile", "Facility Number", "HCAI facility number", "HCAI's 9-digit ID for the facility; the same ID used in the financial data.", "code"),
    "FAC_NAME": f("profile", "Facility Name", "Facility name", "Name on the license.", "text"),
    "FAC_STR_ADDR": f("profile", "Street Address", "Address", "Street address.", "text"),
    "FAC_CITY": f("profile", "City", "City", "City.", "text"),
    "FAC_ZIP": f("profile", "Zip Code", "ZIP code", "ZIP code.", "code"),
    "FAC_PHONE": f("profile", "Phone", "Phone", "Main phone number.", "text"),
    "FAC_ADMIN_NAME": f("profile", "Administrator Name", "Administrator", "Chief executive or administrator.", "text"),
    "FAC_PAR_CORP_NAME": f("profile", "Parent Corporation Name", "Parent organization", "Health system or parent corporation, if any.", "text"),
    "FAC_PAR_CORP_BUS_ADDR": f("profile", "Parent Corporation Address", "Parent address", "Parent organization's address.", "text"),
    "FAC_PAR_CORP_CITY": f("profile", "Parent Corporation City", "Parent city", "Parent organization's city.", "text"),
    "FAC_PAR_CORP_STATE": f("profile", "Parent Corporation State", "Parent state", "Parent organization's state.", "text"),
    "FAC_PAR_CORP_ZIP": f("profile", "Parent Corporation Zip", "Parent ZIP", "Parent organization's ZIP code.", "code"),
    "LICENSE_NO": f("profile", "License Number", "CDPH license number", "Campuses that share a license number report financials together; this app combines their utilization to match.", "code"),
    "LICENSE_EFF_DATE": f("profile", "License Effective Date", "License effective", "Start of the current license.", "date"),
    "LICENSE_EXP_DATE": f("profile", "License Expiration Date", "License expires", "Expiration of the current license.", "date"),
    "LICENSE_STATUS": f("profile", "License Status", "License status", "Open, Closed, or Suspense.", "text"),
    "FACILITY_LEVEL": f("profile", "Facility Level", "Facility level", "Parent facility (holds the license), consolidated facility (another campus on it), or distinct part.", "text"),
    "TRAUMA_CTR": f("profile", "Trauma Center", "Trauma center", "Adult and pediatric trauma center levels.", "text"),
    "TEACH_HOSP": f("profile", "Teaching Hospital", "Teaching hospital", "Whether HCAI classifies the hospital as a teaching hospital.", "text"),
    "TEACH_RURAL": f("profile", "Small and Rural Hospital", "Small & rural", "Whether the hospital is a designated small and rural hospital.", "text"),
    "LONGITUDE": f("profile", "Longitude", "Longitude", "Location, used here to find nearby hospitals.", "code"),
    "LATITUDE": f("profile", "Latitude", "Latitude", "Location, used here to find nearby hospitals.", "code"),
    "ASSEMBLY_DIST": f("profile", "Assembly District", "Assembly district", "California State Assembly district.", "code"),
    "SENATE_DIST": f("profile", "Senate District", "Senate district", "California State Senate district.", "code"),
    "CONGRESS_DIST": f("profile", "Congressional District", "Congressional district", "U.S. House district.", "code"),
    "CENSUS_KEY": f("profile", "Census Key", "Census tract", "Census tract key.", "code"),
    "MED_SVC_STUDY_AREA": f("profile", "Medical Service Study Area", "Medical Service Study Area", "HCAI's sub-county planning area (MSSA).", "code"),
    "LA_COUNTY_SVC_PLAN_AREA": f("profile", "LA County Service Planning Area", "LA County service area", "Los Angeles County Service Planning Area, if applicable.", "text"),
    "HEALTH_SVC_AREA": f("profile", "Health Service Area", "Health Service Area", "One of California's 14 regional health planning areas.", "text"),
    "COUNTY": f("profile", "County", "County", "County.", "text"),
    "LIC_CAT": f("profile", "License Category", "License category", "General acute care, acute psychiatric, psychiatric health facility, or chemical dependency recovery.", "text"),
    "LICEE_TOC": f("profile", "Licensee Type of Control", "Ownership (licensee)", "Type of organization that holds the license: nonprofit, investor, district, city/county, UC, or state.", "text"),
    "PRIN_SERVICE_TYPE": f("profile", "Principal Service Type", "Principal service", "Service used by most of the hospital's patient days (general medical/surgical, psychiatric, pediatric, rehab…).", "text"),
    # -- Beds, other (page 3)
    "NEWBORN_NURSERY_BASSINETS": f("beds", "Newborn Nursery Bassinets", "Newborn nursery bassinets", "Bassinets in the normal newborn nursery on December 31.", "beds"),
    "GEN_ACUTE_CARE_SN_SWING_BEDS": f("beds", "Skilled Nursing Swing Beds", "Swing beds", "General acute beds also approved for skilled nursing care — common at small and rural hospitals.", "beds"),
    "NEWBORN_NURSERY_INFANTS": f("discharges", "Nursery Infants", "Nursery discharges", "Newborns discharged from the normal nursery (not counted in hospital discharges).", "count", drivers=SECTIONS["births"]["drivers"]),
    "NEWBORN_NURSERY_CEN_DAYS": f("census_days", "Nursery Days", "Nursery days", "Days newborns spent in the normal nursery (not counted in patient days).", "days", drivers=SECTIONS["births"]["drivers"]),
    # -- Psych snapshot
    "ACUTE_PSYCHIATRIC_PATS_LOCKED_ON_1231": f("psych", "Acute Psychiatric Patients — Locked Unit", "Psych patients, locked units", "Acute psychiatric inpatients in locked units on December 31.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_OPEN_ON_1231": f("psych", "Acute Psychiatric Patients — Open Unit", "Psych patients, open units", "Acute psychiatric inpatients in open units on December 31.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_TOT_BY_UNIT_ON_1231": f("psych", "Acute Psychiatric Total (By Unit)", "Psych patients on Dec 31", "Total acute psychiatric inpatients on December 31.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_0_TO_17_ON_1231": f("psych", "Acute Psychiatric Patients — Age 0–17", "Psych patients, age 0–17", "Children and adolescents in acute psychiatric beds on December 31.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_18_TO_64_ON_1231": f("psych", "Acute Psychiatric Patients — Age 18–64", "Psych patients, age 18–64", "Adults 18–64 in acute psychiatric beds on December 31.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_65_AND_UP_ON_1231": f("psych", "Acute Psychiatric Patients — Age 65+", "Psych patients, age 65+", "Adults 65 and older in acute psychiatric beds on December 31.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_TOT_BY_AGE_ON_1231": f("psych", "Acute Psychiatric Total (By Age)", "Psych patients (by age total)", "Same total, counted by age.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_MED_TRAD_ON_1231": f("psych", "Acute Psychiatric Patients — Medicare Traditional", "Psych patients, Medicare FFS", "Psych inpatients on December 31 covered by traditional Medicare.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_MED_MANAGED_CARE_ON_1231": f("psych", "Acute Psychiatric Patients — Medicare Managed Care", "Psych patients, Medicare Advantage", "Psych inpatients on December 31 covered by Medicare Advantage.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_MED_CAL_TRAD_ON_1231": f("psych", "Acute Psychiatric Patients — Medi-Cal Traditional", "Psych patients, Medi-Cal FFS", "Psych inpatients on December 31 covered by fee-for-service Medi-Cal.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_MED_CAL_MANAGED_CARE_ON_1231": f("psych", "Acute Psychiatric Patients — Medi-Cal Managed Care", "Psych patients, Medi-Cal managed care", "Psych inpatients on December 31 covered by a Medi-Cal managed care plan.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_COUNTY_INDIGENT_PROG": f("psych", "Acute Psychiatric Patients — County Indigent Programs", "Psych patients, county programs", "Psych inpatients on December 31 covered by county indigent programs.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_3RD_PARTIES_TRAD": f("psych", "Acute Psychiatric Patients — Other Third Parties Traditional", "Psych patients, commercial (non-managed)", "Psych inpatients on December 31 with commercial indemnity coverage.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_3RD_PARTIES_MANAGED_CARE": f("psych", "Acute Psychiatric Patients — Other Third Parties Managed Care", "Psych patients, commercial managed care", "Psych inpatients on December 31 in commercial HMO/PPO plans.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_SHORT_DOYLE": f("psych", "Acute Psychiatric Patients — Short-Doyle", "Psych patients, Short-Doyle", "Psych inpatients on December 31 under a county mental health (Short-Doyle) contract.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_OTHER_INDIGENT": f("psych", "Acute Psychiatric Patients — Other Indigent", "Psych patients, other indigent", "Psych inpatients on December 31 receiving charity care.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_OTHER_PAYERS": f("psych", "Acute Psychiatric Patients — Other Payers", "Psych patients, other payers", "Psych inpatients on December 31 with self-pay or other coverage.", "count"),
    "ACUTE_PSYCHIATRIC_PATS_TOT_BY_PAYOR": f("psych", "Acute Psychiatric Total (By Payer)", "Psych patients (by payer total)", "Same total, counted by payer.", "count"),
    "SHORT_DOYLE_SERVICES_OFFERED": f("psych", "Short-Doyle Contract Services", "Short-Doyle contract", "Whether the hospital provided psychiatric care under a county Short-Doyle contract.", "text"),
    # -- Programs
    "INPATIENT_HOSPICE_PROG_OFFERED": f("programs", "Inpatient Hospice Program", "Inpatient hospice", "Whether the hospital offered an inpatient hospice program.", "text"),
    "BED_CLASS_GEN_ACUTE_CARE_SERVICE": f("programs", "Hospice Bed Classification — General Acute Care", "Hospice in acute beds", "Hospice provided in general acute beds.", "text"),
    "BED_CLASS_SN_HOSPICE_SERVICE": f("programs", "Hospice Bed Classification — Skilled Nursing", "Hospice in skilled nursing beds", "Hospice provided in skilled nursing beds.", "text"),
    "BED_CLASS_IC_HOSPICE_SERVICE": f("programs", "Hospice Bed Classification — Intermediate Care", "Hospice in intermediate care beds", "Hospice provided in intermediate care beds.", "text"),
    "INPATIENT_PALLIATIVE_CARE_PROG_OFFERED": f("programs", "Inpatient Palliative Care Program", "Inpatient palliative care", "Whether the hospital runs an inpatient palliative care program.", "text"),
    "INPATIENT_PALLIATIVE_CARE_PROG_NURSES": f("programs", "Palliative Care Program — Nurses", "Palliative care nurses", "Nurses on the palliative care team.", "count"),
    "INPATIENT_PALLIATIVE_CARE_PROG_NURSES_CERTIFIED": f("programs", "Palliative Care Program — Certified Nurses", "Certified palliative nurses", "Of those, nurses with palliative certification.", "count"),
    "INPATIENT_PALLIATIVE_CARE_PROG_PHYSICIAN": f("programs", "Palliative Care Program — Physicians", "Palliative care physicians", "Physicians on the palliative care team.", "count"),
    "INPATIENT_PALLIATIVE_CARE_PROG_PHYSICIAN_CERTIFIED": f("programs", "Palliative Care Program — Certified Physicians", "Certified palliative physicians", "Of those, board-certified in hospice and palliative medicine.", "count"),
    "INPATIENT_PALLIATIVE_CARE_PROG_SOCIAL_WORKER": f("programs", "Palliative Care Program — Social Workers", "Palliative care social workers", "Social workers on the palliative care team.", "count"),
    "INPATIENT_PALLIATIVE_CARE_PROG_SOCIAL_WORKER_CERTIFIED": f("programs", "Palliative Care Program — Certified Social Workers", "Certified palliative social workers", "Of those, with palliative certification.", "count"),
    "INPATIENT_PALLIATIVE_CARE_PROG_CHAPLAINS": f("programs", "Palliative Care Program — Chaplains", "Palliative care chaplains", "Chaplains on the palliative care team.", "count"),
    "OUTPATIENT_PALLIATIVE_CARE_SERV_OFFERED": f("programs", "Outpatient Palliative Care Services", "Outpatient palliative care", "Whether the hospital offers outpatient palliative care.", "text"),
    # -- Emergency department
    "EMSA_TRAUMA_DESIGNATION": f("ed", "EMSA Trauma Center Designation", "Trauma level (adult)", "Adult trauma center level designated by the state EMS Authority; Level I is highest.", "text"),
    "EMSA_TRAUMA_DESIGNATION_PEDIATRIC": f("ed", "EMSA Trauma Center Designation — Pediatric", "Trauma level (pediatric)", "Pediatric trauma center level (I or II).", "text"),
    "LIC_ED_LEV_BEGIN": f("ed", "Licensed ED Level — Beginning", "ED level (start of year)", "Licensed emergency service level: Standby, Basic, or Comprehensive.", "text"),
    "LIC_ED_LEV_END": f("ed", "Licensed ED Level — Ending", "ED level (end of year)", "Licensed emergency service level at year end.", "text"),
    "EMS_VISITS_NON_URGENT_TOT": f("ed", "EDS Visits — CPT 99281 (not admitted)", "ED visits, level 1 (minor)", "Visits where a physician may not be required (CPT 99281), not admitted.", "count", drivers=ED_DRIVERS),
    "EMS_VISITS_URGENT_TOT": f("ed", "EDS Visits — CPT 99282 (not admitted)", "ED visits, level 2 (straightforward)", "Straightforward visits (CPT 99282), not admitted.", "count", drivers=ED_DRIVERS),
    "EMS_VISITS_MODERATE_TOT": f("ed", "EDS Visits — CPT 99283 (not admitted)", "ED visits, level 3 (low complexity)", "Low-complexity visits (CPT 99283), not admitted.", "count", drivers=ED_DRIVERS),
    "EMS_VISITS_SEVERE_TOT": f("ed", "EDS Visits — CPT 99284 (not admitted)", "ED visits, level 4 (moderate complexity)", "Moderate-complexity visits (CPT 99284), not admitted.", "count", drivers=ED_DRIVERS),
    "EMS_VISITS_CRITICAL_TOT": f("ed", "EDS Visits — CPT 99285 (not admitted)", "ED visits, level 5 (high complexity)", "High-complexity visits (CPT 99285, plus ED critical care 99291), not admitted.", "count", drivers=ED_DRIVERS),
    "EMER_DEPT_VISITS_NOT_RESULT_ADMISSIONS_TOT": f("ed", "EDS Visits Not Resulting in Admission — Total", "ED visits, treated and released", "ED visits that ended without an inpatient admission.", "count", drivers=ED_DRIVERS),
    "EMS_VISITS_NON_URGENT_ADMITTED": f("ed", "EDS Visits — CPT 99281 (admitted)", "ED admissions, level 1", "Level-1 visits that resulted in admission (optional detail).", "count"),
    "EMS_VISITS_URGENT_ADMITTED": f("ed", "EDS Visits — CPT 99282 (admitted)", "ED admissions, level 2", "Level-2 visits that resulted in admission (optional detail).", "count"),
    "EMS_VISITS_MODERATE_ADMITTED": f("ed", "EDS Visits — CPT 99283 (admitted)", "ED admissions, level 3", "Level-3 visits that resulted in admission (optional detail).", "count"),
    "EMS_VISITS_SEVERE_ADMITTED": f("ed", "EDS Visits — CPT 99284 (admitted)", "ED admissions, level 4", "Level-4 visits that resulted in admission (optional detail).", "count"),
    "EMS_VISITS_CRITICAL_ADMITTED": f("ed", "EDS Visits — CPT 99285 (admitted)", "ED admissions, level 5", "Level-5 visits that resulted in admission (optional detail).", "count"),
    "ADMITTED_FROM_EMER_DEPT_TOT": f("ed", "EDS Visits Resulting in Admission — Total", "Admitted from the ED", "ED visits that became an inpatient admission.", "count", drivers=ED_DRIVERS),
    "ER_TRAFFIC_TOT": f("ed", "Total ED Traffic", "ED visits, total", "All ED visits: treated and released plus admitted. Excludes patients who left without being seen and scheduled clinic visits.", "count", drivers=ED_DRIVERS),
    "EMER_MED_TREAT_STATIONS_ON_1231": f("ed", "Emergency Medical Treatment Stations", "ED treatment stations", "Places in the ED that can treat one patient at a time on December 31; excludes holding and observation beds.", "count"),
    "NON_EMER_VISITS_IN_EMER_DEPT": f("ed", "Non-Emergency (Clinic) Visits Seen in ED", "Scheduled clinic visits in the ED", "Scheduled non-emergency visits — usually small hospitals using the ED as a clinic.", "count"),
    "EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN": f("ed", "Registrations — Patient Left Without Being Seen", "Left without being seen", "Patients who registered in the ED but left before being treated.", "count", drivers=[
        "ED crowding and long waits, often from boarding admitted patients who can't get an inpatient bed.",
        "ED staffing levels and triage process changes (e.g. provider-in-triage).",
    ]),
    "EMER_DEPT_AMBULANCE_DIVERSION_HOURS": f("ed", "Ambulance Diversion Occurred", "Any ambulance diversion", "Whether the ED went on full ambulance diversion during the year.", "text"),
    "EMER_DEPT_HR_DIVERSION_TOT": f("ed", "Ambulance Diversion Hours — Total", "Ambulance diversion hours", "Hours the ED was closed to all ambulance traffic during the year.", "hours", drivers=[
        "Inpatient capacity: no beds for admitted patients backs up the ED.",
        "County EMS policies — several California counties restrict or ban diversion.",
        "Respiratory-virus surges.",
    ]),
    # -- Surgery
    "INPATIENT_SURG_OPER": f("surgery", "Inpatient Surgical Operations", "Inpatient surgeries", "Operations in a surgical suite on admitted patients; multiple procedures in one operation count once.", "count"),
    "OUTPATIENT_SURG_OPER": f("surgery", "Outpatient Surgical Operations", "Outpatient surgeries", "Same-day operations in the hospital's surgical suites.", "count"),
    "INPATIENT_SURG_OPER_RM_MINS": f("surgery", "Inpatient Operating Room Minutes", "Inpatient OR minutes", "Anesthesia (or surgery) start to end for inpatient operations; excludes recovery.", "minutes"),
    "OUTPATIENT_SURG_OPER_RM_MINS": f("surgery", "Outpatient Operating Room Minutes", "Outpatient OR minutes", "Anesthesia (or surgery) start to end for outpatient operations.", "minutes"),
    "INPATIENT_AVG_PER_SURGERY": f("surgery", "Average Minutes per Inpatient Surgery", "Minutes per inpatient surgery", "Inpatient OR minutes ÷ inpatient surgeries.", "minutes"),
    "OUTPATIENT_AVG_PER_SURGERY": f("surgery", "Average Minutes per Outpatient Surgery", "Minutes per outpatient surgery", "Outpatient OR minutes ÷ outpatient surgeries.", "minutes"),
    "INPAT_OPER_RM": f("surgery", "Operating Rooms — Inpatient Only", "Inpatient-only ORs", "Operating rooms used only for inpatients on December 31.", "count"),
    "OUTPAT_OPER_RM": f("surgery", "Operating Rooms — Outpatient Only", "Outpatient-only ORs", "Operating rooms used only for outpatients.", "count"),
    "INPAT_OUTPAT_OPER_RM": f("surgery", "Operating Rooms — Inpatient and Outpatient", "Shared ORs", "Operating rooms used for both.", "count"),
    "OPER_RM_TOT": f("surgery", "Total Operating Rooms", "Operating rooms", "All operating rooms in service on December 31.", "count"),
    "OFFER_AMBULATORY_SURG_PROG": f("surgery", "Ambulatory Surgery Program", "Ambulatory surgery program", "Whether the hospital runs an ambulatory surgery program.", "text"),
    # -- Births
    "LIVE_BIRTHS_TOT": f("births", "Live Births", "Live births", "All live births in the hospital.", "count"),
    "LIVE_BIRTHS_LT_2500GM": f("births", "Live Births Under 2,500 g", "Low-birth-weight births", "Babies born weighing under 2,500 g (5.5 lb).", "count"),
    "LIVE_BIRTHS_LT_1500GM": f("births", "Live Births Under 1,500 g", "Very-low-birth-weight births", "Babies born weighing under 1,500 g (3.3 lb).", "count"),
    "OFFER_ALTERNATE_BIRTH_PROG": f("births", "Alternate Birthing Program", "Alternate birthing program", "Whether the hospital offers an alternate birthing program.", "text"),
    "ALTERNATE_SETTING_LDR": f("births", "Alternate Setting — LDR Rooms", "LDR rooms", "Labor/delivery/recovery rooms.", "count"),
    "ALTERNATE_SETTING_LDRP": f("births", "Alternate Setting — LDRP Rooms", "LDRP rooms", "Labor/delivery/recovery/postpartum rooms.", "count"),
    "LIVE_BIRTHS_IN_ALTERNATIVE_SETTING": f("births", "Live Births in Alternate Setting", "Births in alternate settings", "Births in LDR/LDRP rooms or an alternate birthing center.", "count"),
    "LIVE_BIRTHS_C_SECTION": f("births", "Live Births — C-Section", "Cesarean births", "Live births delivered by C-section.", "count"),
    # -- Cardiac
    "LIC_CARDIOLOGY_CARDIOVASCULAR_SURG_SERVICES": f("cardiac", "Licensed Cardiovascular Surgery Services", "Licensed for cardiac surgery", "Whether the hospital is licensed for cardiovascular surgery.", "text"),
    "CARDIOVASCULAR_OPER_RM": f("cardiac", "Cardiovascular Operating Rooms", "Cardiac ORs", "Operating rooms used for cardiovascular surgery.", "count"),
    "CARDIOVASCULAR_SURG_OPER_PEDIATRIC_BYPASS_USED": f("cardiac", "Cardiovascular Surgery — Pediatric, Bypass Used", "Pediatric heart surgery, on bypass", "Pediatric operations using cardiopulmonary bypass.", "count"),
    "CARDIOVASCULAR_SURG_OPER_ADULT_BYPASS_USED": f("cardiac", "Cardiovascular Surgery — Adult, Bypass Used", "Adult heart surgery, on bypass", "Adult operations using cardiopulmonary bypass.", "count"),
    "CARDIOVASCULAR_SURG_OPER_BYPASS_USED_TOT": f("cardiac", "Cardiovascular Surgery — Bypass Used, Total", "Heart surgery on bypass", "All operations using cardiopulmonary bypass.", "count"),
    "CARDIOVASCULAR_SURG_OPER_PEDIATRIC_BYPASS_NOT_USED": f("cardiac", "Cardiovascular Surgery — Pediatric, Bypass Not Used", "Pediatric heart surgery, off bypass", "Pediatric cardiovascular operations without bypass.", "count"),
    "CARDIOVASCULAR_SURG_OPER_ADULT_BYPASS_NOT_USED": f("cardiac", "Cardiovascular Surgery — Adult, Bypass Not Used", "Adult heart surgery, off bypass", "Adult cardiovascular operations without bypass.", "count"),
    "CARDIOVASCULAR_SURG_OPER_BYPASS_NOT_USED_TOT": f("cardiac", "Cardiovascular Surgery — Bypass Not Used, Total", "Heart surgery off bypass", "All cardiovascular operations without bypass.", "count"),
    "CORONARY_ARTERY_BYPASS_GRAFT_SURG": f("cardiac", "Coronary Artery Bypass Graft Surgery", "CABG surgeries", "Coronary artery bypass graft operations.", "count"),
    "CARDIAC_CATHETERIZATION_LAB_RM": f("cardiac", "Cardiac Catheterization Labs", "Cath labs", "Cardiac catheterization lab rooms.", "count"),
    "CARD_CATH_PED_IP_DIAG_VST": f("cardiac", "Cath Visits — Pediatric Inpatient Diagnostic", "Pediatric inpatient diagnostic cath visits", "Pediatric inpatient diagnostic cath lab visits.", "count"),
    "CARD_CATH_PED_OP_DIAG_VST": f("cardiac", "Cath Visits — Pediatric Outpatient Diagnostic", "Pediatric outpatient diagnostic cath visits", "Pediatric outpatient diagnostic cath lab visits.", "count"),
    "CARDIAC_CATHETERIZATION_ADULT_INPAT_DIAGNOSTIC_VISITS": f("cardiac", "Cath Visits — Adult Inpatient Diagnostic", "Adult inpatient diagnostic cath visits", "Adult inpatient diagnostic cath lab visits.", "count"),
    "CARDIAC_CATHETERIZATION_ADULT_OUTPAT_DIAGNOSTIC_VISITS": f("cardiac", "Cath Visits — Adult Outpatient Diagnostic", "Adult outpatient diagnostic cath visits", "Adult outpatient diagnostic cath lab visits.", "count"),
    "CARDIAC_CATHETERIZATION_DIAGNOSTIC_VISITS_TOT": f("cardiac", "Cath Visits — Diagnostic, Total", "Diagnostic cath visits", "All diagnostic cath lab visits.", "count"),
    "CARD_CATH_PED_IP_THER_VST": f("cardiac", "Cath Visits — Pediatric Inpatient Therapeutic", "Pediatric inpatient therapeutic cath visits", "Pediatric inpatient therapeutic cath lab visits.", "count"),
    "CARD_CATH_PED_OP_THER_VST": f("cardiac", "Cath Visits — Pediatric Outpatient Therapeutic", "Pediatric outpatient therapeutic cath visits", "Pediatric outpatient therapeutic cath lab visits.", "count"),
    "CARDIAC_CATHETERIZATION_ADULT_INPAT_THERAPEUTIC_VISITS": f("cardiac", "Cath Visits — Adult Inpatient Therapeutic", "Adult inpatient therapeutic cath visits", "Adult inpatient therapeutic cath lab visits.", "count"),
    "CARDIAC_CATHETERIZATION_ADULT_OUTPAT_THERAPEUTIC_VISITS": f("cardiac", "Cath Visits — Adult Outpatient Therapeutic", "Adult outpatient therapeutic cath visits", "Adult outpatient therapeutic cath lab visits.", "count"),
    "CARDIAC_CATHETERIZATION_THERAPEUTIC_VISITS_TOT": f("cardiac", "Cath Visits — Therapeutic, Total", "Therapeutic cath visits", "All therapeutic (interventional) cath lab visits.", "count"),
    "DIAGNOSTIC_CARDIAC_CATH_PROC": f("cardiac", "Diagnostic Cardiac Catheterization", "Diagnostic caths", "Diagnostic cardiac catheterizations.", "count"),
    "MYOCARDIAL_BIOPSY": f("cardiac", "Myocardial Biopsy", "Myocardial biopsies", "Heart muscle biopsies.", "count"),
    "PERM_PACEMAKER_IMPLANT": f("cardiac", "Permanent Pacemaker Implantation", "Pacemaker implants", "Permanent pacemaker implantations.", "count"),
    "OTH_PERM_PACEMAKER_PROC": f("cardiac", "Other Permanent Pacemaker Procedures", "Other pacemaker procedures", "Pacemaker revisions and other procedures.", "count"),
    "IMPLANABLE_CARDIO_DEFIB_IMPLANTATION": f("cardiac", "Implantable Cardioverter Defibrillator", "ICD implants", "Implantable defibrillator implantations.", "count"),
    "OTH_PROCEDURES": f("cardiac", "Other Cath Lab Procedures", "Other cath lab procedures", "Other procedures in the cath lab.", "count"),
    "PCI_WITH_STENT": f("cardiac", "PCI With Stent", "PCI with stent", "Angioplasty with a stent.", "count"),
    "PCI_WO_STENT": f("cardiac", "PCI Without Stent", "PCI without stent", "Angioplasty without a stent.", "count"),
    "ATHERECTOMY": f("cardiac", "Atherectomy", "Atherectomies", "Removal of plaque from an artery by catheter.", "count"),
    "THROMBOLYTIC_AGENTS": f("cardiac", "Intracoronary Thrombolytic Agents", "Thrombolytic infusions", "Clot-dissolving drugs delivered by catheter.", "count"),
    "PTBV": f("cardiac", "Percutaneous Transluminal Balloon Valvuloplasty", "Balloon valvuloplasties", "Heart valve widening by balloon catheter.", "count"),
    "DIAGNOSTIC_ELECTROPHYSIOLOGY_EP": f("cardiac", "Diagnostic Electrophysiology", "EP studies", "Diagnostic electrophysiology studies.", "count"),
    "CATHETER_ABLATION": f("cardiac", "Catheter Ablation", "Catheter ablations", "Ablations for heart rhythm problems.", "count"),
    "PERIPHERAL_VASCULAR_ANGIOGRAPHY": f("cardiac", "Peripheral Vascular Angiography", "Peripheral angiography", "Imaging of arteries outside the heart.", "count"),
    "PERIPHERAL_VASCULAR_INTERVENTIONAL": f("cardiac", "Peripheral Vascular Interventional", "Peripheral interventions", "Catheter treatments of arteries outside the heart.", "count"),
    "CAROTID_STENTING": f("cardiac", "Carotid Stenting", "Carotid stents", "Stents in the carotid artery.", "count"),
    "INTRA_AORTIC_BALLOON_PUMP_INSERTION": f("cardiac", "Intra-Aortic Balloon Pump Insertion", "Balloon pump insertions", "Intra-aortic balloon pump insertions.", "count"),
    "CATHETER_BASED_VENTRICULAR_ASSIST_DEVICE_INSERTION": f("cardiac", "Catheter-Based Ventricular Assist Device", "Catheter VAD insertions", "Catheter-based heart pump insertions (e.g. Impella).", "count"),
    "ALL_OTHER_CATHETERIZATION_PROC": f("cardiac", "All Other Catheterization Procedures", "Other cath procedures", "Cath procedures not listed separately.", "count"),
    "CATHETERIZATION_PROC_TOT": f("cardiac", "Catheterization Procedures — Total", "Cath lab procedures", "All cardiac catheterization procedures.", "count", drivers=SECTIONS["cardiac"]["drivers"]),
    # -- Capital (per-item slots are summed by the ETL)
    "FAC_ACQUIRE_EQUIP_OVER_500K": f("capital", "Equipment Acquired Over $500,000", "Major equipment acquired", "Whether the hospital acquired equipment costing over $500,000.", "text"),
    "PROJ_OVER_1M": f("capital", "Capital Projects Over $1 Million", "Major capital projects", "Whether the hospital had capital projects over $1 million.", "text"),
    "EQUIP_VAL_TOT": f("capital", "Equipment Value (sum of items 1–10)", "Major equipment value", "Total value of equipment over $500,000 acquired in the year (up to ten items reported).", "usd"),
    "PROJ_EXPENDITURES_TOT": f("capital", "Projected Capital Expenditure (sum of projects 1–5)", "Major project spending", "Projected total cost of capital projects over $1 million (up to five reported).", "usd"),
}

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
for _abbr, _name in zip(MONTHS, MONTH_NAMES):
    EXPLICIT[f"EMER_DEPT_HR_DIVERSION_{_abbr}"] = f(
        "ed", f"Ambulance Diversion Hours — {_name}", f"Diversion hours, {_name}",
        f"Hours on full ambulance diversion in {_name}.", "hours",
    )

FIELDS: dict[str, dict] = {**_bed_grid(), **EXPLICIT}


# --------------------------------------------------------------------------- #
# Derived metrics (computed in datasets/hau.py:derive_metrics)
# --------------------------------------------------------------------------- #

METRICS: dict[str, dict] = {
    "licensedBeds": {
        "category": "utilization",
        "label": "Licensed beds",
        "unit": "count",
        "summary": "All beds on the hospital's license on December 31, including every campus on the license.",
        "formula": "TOT_LIC_BEDS",
        "inputs": ["TOT_LIC_BEDS"],
        "higherIsBetter": None,
        "drivers": SECTIONS["beds"]["drivers"],
    },
    "occupancy": {
        "category": "utilization",
        "label": "Occupancy rate",
        "unit": "pct",
        "summary": "Share of licensed beds filled on an average day.",
        "formula": "TOT_CEN_DAYS ÷ TOT_LIC_BED_DAYS",
        "inputs": ["TOT_CEN_DAYS", "TOT_LIC_BED_DAYS"],
        "higherIsBetter": None,
        "caution": "Based on licensed beds, not staffed beds, so hospitals with units closed for staffing or construction look emptier than they feel.",
        "drivers": [
            "Patient days (admissions × length of stay).",
            "Licensed bed changes — closing beds raises occupancy without adding patients.",
            "Discharge delays for patients waiting on skilled nursing or psychiatric placement.",
        ],
    },
    "inpatientDays": {
        "category": "utilization",
        "label": "Inpatient days",
        "unit": "count",
        "summary": "Total patient (census) days across all bed types, excluding the normal newborn nursery.",
        "formula": "TOT_CEN_DAYS",
        "inputs": ["TOT_CEN_DAYS"],
        "higherIsBetter": None,
        "drivers": SECTIONS["census_days"]["drivers"],
    },
    "discharges": {
        "category": "utilization",
        "label": "Discharges",
        "unit": "count",
        "summary": "Inpatient discharges across all bed types, including deaths and moves between types of care.",
        "formula": "TOT_DISCHARGES",
        "inputs": ["TOT_DISCHARGES"],
        "higherIsBetter": None,
        "drivers": SECTIONS["discharges"]["drivers"],
    },
    "alos": {
        "category": "utilization",
        "label": "Average length of stay (acute)",
        "unit": "days",
        "decimals": 1,
        "summary": "Average days per stay in general acute beds (medical/surgical, ICU, pediatric, perinatal, NICU, rehab…).",
        "formula": "GAC_SUBTOT_CEN_DAYS ÷ GAC_SUBTOT_DISCHARGES",
        "inputs": ["GAC_SUBTOT_CEN_DAYS", "GAC_SUBTOT_DISCHARGES"],
        "higherIsBetter": None,
        "caution": "Not adjusted for case mix: trauma and tertiary centers keep sicker patients longer.",
        "drivers": SECTIONS["alos"]["drivers"],
    },
    "adc": {
        "category": "utilization",
        "label": "Average daily census (acute)",
        "unit": "number",
        "unitLabel": "patients",
        "decimals": 1,
        "summary": "Patients in general acute beds on an average day: acute patient days ÷ days in the year.",
        "formula": "GAC_SUBTOT_CEN_DAYS ÷ days in the reporting period",
        "inputs": ["GAC_SUBTOT_CEN_DAYS"],
        "higherIsBetter": None,
        "caution": "Acute beds only, like length of stay: skilled nursing, psychiatric, and chemical dependency days are left out, so it's lower than total patient days ÷ 365 at hospitals with those units.",
        "drivers": [
            "Admissions × length of stay: either one moving shifts the census.",
            "Discharge delays for patients waiting on skilled nursing or psychiatric placement.",
            "Units opening, closing, or converting.",
        ],
    },
    "edVisits": {
        "category": "utilization",
        "label": "ED visits",
        "unit": "count",
        "summary": "Emergency department visits in the calendar year, treated-and-released plus admitted.",
        "formula": "ER_TRAFFIC_TOT",
        "inputs": ["ER_TRAFFIC_TOT"],
        "higherIsBetter": None,
        "drivers": ED_DRIVERS,
    },
    "edAdmitRate": {
        "category": "utilization",
        "label": "ED admission rate",
        "unit": "ratio",
        "summary": "Share of ED visits that became an inpatient admission.",
        "formula": "ADMITTED_FROM_EMER_DEPT_TOT ÷ ER_TRAFFIC_TOT",
        "inputs": ["ADMITTED_FROM_EMER_DEPT_TOT", "ER_TRAFFIC_TOT"],
        "higherIsBetter": None,
        "drivers": [
            "Patient acuity and the ED's role (trauma and tertiary centers admit more).",
            "Observation-status policies: patients kept in observation aren't admitted.",
            "Nearby urgent care absorbing minor visits raises the share that are admitted.",
        ],
    },
    "edHighAcuityShare": {
        "category": "utilization",
        "label": "High-acuity ED visits",
        "unit": "ratio",
        "summary": "Share of treated-and-released ED visits coded at the two highest levels (CPT 99284–99285).",
        "formula": "(EMS_VISITS_SEVERE_TOT + EMS_VISITS_CRITICAL_TOT) ÷ EMER_DEPT_VISITS_NOT_RESULT_ADMISSIONS_TOT",
        "inputs": ["EMS_VISITS_SEVERE_TOT", "EMS_VISITS_CRITICAL_TOT", "EMER_DEPT_VISITS_NOT_RESULT_ADMISSIONS_TOT"],
        "higherIsBetter": None,
        "caution": "Coding practice drives this as much as patient severity, and the 2023 CPT revision of ED levels changed how visits are coded.",
        "drivers": ED_DRIVERS,
    },
    "edLwbsRate": {
        "category": "utilization",
        "label": "Left without being seen",
        "unit": "ratio",
        "summary": "Patients who registered in the ED but left before treatment, as a share of ED visits.",
        "formula": "EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN ÷ ER_TRAFFIC_TOT",
        "inputs": ["EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN", "ER_TRAFFIC_TOT"],
        "higherIsBetter": False,
        "drivers": EXPLICIT["EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN"]["drivers"],
    },
    "edVisitsPerStation": {
        "category": "utilization",
        "label": "ED visits per treatment station",
        "unit": "count",
        "summary": "Annual ED visits per treatment station — how hard each ED bay works.",
        "formula": "ER_TRAFFIC_TOT ÷ EMER_MED_TREAT_STATIONS_ON_1231",
        "inputs": ["ER_TRAFFIC_TOT", "EMER_MED_TREAT_STATIONS_ON_1231"],
        "higherIsBetter": None,
        "caution": "Stations are counted on December 31, so an ED expansion late in the year lowers this before the new space sees a full year of visits.",
        "drivers": ED_DRIVERS,
    },
    "diversionHours": {
        "category": "utilization",
        "label": "Ambulance diversion hours",
        "unit": "count",
        "summary": "Hours the ED was closed to all ambulance traffic during the year.",
        "formula": "EMER_DEPT_HR_DIVERSION_TOT (0 when the hospital reported no diversion)",
        "inputs": ["EMER_DEPT_HR_DIVERSION_TOT", "EMER_DEPT_AMBULANCE_DIVERSION_HOURS"],
        "higherIsBetter": False,
        "drivers": EXPLICIT["EMER_DEPT_HR_DIVERSION_TOT"]["drivers"],
    },
    "ipSurgeries": {
        "category": "utilization",
        "label": "Inpatient surgeries",
        "unit": "count",
        "summary": "Operations on admitted patients in the hospital's surgical suites.",
        "formula": "INPATIENT_SURG_OPER",
        "inputs": ["INPATIENT_SURG_OPER"],
        "higherIsBetter": None,
        "drivers": SECTIONS["surgery"]["drivers"],
    },
    "opSurgeries": {
        "category": "utilization",
        "label": "Outpatient surgeries",
        "unit": "count",
        "summary": "Same-day operations in the hospital's surgical suites (not free-standing surgery centers).",
        "formula": "OUTPATIENT_SURG_OPER",
        "inputs": ["OUTPATIENT_SURG_OPER"],
        "higherIsBetter": None,
        "drivers": SECTIONS["surgery"]["drivers"],
    },
    "cathProcedures": {
        "category": "utilization",
        "label": "Cardiac cath procedures",
        "unit": "count",
        "summary": "All cardiac catheterization procedures, diagnostic and interventional.",
        "formula": "CATHETERIZATION_PROC_TOT",
        "inputs": ["CATHETERIZATION_PROC_TOT"],
        "higherIsBetter": None,
        "drivers": SECTIONS["cardiac"]["drivers"],
    },
}


def export(field_order: list[str]) -> dict:
    ordered = [c for c in field_order if c in FIELDS]
    ordered += [c for c in FIELDS if c not in ordered]
    return {
        "dataset": "hau",
        "source": "HCAI Instructions for Completing the Annual Utilization Report of Hospitals (11/01/2024) and 2024 reporting form",
        "sections": [{"id": k, **v} for k, v in SECTIONS.items()],
        "fields": [{"code": c, **FIELDS[c]} for c in ordered],
        "metrics": [{"id": k, **v} for k, v in METRICS.items()],
        "payerGroups": [],
    }
