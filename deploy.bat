@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ========================================
echo   رفع المشروع — GitHub + Firebase
echo ========================================
echo.

echo [1/3] التحقق والبناء (npm run check = build + اختبارات وحدة)...
call npm run check
if errorlevel 1 (
  echo.
  echo فشل التحقق أو البناء. أصلح الأخطاء ثم أعد التشغيل.
  exit /b 1
)
echo التحقق والبناء نجح.
echo.

echo [2/3] رفع GitHub (git push)...
call git push origin master
if errorlevel 1 (
  echo.
  echo تحذير: فشل git push. تأكد من:
  echo   - وجود commit محلي (git status)
  echo   - صلاحية الدفع إلى origin/master
  echo متابعة النشر على Firebase...
  echo.
)
echo.

echo [3/3] النشر على Firebase...
call npx firebase deploy
if errorlevel 1 (
  echo.
  echo فشل النشر على Firebase.
  exit /b 1
)

echo.
echo ========================================
echo   اكتمل: GitHub و Firebase
echo ========================================
exit /b 0
