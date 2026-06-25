import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DESKTOPS = [
    Path.home() / "Desktop",
    Path("D:/Users/ASUS/Desktop"),
]
OUTPUT = ROOT / "src" / "data" / "questions.json"
WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def find_source_docx() -> Path:
    existing_desktops = [path for path in DESKTOPS if path.exists()]
    candidates = sorted(
        [item for desktop in existing_desktops for item in desktop.glob("*题库*.docx")],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        candidates = sorted(
            [item for desktop in existing_desktops for item in desktop.glob("*.docx")],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    if not candidates:
        checked = ", ".join(str(path) for path in DESKTOPS)
        raise FileNotFoundError(f"No docx file found on desktop. Checked: {checked}")
    return candidates[0]


def read_docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as package:
        root = ET.fromstring(package.read("word/document.xml"))

    paragraphs: list[str] = []
    for para in root.findall(".//w:p", WORD_NS):
        text = "".join(node.text or "" for node in para.findall(".//w:t", WORD_NS)).strip()
        if text:
            paragraphs.append(normalize_text(text))
    return paragraphs


def normalize_text(value: str) -> str:
    value = value.replace("\u3000", " ")
    value = value.replace("．", ".")
    return re.sub(r"\s+", " ", value).strip()


def parse_answer_line(text: str) -> dict[int, str]:
    answers: dict[int, str] = {}
    for number, answer in re.findall(r"(\d+)\.([A-E]+|对|错)", text):
        answers[int(number)] = answer
    return answers


def parse_answers(paragraphs: list[str]) -> dict[int, str]:
    try:
        answer_start = paragraphs.index("参考答案")
    except ValueError as exc:
        raise ValueError("Could not locate the answer section") from exc

    answers: dict[int, str] = {}
    for paragraph in paragraphs[answer_start + 1 :]:
        answers.update(parse_answer_line(paragraph))
    return answers


def current_type(number: int) -> str:
    if number <= 2001:
        return "single"
    if number <= 3167:
        return "multiple"
    return "judge"


def parse_choice_question(number: int, body: str, qtype: str, answer: str) -> dict:
    body = strip_inline_answer(body)
    marker_match = re.search(r"\[多选题\]", body)
    if marker_match:
        body = (body[: marker_match.start()] + " " + body[marker_match.end() :]).strip()

    option_match = re.search(r"\sA[.．]?", body)
    if not option_match:
        raise ValueError(f"Question {number} has no A option")

    stem = body[: option_match.start()].strip()
    option_text = body[option_match.start() :].strip()
    option_matches = list(re.finditer(r"([A-E])(?:[.．]|(?=[\u4e00-\u9fff]))", option_text))
    options = []
    for index, match in enumerate(option_matches):
        next_start = option_matches[index + 1].start() if index + 1 < len(option_matches) else len(option_text)
        options.append(
            {
                "key": match.group(1),
                "text": option_text[match.end() : next_start].strip(),
            }
        )

    return {
        "id": number,
        "type": qtype,
        "stem": stem,
        "options": options,
        "answer": answer,
    }


def parse_judge_question(number: int, body: str, answer: str) -> dict:
    body = strip_inline_answer(body)
    body = body.replace("[判断题]", "").strip()
    return {
        "id": number,
        "type": "judge",
        "stem": body,
        "options": [{"key": "对", "text": "对"}, {"key": "错", "text": "错"}],
        "answer": answer,
    }


def parse_questions(paragraphs: list[str], answers: dict[int, str]) -> list[dict]:
    questions: list[dict] = []
    answer_start = paragraphs.index("参考答案")
    pattern = re.compile(r"^(\d+)\.(.+)")

    for paragraph in paragraphs[:answer_start]:
        match = pattern.match(paragraph)
        if not match:
            continue

        number = int(match.group(1))
        body = match.group(2).strip()
        inline_answer = extract_inline_answer(body)
        answer = answers.get(number) or inline_answer
        if not answer:
            raise ValueError(f"Question {number} has no answer")

        qtype = current_type(number)
        if qtype == "judge":
            question = parse_judge_question(number, body, answer)
        else:
            question = parse_choice_question(number, body, qtype, answer)
        questions.append(question)

    return questions


def extract_inline_answer(body: str) -> str | None:
    match = re.search(r"[（(]\s*([A-E]+|对|错)\s*[）)]", body)
    return match.group(1) if match else None


def strip_inline_answer(body: str) -> str:
    return re.sub(r"\s*[（(]\s*([A-E]+|对|错)\s*[）)]\s*", " ", body, count=1).strip()


def main() -> None:
    source = find_source_docx()
    paragraphs = read_docx_paragraphs(source)
    answers = parse_answers(paragraphs)
    questions = parse_questions(paragraphs, answers)

    counts = {
        "single": sum(item["type"] == "single" for item in questions),
        "multiple": sum(item["type"] == "multiple" for item in questions),
        "judge": sum(item["type"] == "judge" for item in questions),
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "source": source.name,
                "total": len(questions),
                "counts": counts,
                "questions": questions,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Imported {len(questions)} questions from {source.name}")
    print(counts)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
