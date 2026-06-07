"""跨 skills 的集成 / 协议测试。

直接运行各 skill 的 main.py，验证：
  - 退出码 0
  - stdout 全是合法 JSON 事件
  - 必含 result 事件
  - result.payload 含规定字段（summary/metrics/outputs）
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

SKILLS_DIR = Path(__file__).parent


def run_skill(skill_id: str, params: dict, files: list) -> tuple[int, list[dict]]:
    """运行 skill，回收 stdout JSON 事件流"""
    with tempfile.TemporaryDirectory() as out_dir:
        proc = subprocess.run(
            [
                sys.executable,
                str(SKILLS_DIR / skill_id / "main.py"),
                "--params", json.dumps(params),
                "--files", json.dumps(files),
                "--out", out_dir,
            ],
            capture_output=True, text=True, timeout=30,
        )
        events = []
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
        return proc.returncode, events


@pytest.mark.parametrize("skill_id", ["csv_diff", "batch_extract"])
def test_skill_exits_zero(skill_id):
    code, events = run_skill(skill_id, {}, [])
    assert code == 0, f"skill {skill_id} exited {code}"


@pytest.mark.parametrize("skill_id", ["csv_diff", "batch_extract"])
def test_skill_emits_result(skill_id):
    _, events = run_skill(skill_id, {}, [])
    result_events = [e for e in events if e.get("type") == "result"]
    assert len(result_events) == 1
    payload = result_events[0]["payload"]
    assert "summary" in payload
    assert "metrics" in payload
    assert isinstance(payload["metrics"], list)


@pytest.mark.parametrize("skill_id", ["csv_diff", "batch_extract"])
def test_skill_progress_monotonic(skill_id):
    _, events = run_skill(skill_id, {}, [])
    progresses = [e["percent"] for e in events if e.get("type") == "progress"]
    assert progresses, "应有 progress 事件"
    # 至少最后一个进度 >= 90
    assert max(progresses) >= 90
    # 不能倒退
    for a, b in zip(progresses, progresses[1:]):
        assert b >= a, f"进度倒退：{a} -> {b}"


def test_batch_extract_reads_real_files(tmp_path):
    f1 = tmp_path / "a.txt"
    f1.write_text("hello world", encoding="utf-8")
    f2 = tmp_path / "b.csv"
    f2.write_text("col1,col2\n1,2", encoding="utf-8")

    files = [
        {"key": "f1", "name": "a.txt", "path": str(f1), "size": 11},
        {"key": "f2", "name": "b.csv", "path": str(f2), "size": 12},
    ]
    code, events = run_skill("batch_extract", {"scope": "all"}, files)
    assert code == 0
    result = next(e for e in events if e["type"] == "result")
    payload = result["payload"]
    # 应至少有 2 个处理项
    assert payload["totalRows"] == 2
    # 表格内容能命中文件名
    table_rows = payload["table"]["rows"]
    names = {r["name"] for r in table_rows}
    assert names == {"a.txt", "b.csv"}


def test_batch_extract_scope_filter(tmp_path):
    """scope=text 时应跳过非文本文件"""
    (tmp_path / "img.png").write_bytes(b"\x89PNG fake")
    (tmp_path / "doc.txt").write_text("data")
    files = [
        {"key": "k1", "name": "img.png", "path": str(tmp_path / "img.png")},
        {"key": "k2", "name": "doc.txt", "path": str(tmp_path / "doc.txt")},
    ]
    _, events = run_skill("batch_extract", {"scope": "text"}, files)
    payload = next(e for e in events if e["type"] == "result")["payload"]
    names = {r["name"] for r in payload["table"]["rows"]}
    assert names == {"doc.txt"}
