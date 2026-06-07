#!/usr/bin/env bash
# 跑完整套件：前端 + 后端 + Python skills
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 前端 (vitest) $(npm --silent test 2>&1 | tail -3)"
( cd "$ROOT" && npm --silent test )

echo
echo "==> 后端 (vitest)"
( cd "$ROOT/backend" && npm --silent test )

echo
echo "==> Skills (pytest)"
python3 -m pytest "$ROOT/backend/skills/test_skills.py" -q
