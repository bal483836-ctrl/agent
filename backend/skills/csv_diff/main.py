#!/usr/bin/env python3
"""CSV 跨中心数据比对 / 批量信息提取（演示 skill）。

体现"工作区勾选生效"的关键点：
  - --files 传入的是一个 JSON 数组：[{"key","name","path","size"}, ...]
  - path 是后端解析后的**绝对路径**，子进程直接打开即可
  - 如果勾选的是一个文件夹，后端会展开为该文件夹下的所有文件（最多 20 个）

输出（stdout，逐行 JSON）：
  {"type":"step","label":"...","status":"running"}
  {"type":"progress","percent":30,"caption":"..."}
  {"type":"result","payload":{...}}
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
    emit({"type": "progress", "percent": 10,
          "caption": f"接收到 {len(files)} 个输入文件"})

    # ===== 真实读取每个文件 =====
    per_file = []
    n = len(files) if files else 1
    for i, f in enumerate(files):
        emit({
            "type": "progress",
            "percent": 10 + int(60 * (i + 1) / n),
            "caption": f"读取 [{i + 1}/{n}] {f.get('name')}",
        })
        info = {"key": f.get("key"), "name": f.get("name"), "size": f.get("size")}
        p = f.get("path")
        if not p or not os.path.exists(p):
            info["status"] = "missing"
            per_file.append(info)
            continue
        try:
            st = os.stat(p)
            info["bytes"] = st.st_size
            # 读前 200 行，逐行计 token 行数
            with open(p, "rb") as fp:
                head = fp.read(64 * 1024)
            lines = head.splitlines()
            info["lineCount"] = len(lines)
            info["firstLine"] = (lines[0][:120].decode("utf-8", errors="replace")
                                 if lines else "")
            info["status"] = "ok"
        except Exception as e:
            info["status"] = "error"
            info["error"] = str(e)
        per_file.append(info)
        time.sleep(0.1)  # 演示效果

    emit({"type": "step", "label": "输入文件加载", "status": "done"})
    emit({"type": "step", "label": "聚合分析", "status": "running"})
    time.sleep(0.3)

    total_bytes = sum(x.get("bytes", 0) or 0 for x in per_file)
    total_lines = sum(x.get("lineCount", 0) or 0 for x in per_file)
    ok_count = sum(1 for x in per_file if x.get("status") == "ok")
    missing_count = sum(1 for x in per_file if x.get("status") == "missing")

    emit({"type": "step", "label": "聚合分析", "status": "done"})
    emit({"type": "step", "label": "输出归档", "status": "running"})

    report_path = os.path.join(out_dir, "report.json")
    with open(report_path, "w", encoding="utf-8") as fp:
        json.dump({
            "skill": "csv_diff",
            "params": params,
            "files": per_file,
            "summary": {
                "totalFiles": len(per_file),
                "ok": ok_count,
                "missing": missing_count,
                "totalBytes": total_bytes,
                "totalLines": total_lines,
            },
        }, fp, ensure_ascii=False, indent=2)

    params_path = os.path.join(out_dir, "run_params.json")
    with open(params_path, "w", encoding="utf-8") as fp:
        json.dump(params, fp, ensure_ascii=False, indent=2)

    emit({"type": "step", "label": "输出归档", "status": "done"})
    emit({"type": "progress", "percent": 100, "caption": "完成"})

    table_rows = [
        {
            "name": x.get("name", ""),
            "size": str(x.get("bytes", "")) if x.get("bytes") is not None else "-",
            "lines": str(x.get("lineCount", "-")),
            "first": x.get("firstLine", "")[:60],
            "status": x.get("status", ""),
        }
        for x in per_file[:50]
    ]

    emit({
        "type": "result",
        "payload": {
            "summary": f"已批量处理 {len(per_file)} 个文件，{ok_count} 成功 / {missing_count} 缺失，"
                       f"累计 {total_bytes} 字节 / {total_lines} 行。",
            "metrics": [
                {"label": "文件数", "value": str(len(per_file)), "tone": "primary"},
                {"label": "成功", "value": str(ok_count), "tone": "success"},
                {"label": "缺失", "value": str(missing_count),
                 "tone": "danger" if missing_count else "primary"},
                {"label": "总字节", "value": str(total_bytes)},
            ],
            "table": {
                "columns": [
                    {"key": "name", "title": "文件名"},
                    {"key": "size", "title": "字节"},
                    {"key": "lines", "title": "行数"},
                    {"key": "first", "title": "首行预览"},
                    {"key": "status", "title": "状态"},
                ],
                "rows": table_rows,
            },
            "totalRows": len(per_file),
            "previewRows": min(50, len(per_file)),
            "outputs": [
                {"name": "report.json", "path": report_path},
                {"name": "run_params.json", "path": params_path},
            ],
            "runtimeMs": 0,
            "needsHumanReview": False,
        },
    })


if __name__ == "__main__":
    main()
