@echo off
title Video ShotCraft 操作台
cd /d "E:\video-shotcraft"
set "SHOTCRAFT_MATCH_PREVIEW=1"
echo 正在启动 Video ShotCraft 图形化操作台...
set "PORT=8768"
echo 启动后浏览器会自动打开 http://127.0.0.1:8768
echo 关闭本窗口即停止操作台服务。
echo.
start "" http://127.0.0.1:8768/director
python start-console-runtime.py
pause
