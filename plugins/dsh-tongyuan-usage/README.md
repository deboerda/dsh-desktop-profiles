# dsh-tongyuan-usage

Host-plane DSH plugin: Tongyuan account balance + token usage in the left sidebar.

- Reads `TONGYUAN_API_KEY` from harness credentials
- Polls `https://copilot-dev.tongyuan.cc/api/user/balance` and `/api/tokens`
- Serves `http://127.0.0.1:1458/status` to the Web client
- Starts and stops with the DSH host process
