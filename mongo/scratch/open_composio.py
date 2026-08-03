import asyncio
import base64
import json
import os
import urllib.request
import websockets

async def open_composio():
    ws_url = os.environ.get('AGY_BROWSER_WS_URL')
    if not ws_url:
        print("AGY_BROWSER_WS_URL environment variable is not set.")
        return

    parts = ws_url.split('/')
    host_port = parts[2]
    http_url = f"http://{host_port}/json/list"
    
    print("Connecting to browser WS URL:", ws_url)
    async with websockets.connect(ws_url, max_size=None) as websocket:
        create_target_cmd = {
            "id": 1,
            "method": "Target.createTarget",
            "params": {
                "url": "https://app.composio.dev"
            }
        }
        await websocket.send(json.dumps(create_target_cmd))
        
        target_id = None
        while True:
            response = await websocket.recv()
            resp_data = json.loads(response)
            if resp_data.get("id") == 1:
                target_id = resp_data["result"]["targetId"]
                print("Created target with ID:", target_id)
                break

        if not target_id:
            print("Failed to create target.")
            return

        # Wait for page to navigate and load
        await asyncio.sleep(5)
        
        target_ws_url = None
        try:
            with urllib.request.urlopen(http_url) as response:
                targets = json.loads(response.read().decode())
                for t in targets:
                    if t.get('id') == target_id:
                        target_ws_url = t.get('webSocketDebuggerUrl')
                        break
        except Exception as e:
            print("Failed to get target WS URL:", e)
            return

        if not target_ws_url:
            print("No webSocketDebuggerUrl found for new target.")
            return

        print("Connecting to new target WS URL:", target_ws_url)
        async with websockets.connect(target_ws_url, max_size=None) as page_ws:
            # Enable Page domain
            await page_ws.send(json.dumps({
                "id": 10,
                "method": "Page.enable"
            }))
            # Read messages until we get response for id 10
            while True:
                response = await page_ws.recv()
                resp_data = json.loads(response)
                if resp_data.get("id") == 10:
                    break

            # Wait a bit more for rendering
            await asyncio.sleep(5)

            # Capture screenshot
            screenshot_cmd = {
                "id": 11,
                "method": "Page.captureScreenshot",
                "params": {
                    "format": "png"
                }
            }
            await page_ws.send(json.dumps(screenshot_cmd))
            
            screenshot_data = None
            while True:
                response = await page_ws.recv()
                resp_data = json.loads(response)
                if resp_data.get("id") == 11:
                    if "result" in resp_data and "data" in resp_data["result"]:
                        screenshot_data = resp_data["result"]["data"]
                    else:
                        print("Failed to capture screenshot:", resp_data)
                    break

            if screenshot_data:
                image_bytes = base64.b64decode(screenshot_data)
                output_path = "C:\\Users\\user\\.gemini\\antigravity\\scratch\\composio_screenshot.png"
                with open(output_path, "wb") as f:
                    f.write(image_bytes)
                print(f"Composio screenshot successfully saved to {output_path}")

if __name__ == '__main__':
    asyncio.run(open_composio())
