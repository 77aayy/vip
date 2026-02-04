@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   رفع إلى GitHub + نشر على Firebase
echo ========================================
echo.

echo [1/4] Git: إضافة التغييرات...
git add -A
if errorlevel 1 (
  echo خطأ في git add
  pause
  exit /b 1
)

echo [2/4] Git: حفظ ونشر إلى GitHub...
set MSG=deploy %date% %time%
set MSG=%MSG:~0,-3%
git commit -m "%MSG%" 2>nul
if errorlevel 1 (
  echo لا توجد تغييرات جديدة للرفع أو فشل commit.
) else (
  git push
  if errorlevel 1 (
    echo تحذير: فشل git push. تأكد من الريموت والصلاحيات.
  ) else (
    echo تم الرفع إلى GitHub بنجاح.
  )
)
echo.

echo [3/4] بناء المشروع...
call npm run build
if errorlevel 1 (
  echo فشل البناء. راجع الأخطاء أعلاه.
  pause
  exit /b 1
)
echo.

echo [4/4] النشر على Firebase...
call firebase deploy
if errorlevel 1 (
  echo فشل النشر على Firebase.
  pause
  exit /b 1
)

echo.
echo ========================================
echo   تم: GitHub + Firebase بنجاح
echo ========================================
pause
