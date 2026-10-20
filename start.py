"""Serve the bundled workbench on loopback with a stable browser storage origin."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json
import sys
import webbrowser

VERSION = "0.7.0"
DEFAULT_PORT = 8876


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/_desk_health":
            body = json.dumps({"app": "headhunter-workbench", "version": VERSION}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def make_server(directory, port):
    directory = Path(directory).resolve()
    if not (directory / "index.html").is_file():
        raise FileNotFoundError("未找到 dist/index.html，请先解压完整交付包，或运行 build.py。")
    return ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(directory)))


def main(argv=None):
    parser = argparse.ArgumentParser(description="启动猎头工作台，只允许本机访问。")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("端口必须在 1—65535 之间。")
    try:
        server = make_server(Path(__file__).resolve().parent / "dist", args.port)
    except (OSError, FileNotFoundError) as error:
        print("未能启动：" + str(error), file=sys.stderr)
        print("若端口已占用，请先关闭旧启动窗口；不会自动切换端口，以免误进另一个数据区。", file=sys.stderr)
        return 1
    url = f"http://127.0.0.1:{args.port}/"
    print(f"猎头工作台 {VERSION}：{url}", flush=True)
    print("保持本窗口打开。按 Ctrl+C 停止服务。请固定使用同一浏览器和地址，并定期下载备份。", flush=True)
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            print("浏览器未自动打开，请手动访问上方地址。", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n工作台服务已停止。浏览器中的本地记录没有被清除。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
