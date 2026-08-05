import * as vscode from 'vscode';
import { AgentRouter } from "./router/AgentRouter";
import { AgentType } from "../../../packages/shared/src/types";
import { AssistantController } from "./core/AssistantController";
import { ContextService } from "./services/ContextService";
import { ContextMessageBuilder } from "./services/ContextMessageBuilder";
import { ChatService } from "./services/ChatService"
import { ChatMessage } from "./models/ChatMessage";
import { FileOperationService } from "./services/FileOperationService";
import * as fs from "fs";
import * as path from "path";

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
  private readonly router = new AgentRouter();
  private readonly assistant = new AssistantController(this.router);

  private readonly contextService = new ContextService();
  private readonly fileOperationService = new FileOperationService();

  private readonly chatService: ChatService;


  constructor(private readonly _extensionUri: vscode.Uri, private context: vscode.ExtensionContext) {
    this.chatService = new ChatService(context);
  }

  private sendChatList(webviewView: vscode.WebviewView) {
    webviewView.webview.postMessage({
      command: "renderChats",
      chats: Object.fromEntries(this.chatService.getChats())
    });
  }

  private async handleSendPrompt(message: any, webviewView: vscode.WebviewView): Promise<void> {

    let isNewChat = false;

    let currentChat = this.chatService.getCurrentChat();

    // Create a chat if one does not exist yet
    if (!currentChat || currentChat.messages.length === 0) {
      isNewChat = true;

      const chatId = `chat-${Date.now()}`;

      this.chatService.setCurrentChatId(chatId);

      currentChat = this.chatService.createChat(chatId);
    }

    // Add the user's message to chat history
    const userMsg: ChatMessage = {
      role: "user",
      content: message.prompt,
      timestamp: Date.now()
    };

    this.addMessageToCurrentChat(userMsg);

    // Refresh chat after modifying storage
    currentChat = this.chatService.getCurrentChat();

    // Capture current editor context
    const editorContext = this.contextService.getCurrentContext();

    try {
      const response = await this.assistant.sendMessage(
        AgentType.CHAT,
        {
          prompt: message.prompt,
          messages: currentChat?.messages,
          activeFile: editorContext
        }
      );

      // Check whether the response contains a file operation
      const handled = await this.fileOperationService.handle(response.message, webviewView);
      // Normal chat response
      if (!handled) {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: response.message,
          timestamp: Date.now()
        };

        this.addMessageToCurrentChat(assistantMsg);

        webviewView.webview.postMessage({
          command: "response",
          text: response.message
        });
      }

      // Generate a title for a newly-created chat
      if (isNewChat) {
        await this.generateBetterTitle(
          this.chatService.getCurrentChatId(),
          webviewView
        );
      }

      this.sendChatList(webviewView);

    } catch (error: any) {

      console.error("Failed to process prompt:", error);

      webviewView.webview.postMessage({
        command: "response",
        text: `❌ Error: ${error.message ?? "Failed to process request."}`
      });
    }
  }

  private async handleReadActiveFile(webviewView: vscode.WebviewView): Promise<void> {

    const context = this.contextService.getCurrentContext();

    if (!context) {
      webviewView.webview.postMessage({
        command: "response",
        text: "No active editor found. Open a file first."
      });

      return;
    }

    const fileName =
      context.fileName.split(/[/\\]/).pop() || "file";

    const contextMsg =
      ContextMessageBuilder.fromEditorContext(context);

    this.addMessageToCurrentChat(contextMsg);

    webviewView.webview.postMessage({
      command: "response",
      text: `✅ Loaded ${fileName} into context.`
    });

    this.sendChatList(webviewView);
  }

  private handleLoadChat(message: any, webviewView: vscode.WebviewView): void {

    this.chatService.setCurrentChatId(message.chatId);

    const chat = this.chatService.getCurrentChat();

    webviewView.webview.postMessage({
      command: "loadChat",
      messages: chat?.messages ?? [],
      chatId: this.chatService.getCurrentChatId()
    });

    this.sendChatList(webviewView);
  }

  private handleNewChat(webviewView: vscode.WebviewView): void {

    const chatId = `chat-${Date.now()}`;

    this.chatService.setCurrentChatId(chatId);

    webviewView.webview.postMessage({
      command: "newChat",
      chatId
    });
  }

  private handleDeleteChat(message: any, webviewView: vscode.WebviewView): void {

    if (!message.chatId) {
      return;
    }

    this.chatService.deleteChat(message.chatId);

    this.sendChatList(webviewView);
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
        case "sendPrompt": {
          await this.handleSendPrompt(message, webviewView);
          break;
        }

        case 'readActiveFile': {
          await this.handleReadActiveFile(webviewView);
          break;
        }

        case "loadChat": {
          this.handleLoadChat(message, webviewView);
          break;
        }

        case "newChat": {
          this.handleNewChat(webviewView);
          break;
        }

        case "deleteChat": {
          this.handleDeleteChat(message, webviewView);
          break;
        }
      }
    });
  }

  private addMessageToCurrentChat(msg: ChatMessage): void {

    let chat = this.chatService.getCurrentChat();

    if (!chat) {
      chat = this.chatService.createChat(
        this.chatService.getCurrentChatId()
      );
    }

    this.chatService.addMessage(chat.id, msg);
  }

  private async generateBetterTitle(
    chatId: string,
    webviewView?: vscode.WebviewView
  ): Promise<void> {

    const chat = this.chatService.getChat(chatId);

    if (!chat) {
      return;
    }

    const firstUserMessage = chat.messages.find(
      (message: ChatMessage) => message.role === "user"
    );

    if (!firstUserMessage) {
      return;
    }

    try {

      const generatedTitle =
        await this.assistant.generateTitle(firstUserMessage.content);

      const title =
        generatedTitle
          .trim()
          .replace(/^["']|["']$/g, "")
          .replace(/^title:\s*/i, "")
          .substring(0, 60) || "New Chat";


      this.chatService.setTitle(chatId, title);


      if (webviewView) {
        this.sendChatList(webviewView);
      }

    } catch (error) {
      console.error("Failed to generate chat title:", error);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "src",
      "webview",
      "chat.html"
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    html = html
      .replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource)
      .replace(/\{\{NONCE\}\}/g, nonce);

    return html;
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