# UC Enterprise Suite - Ubuntu Server Deployment Guide

## Prerequisites

Before deploying, ensure your Ubuntu server has:
- Ubuntu 20.04 LTS or higher
- Node.js 18.x or higher
- npm or yarn package manager
- At least 2GB RAM
- 10GB free disk space

## Step 1: Install Node.js and npm

\`\`\`bash
# Update system packages
sudo apt update
sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x or higher
\`\`\`

## Step 2: Install PM2 (Process Manager)

\`\`\`bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version
\`\`\`

## Step 3: Upload Your Application

### Option A: Using Git (Recommended)
\`\`\`bash
# Install git if not already installed
sudo apt install git -y

# Clone your repository (replace with your repo URL)
cd /var/www
sudo git clone <your-repo-url> uc-enterprise-suite
cd uc-enterprise-suite
\`\`\`

### Option B: Using SCP/SFTP
\`\`\`bash
# From your local machine, upload the files
scp -r /path/to/your/app user@your-server-ip:/var/www/uc-enterprise-suite

# Then SSH into your server
ssh user@your-server-ip
cd /var/www/uc-enterprise-suite
\`\`\`

## Step 4: Install Dependencies

\`\`\`bash
# Navigate to your app directory
cd /var/www/uc-enterprise-suite

# Install dependencies
npm install

# Or if using yarn
# yarn install
\`\`\`

## Step 5: Build the Application

\`\`\`bash
# Build for production
npm run build

# This creates an optimized production build in the .next folder
\`\`\`

## Step 6: Start the Application with PM2

\`\`\`bash
# Start the app with PM2
pm2 start npm --name "uc-enterprise-suite" -- start

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup systemd
# Follow the command output instructions

# Check app status
pm2 status

# View logs
pm2 logs uc-enterprise-suite
\`\`\`

## Step 7: Install and Configure Nginx

\`\`\`bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/uc-enterprise-suite
\`\`\`

Add the following configuration:

\`\`\`nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
\`\`\`

Enable the site:

\`\`\`bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/uc-enterprise-suite /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx
\`\`\`

## Step 8: Configure Firewall

\`\`\`bash
# Allow Nginx through firewall
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable

# Check firewall status
sudo ufw status
\`\`\`

## Step 9: Install SSL Certificate (Optional but Recommended)

\`\`\`bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Follow the prompts to complete SSL setup

# Test auto-renewal
sudo certbot renew --dry-run
\`\`\`

## Step 10: Access Your Application

Your application should now be accessible at:
- HTTP: `http://your-domain.com` or `http://your-server-ip`
- HTTPS: `https://your-domain.com` (if SSL configured)

## Default Login Credentials

**Super Admin Account:**
- Email: `admin@demo.com`
- Password: `admin123`
- Company: `Demo Enterprises Pvt Ltd`
- Branch: `Main Showroom`

**Important:** Change these credentials immediately after first login!

## Useful PM2 Commands

\`\`\`bash
# View app status
pm2 status

# View logs
pm2 logs uc-enterprise-suite

# Restart app
pm2 restart uc-enterprise-suite

# Stop app
pm2 stop uc-enterprise-suite

# Delete app from PM2
pm2 delete uc-enterprise-suite

# Monitor app
pm2 monit
\`\`\`

## Troubleshooting

### App won't start
\`\`\`bash
# Check logs
pm2 logs uc-enterprise-suite

# Check if port 3000 is in use
sudo lsof -i :3000

# Restart the app
pm2 restart uc-enterprise-suite
\`\`\`

### Nginx errors
\`\`\`bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
\`\`\`

### Permission issues
\`\`\`bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/uc-enterprise-suite

# Fix permissions
sudo chmod -R 755 /var/www/uc-enterprise-suite
\`\`\`

## Important Notes

### Data Persistence
⚠️ **Current Setup:** The application currently uses in-memory storage. All data will be lost when the app restarts.

**For Production Use:** You should integrate a database:
1. **Supabase** (Recommended) - PostgreSQL with built-in auth
2. **Neon** - Serverless PostgreSQL
3. **MongoDB** - NoSQL database
4. **MySQL/PostgreSQL** - Traditional SQL databases

To add database integration, you can use the v0 integration features or manually configure your preferred database.

### Security Recommendations

1. **Change Default Credentials** immediately after deployment
2. **Set up SSL/HTTPS** for secure communication
3. **Configure firewall** to only allow necessary ports
4. **Regular backups** of your data (once database is integrated)
5. **Keep system updated**: `sudo apt update && sudo apt upgrade`
6. **Monitor logs** regularly: `pm2 logs`

### Performance Optimization

\`\`\`bash
# Increase PM2 instances for better performance
pm2 delete uc-enterprise-suite
pm2 start npm --name "uc-enterprise-suite" -i max -- start

# This will start one instance per CPU core
\`\`\`

## Updating the Application

\`\`\`bash
# Navigate to app directory
cd /var/www/uc-enterprise-suite

# Pull latest changes (if using Git)
git pull origin main

# Install any new dependencies
npm install

# Rebuild the application
npm run build

# Restart with PM2
pm2 restart uc-enterprise-suite
\`\`\`

## Support

For issues or questions:
1. Check the logs: `pm2 logs uc-enterprise-suite`
2. Review Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Ensure all services are running: `pm2 status` and `sudo systemctl status nginx`

---

**Your UC Enterprise Suite is now deployed and ready to use!** 🚀
