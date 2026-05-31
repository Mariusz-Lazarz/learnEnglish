module.exports = {
  apps: [
    {
      name: "learn-english",
      script: "/root/.nvm/versions/node/v20.20.2/bin/node",
      args: "/root/learnEnglish/node_modules/.bin/next start -p 3001",
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