import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Local LLM Copilot activated!');

  const provider = new LocalLLMChatProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('localLLM.chatView', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('local-llm-copilot.startChat', () => {
      vscode.commands.executeCommand('localLLM.chatView.focus');
    })
  );
}

class LocalLLMChatProvider implements vscode.WebviewViewProvider {
  private currentChatId: string = 'default';
  private chats: Map<string, any[]> = new Map();

  constructor(private readonly _extensionUri: vscode.Uri, private context: vscode.ExtensionContext) {
    this.loadChats();
  }

  private loadChats() {
    const saved = this.context.globalState.get<Record<string, any[]>>('localLLM.chats');
    if (saved) {
      this.chats = new Map(Object.entries(saved));
    } else {
      this.chats.set('default', []);
    }
    this.currentChatId = 'default';
  }

  private saveChats() {
    this.context.globalState.update('localLLM.chats', Object.fromEntries(this.chats));
  }

  private sendChatList(webviewView: vscode.WebviewView) {
  webviewView.webview.postMessage({ 
    command: 'renderChats', 
    chats: Object.fromEntries(this.chats) 
  });
}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    this.sendChatList(webviewView);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'sendPrompt':
          const userMsg = { role: 'user', content: message.prompt, timestamp: Date.now() };
          this.addMessageToCurrentChat(userMsg);
          
          const responseText = await this.callLLM(message.prompt);
          const assistantMsg = { role: 'assistant', content: responseText, timestamp: Date.now() };
          this.addMessageToCurrentChat(assistantMsg);

          webviewView.webview.postMessage({ command: 'response', text: responseText });
          break;

        case 'loadChat':
          this.currentChatId = message.chatId;
          webviewView.webview.postMessage({ 
            command: 'loadChat', 
            messages: this.chats.get(this.currentChatId) || [] 
          });
          break;

        case 'newChat':
          this.currentChatId = `chat-${Date.now()}`;
          this.chats.set(this.currentChatId, []);
          this.saveChats();
          webviewView.webview.postMessage({ 
            command: 'newChat', 
            chatId: this.currentChatId,
            messages: [] 
          });
          break;
      }
    });
  }

  private addMessageToCurrentChat(msg: any) {
    if (!this.chats.has(this.currentChatId)) this.chats.set(this.currentChatId, []);
    this.chats.get(this.currentChatId)!.push(msg);
    this.saveChats();
  }

 private _getHtmlForWebview(webview: vscode.Webview): string {
  const nonce = this.getNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <style>
    body { 
      margin:0; padding:0; font-family: var(--vscode-font-family); 
      background: var(--vscode-editor-background); 
      color: var(--vscode-editor-foreground); 
      height:100vh; display:flex; 
    }
    #sidebar { 
      width: 240px; border-right: 1px solid #444; padding: 12px; overflow-y: auto; 
    }
    #main { flex: 1; display: flex; flex-direction: column; }
    #chat-container { 
      flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px; 
    }
    .message { 
      max-width: 80%; padding: 12px 16px; border-radius: 18px; line-height: 1.5; 
    }
    .user { align-self: flex-end; background: #007acc; color: white; }
    .assistant { align-self: flex-start; background: #2d2d2d; }
    .chat-item { 
      padding: 10px; cursor: pointer; border-radius: 6px; margin-bottom: 6px; 
    }
    .chat-item:hover, .chat-item.active { background: #2d2d2d; }
    #input-area { 
      padding: 12px; border-top: 1px solid #444; display: flex; gap: 8px; 
    }
    #prompt { 
      flex: 1; padding: 10px 14px; border-radius: 20px; 
      background: var(--vscode-input-background); 
      color: var(--vscode-input-foreground); border: none; 
    }
    button { 
      padding: 10px 20px; border-radius: 20px; background: #007acc; color: white; border: none; cursor: pointer; 
    }
  </style>
</head>
<body>
  <div id="sidebar">
    <button onclick="newChat()" style="width:100%; margin-bottom:15px; padding:12px;">+ New Chat</button>
    <div id="chat-list"></div>
  </div>
  <div id="main">
    <div id="chat-container"></div>
    <div id="input-area">
      <textarea id="prompt" rows="1" placeholder="Type a message..."></textarea>
      <button id="send">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentChatId = 'default';

    function renderChatList(chats) {
      const container = document.getElementById('chat-list');
      container.innerHTML = '';
      Object.keys(chats).forEach(id => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        if (id === currentChatId) item.classList.add('active');
        item.textContent = id === 'default' ? 'Default Chat' : 'Chat ' + new Date(parseInt(id.split('-')[1] || Date.now())).toLocaleString();
        item.onclick = () => vscode.postMessage({command: 'loadChat', chatId: id});
        container.appendChild(item);
      });
    }

    function addMessage(role, content) {
      const container = document.getElementById('chat-container');
      const div = document.createElement('div');
      div.className = \`message \${role}\`;
      div.textContent = content;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function newChat() {
      vscode.postMessage({command: 'newChat'});
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'response') {
        addMessage('assistant', msg.text);
      } else if (msg.command === 'loadChat') {
        currentChatId = msg.chatId || currentChatId;
        document.getElementById('chat-container').innerHTML = '';
        (msg.messages || []).forEach(m => addMessage(m.role, m.content));
      } else if (msg.command === 'newChat') {
        currentChatId = msg.chatId;
        document.getElementById('chat-container').innerHTML = '';
      } else if (msg.command === 'renderChats') {
        renderChatList(msg.chats);
      }
    });

    // Send message
    function sendPrompt() {
      const input = document.getElementById('prompt');
      if (input.value.trim()) {
        addMessage('user', input.value);
        vscode.postMessage({command: 'sendPrompt', prompt: input.value});
        input.value = '';
      }
    }

    document.getElementById('send').addEventListener('click', sendPrompt);
    document.getElementById('prompt').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    });

    // Initial load
    vscode.postMessage({command: 'loadChat', chatId: 'default'});
  </script>
</body>
</html>`;
}


  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:7b',
          messages: [{ role: 'user', content: prompt }],
          stream: false
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data:any = await response.json();
      return data.message?.content || 'No response';
    } catch (err: any) {
      console.error(err);
      return `Error: ${err.message}. Is Ollama running?`;
    }
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

export function deactivate() { }