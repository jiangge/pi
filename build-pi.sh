#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Building pi-tui ==="
npx tsgo -p packages/tui/tsconfig.build.json

echo "=== Building pi-ai ==="
npx tsgo -p packages/ai/tsconfig.build.json

echo "=== Building pi-agent-core ==="
npx tsgo -p packages/agent/tsconfig.build.json

echo "=== Building pi-coding-agent ==="
npx tsgo -p packages/coding-agent/tsconfig.build.json

echo "=== Installing pi-pi ==="
mkdir -p /home/jiang/.local/bin
cat > /home/jiang/.local/bin/pi-pi << 'WRAPPER'
#!/bin/bash
exec node /home/jiang/jiang/source/pi/packages/coding-agent/dist/cli.js "$@"
WRAPPER
chmod +x /home/jiang/.local/bin/pi-pi

echo "=== Done ==="
echo "pi-pi installed: $(realpath /home/jiang/.local/bin/pi-pi)"
