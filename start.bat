@echo off
chcp 65001 >nul
title Cybers DA9 Bot
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm install
)
:loop
node src/index.js
echo Bot stopped - restarting in 5 seconds...
timeout /t 5 >nul
goto loop
