@echo off
chcp 65001 >nul 2>&1
title Token Tool Setup
color 0E

echo.
echo  ======================================================
echo     Token Capture Tool - Environment Setup
echo  ======================================================
echo.

:: -- Check Python --
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Python not found!
    echo  [!] Please install Python 3.8+: https://www.python.org/downloads/
    echo  [!] Check "Add Python to PATH" during installation
    pause
    exit /b 1
)
echo  [OK] Python installed

:: -- Install mitmproxy --
echo  [..] Installing mitmproxy (may take 1-2 min)...
pip install mitmproxy -q
if %errorlevel% neq 0 (
    echo  [!] mitmproxy installation failed
    pause
    exit /b 1
)
echo  [OK] mitmproxy installed

:: -- Generate cert --
echo.
echo  [..] Generating mitmproxy CA certificate...
start /b mitmdump -p 18888 -q
timeout /t 4 /nobreak >nul
taskkill /f /im mitmdump.exe >nul 2>&1

:: Install CA cert
if exist "%USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer" (
    echo  [..] Installing CA certificate to system trust store...
    certutil -addstore -user root "%USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer" >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] CA certificate installed
    ) else (
        echo  [!] Certificate install needs admin rights
        echo  [!] Right-click setup.bat and "Run as Administrator"
    )
) else (
    echo  [!] Certificate file not generated. Run mitmdump manually once.
)

echo.
echo  ======================================================
echo  [OK] Setup complete!
echo  [OK] Now run get_token.bat to capture your token.
echo  ======================================================
echo.
pause
