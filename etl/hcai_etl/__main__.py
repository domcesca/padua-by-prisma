"""CLI: python -m hcai_etl [dataset ...] [--refresh] [--years 2019 2020 ...]"""

from __future__ import annotations

import argparse

from .datasets import REGISTRY


def main() -> None:
    parser = argparse.ArgumentParser(prog="hcai_etl", description=__doc__)
    parser.add_argument("datasets", nargs="*", help=f"datasets to build (default: all). Options: {', '.join(REGISTRY)}")
    parser.add_argument("--refresh", action="store_true", help="re-download source files even if cached")
    parser.add_argument("--years", nargs="+", type=int, help="limit to these report years")
    parser.add_argument("--list", action="store_true", help="list available datasets and exit")
    args = parser.parse_args()

    if args.list:
        for key, cls in REGISTRY.items():
            print(f"{key:20s} {cls.title}")
        return

    selected = args.datasets or list(REGISTRY)
    unknown = [d for d in selected if d not in REGISTRY]
    if unknown:
        parser.error(f"unknown dataset(s): {', '.join(unknown)}")
    for key in selected:
        REGISTRY[key](refresh=args.refresh, years=args.years).run()


if __name__ == "__main__":
    main()
