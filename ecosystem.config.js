module.exports = {
  "apps": [
    {
      "name": "task-system-server",
      "script": "src/server.js",
      "exec_mode": "fork",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "1G",
      "env": {
        "NODE_ENV": "production",
        "PORT": "8081"
      }
    },
    {
      "name": "agent-im-server",
      "script": "services/agent-im-server.js",
      "exec_mode": "fork",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "1G",
      "env": {
        "NODE_ENV": "production",
        "PORT": "18793"
      }
    },
    {
      "name": "auto-task-assigner",
      "script": "services/auto-task-assigner.js",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "500M",
      "env": {
        "NODE_ENV": "production",
        "CHECK_INTERVAL": 30000
      }
    },
    {
      "name": "task-completion-monitor",
      "script": "services/task-completion-monitor.js",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "200M",
      "env": {
        "NODE_ENV": "production",
        "CHECK_INTERVAL": 30000
      }
    }
  ]
}
