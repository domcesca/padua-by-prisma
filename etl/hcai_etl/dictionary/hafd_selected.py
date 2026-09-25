"""Data dictionary for the HCAI Hospital Annual Financial Data Selected File.

Sources:
  * HCAI "Hospital Annual Financial Data Selected Data File Documentation"
    (cross-reference, column labels, glossary), report periods ended on/after
    June 30, 2004.
  * Plain-language labels, one-line explanations, and "why it moves" drivers
    are written for hospital administrators. Where a statement depends on
    recent California policy it names the program so readers can verify it.

Most of the ~230 numeric fields follow a <measure>_<payer> or
<measure>_<care type> pattern, so they're generated from the tables below; the
rest are listed explicitly.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Sections: grouping + default "why it moves" drivers inherited by fields
# --------------------------------------------------------------------------- #

SECTIONS: dict[str, dict] = {
    "report": {
        "title": "Report information",
        "summary": "Which report the numbers came from and how complete it is.",
        "drivers": [],
    },
    "general": {
        "title": "Hospital profile",
        "summary": "Who the hospital is: location, ownership, type, and designations.",
        "drivers": [],
    },
    "beds": {
        "title": "Beds & capacity",
        "summary": "How many beds the hospital is licensed for, has available, and actually staffs.",
        "drivers": [
            "License changes: beds added, closed, or converted to another type of care.",
            "Seismic retrofits or construction taking units out of service (California SB 1953 requirements).",
            "Staffed beds track staffing availability — nursing shortages reduce staffed beds without changing the license.",
        ],
    },
    "inpatient_payer": {
        "title": "Inpatient volume by payer",
        "summary": "Patient days and discharges split by who is responsible for the bill.",
        "drivers": [
            "Admission volume: service-line growth, physician recruitment or departures, a competitor opening or closing.",
            "Length of stay: delays discharging patients to skilled nursing or home care add days without adding patients.",
            "Payer shifts: Medicare Advantage growth moves volume from Medicare fee-for-service to Medicare managed care; Medi-Cal enrollment swings (the 2023–24 end of continuous coverage, the 2024 expansion to undocumented adults) move volume between Medi-Cal, county programs, and self-pay.",
            "Partial reporting periods (opening, closure, fiscal-year change) — check Days in Report Period.",
        ],
    },
    "care_type": {
        "title": "Beds & volume by type of care",
        "summary": "Beds, patient days, and discharges for acute, psychiatric, rehab, long-term care, and other units.",
        "drivers": [
            "Opening, closing, or converting a unit (e.g., closing a psych unit or skilled nursing unit).",
            "Changes in length of stay or referral patterns for that service line.",
            "Internal transfers between types of care count as a discharge from one and an admission to the other.",
        ],
    },
    "rates": {
        "title": "Occupancy & length of stay",
        "summary": "How full the hospital is and how long patients stay.",
        "drivers": [
            "Occupancy moves with patient days (numerator) and bed counts (denominator) — a bed closure raises occupancy with no change in volume.",
            "Length of stay rises when discharges to post-acute care are delayed or case mix gets sicker; it falls with care-management programs.",
        ],
    },
    "nursery": {
        "title": "Nursery",
        "summary": "Newborn nursery capacity and volume (kept separate from inpatient beds and days).",
        "drivers": [
            "Birth volume in the service area (California births have been declining).",
            "Obstetric unit openings or closures — many smaller and rural hospitals have closed labor & delivery.",
        ],
    },
    "outpatient_payer": {
        "title": "Outpatient visits by payer",
        "summary": "Outpatient visits split by who is responsible for the bill.",
        "drivers": [
            "Care continuing to shift from inpatient to outpatient settings.",
            "Opening, acquiring, or closing clinics and satellite sites that report under the hospital license.",
            "Payer shifts (Medicare Advantage growth, Medi-Cal enrollment changes).",
            "Changes in how visits are counted; telehealth may not be counted as a visit.",
        ],
    },
    "outpatient_visits": {
        "title": "Emergency & outpatient visits",
        "summary": "Visits by setting: emergency department, clinics, home health, and referred outpatient services.",
        "drivers": [
            "ED volume swings with respiratory-virus seasons, the 2020 COVID drop, and nearby urgent-care or ED openings/closures.",
            "Clinic volume moves with sites being added, sold, or moved to an affiliated medical group.",
        ],
    },
    "surgery": {
        "title": "Surgery & births",
        "summary": "Operating rooms, surgical volume, and deliveries.",
        "drivers": [
            "Surgeon recruitment or departures and new or lost payer contracts.",
            "Procedures migrating to freestanding ambulatory surgery centers.",
            "Elective-surgery pauses (e.g., 2020 COVID restrictions, staffing shortages).",
        ],
    },
    "income": {
        "title": "Income statement",
        "summary": "The top-line P&L: revenue, expenses, and the resulting margin.",
        "drivers": [
            "Volume and payment-rate changes (annual Medicare updates, commercial contract renegotiations).",
            "Medi-Cal supplemental payments such as the Hospital Quality Assurance Fee program arrive in lumpy, multi-year cycles and can swing results sharply year to year.",
            "Labor costs: the 2021–22 travel-nurse surge and California's health care worker minimum wage (SB 525, phased in from October 2024).",
            "One-time items: COVID relief grants in 2020–21, prior-year cost report settlements.",
        ],
    },
    "revenue_center": {
        "title": "Gross revenue by service",
        "summary": "Charges at full list price, split into inpatient room & board, ambulatory, and ancillary services.",
        "drivers": [
            "Annual chargemaster (list price) increases — gross charges rise even when volume is flat.",
            "Volume and acuity changes in each service group.",
        ],
        "caution": "Gross charges are list prices that almost no payer pays. Use net patient revenue to judge real change or compare hospitals.",
    },
    "gross_inpatient": {
        "title": "Gross inpatient revenue by payer",
        "summary": "Inpatient charges at full list price, by payer.",
        "drivers": [
            "Annual chargemaster increases.",
            "Inpatient volume and case mix by payer.",
            "Payer shifts such as Medicare fee-for-service to Medicare Advantage.",
        ],
        "caution": "Gross charges are list prices, not what the hospital collects. They're most useful as a consistent way to measure payer mix.",
    },
    "gross_outpatient": {
        "title": "Gross outpatient revenue by payer",
        "summary": "Outpatient charges at full list price, by payer.",
        "drivers": [
            "Annual chargemaster increases.",
            "Outpatient volume growth as care shifts out of the hospital bed.",
            "Payer shifts such as Medicare fee-for-service to Medicare Advantage.",
        ],
        "caution": "Gross charges are list prices, not what the hospital collects. They're most useful as a consistent way to measure payer mix.",
    },
    "deductions": {
        "title": "Deductions from revenue",
        "summary": "The gap between list-price charges and what the hospital expects to collect.",
        "drivers": [
            "Chargemaster increases widen contractual adjustments automatically (list price rises faster than payment).",
            "Payer contract terms and payer mix.",
            "Some Medi-Cal supplemental payments are recorded as reductions to Medi-Cal contractual adjustments, so these lines can swing with supplemental payment timing.",
            "Charity-care and bad-debt policy changes, and patients gaining or losing coverage.",
        ],
    },
    "capitation": {
        "title": "Capitation revenue",
        "summary": "Fixed per-member-per-month payments from managed care plans, regardless of services used.",
        "drivers": [
            "Contracts moving between capitated and fee-for-service arrangements.",
            "Changes in the number of members assigned under capitated contracts.",
        ],
    },
    "net_revenue_payer": {
        "title": "Net patient revenue by payer",
        "summary": "What the hospital actually expects to collect, by payer.",
        "drivers": [
            "Payment-rate changes: annual Medicare rate updates, commercial contract renegotiations, Medi-Cal rate actions.",
            "Volume and payer-mix shifts.",
            "Medi-Cal supplemental payments (Hospital Quality Assurance Fee program, disproportionate share) — timing can make one year look unusually strong or weak.",
            "Prior-year settlements with Medicare or Medi-Cal booked in the current year.",
        ],
    },
    "financial_other": {
        "title": "Other financial items",
        "summary": "Transfers, contributions, investment income, and public funding outside patient care.",
        "drivers": [
            "Investment market performance (e.g., losses in 2022, recovery in 2023).",
            "Fundraising and one-time gifts.",
            "District tax revenue or county appropriations for public hospitals.",
            "Cash moved to or from a parent organization.",
        ],
    },
    "expense_center": {
        "title": "Expenses by department group",
        "summary": "Operating expenses assigned to the part of the hospital that incurred them.",
        "drivers": [
            "Volume in that service group, staffing levels, and wage rates.",
            "Cost-allocation or chart-of-accounts changes can move dollars between groups without changing the total.",
        ],
    },
    "expense_natural": {
        "title": "Expenses by type",
        "summary": "Operating expenses by what was bought: labor, supplies, services, capital.",
        "drivers": [
            "Wage rates, headcount, and union contracts.",
            "Supply and drug price inflation, and changes in case mix.",
            "Outsourcing decisions move cost between salaries and purchased services.",
        ],
    },
    "assets": {
        "title": "Balance sheet — assets",
        "summary": "What the hospital owns at the end of the period.",
        "drivers": [
            "Operating results adding to or draining cash.",
            "Capital projects: construction in progress becomes buildings and equipment when finished.",
            "Cash swept to or from a parent system.",
        ],
        "caution": "These are hospital-level balance sheets. Hospitals in a health system often keep cash and debt at the parent, so hospital-level figures can understate the system's real financial position.",
    },
    "liabilities": {
        "title": "Balance sheet — liabilities & equity",
        "summary": "What the hospital owes and the net worth left over.",
        "drivers": [
            "New debt or refinancing (often for seismic compliance or expansion).",
            "Operating gains or losses flowing into equity.",
            "Debt pushed down from, or taken up by, a parent organization.",
        ],
        "caution": "These are hospital-level balance sheets. Hospitals in a health system often keep cash and debt at the parent, so hospital-level figures can understate the system's real financial position.",
    },
    "balance_other": {
        "title": "Balance sheet — detail",
        "summary": "Selected balance sheet line items: cash, receivables, property, and debt detail.",
        "drivers": [
            "Collection performance, claim denials, and billing-system conversions change receivables.",
            "New buildings, equipment, and depreciation change property values.",
            "Bond issues, refinancing, and scheduled principal payments change debt.",
        ],
        "caution": "These are hospital-level balance sheets. Hospitals in a health system often keep cash and debt at the parent, so hospital-level figures can understate the system's real financial position.",
    },
    "labor": {
        "title": "Workforce",
        "summary": "Paid staff, hours, medical staff, and trainees.",
        "drivers": [
            "Volume and California's mandated nurse-to-patient ratios.",
            "Replacing contract (registry/travel) staff with employees, or the reverse.",
            "Outsourcing departments such as food service or environmental services.",
        ],
    },
    "hours_class": {
        "title": "Hours worked by job category",
        "summary": "Hours actually worked, by employee classification.",
        "drivers": [
            "Staffing levels and mix (e.g., more RNs vs. LVNs or aides).",
            "Volume changes and new or closed services.",
        ],
    },
    "contract_labor": {
        "title": "Contract labor",
        "summary": "Hours worked by staff not on the hospital payroll (registry/travel nurses, contractors).",
        "drivers": [
            "Contract labor surged in 2021–22 during COVID-era nursing shortages and has generally declined since.",
            "Vacancy rates and success of hiring and retention programs.",
        ],
    },
    "hours_productive_center": {
        "title": "Hours worked by department group",
        "summary": "Hours actually worked (productive hours), by department group.",
        "drivers": [
            "Volume and staffing in each department group.",
            "Departments being outsourced, consolidated to a parent system, or brought in-house.",
        ],
    },
    "hours_paid_center": {
        "title": "Paid hours by department group",
        "summary": "Hours paid, including vacation, sick, and holiday time, by department group.",
        "drivers": [
            "Staffing levels plus paid-time-off policies and usage.",
            "Departments being outsourced, consolidated to a parent system, or brought in-house.",
        ],
    },
}

# --------------------------------------------------------------------------- #
# Pattern tables
# --------------------------------------------------------------------------- #

PAYERS: dict[str, tuple[str, str]] = {
    "MCAR_TR": ("Medicare fee-for-service", "Traditional Medicare, billed directly to the federal program"),
    "MCAR_MC": ("Medicare Advantage", "Medicare beneficiaries enrolled in a private Medicare Advantage (managed care) plan"),
    "MCAL_TR": ("Medi-Cal fee-for-service", "Medi-Cal (California Medicaid) billed directly to the state, not through a health plan"),
    "MCAL_MC": ("Medi-Cal managed care", "Medi-Cal members enrolled in a managed care plan, which covers most Medi-Cal enrollees"),
    "CNTY": ("County indigent programs", "Low-income patients covered by county programs, traditional and managed care"),
    "THRD_TR": ("Commercial & other, non-managed", "Other coverage without a managed-care contract: indemnity plans, workers' comp, TRICARE, California Children's Services"),
    "THRD_MC": ("Commercial managed care", "Private HMO/PPO plans not funded by Medicare, Medi-Cal, or a county"),
    "OTH_IND": ("Other indigent (charity)", "Patients receiving charity care from the hospital outside county programs"),
    "OTH": ("Self-pay & other", "Everyone not in another category, mostly self-pay and uninsured patients"),
    "TOT": ("All payers", "Total across all payer categories"),
}

PAYER_HCAI = {
    "MCAR_TR": "Medicare-Traditional",
    "MCAR_MC": "Medicare-Managed Care",
    "MCAL_TR": "Medi-Cal-Traditional",
    "MCAL_MC": "Medi-Cal-Managed Care",
    "CNTY": "County Indigent Programs-Traditional & Managed Care",
    "THRD_TR": "Other Third Parties-Traditional",
    "THRD_MC": "Other Third Parties-Managed Care",
    "OTH_IND": "Other Indigent",
    "OTH": "Other Payers",
    "TOT": "Total",
}

# prefix -> (section, hcai measure, plain measure, unit, one-line template)
PAYER_MEASURES = {
    "DAY_": ("inpatient_payer", "Patient (Census) Days", "Patient days", "days",
             "Inpatient days for {payer_desc}. Each patient in a bed at the midnight census counts as one day."),
    "DIS_": ("inpatient_payer", "Discharges", "Discharges", "count",
             "Inpatients released from the hospital (including deaths) for {payer_desc}. Roughly, the number of inpatient stays."),
    "VIS_": ("outpatient_payer", "Outpatient Visits", "Outpatient visits", "count",
             "Outpatient visits (ED, clinic, referred, home health) for {payer_desc}."),
    "GR_IP_": ("gross_inpatient", "Gross Inpatient Revenue", "Inpatient charges", "usd",
               "Inpatient charges at full list price for {payer_desc}, before discounts."),
    "GR_OP_": ("gross_outpatient", "Gross Outpatient Revenue", "Outpatient charges", "usd",
               "Outpatient charges at full list price for {payer_desc}, before discounts."),
    "C_ADJ_": ("deductions", "Contractual Adjustments", "Contractual discount", "usd",
               "The discount from list price that the hospital gives under its contract terms for {payer_desc}."),
    "NETRV_": ("net_revenue_payer", "Net Patient Revenue", "Net patient revenue", "usd",
               "What the hospital expects to collect for {payer_desc}, after discounts."),
}

CAPITATION = {
    "CAP_REV_MCAR": ("Medicare-Managed Care", "Medicare Advantage"),
    "CAP_REV_MCAL": ("Medi-Cal-Managed Care", "Medi-Cal managed care"),
    "CAP_REV_CNTY": ("County Indigent Programs-Managed Care", "county indigent managed care"),
    "CAP_REV_THRD": ("Other Third Parties-Managed Care", "commercial managed care"),
}

CARE_TYPES = {
    "ACUTE": ("Acute Care", "Acute care", "general acute units: medical/surgical, ICU, obstetrics, pediatrics"),
    "PSYCH": ("Psychiatric Care", "Psychiatric", "inpatient psychiatric units"),
    "CHEM": ("Chemical Dependency Care", "Chemical dependency", "chemical dependency (substance use) recovery units"),
    "REHAB": ("Rehabilitation Care", "Rehabilitation", "physical rehabilitation units"),
    "LTC": ("Long-term Care", "Long-term care", "skilled nursing, sub-acute, and intermediate care units"),
    "RESDNT": ("Residential & Other Daily Services", "Residential & other", "residential care and other daily services"),
}

CARE_MEASURES = {
    "BED_": ("Licensed Beds", "licensed beds", "beds", "Licensed beds in {care_desc}."),
    "DAY_": ("Patient (Census) Days", "patient days", "days", "Inpatient days in {care_desc}."),
    "DIS_": ("Discharges", "discharges", "count", "Discharges from {care_desc}, including transfers to another type of care in the hospital."),
}

EMPLOYEE_CLASSES = {
    "MGT": ("Management and Supervision", "Managers & supervisors", "Administrators, directors, managers, and supervisors"),
    "TCH": ("Technical and Specialist", "Technical & specialist staff", "Technologists, technicians, and other licensed or specialized roles"),
    "RN": ("Registered Nurses", "Registered nurses", "Employed RNs providing direct patient care"),
    "LVN": ("Licensed Vocational Nurses", "Licensed vocational nurses", "Employed LVNs providing direct patient care"),
    "AID": ("Aides and Orderlies", "Aides & orderlies", "Nursing assistants, aides, and orderlies"),
    "CLR": ("Clerical and Other Administrative", "Clerical & administrative staff", "Record-keeping, communication, and other administrative roles"),
    "ENV": ("Environmental and Food Services", "Environmental & food service staff", "Housekeeping, dietary, maintenance, and security"),
    "OTH": ("All Other Employee Classifications", "All other employees", "Salaried physicians, non-physician practitioners, and all other roles"),
}

COST_CENTERS = {
    "DLY": ("Daily Hospital Services", "Inpatient units", "nursing units and room & board for admitted patients"),
    "AMB": ("Ambulatory Services", "Ambulatory services", "the ED, clinics, observation, and home health"),
    "ANC": ("Ancillary Services", "Ancillary services", "diagnostic and therapy departments: lab, imaging, pharmacy, surgery, therapy"),
    "ED": ("Research and Education", "Education & research", "education and research programs"),
    "GEN": ("General Services", "General services", "dietary, laundry, housekeeping, and plant operations"),
    "FIS": ("Fiscal Services", "Fiscal services", "accounting, patient accounting, and admitting"),
    "ADM": ("Administrative Services", "Administration", "administration, HR, medical records, and employee benefits"),
    "NON": ("Non-Operating Cost Centers", "Non-operating departments", "activities outside patient care, such as gift shops and medical office buildings"),
}

# --------------------------------------------------------------------------- #
# Explicit fields
# --------------------------------------------------------------------------- #


def f(section, hcai, label, summary, unit, drivers=None, caution=None, source=None):
    entry = {"section": section, "hcaiLabel": hcai, "label": label, "summary": summary, "unit": unit}
    if drivers:
        entry["drivers"] = drivers
    if caution:
        entry["caution"] = caution
    if source:
        entry["source"] = source
    return entry


EXPLICIT: dict[str, dict] = {
    # -- Report information
    "FAC_NO": f("report", "HCAI Facility Number", "HCAI facility ID",
                "HCAI's nine-digit ID for the hospital license. Stays the same even if the hospital's name changes.", "code"),
    "FAC_NAME": f("report", "Facility DBA Name", "Hospital name", "The name the hospital does business under.", "text"),
    "BEG_DATE": f("report", "Report Period Begin Date", "Report start date", "First day covered by this report.", "date"),
    "END_DATE": f("report", "Report Period End Date", "Report end date",
                  "Last day covered by this report — normally the hospital's fiscal year end.", "date"),
    "DAY_PER": f("report", "Days in Report Period", "Days covered",
                 "Number of days this report covers. Usually 365; anything else means the hospital opened, closed, changed owners, or changed its fiscal year.",
                 "days", caution="Short or long periods make volumes and dollars look unusually low or high. This app annualizes them when combining reports."),
    "DATA_IND": f("report", "Data Status Indicator", "Audit status",
                  "'Audited' means HCAI finished its desk review; 'In Process' means the numbers may still change.", "text"),
    "AUDIT_IND": f("report", "Independent Audit Indicator", "Includes auditor adjustments?",
                   "Whether the report includes adjustments from the hospital's independent financial audit.", "text"),
    # -- General
    "COUNTY": f("general", "County Name", "County", "County where the hospital is located.", "text"),
    "HSA": f("general", "Health Service Area (HSA) Number", "Health service area",
             "One of California's 14 federally designated health planning regions (e.g., 11 = Los Angeles County).", "code"),
    "HFPA": f("general", "Health Facility Planning Area (HFPA) Number", "Planning area",
              "HCAI's smaller planning area within the health service area, used to assess local bed need.", "code"),
    "TYPE_CNTRL": f("general", "Type of Control", "Ownership type",
                    "Who owns and governs the hospital: Non-Profit, Investor (for-profit), District, City/County, or State.", "text"),
    "TYPE_CARE": f("general", "Type of Care", "Primary type of care",
                   "The hospital's main focus: General acute, Children's, Psychiatric, or Specialty.", "text"),
    "TYPE_HOSP": f("general", "Type of Hospital", "Comparability group",
                   "Whether HCAI considers the hospital's data comparable to typical hospitals. Kaiser, psychiatric health facilities, state hospitals, and long-term-care-focused hospitals are flagged separately.",
                   "text", caution="Kaiser hospitals report financials differently from other hospitals, so this app leaves non-comparable hospitals out of peer groups by default."),
    "TEACH_RURL": f("general", "Teaching or Small/Rural Hospital", "Teaching or rural status",
                    "Marks HCAI-designated teaching hospitals and small/rural hospitals (per Health & Safety Code §124840).", "text"),
    "PHONE": f("general", "Phone Number", "Phone", "Main business phone number.", "text"),
    "ADDRESS": f("general", "Street Address", "Address", "Street address of the hospital.", "text"),
    "CITY": f("general", "City", "City", "City where the hospital is located.", "text"),
    "ZIP_CODE": f("general", "Zip Code", "ZIP code", "Hospital ZIP code.", "text"),
    "CEO": f("general", "Chief Executive Officer", "CEO", "The hospital's chief executive or top administrator at the time of the report.", "text"),
    "CEO_TITLE": f("general", "CEO Title", "CEO title", "Title of the top executive.", "text"),
    "WEB_SITE": f("general", "Hospital Web Site Address", "Website", "Hospital website.", "text"),
    "OWNER": f("general", "Hospital Owner", "Licensed owner", "The organization licensed to operate the hospital, often the parent health system.", "text"),
    "RPT_PREP": f("general", "Report Preparer", "Report preparer", "Person who prepared the annual disclosure report.", "text"),
    "ORG_NAME": f("general", "Report Preparer Organization Name", "Preparer's organization", "Organization of the person who prepared the report.", "text"),
    "ER_DESIG": f("general", "ER Trauma Center Designation", "Trauma center level",
                  "Trauma designation from the local EMS agency. Level I is the highest; blank means not a designated trauma center.", "code"),
    "MCAR_PRO_NO": f("general", "Medicare Provider Number", "Medicare provider number (CCN)",
                     "Medicare certification number, useful for matching to CMS datasets.", "code"),
    "MCAL_PRO_NO": f("general", "Medi-Cal Provider Number Contract", "Medi-Cal contract provider number",
                     "Medi-Cal provider number used for contracted services.", "code"),
    "REG_MCAL_NO": f("general", "Medi-Cal Non-Contract Provider Number", "Medi-Cal non-contract provider number",
                     "Medi-Cal provider number used for non-contracted services.", "code"),
    # -- Beds
    "BED_LIC": f("beds", "Licensed Beds (End of Period)", "Licensed beds",
                 "Beds on the hospital's license at period end (not counting newborn bassinets). The usual measure of hospital size.", "beds"),
    "BED_AVL": f("beds", "Available Beds (Average)", "Available beds",
                 "Average number of beds physically in place and usable, whether or not staffed.", "beds"),
    "BED_STF": f("beds", "Staffed Beds (Average)", "Staffed beds",
                 "Average number of beds set up and staffed for patients — the beds the hospital can actually use.", "beds"),
    # -- Rates
    "OCC_LIC": f("rates", "Occupancy Rate (Licensed Beds)", "Occupancy (licensed beds)",
                 "Share of licensed bed capacity that was filled: patient days ÷ (licensed beds × days in period).", "pct",
                 caution="Licensed beds often exceed staffed beds, so this can understate how full the hospital feels day to day."),
    "OCC_AVL": f("rates", "Occupancy Rate (Available Beds)", "Occupancy (available beds)",
                 "Share of available bed capacity that was filled: patient days ÷ (available beds × days in period).", "pct"),
    "ALOS_ALL": f("rates", "Average Length of Stay (incl. LTC)", "Average length of stay (all units)",
                  "Average days per inpatient stay, including long-term care units.", "days",
                  caution="Long-term care stays are much longer, so hospitals with skilled nursing units look higher. Use the 'excluding LTC' version to compare."),
    "ALOS_EXLTC": f("rates", "Average Length of Stay (excl. LTC)", "Average length of stay (excl. long-term care)",
                    "Average days per inpatient stay, excluding long-term care units. The more comparable version.", "days"),
    # -- Nursery
    "BAS_NURSRY": f("nursery", "Nursery Bassinets", "Nursery bassinets", "Average number of newborn nursery bassinets.", "beds"),
    "DAY_NURSRY": f("nursery", "Nursery Days", "Nursery days", "Days newborns spent in the regular nursery (not NICU).", "days"),
    "DIS_NURSRY": f("nursery", "Nursery Discharges", "Nursery discharges", "Newborns released from the regular nursery.", "count"),
    # -- Outpatient visits
    "VIS_ER": f("outpatient_visits", "Visits Emergency Room", "Emergency department visits",
                "Every patient visit to the emergency department, whether or not the patient was then admitted.", "count"),
    "VIS_CLIN": f("outpatient_visits", "Visits Clinic", "Clinic visits",
                  "Scheduled visits to the hospital's on-site or satellite clinics.", "count"),
    "VIS_HOME": f("outpatient_visits", "Visits Home Health Care", "Home health visits",
                  "Visits by the hospital's home health staff to patients' homes.", "count"),
    "VIS_REF_OP": f("outpatient_visits", "Visits Referred Outpatient", "Referred outpatient visits",
                    "Visits by patients sent by an outside physician for tests or therapy (e.g., imaging, lab, physical therapy).", "count"),
    "DAYS_PIPS": f("outpatient_visits", "Purchased Inpatient Days", "Purchased inpatient days",
                   "Inpatient days the hospital bought from another hospital for its managed care members.", "days"),
    # -- Surgery
    "OP_ROOM": f("surgery", "Operating Rooms", "Operating rooms", "Operating rooms at the hospital and its satellite surgery centers.", "count"),
    "OP_MIN_IP": f("surgery", "Operating Minutes Inpatient", "Inpatient operating minutes",
                   "Total minutes of inpatient surgery, measured from start to end of anesthesia.", "minutes"),
    "OP_MIN_OP": f("surgery", "Operating Minutes Outpatient", "Outpatient operating minutes",
                   "Total minutes of outpatient surgery, measured from start to end of anesthesia.", "minutes"),
    "SURG_IP": f("surgery", "Surgeries Inpatient", "Inpatient surgeries",
                 "Inpatient surgical cases. One patient visit counts as one surgery regardless of procedures performed.", "count"),
    "SURG_OP": f("surgery", "Surgeries Outpatient", "Outpatient surgeries",
                 "Same-day outpatient surgical cases.", "count"),
    "NAT_BIRTHS": f("surgery", "Natural Births", "Vaginal births", "Babies delivered without surgery.", "count"),
    "C_SECTIONS": f("surgery", "Cesarean Sections", "C-sections", "Babies delivered by cesarean section.", "count"),
    # -- Income statement
    "GR_PT_REV": f("income", "Gross Patient Revenue Total", "Gross patient revenue (charges)",
                   "All patient charges at full list price, before any discounts.", "usd",
                   caution="List prices, not collections. Rises every year with price increases even when volume is flat."),
    "DED_FR_REV": f("income", "Deductions from Revenue Total", "Total deductions from revenue",
                    "All reductions from list price: contractual discounts, charity care, bad debt, and other adjustments.", "usd"),
    "TOT_CAP_REV": f("income", "Total Capitation Premium Revenue", "Capitation revenue",
                     "Fixed per-member-per-month payments from managed care plans.", "usd"),
    "NET_PT_REV": f("income", "Net Patient Revenue Total", "Net patient revenue",
                    "What the hospital expects to actually collect for patient care: charges + capitation − deductions. The best single measure of patient revenue.", "usd"),
    "OTH_OP_REV": f("income", "Other Operating Revenue", "Other operating revenue",
                    "Revenue from non-patient activities tied to operations, such as cafeteria sales, parking, and rebates.", "usd",
                    drivers=["Grant income (some hospitals booked COVID relief funds here in 2020–21).",
                             "New or discontinued retail pharmacy, cafeteria, or parking operations."]),
    "TOT_OP_EXP": f("income", "Total Operating Expenses", "Total operating expenses",
                    "The full cost of running the hospital: labor, supplies, services, depreciation, and interest. Excludes bad debt.", "usd"),
    "NET_FRM_OP": f("income", "Net from Operations", "Operating income",
                    "Operating revenue minus operating expenses — profit or loss from running the hospital, before investment income and other non-operating items.", "usd"),
    "NONOP_REV": f("income", "Non-Operating Revenue", "Non-operating revenue",
                   "Income not tied to patient care: investment returns, donations, district taxes, county appropriations.", "usd",
                   drivers=["Investment market swings (e.g., 2022 losses, 2023 recovery).", "One-time gifts or asset sales."]),
    "NONOP_EXP": f("income", "Non-Operating Expenses", "Non-operating expenses",
                   "Costs not tied to patient care, such as running a medical office building or gift shop.", "usd"),
    "INC_TAX": f("income", "Provision for Income Taxes", "Income taxes", "Income taxes. Only for investor-owned hospitals.", "usd"),
    "EXT_ITEM": f("income", "Extraordinary Items", "Extraordinary items",
                  "Rare, one-time gains or losses (e.g., a fire). Positive = loss, negative = gain.", "usd"),
    "NET_INCOME": f("income", "Net Income", "Net income (bottom line)",
                    "Operating income plus non-operating items, minus taxes and extraordinary items.", "usd",
                    caution="Can be driven by investment returns rather than operations. Look at operating income for the underlying business."),
    # -- Gross revenue by revenue center
    "GR_REV_DLY": f("revenue_center", "Gross Patient Revenue Daily Hospital Services", "Room & board charges",
                    "Charges for inpatient nursing units and room & board at list price.", "usd"),
    "GR_REV_AMB": f("revenue_center", "Gross Patient Revenue Ambulatory Services", "Ambulatory charges",
                    "Charges for the ED, clinics, observation, and home health at list price.", "usd"),
    "GR_REV_ANC": f("revenue_center", "Gross Patient Revenue Ancillary Services", "Ancillary charges",
                    "Charges for lab, imaging, pharmacy, surgery, therapy, and other ancillary services at list price.", "usd"),
    # -- Deductions (non-payer)
    "DISP_855": f("deductions", "Disproportionate Share Payments for Medi-Cal (SB 855)", "Medi-Cal DSH payments (SB 855)",
                  "Extra Medi-Cal payments to hospitals serving many low-income patients. Recorded as a negative deduction (it adds revenue).", "usd",
                  drivers=["Eligibility and payment amounts are recalculated each program year.",
                           "Timing of state payments can shift amounts between years."]),
    "BAD_DEBT": f("deductions", "Provision for Bad Debts", "Bad debt",
                  "Bills the hospital expects patients who could pay won't pay.", "usd",
                  drivers=["Patients losing coverage (e.g., Medi-Cal redeterminations in 2023–24) or rising deductibles.",
                           "Changes in how accounts are classified between bad debt and charity care."]),
    "CHAR_HB": f("deductions", "Charity-Hill-Burton", "Charity care (Hill-Burton)",
                 "Free or reduced-price care provided to meet federal Hill-Burton obligations. Rare today.", "usd"),
    "CHAR_OTH": f("deductions", "Charity-Other", "Charity care",
                  "Care provided free or at a discount to patients unable to pay, valued at list price.", "usd",
                  drivers=["Financial assistance policy changes (California's AB 1020 expanded eligibility starting 2024).",
                           "Changes in the uninsured population and Medi-Cal enrollment."]),
    "SUB_INDGNT": f("deductions", "Restricted Donations and Subsidies for Indigent Care", "Donations & subsidies for indigent care",
                    "Grants or subsidies designated for indigent patients' care. Recorded as a negative deduction.", "usd"),
    "DED_OTH": f("deductions", "All Other Deductions from Revenue", "Other deductions",
                 "Other reductions from charges: policy discounts, administrative adjustments, and teaching allowances at UC hospitals.", "usd"),
    # -- Other financial items
    "DISP_TRNFR": f("financial_other", "Dispro Share Funds Transferred to Related Public Entity", "DSH funds transferred out",
                    "Medi-Cal disproportionate share funds a public hospital passed back to a related public entity.", "usd"),
    "INTER_TFR": f("financial_other", "Intercompany Transfers", "Transfers with parent/affiliates",
                   "Cash sent to (negative) or received from (positive) a related organization. Affects equity directly.", "usd"),
    "CONTRIBTNS": f("financial_other", "Unrestricted Contributions", "Unrestricted donations",
                    "Gifts and grants with no donor restrictions.", "usd"),
    "INC_INVEST": f("financial_other", "Incomes, Gains & Losses from Unrestricted Investments", "Investment income",
                    "Interest, dividends, and gains or losses on unrestricted investments.", "usd"),
    "DIST_REV": f("financial_other", "District Assessment Revenue", "District tax revenue",
                  "Property-tax and assessment revenue received by healthcare district hospitals.", "usd"),
    "CNTY_APPRO": f("financial_other", "County Appropriations", "County appropriations",
                    "General-fund support a county provides to its county hospital.", "usd"),
    # -- Expenses by cost center (EXP_ uses FISC/UNASSG spellings)
    "EXP_DLY": f("expense_center", "Expenses Daily Hospital Services", "Inpatient unit expenses",
                 "Direct costs of inpatient nursing units.", "usd"),
    "EXP_AMB": f("expense_center", "Expenses Ambulatory Services", "Ambulatory expenses",
                 "Direct costs of the ED, clinics, observation, and home health.", "usd"),
    "EXP_ANC": f("expense_center", "Expenses Ancillary Services", "Ancillary expenses",
                 "Direct costs of lab, imaging, pharmacy, surgery, therapy, and other ancillary departments.", "usd"),
    "EXP_PIP": f("expense_center", "Expenses Purchased Inpatient Services", "Purchased inpatient care",
                 "Cost of inpatient care bought from other hospitals for managed care members.", "usd"),
    "EXP_POP": f("expense_center", "Expenses Purchased Outpatient Services", "Purchased outpatient care",
                 "Cost of outpatient care bought from other hospitals, usually under capitation contracts.", "usd"),
    "EXP_RES": f("expense_center", "Research", "Research expenses", "Direct costs of formal research programs.", "usd"),
    "EXP_ED": f("expense_center", "Education", "Education expenses",
                "Direct costs of formal education programs such as residency and nursing school (not in-service training).", "usd"),
    "EXP_GEN": f("expense_center", "General Services", "General services expenses",
                 "Dietary, laundry, housekeeping, and plant operations.", "usd"),
    "EXP_FISC": f("expense_center", "Fiscal Services", "Fiscal services expenses",
                  "Accounting, patient accounting (billing), and admitting.", "usd"),
    "EXP_ADM": f("expense_center", "Administrative Services", "Administrative expenses",
                 "Administration, HR, medical records, and similar overhead departments.", "usd",
                 drivers=["Management fees charged by a parent health system often land here or in purchased services."]),
    "EXP_UNASSG": f("expense_center", "Unassigned Costs", "Unassigned costs",
                    "Costs not assigned to a department: building depreciation, building leases, and some interest.", "usd"),
    # -- Expenses by natural classification
    "EXP_SAL": f("expense_natural", "Salaries and Wages", "Salaries & wages",
                 "Pay for employees' time worked, including overtime and on-call premiums. Usually the largest expense.", "usd",
                 drivers=["Wage increases from union contracts and market pressure.",
                          "California's health care worker minimum wage (SB 525), phased in starting October 2024.",
                          "Headcount changes and shifts between employed and contract staff."]),
    "EXP_BEN": f("expense_natural", "Employee Benefits", "Employee benefits",
                 "Paid time off, health insurance, retirement, workers' comp, and payroll taxes.", "usd",
                 drivers=["Health plan cost trends.", "Pension actuarial changes, which can be large and one-time."]),
    "EXP_PHYS": f("expense_natural", "Physician Professional Fees", "Physician fees",
                  "Payments to physicians for professional services (e.g., ED coverage, hospitalists, call pay).", "usd",
                  drivers=["Physician coverage and stipend contracts, which have risen with specialist shortages."]),
    "EXP_OTHPRO": f("expense_natural", "Other Professional Fees", "Other professional fees",
                    "Fees for non-physician professionals: consultants, auditors, lawyers, therapists, and registry (travel) nurses.", "usd",
                    drivers=["Travel/registry nurse spending, which spiked in 2021–22 and has come down since.",
                             "Consulting projects and legal matters."]),
    "EXP_SUPP": f("expense_natural", "Supplies", "Supplies & drugs",
                  "Medical supplies, drugs, food, and office supplies.", "usd",
                  drivers=["Drug prices, especially specialty and oncology drugs.",
                           "Surgical volume and implant costs.", "Supply-chain inflation."]),
    "EXP_PURCH": f("expense_natural", "Purchased Services", "Purchased services",
                   "Outside vendors: imaging reads, equipment maintenance, collection agencies, IT, and management fees paid to a parent system.", "usd",
                   drivers=["Outsourcing (moves cost out of salaries into this line).",
                            "Changes in parent-system management fee allocations."]),
    "EXP_DEPRE": f("expense_natural", "Depreciation", "Depreciation",
                   "The yearly cost of buildings and equipment spread over their useful life. A non-cash expense.", "usd",
                   drivers=["New buildings or equipment going into service (e.g., seismic replacement towers).",
                            "Older assets becoming fully depreciated."]),
    "EXP_LEASES": f("expense_natural", "Leases and Rentals", "Leases & rentals",
                    "Rent for buildings, equipment, and leasehold improvements.", "usd"),
    "EXP_INSUR": f("expense_natural", "Insurance - Hospital and Professional Malpractice", "Malpractice insurance",
                   "Professional liability insurance and actuarially determined self-insurance costs.", "usd"),
    "EXP_INTRST": f("expense_natural", "Interest - Working Capital and Other", "Interest expense",
                    "Interest on short- and long-term debt.", "usd",
                    drivers=["New bond issues or refinancing.", "Variable-rate debt when interest rates change (e.g., 2022–23 increases)."]),
    "EXP_OTH": f("expense_natural", "All Other Expenses", "All other expenses",
                 "Everything else: utilities, non-malpractice insurance, telephones, and other costs.", "usd"),
    # -- Balance sheet assets
    "CUR_ASST": f("assets", "Current Assets", "Current assets",
                  "Cash, receivables, inventory, and other assets expected to turn into cash within a year.", "usd"),
    "ASST_LIMTD": f("assets", "Assets Whose Use Is Limited", "Limited-use assets",
                    "Cash and investments set aside by the board, a bond trustee, or others — e.g., funded depreciation or bond reserves.", "usd"),
    "NET_PPE": f("assets", "Net Property, Plant, and Equipment", "Net property & equipment",
                 "Land, buildings, and equipment at cost minus accumulated depreciation.", "usd"),
    "CONST_PROG": f("assets", "Construction-in-Progress", "Construction in progress",
                    "Cost of projects under construction that aren't in service yet.", "usd",
                    drivers=["Seismic compliance and expansion projects starting or finishing (completed projects move into property & equipment)."]),
    "INV_OTH": f("assets", "Investments and Other Assets", "Investments & other assets",
                 "Long-term investments and other non-current assets, including long-term amounts owed by affiliates.", "usd"),
    "INTAN_ASST": f("assets", "Intangible Assets", "Intangible assets",
                    "Goodwill, unamortized financing costs, and other non-physical assets.", "usd"),
    "TOT_ASST": f("assets", "Total Assets", "Total assets", "Everything the hospital owns. Equals total liabilities and equity.", "usd"),
    # -- Liabilities & equity
    "CUR_LIAB": f("liabilities", "Current Liabilities", "Current liabilities",
                  "Bills and obligations due within a year: accounts payable, accrued payroll, current debt payments.", "usd"),
    "DEF_CRED": f("liabilities", "Deferred Credits", "Deferred credits",
                  "Money received or recorded before it's earned, such as deferred third-party income.", "usd"),
    "NET_LTDEBT": f("liabilities", "Net Long-term Debt", "Long-term debt (net)",
                    "Debt due after one year, including long-term amounts owed to affiliates.", "usd"),
    "EQUITY": f("liabilities", "Equity", "Equity (net assets)",
                "Total assets minus total liabilities — the hospital's net worth. Nonprofits call this fund balance or net assets.", "usd",
                caution="Negative equity means liabilities exceed assets."),
    "LIAB_EQ": f("liabilities", "Total Liabilities and Equity", "Total liabilities & equity",
                 "Everything the hospital owes plus its equity. Equals total assets.", "usd"),
    # -- Balance sheet detail
    "CASH": f("balance_other", "Cash", "Cash",
              "Cash in the bank and immediately available, including savings, CDs, and treasury notes.", "usd",
              caution="Many system-affiliated hospitals sweep cash to the parent daily, so hospital-level cash can be near zero even at financially strong systems."),
    "ACCTS_REC": f("balance_other", "Accounts and Notes Receivable", "Patient accounts receivable",
                   "Unpaid patient bills owed by patients and insurers, at charges.", "usd"),
    "ALLOW_UNCOLL": f("balance_other", "Allowance for Uncollectible Receivables and Third Party Contractual Withholds",
                      "Allowance for uncollectibles", "The portion of receivables the hospital doesn't expect to collect.", "usd"),
    "BLDGS": f("balance_other", "Buildings and Improvements", "Buildings (at cost)",
               "Original cost of buildings, parking structures, and fixed equipment.", "usd"),
    "EQUIPMENT": f("balance_other", "Equipment", "Equipment (at cost)", "Original cost of movable and minor equipment.", "usd"),
    "TOT_PPE": f("balance_other", "Total Property, Plant and Equipment", "Total property & equipment (at cost)",
                 "Original cost of land, buildings, and equipment before depreciation.", "usd"),
    "ACC_DEPRE": f("balance_other", "Accumulated Depreciation", "Accumulated depreciation",
                   "Total depreciation recorded to date on property and equipment. High relative to cost means aging facilities.", "usd"),
    "MORT_PAY": f("balance_other", "Mortgages Payable", "Mortgages", "Unpaid mortgage principal.", "usd"),
    "CAP_LEASE": f("balance_other", "Capital Lease Obligation", "Capital lease obligations", "Unpaid principal on capital (finance) leases.", "usd"),
    "BOND_PAY": f("balance_other", "Bonds Payable", "Bonds payable", "Unpaid principal on bonds.", "usd"),
    "TOT_LTDEBT": f("balance_other", "Total Long-Term Debt", "Total long-term debt",
                    "All long-term debt, including the portion due this year.", "usd"),
    "CUR_MAT": f("balance_other", "Current Maturities on Long-term Debt", "Debt due within a year",
                 "The part of long-term debt that must be repaid in the next 12 months.", "usd"),
    "INTER_REC": f("balance_other", "Intercompany Receivables (Current and Non-Current)", "Owed by affiliates",
                   "Amounts related organizations (e.g., the parent system) owe the hospital.", "usd",
                   caution="At system-affiliated hospitals this often holds the cash swept to the parent."),
    "INTER_PAY": f("balance_other", "Intercompany Payables (Current and Non-Current)", "Owed to affiliates",
                   "Amounts the hospital owes related organizations.", "usd"),
    # -- Labor
    "HOSP_FTE": f("labor", "Number of Hospital Paid FTEs", "Paid FTEs (employees)",
                  "Full-time-equivalent employees: total paid hours ÷ 2,080. Excludes registry and contract staff.", "fte"),
    "NURS_FTE": f("labor", "Number of Nursing Service FTE Personnel", "Nursing FTEs",
                  "FTEs for nursing service personnel (RNs, LVNs, aides, orderlies, ward clerks), including registry nurses.", "fte"),
    "PROD_HRS": f("labor", "Total Productive Hours", "Hours worked",
                  "Total hours actually worked, including contract staff.", "hours"),
    "NON_PRD_HR": f("labor", "Total Non-Productive Hours", "Paid time off hours",
                    "Paid hours not worked: vacation, sick leave, holidays.", "hours"),
    "PAID_HRS": f("labor", "Total Paid Hours", "Total paid hours",
                  "All paid hours, worked or not.", "hours"),
    "MED_STAFF": f("labor", "Number of Active Medical Staff", "Active medical staff",
                   "Physicians who are voting members of the hospital's medical staff (employed or not).", "count"),
    "STDNT_FTE": f("labor", "Number of Student FTEs", "Residents & fellows (FTE)",
                   "Full-time-equivalent residents and fellows in training.", "fte"),
    "CNT_HR_RN": f("contract_labor", "Registry Nurses", "Registry/travel nurse hours",
                   "Hours worked by registry or travel nursing staff (RNs, LVNs, aides) not on the hospital payroll.", "hours"),
    "CNT_HR_OTH": f("contract_labor", "Other Contracted Services", "Other contract labor hours",
                    "Hours worked by other temporary contracted staff, such as therapists and clerical support.", "hours"),
}


def _generate() -> dict[str, dict]:
    fields: dict[str, dict] = {}

    for prefix, (section, hcai_measure, plain_measure, unit, template) in PAYER_MEASURES.items():
        for code, (payer_label, payer_desc) in PAYERS.items():
            if prefix == "C_ADJ_" and code not in {"MCAR_TR", "MCAR_MC", "MCAL_TR", "MCAL_MC", "CNTY", "THRD_TR", "THRD_MC"}:
                continue
            if prefix == "NETRV_" and code == "TOT":
                continue
            desc = payer_desc[0].lower() + payer_desc[1:]
            fields[f"{prefix}{code}"] = {
                "section": section,
                "hcaiLabel": f"{hcai_measure} {PAYER_HCAI[code]}",
                "label": f"{plain_measure} — {payer_label}",
                "summary": template.format(payer_desc=desc),
                "unit": unit,
                "payer": code,
            }

    for code, (hcai_payer, plain) in CAPITATION.items():
        fields[code] = {
            "section": "capitation",
            "hcaiLabel": f"Capitation Premium Revenue {hcai_payer}",
            "label": f"Capitation revenue — {plain}",
            "summary": f"Fixed per-member-per-month payments from {plain} plans.",
            "unit": "usd",
        }

    for care, (hcai_care, plain_care, desc) in CARE_TYPES.items():
        for prefix, (hcai_measure, plain_measure, unit, template) in CARE_MEASURES.items():
            fields[f"{prefix}{care}"] = {
                "section": "care_type",
                "hcaiLabel": f"{hcai_measure} {hcai_care}",
                "label": f"{plain_care} {plain_measure}",
                "summary": template.format(care_desc=desc),
                "unit": unit,
            }

    for cls, (hcai, plain, desc) in EMPLOYEE_CLASSES.items():
        fields[f"PRD_HR_{cls}"] = {
            "section": "hours_class",
            "hcaiLabel": f"Productive Hours {hcai}",
            "label": f"Hours worked — {plain}",
            "summary": f"{desc}: hours actually worked by employees.",
            "unit": "hours",
        }

    for cc, (hcai, plain, desc) in COST_CENTERS.items():
        fields[f"PRD_HR_{cc}"] = {
            "section": "hours_productive_center",
            "hcaiLabel": f"Productive Hours {hcai}",
            "label": f"Hours worked — {plain}",
            "summary": f"Hours actually worked (employees plus contract staff) in {desc}.",
            "unit": "hours",
        }
        fields[f"PD_HR_{cc}"] = {
            "section": "hours_paid_center",
            "hcaiLabel": f"Paid Hours {hcai}",
            "label": f"Paid hours — {plain}",
            "summary": f"All paid hours, including time off, in {desc}.",
            "unit": "hours",
        }

    fields.update(EXPLICIT)  # explicit wording wins over generated
    return fields


FIELDS: dict[str, dict] = _generate()

# --------------------------------------------------------------------------- #
# Derived benchmark metrics (shared with the Benchmark tab)
# --------------------------------------------------------------------------- #

METRICS: dict[str, dict] = {
    "operatingMargin": {
        "category": "financial",
        "label": "Operating margin",
        "unit": "ratio",
        "summary": "Cents of operating profit per dollar of operating revenue.",
        "formula": "NET_FRM_OP ÷ (NET_PT_REV + OTH_OP_REV)",
        "inputs": ["NET_FRM_OP", "NET_PT_REV", "OTH_OP_REV"],
        "higherIsBetter": True,
        "drivers": SECTIONS["income"]["drivers"],
    },
    "daysCashOnHand": {
        "category": "financial",
        "label": "Days cash on hand",
        "unit": "days",
        "summary": "How many days the hospital could pay its operating expenses from the cash on its own balance sheet.",
        "formula": "CASH ÷ ((TOT_OP_EXP − EXP_DEPRE) ÷ days in period)",
        "inputs": ["CASH", "TOT_OP_EXP", "EXP_DEPRE", "DAY_PER"],
        "higherIsBetter": True,
        "caution": "Hospital-level cash only. System-affiliated hospitals often sweep cash to the parent, so compare within similar ownership structures. Rating-agency figures (which include investments at the system level) are much higher.",
        "drivers": [
            "Operating results adding to or draining cash.",
            "Cash swept to or from a parent system.",
            "Timing of large receipts such as Medi-Cal supplemental payments.",
            "Capital spending and debt service.",
        ],
    },
    "occupancy": {
        "category": None,
        "label": "Occupancy rate",
        "unit": "pct",
        "summary": "Share of licensed beds filled on an average day.",
        "formula": "Patient days ÷ (licensed beds × days in period) — HCAI OCC_LIC",
        "inputs": ["OCC_LIC", "DAY_TOT", "BED_LIC"],
        "higherIsBetter": None,
        "drivers": SECTIONS["rates"]["drivers"],
    },
    "edVisits": {
        "category": None,
        "label": "ED visits",
        "unit": "count",
        "summary": "Emergency department visits in the year (annualized if the report didn't cover a full year).",
        "formula": "VIS_ER",
        "inputs": ["VIS_ER"],
        "higherIsBetter": None,
        "drivers": SECTIONS["outpatient_visits"]["drivers"],
    },
    "netPatientRevenue": {
        "category": "financial",
        "label": "Net patient revenue",
        "unit": "usd",
        "summary": "What the hospital expects to collect for patient care after contractual discounts, charity care, and bad debt.",
        "formula": "NET_PT_REV",
        "inputs": ["NET_PT_REV"],
        "higherIsBetter": None,
        "drivers": SECTIONS["income"]["drivers"],
    },
    "totalOperatingExpense": {
        "category": "financial",
        "label": "Operating expense",
        "unit": "usd",
        "summary": "Total cost of running the hospital for the year, including depreciation and interest.",
        "formula": "TOT_OP_EXP",
        "inputs": ["TOT_OP_EXP"],
        "higherIsBetter": None,
        "drivers": SECTIONS["income"]["drivers"],
    },
    "expensePerAdjDischarge": {
        "category": "financial",
        "label": "Expense per adjusted discharge",
        "unit": "usd",
        "summary": "Operating cost per inpatient discharge, scaled up to count outpatient work — the standard unit-cost comparison between hospitals.",
        "formula": "TOT_OP_EXP ÷ (DIS_TOT × GR_PT_REV ÷ GR_IP_TOT)",
        "inputs": ["TOT_OP_EXP", "DIS_TOT", "GR_PT_REV", "GR_IP_TOT"],
        "higherIsBetter": False,
        "caution": "Case mix matters: trauma, transplant, and tertiary centers treat sicker patients and cost more per discharge. Compare within similar hospitals.",
        "drivers": [
            "Labor cost per hour (wage increases, travel and registry staff, SB 525 minimum wage).",
            "Supply and drug costs, especially for surgery-heavy or oncology service lines.",
            "Volume: fixed costs spread over fewer discharges push the unit cost up.",
            "Charge-master changes move the outpatient adjustment, since it's based on gross charges.",
        ],
    },
    "revenuePerAdjDischarge": {
        "category": "financial",
        "label": "Revenue per adjusted discharge",
        "unit": "usd",
        "summary": "Operating revenue per inpatient discharge, scaled up to count outpatient work. Compare with expense per adjusted discharge to see where the margin comes from.",
        "formula": "(NET_PT_REV + OTH_OP_REV) ÷ (DIS_TOT × GR_PT_REV ÷ GR_IP_TOT)",
        "inputs": ["NET_PT_REV", "OTH_OP_REV", "DIS_TOT", "GR_PT_REV", "GR_IP_TOT"],
        "higherIsBetter": True,
        "drivers": [
            "Payer mix: Medicare and Medi-Cal pay less per case than commercial insurers.",
            "Commercial contract renegotiations and annual Medicare rate updates.",
            "Medi-Cal supplemental payments (Hospital Quality Assurance Fee program) arriving in lumpy cycles.",
            "Case mix: sicker patients bring higher payments per discharge.",
        ],
    },
    "outpatientVisits": {
        "category": "utilization",
        "label": "Outpatient visits",
        "unit": "count",
        "summary": "Outpatient visits of every kind in the hospital's fiscal year, from the financial report (the utilization report doesn't total them).",
        "formula": "VIS_TOT",
        "inputs": ["VIS_TOT"],
        "higherIsBetter": None,
        "caution": "Counted by fiscal year, not calendar year like the other utilization measures. Hospitals count visits differently (a series of therapy sessions may be one visit or many), so compare trends more than levels.",
        "drivers": SECTIONS["outpatient_visits"]["drivers"],
    },
    "payerMix": {
        "category": "financial",
        "label": "Payer mix",
        "unit": "share",
        "summary": "Share of the hospital's business by payer, measured by gross charges (inpatient + outpatient) or by inpatient days.",
        "formula": "(GR_IP_<payer> + GR_OP_<payer>) ÷ Σ all payers; or DAY_<payer> ÷ Σ all payers",
        "inputs": ["GR_IP_*", "GR_OP_*", "DAY_*"],
        "higherIsBetter": None,
        "drivers": SECTIONS["inpatient_payer"]["drivers"],
    },
}

# Medicare lens: the same measures narrowed to Medicare (traditional + Medicare
# Advantage) from HCAI's own payer columns, so years and definitions match the
# all-payer view. `lens` marks them; `allPayer` names the metric each one
# replaces when the Benchmark "Payer view" is set to Medicare.
_MCAR_TR_MC = "MCAR_TR + MCAR_MC"
_MCAR_COST_CAUTION = (
    "Estimated, and more negative than MedPAC's figures by design. HCAI doesn't report expenses by payer, so Medicare's "
    "cost is its gross charges times the hospital's cost-to-charge ratio (the AHA payment-to-cost method). MedPAC's "
    "Medicare margin (−13% nationally in 2023) counts only Medicare-allowable costs from cost reports and only traditional "
    "Medicare. The AHA method counts all operating expense and includes Medicare Advantage: nationally it put Medicare "
    "at 82 cents per dollar of cost in 2022 (a margin near −22%), and California hospitals run lower, near 75 cents "
    "(about −33%). Compare hospitals with each other here, not with MedPAC or the Medicare cost report (CMS-2552)."
)
MEDICARE_METRICS: dict[str, dict] = {
    "medicareMargin": {
        "category": "financial",
        "estimate": True,
        "lens": "medicare",
        "allPayer": "operatingMargin",
        "label": "Medicare margin",
        "unit": "ratio",
        "summary": "Estimated profit or loss per dollar of Medicare net patient revenue, with Medicare's cost estimated from its charges and the hospital's cost-to-charge ratio.",
        "formula": f"(NETRV_MCAR − GR_MCAR × TOT_OP_EXP ÷ (GR_PT_REV + OTH_OP_REV)) ÷ NETRV_MCAR, where MCAR = {_MCAR_TR_MC} and GR = GR_IP_ + GR_OP_",
        "inputs": ["NETRV_MCAR_TR", "NETRV_MCAR_MC", "TOT_OP_EXP", "OTH_OP_REV", "GR_IP_MCAR_TR", "GR_IP_MCAR_MC", "GR_OP_MCAR_TR", "GR_OP_MCAR_MC", "GR_PT_REV"],
        "higherIsBetter": True,
        "caution": _MCAR_COST_CAUTION,
        "drivers": [
            "Annual Medicare payment updates (IPPS and OPPS) versus local wage and supply inflation.",
            "Case mix: sicker Medicare patients bring higher DRG payments.",
            "Medicare Advantage contract terms, and denials or downgrades by MA plans.",
            "Cost per case: length of stay, staffing, and supply use.",
        ],
    },
    "medicareRevenuePerAdjDischarge": {
        "category": "financial",
        "lens": "medicare",
        "allPayer": "revenuePerAdjDischarge",
        "label": "Medicare revenue per adjusted discharge",
        "unit": "usd",
        "summary": "Medicare net patient revenue per Medicare inpatient stay, scaled up for Medicare outpatient work.",
        "formula": f"NETRV_MCAR ÷ (DIS_MCAR × GR_MCAR ÷ GR_IP_MCAR), where MCAR = {_MCAR_TR_MC}",
        "inputs": ["NETRV_MCAR_TR", "NETRV_MCAR_MC", "DIS_MCAR_TR", "DIS_MCAR_MC", "GR_IP_MCAR_TR", "GR_IP_MCAR_MC", "GR_OP_MCAR_TR", "GR_OP_MCAR_MC"],
        "higherIsBetter": True,
        "drivers": [
            "Annual Medicare rate updates and the hospital's wage index.",
            "Case mix index of Medicare patients.",
            "Add-on payments: disproportionate share (DSH), uncompensated care, and graduate medical education.",
            "Medicare Advantage rates, which are negotiated and can sit above or below traditional Medicare.",
        ],
    },
    "medicareCostPerAdjDischarge": {
        "category": "financial",
        "estimate": True,
        "lens": "medicare",
        "allPayer": "expensePerAdjDischarge",
        "label": "Medicare cost per adjusted discharge",
        "unit": "usd",
        "summary": "Estimated cost of caring for Medicare patients, per Medicare adjusted discharge.",
        "formula": f"(GR_MCAR × TOT_OP_EXP ÷ (GR_PT_REV + OTH_OP_REV)) ÷ (DIS_MCAR × GR_MCAR ÷ GR_IP_MCAR), where MCAR = {_MCAR_TR_MC}",
        "inputs": ["TOT_OP_EXP", "OTH_OP_REV", "GR_PT_REV", "DIS_MCAR_TR", "DIS_MCAR_MC", "GR_IP_MCAR_TR", "GR_IP_MCAR_MC", "GR_OP_MCAR_TR", "GR_OP_MCAR_MC"],
        "higherIsBetter": False,
        "caution": _MCAR_COST_CAUTION,
        "drivers": [
            "Length of stay of Medicare patients.",
            "Labor costs, contract labor, and supply prices.",
            "Charge-master changes, which shift how expense is allocated between payers.",
        ],
    },
    "medicareNetRevenue": {
        "category": "financial",
        "lens": "medicare",
        "allPayer": "netPatientRevenue",
        "label": "Medicare net patient revenue",
        "unit": "usd",
        "summary": "What the hospital expects to collect from traditional Medicare and Medicare Advantage plans, after contractual discounts.",
        "formula": "NETRV_MCAR_TR + NETRV_MCAR_MC",
        "inputs": ["NETRV_MCAR_TR", "NETRV_MCAR_MC"],
        "higherIsBetter": None,
        "drivers": [
            "Medicare volume and case mix.",
            "Annual Medicare payment updates.",
            "Prior-year cost report settlements, which can land in a later year.",
        ],
    },
    "medicareAdvantageShare": {
        "category": "financial",
        "lens": "medicare",
        "label": "Medicare Advantage share",
        "unit": "ratio",
        "summary": "Share of the hospital's Medicare discharges covered by a Medicare Advantage (managed care) plan rather than traditional Medicare.",
        "formula": "DIS_MCAR_MC ÷ (DIS_MCAR_TR + DIS_MCAR_MC)",
        "inputs": ["DIS_MCAR_TR", "DIS_MCAR_MC"],
        "higherIsBetter": None,
        "drivers": [
            "Medicare Advantage enrollment in the hospital's market, which has risen steadily in California.",
            "Which MA plans the hospital is in network with.",
            "Prior authorization and denial practices that steer MA patients elsewhere.",
        ],
    },
    "medicareDischarges": {
        "category": "utilization",
        "lens": "medicare",
        "allPayer": "discharges",
        "label": "Medicare discharges",
        "unit": "count",
        "summary": "Inpatient stays covered by traditional Medicare or Medicare Advantage in the hospital's fiscal year.",
        "formula": "DIS_MCAR_TR + DIS_MCAR_MC",
        "inputs": ["DIS_MCAR_TR", "DIS_MCAR_MC"],
        "higherIsBetter": None,
        "caution": "From the financial report, so counted by fiscal year rather than the calendar years of the utilization report. Includes every inpatient unit, long-term care included.",
        "drivers": [
            "Aging of the local population and Medicare enrollment.",
            "The two-midnight rule and observation stays, which move Medicare patients between inpatient and outpatient.",
            "Service line growth or closures (cardiac, orthopedics, oncology).",
        ],
    },
    "medicareInpatientDays": {
        "category": "utilization",
        "lens": "medicare",
        "allPayer": "inpatientDays",
        "label": "Medicare inpatient days",
        "unit": "count",
        "summary": "Inpatient days for Medicare patients (traditional and Medicare Advantage) in the hospital's fiscal year.",
        "formula": "DAY_MCAR_TR + DAY_MCAR_MC",
        "inputs": ["DAY_MCAR_TR", "DAY_MCAR_MC"],
        "higherIsBetter": None,
        "caution": "From the financial report (fiscal year). Includes long-term care and skilled nursing days, which the utilization report counts separately.",
        "drivers": [
            "Medicare discharges and length of stay.",
            "Discharge delays to skilled nursing facilities.",
            "Distinct-part skilled nursing or sub-acute units.",
        ],
    },
    "medicareAlos": {
        "category": "utilization",
        "lens": "medicare",
        "allPayer": "alos",
        "label": "Medicare average length of stay",
        "unit": "days",
        "decimals": 1,
        "summary": "Average days a Medicare patient stays, across every inpatient unit.",
        "formula": "(DAY_MCAR_TR + DAY_MCAR_MC) ÷ (DIS_MCAR_TR + DIS_MCAR_MC)",
        "inputs": ["DAY_MCAR_TR", "DAY_MCAR_MC", "DIS_MCAR_TR", "DIS_MCAR_MC"],
        "higherIsBetter": None,
        "caution": "Includes long-term care and skilled nursing days, so hospitals with those units run much higher than their acute-care length of stay. The all-payer view is acute care only.",
        "drivers": [
            "Discharge delays to skilled nursing and home health.",
            "Case mix: older, sicker patients stay longer.",
            "Long-term care or sub-acute units in the hospital.",
        ],
    },
    "medicareOutpatientVisits": {
        "category": "utilization",
        "lens": "medicare",
        "allPayer": "outpatientVisits",
        "label": "Medicare outpatient visits",
        "unit": "count",
        "summary": "Outpatient visits by Medicare patients (traditional and Medicare Advantage) in the hospital's fiscal year.",
        "formula": "VIS_MCAR_TR + VIS_MCAR_MC",
        "inputs": ["VIS_MCAR_TR", "VIS_MCAR_MC"],
        "higherIsBetter": None,
        "caution": "Counted by fiscal year. Hospitals count visits differently, so compare trends more than levels.",
        "drivers": [
            "Shift of procedures from inpatient to outpatient (CMS removing procedures from the inpatient-only list).",
            "Observation stays, which count as outpatient under Medicare.",
            "Outpatient clinic and imaging growth.",
        ],
    },
}
METRICS.update(MEDICARE_METRICS)

PAYER_GROUPS = {
    "medicare": {"label": "Medicare", "includes": ["MCAR_TR", "MCAR_MC"]},
    "medical": {"label": "Medi-Cal", "includes": ["MCAL_TR", "MCAL_MC"]},
    "commercial": {"label": "Commercial", "includes": ["THRD_TR", "THRD_MC"]},
    "indigent": {"label": "County & indigent", "includes": ["CNTY", "OTH_IND"]},
    "other": {"label": "Self-pay & other", "includes": ["OTH"]},
}


def export(field_order: list[str]) -> dict:
    ordered = [c for c in field_order if c in FIELDS]
    ordered += [c for c in FIELDS if c not in ordered]
    return {
        "dataset": "hafd-selected",
        "source": "HCAI Hospital Annual Financial Data Selected Data File Documentation (report periods ended on/after 6/30/2004)",
        "sections": [{"id": k, **v} for k, v in SECTIONS.items()],
        "fields": [{"code": c, **FIELDS[c]} for c in ordered],
        "metrics": [{"id": k, **v} for k, v in METRICS.items()],
        "payerGroups": [{"id": k, **v} for k, v in PAYER_GROUPS.items()],
    }
