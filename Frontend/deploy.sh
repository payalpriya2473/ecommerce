#!/bin/bash

# UC Enterprise Suite Deployment Script
# This script automates the deployment process

set -e  # Exit on error

echo "🚀 Starting UC Enterprise Suite Deployment..."

# Configuration
APP_DIR="/var/www/uc-enterprise-suite"
APP_NAME="uc-enterprise-suite"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}Please do not run this script as root${NC}"
    exit 1
fi

# Navigate to app directory
cd $APP_DIR || exit

echo -e "${YELLOW}📦 Pulling latest changes...${NC}"
git pull origin main

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}🔨 Building application...${NC}"
npm run build

echo -e "${YELLOW}🔄 Restarting application with PM2...${NC}"
pm2 restart $APP_NAME

echo -e "${YELLOW}💾 Saving PM2 configuration...${NC}"
pm2 save

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}📊 Application status:${NC}"
pm2 status $APP_NAME

echo -e "\n${YELLOW}📝 View logs with: pm2 logs $APP_NAME${NC}"
