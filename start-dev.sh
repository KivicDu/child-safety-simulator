#!/bin/bash

# Child Safety Simulator - Development Server Starter
# Chạy Backend và Frontend cùng lúc

echo ""
echo "===================================================="
echo "   Child Safety Simulator - Development Mode"
echo "===================================================="
echo ""
echo "Checking dependencies..."
echo ""

# Check if node_modules exists in root
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
    echo ""
fi

# Check if Backend node_modules exists
if [ ! -d "Backend/node_modules" ]; then
    echo "Installing Backend dependencies..."
    npm --prefix Backend install
    echo ""
fi

# Check if Frontend node_modules exists
if [ ! -d "Frontend/node_modules" ]; then
    echo "Installing Frontend dependencies..."
    npm --prefix Frontend install
    echo ""
fi

echo ""
echo "===================================================="
echo "Starting development servers..."
echo "===================================================="
echo ""
echo "Backend will start at:  http://localhost:3000"
echo "Frontend will start at: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

npm run dev
