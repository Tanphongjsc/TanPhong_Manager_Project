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

# 2. Install Node.js dependencies & build Tailwind CSS
echo ""
echo "🎨 Step 2: Building Tailwind CSS..."
npm ci
npm run build:css

# 3. Collect static files
echo ""
echo "📁 Step 3: Collecting static files..."
python manage.py collectstatic --no-input --clear

# 4. Run database migrations
echo ""
echo "🗄️  Step 4: Running database migrations..."
python manage.py migrate --no-input

echo ""
echo "=================================="
echo "✅ Build completed successfully!"
echo "=================================="