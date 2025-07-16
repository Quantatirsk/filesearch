#!/bin/bash

# Document Search API Server Startup Script

# Default configuration
HOST=${HOST:-"0.0.0.0"}
PORT=${PORT:-8001}
DB_PATH=${DB_PATH:-"documents.db"}
RELOAD=${RELOAD:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Document Search API Server${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is required but not installed${NC}"
    exit 1
fi

# Check if required packages are installed
echo -e "${YELLOW}📦 Checking dependencies...${NC}"
python3 -c "import fastapi, uvicorn" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Required packages not installed${NC}"
    echo -e "${YELLOW}💡 Run: pip install -r requirements.txt${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependencies satisfied${NC}"

# Check if database exists and show stats
if [ -f "$DB_PATH" ]; then
    echo -e "${GREEN}✅ Database found: $DB_PATH${NC}"
    echo -e "${YELLOW}📊 Database stats:${NC}"
    python3 -c "
import sys
sys.path.insert(0, '.')
from core.database import DocumentDatabase
try:
    with DocumentDatabase('$DB_PATH') as db:
        stats = db.get_stats()
        print(f'   📄 Documents: {stats.get(\"document_count\", 0)}')
        print(f'   💾 Size: {stats.get(\"database_size\", 0)} bytes')
except Exception as e:
    print(f'   ⚠️  Error reading stats: {e}')
"
else
    echo -e "${YELLOW}⚠️  Database not found: $DB_PATH${NC}"
    echo -e "${YELLOW}💡 Index some documents first using: python main.py index <directory>${NC}"
fi

echo ""
echo -e "${BLUE}🌐 Server Configuration:${NC}"
echo -e "   Host: $HOST"
echo -e "   Port: $PORT"
echo -e "   Database: $DB_PATH"
echo -e "   Reload: $RELOAD"
echo ""

# Start the server
echo -e "${GREEN}🚀 Starting API server...${NC}"
echo -e "${BLUE}📚 API Documentation: http://$HOST:$PORT/docs${NC}"
echo -e "${BLUE}📖 Alternative Docs: http://$HOST:$PORT/redoc${NC}"
echo -e "${YELLOW}⏹️  Press Ctrl+C to stop${NC}"
echo ""

if [ "$RELOAD" = "true" ]; then
    python3 api_server.py --host "$HOST" --port "$PORT" --db "$DB_PATH" --reload
else
    python3 api_server.py --host "$HOST" --port "$PORT" --db "$DB_PATH"
fi