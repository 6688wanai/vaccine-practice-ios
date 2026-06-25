import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlretrieve


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "xiaomei"
DEFAULT_TARGET = "weixin"
DEFAULT_URL = "http://127.0.0.1:5173"


def run_hermes_send(target: str, message: str) -> None:
    command = ["hermes", "send", "--to", target, message]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode != 0:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    if result.stdout.strip():
        print(result.stdout.strip())


def make_qr(url: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    qr_api = f"https://api.qrserver.com/v1/create-qr-code/?size=720x720&data={quote(url, safe='')}"
    urlretrieve(qr_api, output_path)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Send the practice app QR code through XiaoMei/Hermes Weixin.")
    parser.add_argument("--url", default=DEFAULT_URL, help="Practice app URL to encode in the QR code.")
    parser.add_argument("--to", default=DEFAULT_TARGET, help="Hermes target, for example: weixin:<chat_id>.")
    parser.add_argument("--text-only", action="store_true", help="Only send the text link, do not send QR image.")
    args = parser.parse_args()

    message = (
        "预防接种刷题入口已准备好：\n"
        f"{args.url}\n\n"
        "每次随机 150 题，包含单选、多选、判断。"
    )
    run_hermes_send(args.to, message)

    if not args.text_only:
        qr_path = make_qr(args.url, OUTPUT / "practice_qr.png")
        run_hermes_send(args.to, f"MEDIA:{qr_path}")
        print(f"QR saved: {qr_path}")


if __name__ == "__main__":
    main()
