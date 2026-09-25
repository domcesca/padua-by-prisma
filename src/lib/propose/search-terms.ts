// Plain-language search terms for Propose's code pickers: MS-DRGs (inpatient) and APCs (outpatient). CMS titles use
// billing language ("intracranial vascular procedures with principal diagnosis hemorrhage", "Level 3 Imaging without
// Contrast"); administrators search for "aneurysm" or "ct scan". Each entry maps the words people use to the codes
// those cases usually group to. A picker matches a search against code, title, group, and these terms, and says which
// term matched.
//
// To add terms: add an entry (or words to an existing one). `drgs` / `apcs` are the codes the terms mean most directly
// and rank first; `related` / `relatedApcs` are found too but rank lower (e.g. "tavr" → endovascular valve DRGs, with
// open valve surgery related). An entry can list DRGs, APCs, or both. All take single codes ("189", "5012") or inclusive
// ranges ("020-027", "5521-5524"); a range covers every code CMS publishes in it, so check it doesn't sweep in a
// neighbor from another service line. Codes that aren't in the current tables are ignored and logged on the server
// (see module-data.ts), so a renumbering shows up there. Nothing else needs to change.
//
// The same entries drive the proposal intake (intake.ts): a description that hits DRG terms suggests inpatient
// reimbursement, APC terms outpatient, and `modules` entries the module they name.
//
// This is a starting set, not a grouper: the DRG or APC a case lands in depends on its coding. Outpatient especially:
// APCs are levels ("Level 1–4 Imaging without Contrast"), and which level a given scan or procedure falls in is set by
// its CPT code, which this app doesn't carry (CPT is licensed by the AMA). So outpatient terms point at the family of
// APCs a service can land in, and the proposer confirms the level with their coding team.

export type SearchTerm = {
  /** For people editing this file; not shown. */
  category: string
  /** Lowercase words and phrases people search for. */
  terms: string[]
  /** The DRGs these terms mean most directly; they rank first. */
  drgs?: string[]
  /** DRGs the terms also touch (complications, the open-surgery alternative, …); they're found but rank lower. */
  related?: string[]
  /** The APCs these terms mean most directly; they rank first. */
  apcs?: string[]
  /** APCs the terms also touch; found but ranked lower. */
  relatedApcs?: string[]
  /**
   * Propose modules the terms point to directly, for the "describe what you're proposing" intake. DRG entries already
   * point to inpatient reimbursement and APC entries to outpatient; use this for intents no code captures
   * ("adding FTEs", "reduce readmissions").
   */
  modules?: string[]
}

