#!/usr/bin/env bash
# build.sh - Script tự động build cho Render.com

# Exit ngay khi có lỗi
set -o errexit

echo "=================================="
echo "🚀 Starting build process..."
echo "=================================="


# 1. Install dependencies
echo ""
echo "📦 Step 1: Installing Python dependencies..."
pip install -r requirements.txt

# 2. Collect static files
echo ""
echo "🎨 Step 2: Collecting static files..."
python manage.py collectstatic --no-input --clear

echo ""
echo "=================================="
echo "✅ Build completed successfully!"
echo "=================================="