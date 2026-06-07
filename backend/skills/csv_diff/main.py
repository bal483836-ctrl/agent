#!/usr/bin/env python3
"""CSV 跨中心数据比对（演示用 skill）。

调用约定：
    python3 main.py --params <json> --files <json> --out <dir>

输出（stdout，逐行 JSON）：
    {"type":"step","label":"...","status":"running"}
    {"type":"progress","percent":30,"caption":"..."}
    {"type":"result","payload":{...}}

无外部依赖（纯标准库），便于在没安装 pandas 时也能跑通端到端流程。
"""
import argparse
import json
import os
import sys
import time


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--params", required=True)
    ap.add_argument("--files", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    params = json.loads(args.params)
    files = json.loads(args.files)
    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)

    emit({"type": "step", "label": "输入文件加载", "status": "running"})
    time.sleep(0.4)
    emit({"type": "progress", "percent": 25, "caption": f"已识别 {len(files)} 个输入"})

    emit({"type": "step", "label": "输入文件加载", "status": "done"})
    emit({"type": "step", "label": "参数校验", "status": "running"})
    time.sleep(0.3)
    emit({"type": "progress", "percent": 45, "caption": "校验参数中…"})
    emit({"type": "step", "label": "参数校验", "status": "done"})

    emit({"type": "step", "label": "主流程执行", "status": "running"})
    time.sleep(0.6)
    emit({"type": "progress", "percent": 75, "caption": "比对字段…"})
    emit({"type": "step", "label": "主流程执行", "status": "done"})

    emit({"type": "step", "label": "输出归档", "status": "running"})
    # 写一个假报告，演示输出归档
    report_path = os.path.join(out_dir, "diff_report.json")
    report = {
        "skill": "csv_diff",
        "params": params,
        "files": files,
        "totalRows": 632,
        "diffRows": 17,
        "criticalRows": 3,
    }
    with open(report_path, "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)

    params_path = os.path.join(out_dir, "run_params.json")
    with open(params_path, "w", encoding="utf-8") as fp:
        json.dump(params, fp, ensure_ascii=False, indent=2)

    emit({"type": "step", "label": "输出归档", "status": "done"})
    emit({"type": "progress", "percent": 100, "caption": "完成"})

    emit({
        "type": "result",
        "payload": {
            "summary": "比对完成。共扫描 632 条记录，发现 17 处差异，其中 3 处为关键字段。",
            "metrics": [
                {"label": "总记录", "value": "632", "tone": "primary"},
                {"label": "字段差异", "value": "17"},
                {"label": "关键差异", "value": "3", "tone": "danger"},
                {"label": "一致率", "value": "97.3%", "tone": "success"},
            ],
            "table": {
                "columns": [
                    {"key": "sid", "title": "受试者ID"},
                    {"key": "field", "title": "字段"},
                    {"key": "s1", "title": "中心01"},
                    {"key": "s2", "title": "中心02"},
                    {"key": "level", "title": "级别"},
                ],
                "rows": [
                    {"sid": "S203-0117", "field": "SAE发生时间",
                     "s1": "2026-05-30 14:20", "s2": "2026-05-30 14:00", "level": "关键"},
                    {"sid": "S203-0204", "field": "主要疗效评分",
                     "s1": "8.4", "s2": "8.7", "level": "关键"},
                    {"sid": "S203-0301", "field": "体温(°C)",
                     "s1": "37.2", "s2": "37.21", "level": "容差内"},
                ],
                "warnKeys": ["S203-0117", "S203-0204"],
            },
            "totalRows": 17,
            "previewRows": 3,
            "outputs": [
                {"name": "diff_report.json", "path": report_path},
                {"name": "run_params.json", "path": params_path},
            ],
            "runtimeMs": 0,
            "needsHumanReview": True,
        },
    })


if __name__ == "__main__":
    main()
