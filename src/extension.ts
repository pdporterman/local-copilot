// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Local LLM Copilot activated!');

	// Register the webview view provider
	const provider = new LocalLLMChatProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('localLLM.chatView', provider)
	);

	// Optional command to focus it
	context.subscriptions.push(
		vscode.commands.registerCommand('local-llm-copilot.startChat', () => {
			vscode.commands.executeCommand('localLLM.chatView.focus');
		})
	);
}

class LocalLLMChatProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) { }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'sendPrompt') {
        const responseText = await this.callLLM(message.prompt);
        webviewView.webview.postMessage({
          command: 'response',
          text: responseText
        });
      }
    });
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --text: var(--vscode-editor-foreground);
      --user-bg: #007acc;
      --assistant-bg: #2d2d2d;
    }
    body {
      margin: 0; padding: 0; font-family: var(--vscode-font-family);
      background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column;
    }
    #chat-container {
      flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;
    }
    .message {
      max-width: 85%; padding: 10px 14px; border-radius: 18px; line-height: 1.4;
    }
    .user {
      align-self: flex-end; background: var(--user-bg); color: white; border-bottom-right-radius: 4px;
    }
    .assistant {
      align-self: flex-start; background: var(--assistant-bg); border-bottom-left-radius: 4px;
    }
    .loading { font-style: italic; color: #888; }
    #input-area {
      padding: 10px; border-top: 1px solid #444; display: flex; gap: 8px;
    }
    #prompt {
      flex: 1; padding: 10px; border-radius: 20px; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: none; resize: none; max-height: 120px;
    }
    button {
      padding: 8px 16px; border-radius: 20px; background: #007acc; color: white; border: none; cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="chat-container"></div>
  
  <div id="input-area">
    <textarea id="prompt" rows="1" placeholder="Type a message..."></textarea>
    <button id="send">Send</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat-container');
    const promptInput = document.getElementById('prompt');
    const sendBtn = document.getElementById('send');

    let isLoading = false;

    function addMessage(role, content, isLoadingMsg = false) {
      const msg = document.createElement('div');
      msg.className = 'message';
      if (role === 'user') msg.classList.add('user');
      if (role === 'assistant') msg.classList.add('assistant');
      if (isLoadingMsg) msg.classList.add('loading');

      if (role === 'assistant' && !isLoadingMsg) {
        msg.innerHTML = content.replace(/\\n/g, '<br>');
      } else {
        msg.textContent = content;
      }

      chat.appendChild(msg);
      chat.scrollTop = chat.scrollHeight;
      return msg;
    }

    function sendMessage() {
      if (isLoading || !promptInput.value.trim()) return;
      
      const text = promptInput.value.trim();
      addMessage('user', text);
      promptInput.value = '';
      
      addMessage('assistant', 'Thinking...', true);
      isLoading = true;

      vscode.postMessage({ command: 'sendPrompt', prompt: text });
    }

    window.addEventListener('message', (event) => {
      try {
        const msg = event.data;
        console.log('[Webview] Received:', msg);

        if (msg.command === 'response') {
          const last = chat.lastElementChild;
          if (last && last.classList.contains('loading')) last.remove();
          
          addMessage('assistant', msg.text || 'No response');
          isLoading = false;
        }
      } catch (e) {
        console.error('[Webview] Error:', e);
      }
    });

    sendBtn.addEventListener('click', sendMessage);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Welcome message
    addMessage('assistant', 'Hello! Ready to help with your projects.');
  </script>
</body>
</html>`;
  }

  private async callLLM(prompt: string): Promise<string> {
    try {
      console.log('Calling Ollama with prompt:', prompt);

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5-coder:7b',
          messages: [{ role: 'user', content: prompt }],
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: any = await response.json();
      console.log('Ollama full response:', data);

      return data.message?.content || data.response || 'No content in response.';
    } catch (err: any) {
      console.error('LLM call failed:', err);
      return `Error: ${err.message || err}. Make sure Ollama is running (ollama serve) and the model is pulled.`;
    }
  }
}

// This method is called when your extension is deactivated
export function deactivate() { }