export const SEARCH_TERMS: SearchTerm[] = [
  // -- Proposal intents (intake only; no codes) ---------------------------------------------------------------------------
  { category: "Intent", terms: ["inpatient", "admissions", "admitted patients", "inpatient volume", "transfers in", "service line", "bed capacity"], modules: ["reimbursement"] },
  { category: "Intent", terms: ["outpatient", "outpatient volume", "clinic volume", "procedure volume", "scan volume", "ambulatory"], modules: ["outpatient"] },
  { category: "Intent", terms: ["fte", "ftes", "staffing", "headcount", "hire", "hiring", "nurses", "overtime", "agency staff", "travel nurses", "contract labor"], modules: ["savings"] },
  { category: "Intent", terms: ["length of stay", "los", "boarding", "throughput", "bed days", "patient days", "discharge planning", "patient flow", "capacity management"], modules: ["savings"] },
  { category: "Intent", terms: ["supply", "supplies", "supply chain", "standardization", "standardize", "inventory", "vendor consolidation"], modules: ["savings"] },
  { category: "Intent", terms: ["workflow", "automation", "automate", "efficiency", "productivity", "cost savings", "reduce costs", "save money", "save time", "time savings", "nurse time", "documentation", "documentation burden"], modules: ["savings"] },
  { category: "Intent", terms: ["readmission", "readmissions", "hrrp", "care transitions", "transitional care", "post-discharge follow-up"], modules: ["penalty"] },
  {
    category: "Intent",
    terms: ["hospital-acquired", "hac", "infection prevention", "infection control", "clabsi", "cauti", "surgical site infection", "c. diff", "c diff", "mrsa", "penalty", "penalties"],
    modules: ["penalty"],
  },
  { category: "Intent", terms: ["grant", "philanthropy", "donation", "sponsorship", "lease income", "parking revenue", "retail"], modules: ["custom"] },

  // -- Neuro -----------------------------------------------------------------------------------------------------------
  {
    category: "Neuro",
    terms: ["aneurysm", "brain aneurysm", "cerebral aneurysm", "coiling", "flow diverter", "subarachnoid hemorrhage", "brain bleed"],
    drgs: ["020-027"],
    related: ["064-066"],
  },
  { category: "Neuro", terms: ["stroke", "cva", "brain attack", "stroke center", "tpa", "tnk", "thrombolytic"], drgs: ["061-072"] },
  { category: "Neuro", terms: ["tia", "mini stroke", "transient ischemic attack"], drgs: ["061-063", "069"] },
  {
    category: "Neuro",
    terms: ["thrombectomy", "mechanical thrombectomy", "clot retrieval", "endovascular stroke", "neurointerventional", "biplane"],
    drgs: ["020-027"],
  },
  { category: "Neuro", terms: ["neurosurgery", "brain surgery", "craniotomy"], drgs: ["020-027", "955"] },
  { category: "Neuro", terms: ["brain tumor", "brain cancer", "glioma", "glioblastoma"], drgs: ["023-027", "054-055"] },
  { category: "Neuro", terms: ["epilepsy", "seizure", "epilepsy monitoring", "vns", "responsive neurostimulation"], drgs: ["023-024", "100-101"] },
  { category: "Neuro", terms: ["deep brain stimulation", "dbs", "parkinson's", "parkinsons", "movement disorder"], drgs: ["023-024"], related: ["056-057"] },
  { category: "Neuro", terms: ["dementia", "alzheimer's", "alzheimers", "neurodegenerative"], drgs: ["056-057"] },
  { category: "Neuro", terms: ["carotid", "carotid endarterectomy", "carotid stent", "tcar"], drgs: ["034-039"] },
  { category: "Neuro", terms: ["hydrocephalus", "vp shunt", "ventricular shunt"], drgs: ["031-033"] },
  {
    category: "Neuro",
    terms: ["head injury", "traumatic brain injury", "tbi", "concussion", "neurotrauma"],
    drgs: ["082-090", "955"],
  },

  // -- Cardiac and vascular ----------------------------------------------------------------------------------------------
  {
    category: "Cardiac",
    terms: ["tavr", "tavi", "transcatheter aortic valve", "aortic stenosis", "structural heart"],
    drgs: ["266-267"],
    related: ["216-221", "306-307"],
  },
  { category: "Cardiac", terms: ["valve replacement", "valve repair", "heart valve", "valve surgery"], drgs: ["212", "216-221", "266-267", "319-320"] },
  {
    category: "Cardiac",
    terms: ["mitraclip", "teer", "mitral valve repair", "tricuspid", "transcatheter valve repair"],
    drgs: ["319-320"],
    related: ["212", "216-221"],
  },
  {
    category: "Cardiac",
    terms: ["watchman", "left atrial appendage", "laa closure", "laao", "structural heart"],
    drgs: ["273-274", "317"],
  },
  {
    category: "Cardiac",
    terms: ["heart attack", "stemi", "nstemi", "myocardial infarction", "chest pain center"],
    drgs: ["280-285"],
    related: ["321-322", "231-236"],
  },
  {
    category: "Cardiac",
    terms: ["pci", "angioplasty", "coronary stent", "cardiac stent", "stent", "cath lab", "cardiac catheterization", "interventional cardiology"],
    drgs: ["250-251", "318", "321-325", "359-360"],
    related: ["286-287"],
  },
  { category: "Cardiac", terms: ["intravascular lithotripsy", "ivl", "shockwave", "calcified coronary"], drgs: ["323-325"] },
  { category: "Cardiac", terms: ["cabg", "bypass surgery", "coronary artery bypass", "open heart", "cardiac surgery", "heart surgery"], drgs: ["231-236"], related: ["216-221", "228-229"] },
  { category: "Cardiac", terms: ["heart failure", "chf", "congestive heart failure"], drgs: ["291-293"], related: ["001-002", "215", "268-269"] },
  {
    category: "Cardiac",
    terms: ["lvad", "ventricular assist device", "heart pump", "impella", "mechanical circulatory support"],
    drgs: ["001-002", "215", "268-269"],
  },
  { category: "Cardiac", terms: ["pacemaker", "leadless pacemaker"], drgs: ["242-244", "210-211"] },
  { category: "Cardiac", terms: ["defibrillator", "icd", "implantable cardioverter"], drgs: ["275-277", "245", "265"] },
  {
    category: "Cardiac",
    terms: ["afib", "atrial fibrillation", "arrhythmia", "ablation", "electrophysiology", "ep lab", "pulsed field ablation"],
    drgs: ["308-310", "273-274", "317"],
  },
  {
    category: "Vascular",
    terms: ["aortic aneurysm", "aneurysm", "aaa", "evar", "tevar", "aortic dissection", "aorta"],
    drgs: ["209", "213", "268-272"],
  },
  {
    category: "Vascular",
    terms: ["peripheral artery disease", "peripheral vascular", "critical limb ischemia", "limb salvage", "vascular surgery"],
    drgs: ["252-254", "278-279", "299-301", "239-241", "255-257"],
  },
  {
    category: "Vascular",
    terms: ["dvt", "deep vein thrombosis", "blood clot", "pulmonary embolism", "ekos", "catheter-directed thrombolysis"],
    drgs: ["173", "175-176", "278-279", "299-301"],
  },
  { category: "Vascular", terms: ["varicose veins", "vein ablation"], drgs: ["263"] },

  // -- Orthopedics and spine ----------------------------------------------------------------------------------------------
  {
    category: "Ortho",
    terms: ["joint replacement", "total joint", "knee replacement", "hip replacement", "arthroplasty", "tka", "tha", "tkr", "thr"],
    drgs: ["469-470", "461-462", "521-522"],
    related: ["449"],
  },
  { category: "Ortho", terms: ["shoulder replacement", "elbow replacement", "reverse shoulder"], drgs: ["483", "507-508"] },
  { category: "Ortho", terms: ["ankle replacement"], drgs: ["469"] },
  { category: "Ortho", terms: ["joint revision", "revision arthroplasty", "prosthetic joint infection"], drgs: ["449", "403-404"] },
  { category: "Ortho", terms: ["hip fracture", "broken hip", "femur fracture"], drgs: ["480-482", "521-522", "533-536"] },
  { category: "Ortho", terms: ["fracture", "orthopedic trauma", "broken bone"], drgs: ["480-482", "492-494", "533-536", "562-563", "956"] },
  { category: "Ortho", terms: ["sports medicine", "acl", "arthroscopy", "rotator cuff"], drgs: ["488-489", "510-512"] },
  {
    category: "Spine",
    terms: ["spine surgery", "back surgery", "spinal fusion", "laminectomy", "discectomy", "scoliosis", "neck surgery"],
    drgs: ["028-030", "402", "426-430", "447-448", "450-451", "456-458", "471-473", "518-520", "523-525"],
  },
  { category: "Spine", terms: ["spinal cord stimulator", "neurostimulator", "pain management"], drgs: ["028-030", "040-042", "518"] },
  { category: "Spine", terms: ["back pain"], drgs: ["551-552", "518-520"] },
  {
    category: "Wound",
    terms: ["amputation", "wound care", "diabetic foot", "limb salvage", "hyperbaric"],
    drgs: ["239-241", "255-257", "474-476", "616-618", "622-624", "592-594", "570-572"],
  },

  // -- Oncology ---------------------------------------------------------------------------------------------------------
  {
    category: "Oncology",
    terms: ["cancer", "oncology", "tumor", "cancer center"],
    drgs: [
      "054-055", "146-148", "180-182", "374-376", "435-437", "542-544", "597-599", "582-583", "656-658", "686-688",
      "715-716", "722-724", "731-735", "754-756", "820-830", "834-850",
    ],
  },
  { category: "Oncology", terms: ["chemotherapy", "chemo", "infusion"], drgs: ["837-839", "846-848"] },
  { category: "Oncology", terms: ["radiation", "radiation oncology", "radiation therapy", "proton therapy", "linac", "radiosurgery"], drgs: ["849"] },
  {
    category: "Oncology",
    terms: ["car-t", "car t", "cell therapy", "bone marrow transplant", "stem cell transplant", "bmt", "immunotherapy"],
    drgs: ["014", "016-018"],
  },
  { category: "Oncology", terms: ["breast cancer", "mastectomy", "breast surgery"], drgs: ["582-585", "597-599"] },
  { category: "Oncology", terms: ["lung cancer", "lobectomy", "thoracic surgery", "lung nodule"], drgs: ["163-168", "180-182"] },
  { category: "Oncology", terms: ["prostate cancer"], drgs: ["707-708", "665-667", "722-724"] },
  { category: "Oncology", terms: ["colon cancer", "colorectal cancer", "rectal cancer"], drgs: ["329-334", "374-376"] },
  { category: "Oncology", terms: ["pancreatic cancer", "whipple", "liver cancer", "hepatobiliary surgery"], drgs: ["405-407", "435-437"] },
  { category: "Oncology", terms: ["kidney cancer", "nephrectomy", "bladder cancer", "cystectomy"], drgs: ["653-658", "686-688"] },
  {
    category: "Oncology",
    terms: ["gynecologic oncology", "ovarian cancer", "uterine cancer", "cervical cancer"],
    drgs: ["731-735", "754-756"],
  },
  { category: "Oncology", terms: ["head and neck cancer", "throat cancer", "laryngectomy"], drgs: ["011-013", "140-142", "146-148"] },

  // -- GI and general surgery -------------------------------------------------------------------------------------------
  {
    category: "GI",
    terms: ["bariatric", "weight loss surgery", "gastric bypass", "sleeve gastrectomy", "obesity surgery"],
    drgs: ["619-621"],
  },
  { category: "GI", terms: ["colectomy", "bowel surgery", "colorectal surgery", "ostomy"], drgs: ["329-334", "344-349"] },
  { category: "GI", terms: ["gallbladder", "gallstones"], drgs: ["411-419", "444-446"] },
  { category: "GI", terms: ["appendicitis", "appendectomy"], drgs: ["397-399"] },
  { category: "GI", terms: ["gi bleed", "gastrointestinal bleed", "ulcer bleed"], drgs: ["377-382"] },
  {
    category: "GI",
    terms: ["endoscopy", "gi lab", "ercp", "gastroenterology", "colonoscopy"],
    drgs: ["368-373", "377-379", "388-390", "444-446"],
  },
  { category: "GI", terms: ["cirrhosis", "liver disease", "hepatology", "liver transplant"], drgs: ["005-006", "432-434", "441-443"] },
  { category: "GI", terms: ["pancreatitis"], drgs: ["438-440"] },
  { category: "GI", terms: ["crohn's", "crohns", "ulcerative colitis", "ibd"], drgs: ["385-387"] },
  { category: "GI", terms: ["bowel obstruction", "adhesions"], drgs: ["388-390", "335-337"] },
  { category: "GI", terms: ["general surgery", "acute care surgery"], drgs: ["326-337", "344-358", "397-399", "411-419"] },

  // -- Respiratory ------------------------------------------------------------------------------------------------------
  { category: "Respiratory", terms: ["copd", "emphysema", "chronic lung disease"], drgs: ["190-192"] },
  {
    category: "Respiratory",
    terms: ["ventilator", "mechanical ventilation", "respiratory failure", "trach", "vent unit"],
    drgs: ["003-004", "189", "207-208", "870"],
  },
  { category: "Respiratory", terms: ["covid", "covid-19", "flu", "influenza", "rsv"], drgs: ["177-179", "193-195"], related: ["207-208", "870-872"] },
  {
    category: "Respiratory",
    terms: ["bronchoscopy", "interventional pulmonology", "navigational bronchoscopy", "pulmonology"],
    drgs: ["163-168", "180-182"],
  },

  // -- Imaging and interventional ---------------------------------------------------------------------------------------
  // Scans themselves (MRI, CT, PET) are paid mostly as outpatient services, not by DRG; see DRG_SEARCH_NOTES below.
  {
    category: "Imaging and interventional",
    terms: ["interventional radiology", "embolization", "image-guided", "angiography", "angio suite"],
    drgs: ["020-027", "173", "252-254", "278-279"],
  },
  {
    category: "Imaging and interventional",
    terms: ["hybrid or", "hybrid operating room", "hybrid suite"],
    drgs: ["209", "213", "266-274"],
  },

  // -- Robotic surgery ---------------------------------------------------------------------------------------------------
  // Robotic cases group by the procedure, not the robot: these are the inpatient DRGs where robotic approaches are common.
  {
    category: "Robotic surgery",
    terms: ["robotic", "robotic surgery", "robot-assisted", "da vinci", "minimally invasive surgery"],
    drgs: [
      "707-708", "665-667", "742-743", "731-735", "329-334", "656-661", "653-655", "353-355", "163-165", "619-621",
      "326-328",
    ],
  },
  { category: "Robotic surgery", terms: ["robotic knee", "robotic hip", "robotic joint", "mako", "rosa"], drgs: ["469-470", "461-462"] },
  { category: "Robotic surgery", terms: ["robotic spine", "spine navigation"], drgs: ["447-448", "450-451", "456-458"] },
  { category: "Robotic surgery", terms: ["hysterectomy", "gynecologic surgery"], drgs: ["731-735", "742-743"] },

  // -- Sepsis and critical care ------------------------------------------------------------------------------------------
  { category: "Critical care", terms: ["sepsis", "septic shock", "bacteremia"], drgs: ["870-872"], related: ["853-858", "862-863"] },
  {
    category: "Critical care",
    terms: ["icu", "critical care", "intensive care", "tele-icu", "eicu"],
    drgs: ["003-004", "189", "207-208", "291", "296-298", "870-871"],
  },
  { category: "Critical care", terms: ["cardiac arrest", "code blue", "shock"], drgs: ["296-298", "291-293", "870-872"] },

  // -- Other service lines ------------------------------------------------------------------------------------------------
  { category: "Kidney", terms: ["kidney failure", "dialysis", "aki", "esrd", "nephrology"], drgs: ["682-684", "650-652"] },
  { category: "Urology", terms: ["urology", "kidney stones", "lithotripsy"], drgs: ["659-661", "668-670", "693-694"] },
  { category: "Urology", terms: ["uti", "urinary tract infection"], drgs: ["689-690"] },
  {
    category: "Women's health",
    terms: ["maternity", "labor and delivery", "childbirth", "obstetrics", "birth", "c-section"],
    drgs: ["768", "783-788", "796-798", "805-807"],
  },
  { category: "Women's health", terms: ["nicu", "newborn", "neonatal", "premature"], drgs: ["789-795"] },
  { category: "Behavioral health", terms: ["behavioral health", "psychiatric", "mental health", "psych unit"], drgs: ["876-887"] },
  { category: "Behavioral health", terms: ["detox", "substance use", "addiction", "withdrawal"], drgs: ["894-897"] },
  { category: "Trauma", terms: ["trauma", "trauma center"], drgs: ["955-965", "901-909", "913-914"] },
  { category: "Transplant", terms: ["transplant", "organ transplant"], drgs: ["001-002", "005-008", "010", "014", "016-017", "019", "650-652"] },

  // -- Outpatient (APCs) --------------------------------------------------------------------------------------------------
  // Visits
  {
    category: "Outpatient visits",
    terms: ["emergency", "emergency department", "emergency room", "ed visit", "er visit", "ed volume"],
    apcs: ["5021-5025"],
    relatedApcs: ["5031-5035", "5041"],
  },
  { category: "Outpatient visits", terms: ["freestanding ed", "type b ed", "urgent care"], apcs: ["5031-5035"] },
  { category: "Outpatient visits", terms: ["critical care", "trauma activation", "trauma response"], apcs: ["5041", "5045"] },
  {
    category: "Outpatient visits",
    terms: ["clinic visit", "office visit", "outpatient visit", "hospital clinic", "e/m", "evaluation and management", "telehealth"],
    apcs: ["5012"],
  },
  { category: "Outpatient visits", terms: ["observation", "obs stay", "observation unit"], apcs: ["8011"] },
  // Imaging: APC levels are shared across modalities; the level comes from the CPT code.
  { category: "Imaging", terms: ["x-ray", "xray", "radiograph", "plain film", "fluoroscopy"], apcs: ["5521-5522"] },
  {
    category: "Imaging",
    terms: ["ct", "ct scan", "cat scan", "computed tomography", "ct scanner", "cta", "ct angiography", "photon-counting ct"],
    apcs: ["5521-5524", "5571-5573"],
    relatedApcs: ["8005-8006"],
  },
  {
    category: "Imaging",
    terms: ["mri", "mra", "magnetic resonance", "mri scanner", "mr imaging"],
    apcs: ["5522-5524", "5571-5573"],
    relatedApcs: ["8007-8008"],
  },
  { category: "Imaging", terms: ["ultrasound", "sonography", "doppler", "vascular ultrasound", "point of care ultrasound"], apcs: ["5521-5524"], relatedApcs: ["8004"] },
  { category: "Imaging", terms: ["echo", "echocardiogram", "echocardiography", "tte", "tee"], apcs: ["5522-5524", "5571-5572"] },
  {
    category: "Imaging",
    terms: ["nuclear medicine", "pet", "pet-ct", "pet scan", "spect", "nuclear stress test", "bone scan", "myocardial perfusion"],
    apcs: ["5591-5594"],
  },
  {
    category: "Imaging",
    terms: ["imaging", "radiology", "diagnostic imaging", "scanner", "imaging center", "radiology ai", "imaging ai", "computer-aided detection"],
    apcs: ["5521-5524", "5571-5573"],
    relatedApcs: ["5591-5594", "8004-8008"],
  },
  {
    category: "New technology",
    terms: ["new technology", "category iii", "emerging technology", "artificial intelligence", "ai analysis", "ffr-ct", "plaque analysis", "software as a service"],
    apcs: ["1491-1999"],
  },
  // Diagnostics, oncology, infusion
  {
    category: "Diagnostics",
    terms: ["sleep study", "polysomnography", "eeg", "emg", "stress test", "ekg", "ecg", "holter", "cardiac monitor", "pulmonary function", "diagnostic test"],
    apcs: ["5721-5724"],
  },
  { category: "Diagnostics", terms: ["pathology", "digital pathology", "biopsy reading", "cytology"], apcs: ["5671-5674"] },
  { category: "Diagnostics", terms: ["device check", "pacemaker interrogation", "device interrogation", "remote monitoring"], apcs: ["5741-5743"] },
  {
    category: "Oncology",
    terms: ["radiation therapy", "radiation oncology", "radiotherapy", "imrt", "sbrt", "srs", "proton therapy", "linac", "linear accelerator", "brachytherapy"],
    apcs: ["5611-5613", "5621-5627"],
    relatedApcs: ["5661"],
  },
  { category: "Oncology", terms: ["infusion", "infusion center", "chemotherapy", "chemo", "iv therapy", "injection", "biologic infusion"], apcs: ["5691-5694"] },
  // Procedures
  { category: "Procedures", terms: ["colonoscopy", "lower gi", "sigmoidoscopy", "colon cancer screening"], apcs: ["5311-5313"] },
  { category: "Procedures", terms: ["endoscopy", "egd", "upper endoscopy", "ercp", "gi lab", "endoscopy suite"], apcs: ["5301-5303", "5331"], relatedApcs: ["5311-5313"] },
  { category: "Procedures", terms: ["bronchoscopy", "airway endoscopy", "ebus", "navigational bronchoscopy", "robotic bronchoscopy"], apcs: ["5151-5155"] },
  {
    category: "Procedures",
    terms: ["cardiac catheterization", "cath lab", "heart cath", "outpatient pci", "angioplasty", "peripheral vascular intervention"],
    apcs: ["5191-5194"],
    relatedApcs: ["5181-5184"],
  },
  { category: "Procedures", terms: ["ablation", "afib ablation", "cardiac ablation", "electrophysiology", "ep study", "ep lab"], apcs: ["5211-5213"] },
  { category: "Procedures", terms: ["pacemaker", "leadless pacemaker", "loop recorder"], apcs: ["5221-5224"] },
  { category: "Procedures", terms: ["icd", "defibrillator", "implantable defibrillator"], apcs: ["5231-5232"] },
  { category: "Procedures", terms: ["cataract", "eye surgery", "ophthalmology", "glaucoma surgery", "retina", "intraocular"], apcs: ["5491-5496"], relatedApcs: ["5481", "5501-5504"] },
  {
    category: "Procedures",
    terms: ["arthroscopy", "outpatient orthopedics", "knee arthroscopy", "acl", "rotator cuff", "carpal tunnel", "hand surgery"],
    apcs: ["5112-5117"],
    relatedApcs: ["5111"],
  },
  { category: "Procedures", terms: ["outpatient joint replacement", "outpatient knee replacement", "outpatient hip replacement"], apcs: ["5115-5117"] },
  { category: "Procedures", terms: ["pain management", "epidural", "nerve block", "spinal injection", "radiofrequency ablation"], apcs: ["5441-5443"], relatedApcs: ["5431-5433"] },
  { category: "Procedures", terms: ["spinal cord stimulator", "neurostimulator", "sacral nerve stimulation", "vagus nerve stimulator"], apcs: ["5461-5465"] },
  { category: "Procedures", terms: ["urology", "cystoscopy", "prostate", "lithotripsy", "kidney stones", "turp"], apcs: ["5371-5378"] },
  { category: "Procedures", terms: ["gynecology", "hysteroscopy", "gyn surgery"], apcs: ["5411-5416"] },
  { category: "Procedures", terms: ["laparoscopy", "hernia", "gallbladder", "cholecystectomy", "general surgery", "robotic surgery"], apcs: ["5361-5362"], relatedApcs: ["5341-5342"] },
  { category: "Procedures", terms: ["breast surgery", "lumpectomy", "breast biopsy", "sentinel node"], apcs: ["5091-5094"] },
  { category: "Procedures", terms: ["vascular surgery", "vein ablation", "varicose veins", "dialysis access", "av fistula"], apcs: ["5181-5184"] },
  { category: "Procedures", terms: ["ent", "sinus surgery", "tonsillectomy", "cochlear implant", "ear surgery"], apcs: ["5161-5166"] },
  { category: "Procedures", terms: ["biopsy", "excision", "incision and drainage", "skin lesion"], apcs: ["5071-5073"], relatedApcs: ["5051-5055"] },
  // Therapy, rehab, other services
  { category: "Wound care", terms: ["wound care", "wound center", "debridement", "skin substitute", "skin graft"], apcs: ["5051-5055", "6000-6002"] },
  { category: "Wound care", terms: ["hyperbaric", "hbot", "hyperbaric oxygen"], apcs: ["5061"] },
  { category: "Rehab", terms: ["cardiac rehab", "cardiac rehabilitation"], apcs: ["5771"] },
  { category: "Rehab", terms: ["pulmonary rehab", "pulmonary rehabilitation", "respiratory therapy"], apcs: ["5791"] },
  {
    category: "Behavioral health",
    terms: ["intensive outpatient", "iop", "partial hospitalization", "php", "outpatient behavioral health", "outpatient mental health"],
    apcs: ["5861-5864"],
    relatedApcs: ["8010", "5821-5823"],
  },
  { category: "Kidney", terms: ["outpatient dialysis"], apcs: ["5401"] },
  { category: "Blood", terms: ["apheresis", "plasma exchange", "transfusion"], apcs: ["5241-5244"] },
]

