from __future__ import annotations

import argparse
import json
from .config import Settings
from .diarization.model_loader import ModelLoader


def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument("operation",choices=["check","warmup"]); args=parser.parse_args()
    settings=Settings.from_env(); loader=ModelLoader(settings)
    if args.operation=="warmup": loader.load()
    result={"model_id":settings.model_id,"revision":settings.model_revision,"device":settings.device,"cache_available":loader.cache_available(),"loaded":loader.loaded}
    print(json.dumps(result))
    return 0 if (result["cache_available"] if args.operation=="check" else result["loaded"]) else 2


if __name__=="__main__": raise SystemExit(main())
