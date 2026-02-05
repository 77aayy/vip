@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   رفع إلى Firebase (واختياري: GitHub)
echo ========================================
echo.

echo [1/4] التأكد من المجلد...
if not exist "package.json" (
  echo خطأ: لا يوجد package.json. شغّل الملف من مجلد المشروع.
  pause
  exit /b 1
)
if not exist "firebase.json" (
  echo خطأ: لا يوجد firebase.json في المشروع.
  pause
  exit /b 1
)
echo المجلد صحيح.
echo.

echo [2/4] بناء المشروع (npm run build)...
call npm run build
if errorlevel 1 (
  echo فشل البناء. راجع الأخطاء أعلاه.
  pause
  exit /b 1
)
echo.

echo [3/4] النشر على Firebase (npx firebase deploy)...
call npx firebase deploy
if errorlevel 1 (
  echo فشل النشر على Firebase. تأكد من: firebase login ووجود .firebaserc
  pause
  exit /b 1
)
echo.

echo [4/4] اختياري: Git...
git add -A 2>nul
set MSG=deploy %date% %time%
set MSG=%MSG:~0,-3%
git commit -m "%MSG%" 2>nul
if not errorlevel 1 (
  git push 2>nul
  if not errorlevel 1 echo تم الرفع إلى GitHub أيضاً.
)

echo.
echo ========================================
echo   تم: البناء + Firebase بنجاح
echo ========================================
echo الموقع: https://elite-vip-36dd8.web.app
echo ========================================
pause
