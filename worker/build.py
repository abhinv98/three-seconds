"""Vercel build step (pyproject.toml, [tool.vercel.scripts]): static ffmpeg and ffprobe for Linux into bin/, which
main.py puts first on PATH. The archive is pinned by URL and SHA-256, so a changed download fails the build instead
of shipping. Locally the pipeline uses whatever ffmpeg is installed; this only runs on Vercel.
"""

import hashlib
import io
import sys
import tarfile
import urllib.request
from pathlib import Path

# John Van Sickle's static build of ffmpeg 7.0.2 (GPL), checked against his published MD5 when it was pinned.
URL = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-7.0.2-amd64-static.tar.xz"
SHA256 = "abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67"
TOOLS = ("ffmpeg", "ffprobe")
BIN = Path(__file__).resolve().parent / "bin"


def main() -> None:
    if all((BIN / tool).exists() for tool in TOOLS):
        return
    with urllib.request.urlopen(URL, timeout=600) as response:
        archive = response.read()
    digest = hashlib.sha256(archive).hexdigest()
    if digest != SHA256:
        sys.exit(f"build.py: {URL} has SHA-256 {digest}, expected {SHA256}")
    BIN.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:xz") as tar:
        for member in tar.getmembers():
            name = Path(member.name).name
            if name in TOOLS and member.isfile():
                (BIN / name).write_bytes(tar.extractfile(member).read())  # type: ignore[union-attr]
                (BIN / name).chmod(0o755)
    missing = [tool for tool in TOOLS if not (BIN / tool).exists()]
    if missing:
        sys.exit(f"build.py: {', '.join(missing)} missing from {URL}")
    print(f"build.py: {', '.join(TOOLS)} in {BIN}")


if __name__ == "__main__":
    main()
