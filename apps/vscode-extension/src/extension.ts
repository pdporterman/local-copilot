import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Local LLM Copilot activated - watch test!');

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

    const sendChats = () => this.sendChatList(webviewView);
    sendChats();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) sendChats();
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'sendPrompt':
          let isNewChat = false;

          if (!this.chats.has(this.currentChatId) || this.chats.get(this.currentChatId)!.messages.length === 0) {
            isNewChat = true;
            this.currentChatId = `chat-${Date.now()}`;
            this.chats.set(this.currentChatId, { title: 'New Chat', messages: [] });
          }

          const userMsg = { role: 'user', content: message.prompt, timestamp: Date.now() };
          this.addMessageToCurrentChat(userMsg);

          const responseText = await this.callLLM(message.prompt);

          // Handle file operations silently
          const fileOperationHandled = await this.handleFileOperation(responseText, webviewView);

          // Only show AI response if no file operation was performed
          if (!fileOperationHandled) {
            const assistantMsg = { role: 'assistant', content: responseText, timestamp: Date.now() };
            this.addMessageToCurrentChat(assistantMsg);
            webviewView.webview.postMessage({ command: 'response', text: responseText });
          }

          if (isNewChat) {
            this.generateBetterTitle(this.currentChatId, webviewView);
          }

          this.sendChatList(webviewView);
          break;

        case 'readActiveFile':
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const doc = editor.document;
            const content = doc.getText();
            const fileName = doc.fileName.split(/[/\\]/).pop() || 'file';

            const fileInfo = `**File:** ${doc.fileName}\n\n\`\`\`\n${content}\n\`\`\``;

            const contextMsg = {
              role: 'user',
              content: `Here is the content of the currently open file "${fileName}":\n\n${fileInfo}\n\nWhat would you like to know or do with it?`
            };

            this.addMessageToCurrentChat(contextMsg);

            webviewView.webview.postMessage({
              command: 'response',
              text: `✅ Loaded ${fileName} into context.`
            });
          } else {
            webviewView.webview.postMessage({
              command: 'response',
              text: 'No active editor found. Open a file first.'
            });
          }
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
          this.currentChatId = `chat-${Date.now()}`;
          webviewView.webview.postMessage({ command: 'newChat', chatId: this.currentChatId });
          break;

        case 'deleteChat':
          if (message.chatId && this.chats.has(message.chatId)) {
            this.chats.delete(message.chatId);
            if (this.currentChatId === message.chatId) this.currentChatId = 'default';
            this.saveChats();
            this.sendChatList(webviewView);
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

  private async generateBetterTitle(chatId: string, webviewView?: vscode.WebviewView) {
    try {
      const chat = this.chats.get(chatId);
      if (!chat || chat.messages.length < 2) return;

      const firstUserMsg = chat.messages.find(m => m.role === 'user');
      if (!firstUserMsg) return;

      const summaryPrompt = `Create a short 4-6 word title for this chat. Be specific. No quotes.

User: ${firstUserMsg.content.substring(0, 300)}`;

      const summary = await this.callLLM(summaryPrompt);

      if (this.chats.has(chatId)) {
        let cleanTitle = summary.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^Title:?\s*/i, '')
          .substring(0, 60);

        this.chats.get(chatId)!.title = cleanTitle || 'New Chat';
        this.saveChats();

        if (webviewView) {
          this.sendChatList(webviewView);
        }
      }
    } catch (e) {
      console.error('Title generation failed:', e);
    }
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
    .chat-item { padding:12px; cursor:pointer; border-radius:6px; margin-bottom:6px; }
    .chat-item:hover { background:#2d2d2d; }
    #input-area { padding:12px; border-top:1px solid #444; display:flex; gap:8px; }
    #prompt { flex:1; padding:10px 14px; border-radius:20px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:none; }
    button { padding:10px 20px; border-radius:20px; background:#007acc; color:white; border:none; cursor:pointer; }
    #read-file { padding:8px 12px; background:#2d2d2d; border:none; border-radius:20px; cursor:pointer; font-size:16px; }
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
      <button onclick="deleteCurrentChat()" style="margin-left:auto; background:#ff5555; padding:5px 10px; font-size:12px;">🗑️ Delete</button>
    </div>
    <div id="chat-container"></div>
    <div id="input-area">
      <textarea id="prompt" rows="1" placeholder="Type a message..."></textarea>
      <button id="send">Send</button>
      <button id="read-file" title="Read active file">📄</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentChatId = 'default';

    function showMenu() {
      document.getElementById('menu').style.display = 'flex';
      document.getElementById('chat-screen').style.display = 'none';
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
        return timeB - timeA;
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
      vscode.postMessage({command: 'newChat'});
    }

    function deleteCurrentChat() {
      vscode.postMessage({command: 'deleteChat', chatId: currentChatId});
      showMenu();
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

    const readFileBtn = document.getElementById('read-file');
    if (readFileBtn) {
      readFileBtn.addEventListener('click', () => {
        vscode.postMessage({command: 'readActiveFile'});
      });
    }

    vscode.postMessage({command: 'refreshMenu'});
  </script>
</body>
</html>`;
  }

  private async callLLM(userPrompt: string): Promise<string> {
    try {
      const currentChat = this.chats.get(this.currentChatId);
      const messages = currentChat ? [...currentChat.messages] : [];

      const editor = vscode.window.activeTextEditor;

      let activeFileContext = "";

      if (this.isEditRequest(userPrompt) && editor) {
        const doc = editor.document;

        activeFileContext =
          `CURRENT FILE

Filename: ${doc.fileName}

Language: ${doc.languageId}

\`\`\`${doc.languageId}
${doc.getText()}
\`\`\`
`;
      }

      const systemMessage = {
        role: "system",
        content: `
You are an expert software engineer.

The CURRENT FILE supplied by the user is the source of truth.

Rules:

• NEVER invent code.
• NEVER recreate the file from memory.
• SEARCH blocks MUST exist exactly inside the supplied file.
• If they do not, return

CANNOT_EDIT

and explain why.

When editing return ONLY

EDIT FILE: filename

\`\`\`search-replace
<<<<<<< SEARCH
...
=======
...
>>>>>>> REPLACE
\`\`\`

Multiple search replace blocks are allowed.

For creating a new file return

WRITE TO FILE: filename

\`\`\`
full file
\`\`\`

Do not explain edits unless asked.
`
      };

      const ollamaMessages = [
        systemMessage,
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        {
          role: "user",
          content: activeFileContext + "\n\nUSER REQUEST:\n" + userPrompt
        }
      ];

      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen2.5-coder:7b",
          stream: false,
          temperature: 0.0,
          messages: ollamaMessages
        })
      });

      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);

      const data: any = await response.json();

      return data.message?.content ?? "No response";
    }
    catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  private async handleFileOperation(responseText: string, webviewView: vscode.WebviewView): Promise<boolean> {
    // === FULL WRITE ===
    const writeMatch = responseText.match(/WRITE TO FILE:\s*([^\r\n]+)/i);
    if (writeMatch) {
      const rawPath = writeMatch[1].trim();
      const codeBlockMatch = responseText.match(/```[\w]*\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        return this.writeFullFile(rawPath, codeBlockMatch[1], webviewView);
      }
    }

    // === EDIT FILE ===
    const editMatch = responseText.match(/EDIT FILE:\s*([^\r\n]+)/i);
    if (editMatch) {
      const rawPath = editMatch[1].trim();
      const edits = this.extractSearchReplaceBlocks(responseText);
      if (edits.length > 0) {
        return this.applyEdits(rawPath, edits, webviewView);
      }
    }

    return false;
  }

  private async writeFullFile(rawPath: string, content: string, webviewView: vscode.WebviewView): Promise<boolean> {
    try {
      let targetPath = this.resolvePath(rawPath);
      const uri = vscode.Uri.file(targetPath);
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));

      webviewView.webview.postMessage({
        command: 'response',
        text: `✅ Wrote full file: ${targetPath}`
      });
      return true;
    } catch (err: any) {
      webviewView.webview.postMessage({ command: 'response', text: `❌ Write failed: ${err.message}` });
      return true;
    }
  }

  private extractSearchReplaceBlocks(text: string): Array<{ search: string, replace: string }> {
    const blocks: Array<{ search: string, replace: string }> = [];
    const regex = /<<<<<<<\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> *REPLACE/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        search: match[1],
        replace: match[2]
      });
    }
    return blocks;
  }

  private normalize(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trim();
  }

  private isEditRequest(prompt: string): boolean {

    const p = prompt.toLowerCase();

    return [
      "fix",
      "change",
      "edit",
      "rewrite",
      "rename",
      "refactor",
      "modify",
      "replace",
      "remove",
      "add",
      "make",
      "update"
    ].some(k => p.includes(k));

  }

  private async applyEdits(rawPath: string, edits: Array<{ search: string, replace: string }>, webviewView: vscode.WebviewView): Promise<boolean> {
    try {
      const targetPath = this.resolvePath(rawPath);
      const uri = vscode.Uri.file(targetPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      let success = true;
      await editor.edit(editBuilder => {
        for (const { search, replace } of edits) {
          const text = document.getText();

          let startIdx = text.indexOf(search);

          if (startIdx === -1) {

            const normalizedDoc = this.normalize(text);
            const normalizedSearch = this.normalize(search);

            const normalizedIndex = normalizedDoc.indexOf(normalizedSearch);

            if (normalizedIndex !== -1) {

              // Try again after normalizing whitespace
              startIdx = text.replace(/\r\n/g, "\n").indexOf(search.replace(/\r\n/g, "\n"));

            }

          }
          if (startIdx !== -1) {
            const startPos = document.positionAt(startIdx);
            const endPos = document.positionAt(startIdx + search.length);
            editBuilder.replace(new vscode.Range(startPos, endPos), replace);
          } else {
            success = false;
            console.warn(`Search block not found: ${search.substring(0, 100)}...`);
          }
        }
      });

      const msg = success
        ? `✅ Applied edits to ${targetPath}`
        : `⚠️ Partially applied edits to ${targetPath} (some blocks not found)`;

      webviewView.webview.postMessage({ command: 'response', text: msg });
      await document.save();
      return true;
    } catch (err: any) {
      webviewView.webview.postMessage({ command: 'response', text: `❌ Edit failed: ${err.message}` });
      return true;
    }
  }

  private resolvePath(rawPath: string): string {
    if (rawPath.includes(':') || rawPath.startsWith('/')) return rawPath;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      return vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), rawPath).fsPath;
    }
    return rawPath;
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