"""Dataset pipelines. Register new ones in `REGISTRY`."""

from .acs_county import AcsCounty
from .case_mix_index import CaseMixIndex
from .cdph_hai import CdphHai
from .cms_care_compare import CmsCareCompare
from .cms_inpatient import CmsInpatient
from .cms_ipps import CmsIpps
from .cms_opps import CmsOpps
from .cms_penalties import CmsPenalties
from .cms_wage_index import CmsWageIndex
from .dhcs_medi_cal import DhcsMediCal
from .hafd_selected import HafdSelected
from .hau import HospitalUtilization

# Planned (build on the same core.Dataset contract when needed):
#   "quarterly-financial"  – Hospital Quarterly Financial & Utilization Report, Complete Data Set
#   "annual-disclosure"    – Hospital Annual Financial Disclosure Report, Complete Data Set
REGISTRY = {
    HafdSelected.id: HafdSelected,
    HospitalUtilization.id: HospitalUtilization,
    # Uses the utilization report's campus discharges to combine campuses.
    CaseMixIndex.id: CaseMixIndex,
    # Non-HCAI sources, mapped onto HCAI facility numbers; build after the HCAI datasets.
    CdphHai.id: CdphHai,
    CmsCareCompare.id: CmsCareCompare,
    CmsInpatient.id: CmsInpatient,
    # OPPS APC rates (Addendum A only; no CPT content) and outpatient services by comprehensive APC.
    CmsOpps.id: CmsOpps,
    # HRRP and HAC Reduction Program standing plus estimated Medicare payments, for Propose.
    CmsPenalties.id: CmsPenalties,
    # Each hospital's IPPS and OPPS wage index, for Propose's Advanced mode (after cms-opps).
    CmsWageIndex.id: CmsWageIndex,
    # Reference tables (not per-hospital): MS-DRG weights for Propose.
    CmsIpps.id: CmsIpps,
    # County context (not hospital metrics).
    DhcsMediCal.id: DhcsMediCal,
    AcsCounty.id: AcsCounty,
}
