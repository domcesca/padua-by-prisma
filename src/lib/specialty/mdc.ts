// Benchmark's specialty view groups Medicare inpatient cases by MDC (Major Diagnostic Category): CMS's own grouping of
// MS-DRGs, mostly by the body system of the principal diagnosis. Each entry gives CMS's official name, the short form
// shown as the label, a plain-language specialty alongside it, and, where the MDC spans services people think of
// separately, a short note saying so.
//
// To relabel a specialty or reword a note, edit its entry; nothing else needs to change. Which DRGs belong to which MDC
// isn't set here: that comes from CMS's Table 5 (etl cms-inpatient, drgs.json). The notes describe what the California
// Medicare cases in each MDC mostly are, from the 2024 data; check them when a new year's data changes the picture.

export type MdcInfo = {
  /** CMS's code: "01"–"25", "PRE" for Pre-MDC, "none" for the DRGs CMS assigns no MDC (981–989). */
  code: string
  /** CMS's official name, from the MS-DRG Definitions Manual. */
  official: string
  /** The label shown: the official name's short form. */
  name: string
  /** The specialty in everyday words, shown alongside ("Cardiac & Vascular"). */
  plain: string
  /** Where the MDC spans more than one specialty, or holds less than its name suggests. */
  note?: string
}

export const MDCS: MdcInfo[] = [
  {
    code: "PRE",
    official: "Pre-MDC",
    name: "Pre-MDC",
    plain: "Transplants, ECMO & Prolonged Ventilation",
    note: "Grouped by the procedure, not a body system: organ and bone marrow transplants, CAR T-cell therapy, ECMO, and tracheostomy with long ventilation, whatever the diagnosis.",
  },
  {
    code: "01",
    official: "Diseases and Disorders of the Nervous System",
    name: "Nervous System",
    plain: "Neurology & Neurosurgery",
    note: "Spans neurology (stroke, seizures) and neurosurgery (craniotomy, some spinal procedures). Spinal fusion, most of spine surgery, is under Musculoskeletal.",
  },
  { code: "02", official: "Diseases and Disorders of the Eye", name: "Eye", plain: "Ophthalmology" },
  {
    code: "03",
    official: "Diseases and Disorders of the Ear, Nose, Mouth and Throat",
    name: "Ear, Nose, Mouth & Throat",
    plain: "ENT",
    note: "Mostly dizziness and balance disorders, plus head and neck surgery and dental conditions.",
  },
  {
    code: "04",
    official: "Diseases and Disorders of the Respiratory System",
    name: "Respiratory System",
    plain: "Pulmonary",
    note: "Mostly pneumonia, respiratory infections, respiratory failure, and COPD; also lung surgery (thoracic surgery). Lung cancer cases are here too.",
  },
  {
    code: "05",
    official: "Diseases and Disorders of the Circulatory System",
    name: "Circulatory System",
    plain: "Cardiac & Vascular",
    note: "Spans cardiology, cardiac surgery, and vascular surgery: heart failure, heart attacks, arrhythmias, catheter and valve procedures, and surgery on arteries and veins outside the heart.",
  },
  {
    code: "06",
    official: "Diseases and Disorders of the Digestive System",
    name: "Digestive System",
    plain: "Gastroenterology & GI Surgery",
    note: "Spans gastroenterology (GI bleeding, obstruction) and general surgery (bowel resection, hernia, appendectomy). Liver, gallbladder, and pancreas have their own MDC.",
  },
  {
    code: "07",
    official: "Diseases and Disorders of the Hepatobiliary System and Pancreas",
    name: "Hepatobiliary System & Pancreas",
    plain: "Liver, Gallbladder & Pancreas",
    note: "Spans hepatology (cirrhosis, liver disease) and general surgery (gallbladder removal). Liver transplants are under Pre-MDC.",
  },
  {
    code: "08",
    official: "Diseases and Disorders of the Musculoskeletal System and Connective Tissue",
    name: "Musculoskeletal System & Connective Tissue",
    plain: "Orthopedics & Spine",
    note: "Spans orthopedics (joint replacement, hip fractures), spine surgery, medical back problems, and rheumatology-adjacent conditions (arthritis, lupus, bone infections).",
  },
  {
    code: "09",
    official: "Diseases and Disorders of the Skin, Subcutaneous Tissue and Breast",
    name: "Skin, Subcutaneous Tissue & Breast",
    plain: "Skin, Wound & Breast",
    note: "Mostly cellulitis and skin wounds; also skin grafts and breast surgery, including mastectomy.",
  },
  {
    code: "10",
    official: "Endocrine, Nutritional and Metabolic Diseases and Disorders",
    name: "Endocrine, Nutritional & Metabolic",
    plain: "Endocrine & Metabolic",
    note: "Mostly dehydration and fluid or electrolyte problems, then diabetes; also thyroid surgery and bariatric (weight-loss) surgery.",
  },
  {
    code: "11",
    official: "Diseases and Disorders of the Kidney and Urinary Tract",
    name: "Kidney & Urinary Tract",
    plain: "Nephrology & Urology",
    note: "Spans nephrology (kidney failure), urinary tract infections, and urologic surgery. Kidney transplants are here.",
  },
  { code: "12", official: "Diseases and Disorders of the Male Reproductive System", name: "Male Reproductive System", plain: "Urology (Male Reproductive)" },
  { code: "13", official: "Diseases and Disorders of the Female Reproductive System", name: "Female Reproductive System", plain: "Gynecology", note: "Includes gynecologic cancer surgery." },
  {
    code: "14",
    official: "Pregnancy, Childbirth and the Puerperium",
    name: "Pregnancy & Childbirth",
    plain: "Obstetrics",
    note: "Few Medicare patients are pregnant, so this is rarely more than a handful of cases.",
  },
  {
    code: "15",
    official: "Newborns and Other Neonates with Conditions Originating in the Perinatal Period",
    name: "Newborns & Neonates",
    plain: "Newborn Care",
    note: "Medicare covers almost no newborns, so this is rarely more than a handful of cases.",
  },
  {
    code: "16",
    official: "Diseases and Disorders of the Blood and Blood Forming Organs and Immunological Disorders",
    name: "Blood & Immunological Disorders",
    plain: "Hematology",
    note: "Non-cancer blood disorders: anemia and clotting problems. Blood cancers are in the next row.",
  },
  {
    code: "17",
    official: "Myeloproliferative Diseases and Disorders and Poorly Differentiated Neoplasms",
    name: "Myeloproliferative Diseases & Poorly Differentiated Neoplasms",
    plain: "Blood Cancers & Chemotherapy",
    note: "Not all cancer care: leukemia, lymphoma, and inpatient chemotherapy are here, but most solid tumors group under their organ's MDC (lung cancer under Respiratory, and so on).",
  },
  {
    code: "18",
    official: "Infectious and Parasitic Diseases, Systemic or Unspecified Sites",
    name: "Infectious & Parasitic Diseases",
    plain: "Sepsis & Infectious Disease",
    note: "Mostly sepsis, which cuts across every service: a patient admitted with sepsis groups here whatever the source of the infection.",
  },
  {
    code: "19",
    official: "Mental Diseases and Disorders",
    name: "Mental Diseases & Disorders",
    plain: "Psychiatry",
    note: "Only psychiatric stays paid under the inpatient (IPPS) system. A hospital's distinct-part psychiatric unit is paid under Medicare's separate psychiatric system and isn't in this data, so this can be far below its psychiatric volume.",
  },
  {
    code: "20",
    official: "Alcohol/Drug Use and Alcohol/Drug Induced Organic Mental Disorders",
    name: "Alcohol & Drug Use",
    plain: "Substance Use",
  },
  {
    code: "21",
    official: "Injuries, Poisonings and Toxic Effects of Drugs",
    name: "Injuries, Poisonings & Toxic Effects",
    plain: "Poisonings & Complications",
    note: "Mostly drug poisonings and complications of earlier treatment. Most injuries group by the body part hurt (a hip fracture under Musculoskeletal).",
  },
  { code: "22", official: "Burns", name: "Burns", plain: "Burn Care" },
  {
    code: "23",
    official: "Factors Influencing Health Status and Other Contacts with Health Services",
    name: "Factors Influencing Health Status",
    plain: "Symptoms, Rehab & Aftercare",
    note: "A catch-all: admissions for symptoms without a firm diagnosis, rehabilitation, and aftercare. A distinct-part rehabilitation unit is paid under Medicare's separate rehab system and isn't in this data.",
  },
  { code: "24", official: "Multiple Significant Trauma", name: "Multiple Significant Trauma", plain: "Major Trauma" },
  { code: "25", official: "Human Immunodeficiency Virus Infections", name: "HIV Infections", plain: "HIV" },
  {
    code: "none",
    official: "No MDC (DRGs 981–989)",
    name: "Surgery Unrelated to the Principal Diagnosis",
    plain: "Not a specialty",
    note: "CMS assigns these DRGs no MDC: an operation unrelated to the patient's main diagnosis. They can come from any service.",
  },
]

/** Most hospitals the specialty view shows side by side with the chosen one. */
export const MAX_COMPARE = 4

export const MDC_BY_CODE = new Map(MDCS.map((m) => [m.code, m]))

/** The MDC key for a DRG's Table 5 MDC (null: no MDC). */
export const mdcKey = (mdc: string | null) => mdc ?? "none"

/** "Circulatory System (Cardiac & Vascular)". */
export const mdcLabel = (m: MdcInfo) => (m.code === "none" ? m.name : `${m.name} (${m.plain})`)
