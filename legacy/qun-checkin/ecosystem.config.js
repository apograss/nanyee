module.exports = {
  apps: [
    {
      name: "checkin-web",
      script: "server/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
    },
  ],
};
