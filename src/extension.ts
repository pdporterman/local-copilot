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
  private chats: Map<string, { title: string; messages: any[] }> = new Map();

  constructor(private readonly _extensionUri: vscode.Uri, private context: vscode.ExtensionContext) {
    this.loadChats();
  }

  private loadChats() {
    const saved = this.context.globalState.get<Record<string, { title: string, messages: any[] }>>('localLLM.chats');
    if (saved) {
      this.chats = new Map(Object.entries(saved));
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
          // Create persistent chat only on first real message
          if (!this.chats.has(this.currentChatId) || this.chats.get(this.currentChatId)!.messages.length === 0) {
            this.currentChatId = `chat-${Date.now()}`;
            this.chats.set(this.currentChatId, {
              title: message.prompt.length > 60 ? message.prompt.substring(0, 57) + '...' : message.prompt,
              messages: []
            });
          }

          const userMsg = { role: 'user', content: message.prompt, timestamp: Date.now() };
          this.addMessageToCurrentChat(userMsg);

          const responseText = await this.callLLM(message.prompt);
          const assistantMsg = { role: 'assistant', content: responseText, timestamp: Date.now() };
          this.addMessageToCurrentChat(assistantMsg);

          if (this.chats.get(this.currentChatId)!.messages.length === 2) {
            this.generateBetterTitle(this.currentChatId, message.prompt, webviewView);
          }

          webviewView.webview.postMessage({ command: 'response', text: responseText });
          this.sendChatList(webviewView);
          break;

        case 'loadChat':
          this.currentChatId = message.chatId;
          const chat = this.chats.get(this.currentChatId);
          webviewView.webview.postMessage({
            command: 'loadChat',
            messages: chat ? chat.messages : [],
            chatId: this.currentChatId
          });
          this.sendChatList(webviewView);
          break;

        case 'newChat':
          this.currentChatId = `chat-${Date.now()}`; // temporary until first message
          webviewView.webview.postMessage({ command: 'newChat', chatId: this.currentChatId });
          break;

        case 'deleteChat':
          console.log('[BACKEND] Received deleteChat request for:', message.chatId);
          if (message.chatId && this.chats.has(message.chatId)) {
            this.chats.delete(message.chatId);
            if (this.currentChatId === message.chatId) this.currentChatId = 'default';
            this.saveChats();
            this.sendChatList(webviewView);
            console.log('[BACKEND] ✅ Chat successfully deleted:', message.chatId);
          } else {
            console.log('[BACKEND] ❌ Delete failed - chat not found');
          }
          break;
      }
    });
  }

  private addMessageToCurrentChat(msg: any) {
    if (!this.chats.has(this.currentChatId)) {
      this.chats.set(this.currentChatId, { title: 'New Chat', messages: [] });
    }
    this.chats.get(this.currentChatId)!.messages.push(msg);
    this.saveChats();
  }

  private async generateBetterTitle(chatId: string, firstPrompt: string, webviewView: vscode.WebviewView) {
    try {
      const summary = await this.callLLM(`Give a short 4-6 word title for this chat: "${firstPrompt}"`);
      if (this.chats.has(chatId)) {
        this.chats.get(chatId)!.title = summary.trim().replace(/^"|"$/g, '').substring(0, 60);
        this.saveChats();
        this.sendChatList(webviewView);
      }
    } catch (e) { }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <style>
    body { margin:0; padding:0; font-family:var(--vscode-font-family); background:var(--vscode-editor-background); color:var(--vscode-editor-foreground); height:100vh; overflow:hidden; }
    #menu, #chat-screen { height:100%; display:flex; flex-direction:column; }
    #chat-screen { display:none; }
    .header { padding:12px; border-bottom:1px solid #444; display:flex; align-items:center; gap:10px; }
    .back-btn { font-size:20px; cursor:pointer; padding:0 8px; }
    #chat-container { flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; gap:12px; }
    .message { max-width:80%; padding:12px 16px; border-radius:18px; line-height:1.5; }
    .user { align-self:flex-end; background:#007acc; color:white; }
    .assistant { align-self:flex-start; background:#2d2d2d; }
    .chat-item { padding:12px; cursor:pointer; border-radius:6px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; }
    .chat-item:hover { background:#2d2d2d; }
    .delete-btn { color:#ff5555; cursor:pointer; font-size:18px; padding:0 8px; }
    #input-area { padding:12px; border-top:1px solid #444; display:flex; gap:8px; }
    #prompt { flex:1; padding:10px 14px; border-radius:20px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:none; }
    button { padding:10px 20px; border-radius:20px; background:#007acc; color:white; border:none; cursor:pointer; }
  </style>
</head>
<body>
  <div id="menu">
    <div class="header"><h3>Chats</h3></div>
    <button onclick="newChat()" style="margin:12px;width:calc(100% - 24px);">+ New Chat</button>
    <div id="chat-list" style="padding:0 12px;"></div>
  </div>

  <div id="chat-screen">
    <div class="header">
      <span class="back-btn" onclick="showMenu()">←</span>
      <h3 id="chat-title">Chat</h3>
      <button onclick="deleteCurrentChat()" style="margin-left:auto; background:#ff5555;">Delete</button>
    </div>
    <div id="chat-container"></div>
    <div id="input-area">
      <textarea id="prompt" rows="1" placeholder="Type a message..."></textarea>
      <button id="send">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    console.log('=== WEBVIEW SCRIPT LOADED ===');
    const vscode = acquireVsCodeApi();
    let currentChatId = 'default';

    function showMenu() {
      document.getElementById('menu').style.display = 'flex';
      document.getElementById('chat-screen').style.display = 'none';
      vscode.postMessage({command: 'refreshMenu'});
    }

    function showChat() {
      document.getElementById('menu').style.display = 'none';
      document.getElementById('chat-screen').style.display = 'flex';
    }

    function renderChatList(chats) {
      const container = document.getElementById('chat-list');
      container.innerHTML = '';
      
      const chatIds = Object.keys(chats);
      chatIds.sort((a, b) => {
        const timeA = parseInt(a.replace('chat-', '')) || 0;
        const timeB = parseInt(b.replace('chat-', '')) || 0;
        return timeB - timeA; // newest first
      });
      
      chatIds.forEach(id => {
        const chat = chats[id];
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.textContent = chat.title || 'Untitled Chat';
        
        item.addEventListener('click', () => {
          currentChatId = id;
          vscode.postMessage({command: 'loadChat', chatId: id});
        });
        
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
      console.log('new chat made');
      vscode.postMessage({command: 'newChat'});
    }

    function deleteCurrentChat() {
      console.log('Delete button clicked for chat:', currentChatId);
      vscode.postMessage({command: 'deleteChat', chatId: currentChatId});
      showMenu(); // Return to chat list
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'response') {
        addMessage('assistant', msg.text);
      } else if (msg.command === 'loadChat') {
        currentChatId = msg.chatId;
        document.getElementById('chat-container').innerHTML = '';
        (msg.messages || []).forEach(m => addMessage(m.role, m.content));
        showChat();
      } else if (msg.command === 'newChat') {
        currentChatId = msg.chatId;
        document.getElementById('chat-container').innerHTML = '';
        showChat();
      } else if (msg.command === 'renderChats') {
        renderChatList(msg.chats);
      }
    });

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

    console.log('=== WEBVIEW SCRIPT FINISHED LOADING ===');
    vscode.postMessage({command: 'refreshMenu'});
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
      const data: any = await response.json();
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