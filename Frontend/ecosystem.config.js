// PM2 Ecosystem Configuration File
// This file provides advanced PM2 configuration options

module.exports = {
  apps: [
    {
      name: "uc-enterprise-suite",
      script: "npm",
      args: "start",
      cwd: "/var/www/uc-enterprise-suite",
      instances: 1, // Change to 'max' for cluster mode
      exec_mode: "fork", // Change to 'cluster' for multiple instances
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
    },
  ],
}
