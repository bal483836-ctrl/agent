#!/usr/bin/env python3
"""目录批量信息提取（演示文件夹勾选 → 批量处理）。

典型场景：
  - 用户在右侧工作区**勾选一个文件夹**（例如 imgs/）
  - 触发本 skill → 后端把该文件夹下所有文件解析为绝对路径数组
  - 子进程逐个读取，按 scope 过滤，输出元信息表

参数：
  scope = "all" | "images" | "text"
"""
import argparse
import json
import os
import sys
import time

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"}
TEXT_EXT = {".txt", ".md", ".csv", ".json", ".log", ".py", ".js", ".ts"}


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def keep(ext: str, scope: str) -> bool:
    if scope == "all":
        return True
    if scope == "images":
        return ext.lower() in IMAGE_EXT
    if scope == "text":
        return ext.lower() in TEXT_EXT
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--params", required=True)
    ap.add_argument("--files", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    params = json.loads(args.params)
    files = json.loads(args.files)
    scope = params.get("scope", "all")
    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)

    emit({"type": "step", "label": "枚举文件", "status": "running"})
    emit({"type": "progress", "percent": 8,
          "caption": f"待处理 {len(files)} 个文件（scope={scope}）"})

    accepted = []
    for f in files:
        name = f.get("name") or ""
        ext = os.path.splitext(name)[1]
        if keep(ext, scope):
            accepted.append(f)

    emit({"type": "step", "label": "枚举文件", "status": "done"})
    emit({"type": "step", "label": "逐项处理", "status": "running"})

    rows = []
    n = max(1, len(accepted))
    for i, f in enumerate(accepted):
        emit({
            "type": "progress",
            "percent": 10 + int(80 * (i + 1) / n),
            "caption": f"处理 [{i + 1}/{n}] {f.get('name')}",
        })
        info = {"name": f.get("name"), "key": f.get("key")}
        path = f.get("path")
        try:
            if path and os.path.exists(path):
                st = os.stat(path)
                info["bytes"] = st.st_size
                ext = os.path.splitext(info["name"])[1].lower()
                if ext in IMAGE_EXT:
                    info["kind"] = "image"
                    # 真要解码可装 Pillow；此处给占位摘要
                    info["summary"] = f"image, {st.st_size}B"
                elif ext in TEXT_EXT:
                    info["kind"] = "text"
                    with open(path, "rb") as fp:
                        head = fp.read(1024)
                    info["summary"] = head.decode("utf-8", errors="replace").split("\n")[0][:80]
                else:
                    info["kind"] = "other"
                    info["summary"] = f"binary, {st.st_size}B"
                info["status"] = "ok"
            else:
                info["status"] = "missing"
        except Exception as e:
            info["status"] = "error"
            info["summary"] = str(e)
        rows.append(info)
        time.sleep(0.05)

    emit({"type": "step", "label": "逐项处理", "status": "done"})
    emit({"type": "step", "label": "输出归档", "status": "running"})

    report = {
        "skill": "batch_extract",
        "params": params,
        "rows": rows,
    }
    report_path = os.path.join(out_dir, "extract_report.json")
    with open(report_path, "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)

    emit({"type": "step", "label": "输出归档", "status": "done"})
    emit({"type": "progress", "percent": 100, "caption": "完成"})

    table_rows = [
        {
            "name": r.get("name", ""),
            "kind": r.get("kind", "-"),
            "bytes": str(r.get("bytes", "-")),
            "summary": (r.get("summary") or "")[:80],
            "status": r.get("status", ""),
        }
        for r in rows[:50]
    ]

    ok = sum(1 for r in rows if r.get("status") == "ok")
    emit({
        "type": "result",
        "payload": {
            "summary": f"已批量处理 {len(rows)} 项，其中 {ok} 项提取成功。",
            "metrics": [
                {"label": "总项数", "value": str(len(rows)), "tone": "primary"},
                {"label": "成功", "value": str(ok), "tone": "success"},
                {"label": "scope", "value": scope},
            ],
            "table": {
                "columns": [
                    {"key": "name", "title": "文件名"},
                    {"key": "kind", "title": "类型"},
                    {"key": "bytes", "title": "字节"},
                    {"key": "summary", "title": "摘要"},
                    {"key": "status", "title": "状态"},
                ],
                "rows": table_rows,
            },
            "totalRows": len(rows),
            "previewRows": min(50, len(rows)),
            "outputs": [
                {"name": "extract_report.json", "path": report_path},
            ],
            "runtimeMs": 0,
        },
    })


if __name__ == "__main__":
    main()
