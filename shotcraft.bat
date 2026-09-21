@echo off
title Video ShotCraft 操作台
setlocal

:menu
cls
echo ==========================================
echo       Video ShotCraft - 本地操作台
echo       项目目录: E:\video-shotcraft
echo ==========================================
echo.
echo    [1] 渲染模板视频 (promo.mp4)
echo    [2] 打开 Remotion Studio (模板可视化编辑)
echo    [3] 打开 Motion Workbench (剪辑台)
echo    [4] 打开运动预览 Gallery (浏览器画廊)
echo    [5] 运行单元测试
echo    [0] 退出
echo.
set /p choice=请选择操作后回车: 
if not defined choice exit /b
if "%choice%"=="1" goto render
if "%choice%"=="2" goto studio
if "%choice%"=="3" goto workbench
if "%choice%"=="4" goto gallery
if "%choice%"=="5" goto test
if "%choice%"=="0" exit /b
goto menu

:render
cd /d "E:\video-shotcraft\template"
call render.bat
goto menu

:studio
cd /d "E:\video-shotcraft\template"
echo 正在启动 Remotion Studio，浏览器将自动打开...
call npx remotion studio src/index.ts --browser-executable="C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe"
goto menu

:workbench
cd /d "E:\video-shotcraft\workbench"
echo 正在启动 Motion Workbench，请稍候...
echo 启动后浏览器打开: http://localhost:5198
call npm run dev
goto menu

:gallery
start "" "E:\video-shotcraft\gallery\index.html"
goto menu

:test
cd /d "E:\video-shotcraft"
call npm test
pause
goto menu
