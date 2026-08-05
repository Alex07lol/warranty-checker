import asyncio
import json
import os
import websockets

async def debug_create_target():
    ws_url = os.environ.get('AGY_BROWSER_WS_URL')
    if not ws_url:
        print("AGY_BROWSER_WS_URL environment variable is not set.")
        return

    print("Connecting to browser WS URL:", ws_url)
    async with websockets.connect(ws_url, max_size=None) as websocket:
        create_cmd = {
            "id": 1,
            "method": "Target.createTarget",
            "params": {
                "url": "https://app.composio.dev"
            }
        }
        await websocket.send(json.dumps(create_cmd))
        
        for i in range(10):
            response = await websocket.recv()
            resp_data = json.loads(response)
            print(f"Message {i+1}:")
            print(json.dumps(resp_data, indent=2))
            if resp_data.get("id") == 1:
                break

if __name__ == '__main__':
    asyncio.run(debug_create_target())
