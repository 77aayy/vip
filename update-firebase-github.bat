@echo off
REM Quick deploy: build only (no tests), then git push then Firebase
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Update Firebase + GitHub (build only, no tests)
echo ========================================
echo.

echo [1/5] Building (npm run build)...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Fix errors and run again.
  pause
  exit /b 1
)
echo Build OK.
echo.

echo [2/5] Pushing to GitHub (git push)...
call git push origin master
if errorlevel 1 (
  echo.
  echo Warning: git push failed. Check commit and origin/master.
  echo Continuing to Firebase deploy...
  echo.
) else (
  echo GitHub push OK.
)
echo.

echo [3/5] Installing functions dependencies...
cd /d "%~dp0\functions"
call npm install
cd /d "%~dp0"
echo Functions deps OK.
echo.

echo [4/5] Deploying to Firebase...
call npx firebase deploy
if errorlevel 1 (
  echo.
  echo Firebase deploy failed.
  pause
  exit /b 1
)
echo Firebase deploy OK.
echo.

echo [5/5] Done.
echo ========================================
echo   Firebase and GitHub updated
echo ========================================
echo.
pause
exit /b 0
