#!/bin/bash
while true; do
  clear
  echo "Platform Monitor - $(date)"
  echo "========================"
  ps aux | grep node | wc -l | xargs echo "Node processes:"
  free -h | grep Mem | awk "{print \"Memory: \" \$3 \"/\" \$2}"
  df -h / | tail -1 | awk "{print \"Disk: \" \$3 \"/\" \$2}"
  sleep 5
done
