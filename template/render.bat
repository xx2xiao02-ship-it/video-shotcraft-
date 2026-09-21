@echo off
title Video ShotCraft - 渲染模板
cd /d "%~dp0"

echo ==========================================
echo   Video ShotCraft - 一键渲染
echo   输出: out\promo.mp4 (1920x1080, 30fps)
echo ==========================================
echo.

call npx remotion render src/index.ts AiflPromo out/promo.mp4 --browser-executable="C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe" --concurrency=1

echo.
if exist "%~dp0out\promo.mp4" (
    echo 渲染完成！输出文件: %~dp0out\promo.mp4
) else (
    echo 渲染未成功，请检查上方错误信息。
)
echo.
pause
