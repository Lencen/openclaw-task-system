#!/bin/bash
# 设置自我进化定时任务

echo "设置自我进化定时任务..."

# 获取当前用户
USER=$(whoami)

# 获取脚本绝对路径
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/self-evolution-runner.js"

# 创建临时crontab文件
CRON_TEMP=$(mktemp)

# 备份当前crontab
crontab -l > "$CRON_TEMP" 2>/dev/null || echo "# Empty crontab" > "$CRON_TEMP"

# 检查是否已存在相同的任务
if grep -q "self-evolution-runner.js" "$CRON_TEMP"; then
    echo "定时任务已存在，跳过添加"
else
    # 添加定时任务：每天凌晨3点运行自我进化
    echo "0 3 * * * cd "$(dirname "$(dirname "$SCRIPT_PATH")")" && /usr/bin/node scripts/self-evolution/self-evolution-runner.js >> data/self-evolution.log 2>&1" >> "$CRON_TEMP"
    echo "已添加定时任务：每天凌晨3点运行自我进化"
fi

# 安装新的crontab
crontab "$CRON_TEMP"

# 清理临时文件
rm "$CRON_TEMP"

echo "定时任务设置完成"
echo "当前用户的crontab:"
crontab -l