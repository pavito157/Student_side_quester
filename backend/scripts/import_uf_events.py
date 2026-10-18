"""python -m backend.scripts.import_uf_events [--apply] [--days 14]."""
import argparse
import json
from dotenv import load_dotenv
from backend.auth.firebase_helpers import get_db
from backend.uf_calendar import run


def main():
    parser = argparse.ArgumentParser(description='Import verified Gainesville UF calendar events')
    parser.add_argument('--apply', action='store_true', help='Write to Firestore (default: dry run)')
    parser.add_argument('--days', type=int, default=14, choices=range(1, 32))
    args = parser.parse_args()
    load_dotenv()
    print(json.dumps(run(get_db() if args.apply else None, args.apply, args.days), sort_keys=True))


if __name__ == '__main__':
    main()
