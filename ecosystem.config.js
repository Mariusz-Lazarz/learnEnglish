module.exports = {
  apps: [
    {
      name: "learn-english",
      script: "./node_modules/.bin/next",
      args: "start -p 3001",
      cwd: "/root/learnEnglish",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};