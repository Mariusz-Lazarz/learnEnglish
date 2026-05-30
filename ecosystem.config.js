module.exports = {
  apps: [{
    name: 'learn-english',
    script: 'node_modules/.bin/next',
    args: 'start',
    instances: 1,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
