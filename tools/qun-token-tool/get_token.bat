@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 qun_token_tool.py capture
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [错误] 未找到 Python，请先运行 setup.bat。
        pause
        exit /b 1
    )
    python qun_token_tool.py capture
)

set "RESULT=%errorlevel%"
echo.
if not "%RESULT%"=="0" echo 获取没有完成，请按上方提示处理后重试。
pause
exit /b %RESULT%
