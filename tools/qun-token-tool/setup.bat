@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON=py -3"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [错误] 未找到 Python，请先安装 Python 3 后重试。
        pause
        exit /b 1
    )
    set "PYTHON=python"
)

%PYTHON% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)"
if errorlevel 1 (
    echo [错误] 当前 mitmproxy 需要 Python 3.12 或更高版本。
    pause
    exit /b 1
)

echo [1/2] 安装或更新 mitmproxy...
%PYTHON% -m pip install --upgrade mitmproxy
if errorlevel 1 goto :failed

echo [2/2] 生成并安装本用户的 mitmproxy 根证书...
%PYTHON% qun_token_tool.py setup
if errorlevel 1 goto :failed

echo.
echo 安装完成。以后双击 get_token.bat 即可获取 Token。
pause
exit /b 0

:failed
echo.
echo [失败] 安装没有完成，请保留窗口中的错误信息。
pause
exit /b 1
