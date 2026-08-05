import os
import sys
import json
import ollama
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

# ── Define system prompt ─────────────────────────────────
INTENT_SYSTEM_PROMPT = """
You are an Intent Detection Engine for an enterprise AI assistant.

Your job:
1. Read the user input carefully.
2. Identify ALL distinct action intents present — even implied ones.
3. Split them into individual intents BY YOURSELF — do not rely on conjunctions only.
4. For each intent, extract the target entity and action parameters if present.
5. If an intent is truly ambiguous, flag it for clarification.

Valid intent labels ONLY:
- SendEmail
- ScheduleMeeting
- GenerateReport
- SummarizeDocument
- SearchKnowledge
- SetReminder
- CreateTicket
- MakeCall
- Unknown

Respond ONLY in this exact JSON structure, no explanation, no markdown:
{
  "total_intents": <number>,
  "intents": [
    {
      "intent": "<label>",
      "confidence": <0.0 to 1.0>,
      "action_phrase": "<exact sub-phrase from input>",
      "entity": "<who or what this action targets>",
      "parameters": { "<key>": "<value>" },
      "needs_clarification": false,
      "Status of the work": "<Success or failure>"
    }
  ],
  "execution_order": ["<intent1>", "<intent2>"],
  "clarification_message": null
}

Rules:
- If confidence < 0.7, set needs_clarification to true and explain in clarification_message.
- Never invent intents not in the valid list.
- If truly ambiguous with no valid match, use Unknown and ask clarification.
"""

def detect_intent(user_input: str) -> dict:
    try:
        response = ollama.chat(
            model="llama3.1",
            messages=[
                {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                {"role": "user",   "content": user_input}
            ],
            options={
              "temperature": 0,
              "top_p": 0.1,
              "top_k": 10
            }   # deterministic output
        )
        
        raw = response["message"]["content"].strip()
        
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: strip any accidental markdown fences
            clean = raw.replace("```json", "").replace("```", "").strip()
            return json.loads(clean)
    except Exception as e:
        return {
            "error": str(e),
            "total_intents": 0,
            "intents": [],
            "execution_order": [],
            "clarification_message": f"Ollama execution error: {str(e)}"
        }

# ── Web Server for the UI ─────────────────────────────────
class WebAppHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging server requests to terminal to keep CLI output clean
        pass

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            with open(os.path.join(os.path.dirname(__file__), "index.html"), "rb") as f:
                self.wfile.write(f.read())
        elif self.path == "/styles.css":
            self.send_response(200)
            self.send_header("Content-type", "text/css")
            self.end_headers()
            with open(os.path.join(os.path.dirname(__file__), "styles.css"), "rb") as f:
                self.wfile.write(f.read())
        elif self.path == "/script.js":
            self.send_response(200)
            self.send_header("Content-type", "application/javascript")
            self.end_headers()
            with open(os.path.join(os.path.dirname(__file__), "script.js"), "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

    def do_POST(self):
        if self.path == "/api/detect":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            user_input = data.get("message", "")
            
            result = detect_intent(user_input)
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_web_server(port=8080):
    server = HTTPServer(('127.0.0.1', port), WebAppHandler)
    print(f"\n[Web UI Server] Running at http://localhost:{port}/")
    webbrowser.open(f"http://localhost:{port}/")
    server.serve_forever()

# ── CLI Mode ─────────────────────────────────────────────
def run_cli():
    print("=" * 60)
    print("      Intent Detection Engine (Ollama / Llama3.1)      ")
    print("=" * 60)
    print("Type your message to analyze intents.")
    print("Type 'exit' or 'quit' to stop, or 'web' to launch the Web UI.\n")
    
    while True:
        try:
            msg = input("\033[94mEnter a message:\033[0m ").strip()
            if not msg:
                continue
            if msg.lower() in ['exit', 'quit']:
                print("\nGoodbye!")
                break
            if msg.lower() == 'web':
                print("Launching Web UI...")
                # Start web server in a background thread so we can keep using CLI
                t = threading.Thread(target=run_web_server, daemon=True)
                t.start()
                continue
            
            print("\033[93mAnalyzing intents...\033[0m")
            result = detect_intent(msg)
            
            print("\n\033[92m[Response from Ollama]\033[0m")
            print(json.dumps(result, indent=2))
            print("-" * 60 + "\n")
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}\n")

if __name__ == "__main__":
    # Check if user passed arguments or if they want to run web directly
    if len(sys.argv) > 1 and sys.argv[1] == "--web":
        run_web_server()
    else:
        # Default to CLI mode (which also lets you launch Web UI by typing 'web')
        run_cli()
