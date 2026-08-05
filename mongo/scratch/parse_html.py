from bs4 import BeautifulSoup

def main():
    with open('C:\\Users\\user\\.gemini\\antigravity\\scratch\\page_content.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    print("--- PAGE TITLE ---")
    print(soup.title.string if soup.title else "No Title")
    
    print("\n--- FORMS ---")
    for form in soup.find_all('form'):
        print(f"Form: id={form.get('id')}, action={form.get('action')}, class={form.get('class')}")
        
    print("\n--- INPUTS ---")
    for inp in soup.find_all('input'):
        print(f"Input: id={inp.get('id')}, name={inp.get('name')}, type={inp.get('type')}, placeholder={inp.get('placeholder')}, value={inp.get('value')}")
        
    print("\n--- TEXTAREAS ---")
    for ta in soup.find_all('textarea'):
        print(f"Textarea: id={ta.get('id')}, name={ta.get('name')}, placeholder={ta.get('placeholder')}, text={ta.text.strip()[:100]}")
        
    print("\n--- BUTTONS ---")
    for btn in soup.find_all('button'):
        print(f"Button: id={btn.get('id')}, class={btn.get('class')}, text={btn.text.strip()}")

    print("\n--- STYLED OR INTERESTING SECTION HEADINGS/TEXT ---")
    for tag in soup.find_all(['h1', 'h2', 'h3', 'h4', 'span', 'p']):
        text = tag.text.strip()
        if any(keyword in text.lower() for keyword in ['linkedin', 'post', 'template', 'composio', 'pipedream', 'url', 'mcp']):
            # Print first 100 chars of matching text
            print(f"{tag.name}: {text[:150]}")

if __name__ == '__main__':
    main()
