"""Dataset pipelines. Register new ones in `REGISTRY`."""

from .cdph_hai import CdphHai
from .cms_care_compare import CmsCareCompare
from .hafd_selected import HafdSelected
from .hau import HospitalUtilization

# Planned (build on the same core.Dataset contract when needed):
#   "quarterly-financial"  – Hospital Quarterly Financial & Utilization Report, Complete Data Set
#   "annual-disclosure"    – Hospital Annual Financial Disclosure Report, Complete Data Set
#   "case-mix-index"       – Hospital Utilization Trends / Case Mix Index
REGISTRY = {
    HafdSelected.id: HafdSelected,
    HospitalUtilization.id: HospitalUtilization,
    # Non-HCAI sources, mapped onto HCAI facility numbers; build after the HCAI datasets.
    CdphHai.id: CdphHai,
    CmsCareCompare.id: CmsCareCompare,
}
