#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "没有找到 Python 3。可先用浏览器打开 dist/index.html，或安装 Python 3 后重试。"
  read "?按回车关闭窗口。"
  exit 1
fi
python3 start.py
result=$?
if [ "$result" -ne 0 ]; then
  read "?启动失败，按回车关闭窗口。"
fi
exit "$result"
