import asyncio
import json
import os
import urllib.request
import websockets

async def get_page_content():
    ws_url = os.environ.get('AGY_BROWSER_WS_URL')
    if not ws_url:
        print("AGY_BROWSER_WS_URL environment variable is not set.")
        return

    parts = ws_url.split('/')
    host_port = parts[2]
    http_url = f"http://{host_port}/json/list"
    
    target_ws_url = None
    try:
        with urllib.request.urlopen(http_url) as response:
            targets = json.loads(response.read().decode())
            for t in targets:
                if t.get('type') == 'page':
                    target_ws_url = t.get('webSocketDebuggerUrl')
                    break
    except Exception as e:
        print("Failed to get targets:", e)
        return

    if not target_ws_url:
        print("No page target webSocketDebuggerUrl found.")
        return

    print("Connecting to page WS URL:", target_ws_url)
    # Set max_size=None to handle large frames
    async with websockets.connect(target_ws_url, max_size=None) as websocket:
        eval_cmd = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": "document.documentElement.outerHTML",
                "returnByValue": True
            }
        }
        await websocket.send(json.dumps(eval_cmd))
        
        while True:
            response = await websocket.recv()
            resp_data = json.loads(response)
            if resp_data.get("id") == 1:
                if "result" in resp_data and "result" in resp_data["result"]:
                    html = resp_data["result"]["result"].get("value")
                    print("--- HTML CONTENT ---")
                    # Limit printing to first 2000 chars to avoid clutter, but write full content to a file
                    print(html[:2000] + "\n... TRUNCATED ...")
                    print("--------------------")
                    with open("C:\\Users\\user\\.gemini\\antigravity\\scratch\\page_content.html", "w", encoding="utf-8") as f:
                        f.write(html)
                    print("Full content written to page_content.html")
                else:
                    print("Unexpected response format:", resp_data)
                break

if __name__ == '__main__':
    asyncio.run(get_page_content())
