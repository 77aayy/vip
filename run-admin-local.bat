@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set URL=http://localhost:5174/admin
echo ========================================
echo   تشغيل السيرفر المحلي + صفحة الأدمن
echo ========================================
echo.
echo تشغيل السيرفر (Vite) في نافذة جديدة...
start "Vite Dev Server" cmd /k "cd /d \"%~dp0\" && npm run dev"
echo.
echo انتظار جاهزية السيرفر (حوالي 5 ثوانٍ)...
timeout /t 5 /nobreak >nul
echo.
echo فتح صفحة الأدمن في المتصفح...
start "" "%URL%"
echo.
echo تم. السيرفر يعمل في النافذة الأخرى — لا تغلقها.
echo إذا لم تفتح الصفحة، انظر في نافذة Vite للمنفذ الفعلي (مثلاً 5175).
echo لإيقاف السيرفر: أغلق نافذة "Vite Dev Server" أو اضغط Ctrl+C فيها.
pause
