"""Dataset pipelines. Register new ones in `REGISTRY`."""

from .hafd_selected import HafdSelected

# Planned (build on the same core.Dataset contract when needed):
#   "quarterly-financial"  – Hospital Quarterly Financial & Utilization Report, Complete Data Set
#   "annual-disclosure"    – Hospital Annual Financial Disclosure Report, Complete Data Set
#   "case-mix-index"       – Hospital Utilization Trends / Case Mix Index
REGISTRY = {
    HafdSelected.id: HafdSelected,
}
