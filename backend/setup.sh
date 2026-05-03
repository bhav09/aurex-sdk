#!/bin/bash

# Aurex Backend Setup Script

echo "╔═══════════════════════════════════════╗"
echo "║    Aurex Backend Setup Script        ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check Python version
echo "🔍 Checking Python version..."
python3 --version

if [ $? -ne 0 ]; then
    echo "❌ Python 3 is not installed. Please install Python 3.10 or higher."
    exit 1
fi

# Create virtual environment
echo ""
echo "📦 Creating virtual environment..."
python3 -m venv venv

if [ $? -ne 0 ]; then
    echo "❌ Failed to create virtual environment"
    exit 1
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo ""
echo "📥 Installing dependencies..."
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created. You can edit it if needed."
fi

# Create database directory
echo ""
echo "📁 Setting up database..."
mkdir -p database

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║         Setup Complete! ✅            ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "To start the server:"
echo "  1. Activate virtual environment: source venv/bin/activate"
echo "  2. Run the server: python main.py"
echo ""
echo "API will be available at: http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo ""


