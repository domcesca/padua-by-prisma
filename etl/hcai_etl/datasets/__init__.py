"""Dataset pipelines. Register new ones in `REGISTRY`."""

from .acs_county import AcsCounty
from .case_mix_index import CaseMixIndex
from .cdph_hai import CdphHai
from .cms_care_compare import CmsCareCompare
from .cms_inpatient import CmsInpatient
from .cms_ipps import CmsIpps
from .cms_penalties import CmsPenalties
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
    # HRRP and HAC Reduction Program standing plus estimated Medicare payments, for Propose.
    CmsPenalties.id: CmsPenalties,
    # Reference tables (not per-hospital): MS-DRG weights for Propose.
    CmsIpps.id: CmsIpps,
    # County context (not hospital metrics).
    DhcsMediCal.id: DhcsMediCal,
    AcsCounty.id: AcsCounty,
}
