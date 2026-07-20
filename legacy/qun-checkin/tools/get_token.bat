@echo off
chcp 65001 >nul 2>&1
title Qun100 Token Capture Tool
color 0B

echo.
echo  ======================================================
echo     Qun100 (QunBaoShu) Authorization Token Capture
echo  ======================================================
echo.

:: -- Check mitmdump --
where mitmdump >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] mitmdump not found!
    echo  [!] Please run setup.bat first, or install:
    echo  [!]   pip install mitmproxy
    echo.
    pause
    exit /b 1
)
echo  [OK] mitmdump ready

:: -- Clean old files --
set "SCRIPT_DIR=%~dp0"
del /q "%SCRIPT_DIR%captured_token.txt" >nul 2>&1
del /q "%SCRIPT_DIR%.capture_done" >nul 2>&1

:: -- Save original proxy settings --
echo  [..] Saving proxy settings...
for /f "tokens=2*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable 2^>nul') do set "OLD_PROXY_ENABLE=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer 2^>nul') do set "OLD_PROXY_SERVER=%%b"

:: -- Set system proxy --
set PROXY_PORT=8899
echo  [..] Setting proxy to 127.0.0.1:%PROXY_PORT%...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f >nul
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:%PROXY_PORT%" /f >nul
echo  [OK] System proxy set

echo.
echo  +-----------------------------------------------------+
echo  ^|  Now do this:                                        ^|
echo  ^|                                                      ^|
echo  ^|  1. Open PC WeChat (PC WeiXin)                       ^|
echo  ^|  2. Open "QunBaoShu" mini-program                    ^|
echo  ^|  3. Click any check-in activity                      ^|
echo  ^|  4. Wait for "CAPTURED" message below                ^|
echo  ^|                                                      ^|
echo  ^|  Token will auto-copy to clipboard                   ^|
echo  +-----------------------------------------------------+
echo.
echo  [..] Starting capture on port %PROXY_PORT%...
echo  [..] Waiting for Authorization Token...
echo.

:: -- Start mitmdump --
start /b mitmdump -s "%SCRIPT_DIR%capture_token.py" -p %PROXY_PORT% --ssl-insecure --set connection_strategy=lazy -q 2>nul

:: -- Wait for capture --
:wait_loop
timeout /t 2 /nobreak >nul
if exist "%SCRIPT_DIR%.capture_done" goto captured
goto wait_loop

:captured
echo.
echo  ======================================================
echo.

:: -- Read and display token --
set /p TOKEN=<"%SCRIPT_DIR%captured_token.txt"
echo  [SUCCESS] Token captured!
echo.
echo  Token: %TOKEN:~0,40%...
echo.
echo  [OK] Auto-copied to clipboard
echo  [OK] Paste it to daka.nanyee.de settings page
echo.

:: -- Restore proxy --
echo  [..] Restoring proxy settings...
if "%OLD_PROXY_ENABLE%"=="0x1" (
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f >nul
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer /t REG_SZ /d "%OLD_PROXY_SERVER%" /f >nul
) else (
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f >nul
)
echo  [OK] Proxy restored

:: -- Clean --
del /q "%SCRIPT_DIR%.capture_done" >nul 2>&1

echo.
echo  ======================================================
echo  Press any key to exit...
pause >nul
