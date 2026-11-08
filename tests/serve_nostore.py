#!/usr/bin/env python3
"""Static server for the CI UI tests: tests/serve_nostore.py <dir> <port>
Sends Cache-Control: no-store so the browser's HTTP cache can never answer a request.
Without it, the offline-reload check passed or failed depending on how recently the files were modified (Chromium's heuristic freshness for a
response with Last-Modified and no Cache-Control), instead of on whether the service worker really holds everything the app needs offline."""
import http.server, functools, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
d, port = sys.argv[1], int(sys.argv[2])
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=d)).serve_forever()
