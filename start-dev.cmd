@echo off
REM Child Safety Simulator - Development Server Starter
REM Chạy Backend và Frontend cùng lúc

echo.
echo ====================================================
echo    Child Safety Simulator - Development Mode
echo ====================================================
echo.
echo Checking dependencies...
echo.

REM Check if node_modules exists in root
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
    echo.
)

REM Check if Backend node_modules exists
if not exist "Backend\node_modules" (
    echo Installing Backend dependencies...
    call npm --prefix Backend install
    echo.
)

REM Check if Frontend node_modules exists
if not exist "Frontend\node_modules" (
    echo Installing Frontend dependencies...
    call npm --prefix Frontend install
    echo.
)

echo.
echo ====================================================
echo Starting development servers...
echo ====================================================
echo.
echo Backend will start at:  http://localhost:3000
echo Frontend will start at: http://localhost:5173
echo.
echo Press Ctrl+C to stop both servers
echo.

call npm run dev
