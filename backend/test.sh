#!/bin/bash
set +e

# 杀掉旧 server
pkill -9 -f server.ts 2>/dev/null
sleep 1

# 清干净数据
rm -rf data
mkdir -p data

# 启动
JWT_SECRET=test node --import tsx/esm src/server.ts > /tmp/srv.log 2>&1 &
SPID=$!
sleep 3

TOKEN=$(curl -s -X POST -H "Content-Type: application/json" -d '{}' http://localhost:8080/api/auth/login | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
echo "TOKEN len=${#TOKEN}"

WSID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/workspaces | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
echo "WSID=$WSID"

FOLDER=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"parentKey":null,"name":"imgs"}' http://localhost:8080/api/workspaces/$WSID/folders)
FKEY=$(echo "$FOLDER" | python3 -c "import json,sys;print(json.load(sys.stdin)['key'])")
echo "FKEY=$FKEY"

for n in a b c; do
  echo "row1-$n,$RANDOM" > /tmp/$n.csv
  echo "row2-$n" >> /tmp/$n.csv
  curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -F "parentKey=$FKEY" -F "file=@/tmp/$n.csv" \
    http://localhost:8080/api/workspaces/$WSID/files | head -c 200
  echo
done

echo
echo "=== 物理布局（期望扁平） ==="
find data/org-xiehe/u-001/workspaces/$WSID -mindepth 1 -maxdepth 4

echo
echo "=== 勾选文件夹触发批处理 ==="
RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"params\":{\"scope\":\"all\"},\"contextFiles\":[{\"key\":\"$FKEY\",\"name\":\"imgs\",\"type\":\"folder\"}]}" \
  http://localhost:8080/api/skills/batch_extract/run)
echo "$RESP"
RUN_ID=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['runId'])")
sleep 2

echo
echo "=== 报告输出 ==="
cat data/org-xiehe/u-001/outputs/$RUN_ID/extract_report.json 2>&1 | head -60

kill $SPID 2>/dev/null
wait 2>/dev/null
exit 0
