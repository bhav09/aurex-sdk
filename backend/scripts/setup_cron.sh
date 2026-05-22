#!/bin/bash
# Setup weekly cron job for pricing updates
# Run: bash backend/scripts/setup_cron.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_PATH=$(which python3)

# Cron job: Every Sunday at 2am UTC
CRON_SCHEDULE="0 2 * * 0"
CRON_COMMAND="cd $PROJECT_ROOT/backend && $PYTHON_PATH scripts/update_pricing.py >> /tmp/aurex-pricing-update.log 2>&1"

echo "Setting up pricing update cron job..."
echo "Schedule: $CRON_SCHEDULE (Sunday 2am UTC)"
echo "Command: $CRON_COMMAND"
echo ""

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "update_pricing.py"; then
    echo "⚠️  Cron job already exists. Remove it first with:"
    echo "   crontab -e"
    echo "   (delete the line containing 'update_pricing.py')"
    exit 1
fi

# Add cron job
(crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $CRON_COMMAND") | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "To verify:"
echo "  crontab -l"
echo ""
echo "To view logs:"
echo "  tail -f /tmp/aurex-pricing-update.log"
echo ""
echo "To remove:"
echo "  crontab -e"
echo "  (delete the line containing 'update_pricing.py')"

# Made with Bob
