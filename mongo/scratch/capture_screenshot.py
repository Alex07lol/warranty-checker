import asyncio
import base64
import json
import os
import urllib.request
import websockets

async def capture_screenshot():
    ws_url = os.environ.get('AGY_BROWSER_WS_URL')
    if not ws_url:
        print("AGY_BROWSER_WS_URL environment variable is not set.")
        return

    # Fetch targets list via HTTP to get the active page
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
    async with websockets.connect(target_ws_url, max_size=None) as websocket:
        # Enable Page domain
        await websocket.send(json.dumps({
            "id": 1,
            "method": "Page.enable"
        }))
        await websocket.recv()

        # Capture screenshot
        screenshot_cmd = {
            "id": 2,
            "method": "Page.captureScreenshot",
            "params": {
                "format": "png"
            }
        }
        await websocket.send(json.dumps(screenshot_cmd))
        
        screenshot_data = None
        while True:
            response = await websocket.recv()
            resp_data = json.loads(response)
            if resp_data.get("id") == 2:
                if "result" in resp_data and "data" in resp_data["result"]:
                    screenshot_data = resp_data["result"]["data"]
                else:
                    print("Failed to capture screenshot:", resp_data)
                break

        if screenshot_data:
            image_bytes = base64.b64decode(screenshot_data)
            output_path = "C:\\Users\\user\\.gemini\\antigravity\\scratch\\screenshot.png"
            with open(output_path, "wb") as f:
                f.write(image_bytes)
            print(f"Screenshot successfully saved to {output_path}")

if __name__ == '__main__':
    asyncio.run(capture_screenshot())
