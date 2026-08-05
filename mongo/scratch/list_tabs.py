import asyncio
import json
import os
import urllib.request

async def main():
    ws_url = os.environ.get('AGY_BROWSER_WS_URL')
    print("WS URL:", ws_url)
    if not ws_url:
        print("AGY_BROWSER_WS_URL environment variable is not set.")
        return

    # Extract host and port from ws_url to fetch targets list via HTTP
    # ws_url format: ws://127.0.0.1:53884/devtools/browser/c5807017-a048-42cb-b972-8a80d44443a8
    try:
        parts = ws_url.split('/')
        host_port = parts[2]
        http_url = f"http://{host_port}/json/list"
        print("Fetching targets from:", http_url)
        with urllib.request.urlopen(http_url) as response:
            targets = json.loads(response.read().decode())
            for t in targets:
                print(f"Target: ID={t.get('id')}, Type={t.get('type')}, Title={t.get('title')}, URL={t.get('url')}")
    except Exception as e:
        print("Failed to get targets via HTTP:", e)

if __name__ == '__main__':
    asyncio.run(main())
