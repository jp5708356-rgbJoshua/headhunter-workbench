from pathlib import Path
import importlib.util
import json
import tempfile
import threading
import unittest
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("launcher", ROOT / "start.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_missing_build_refuses_to_start(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                launcher.make_server(directory, 0)

    def test_serves_current_index_on_loopback_without_cache(self):
        server = launcher.make_server(ROOT / "dist", 0)
        self.assertEqual(server.server_address[0], "127.0.0.1")
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}"
            with urlopen(url + "/", timeout=3) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                self.assertEqual(response.read(), (ROOT / "dist/index.html").read_bytes())
            with urlopen(url + "/_desk_health", timeout=3) as response:
                self.assertEqual(json.load(response), {"app": "headhunter-workbench", "version": "0.7.0"})
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)

    def test_port_conflict_refuses_instead_of_silently_changing_origin(self):
        server = launcher.make_server(ROOT / "dist", 0)
        try:
            with self.assertRaises(OSError):
                launcher.make_server(ROOT / "dist", server.server_port)
        finally:
            server.server_close()


if __name__ == "__main__":
    unittest.main()
