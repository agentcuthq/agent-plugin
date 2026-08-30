#!/bin/sh

python3 -c 'import pty,sys; pty.spawn(sys.argv[1:])' claude mcp login plugin:agentcut:agentcut > /tmp/agentcut-login.log 2>&1 &