/**
 * Searches with no inpatient DRG, where saying why beats "no results". Shown when a search matches one of these
 * terms and no DRG.
 */
export const DRG_SEARCH_NOTES: { terms: string[]; note: string }[] = [
  {
    terms: ["mri", "ct scan", "ct scanner", "pet", "pet-ct", "imaging", "x-ray", "mammography", "ultrasound", "scanner"],
    note: "Scans themselves are mostly paid as outpatient services (APCs), not by DRG. Use Outpatient reimbursement for scan volume, or search the conditions the scans serve (e.g. “stroke”, “cancer”).",
  },
  {
    terms: ["outpatient", "clinic", "ambulatory", "infusion center", "urgent care", "telehealth"],
    note: "Outpatient services aren’t paid by DRG. Use Outpatient reimbursement for visit or procedure volume.",
  },
]

/** Searches with no outpatient APC, where saying why beats "no results". */
export const APC_SEARCH_NOTES: { terms: string[]; note: string }[] = [
  {
    terms: ["mammography", "mammogram", "tomosynthesis", "breast screening", "screening mammography"],
    note: "Mammography is paid on the Physician Fee Schedule even in hospital outpatient departments, not by APC. Use the Custom module with your fee schedule rate.",
  },
  {
    terms: ["lab", "laboratory", "lab test", "blood test", "clinical lab"],
    note: "Outpatient lab tests are paid on the Clinical Laboratory Fee Schedule, not by APC. Use the Custom module with your lab rates.",
  },
  {
    terms: ["physical therapy", "occupational therapy", "speech therapy", "pt", "ot"],
    note: "Outpatient therapy is paid on the Physician Fee Schedule, not by APC. Use the Custom module.",
  },
  {
    terms: ["cpt", "hcpcs"],
    note: "This picker lists CMS’s payment groups (APCs), not CPT codes: CPT is licensed by the AMA. Search the service in plain words, or by APC number, and confirm the level with your coding team.",
  },
]
