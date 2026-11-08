#!/usr/bin/env python3
"""
Local preview server for daen141kk.

The plain `python3 -m http.server` works, but it lets the browser cache the
bundles, so a rebuild is invisible until a hard reload. This one always sends
`no-store`, binds to 0.0.0.0 (so the sandbox preview proxy can reach it) and
serves from the project root no matter where it is started.

    python3 tools/serve.py            # http://localhost:8080
    python3 tools/serve.py --port 8090
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import socketserver
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("  %s  %s\n" % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()

    handler = functools.partial(Handler, directory=str(ROOT))
    with Server((args.host, args.port), handler) as httpd:
        print(f"daen141kk preview  →  http://localhost:{args.port}  (root: {ROOT})", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped", flush=True)


if __name__ == "__main__":
    main()
