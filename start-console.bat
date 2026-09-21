@echo off
title Video ShotCraft 操作台
cd /d "E:\video-shotcraft"
echo 正在启动 Video ShotCraft 图形化操作台...
echo 启动后浏览器会自动打开 http://127.0.0.1:8765
echo 关闭本窗口即停止操作台服务。
echo.
node console-server.mjs
pause
