import * as vscode from "vscode";
import { Chat } from "../models/Chat";
import { ChatMessage } from "../models/ChatMessage";

export class ChatService {

    private currentChatId = "default";
    private readonly chats = new Map<string, Chat>();

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.loadChats();
    }

    public getCurrentChatId(): string {
        return this.currentChatId;
    }

    public setCurrentChatId(chatId: string): void {
        this.currentChatId = chatId;
    }

    public getCurrentChat(): Chat | undefined {
        return this.chats.get(this.currentChatId);
    }

    public getChat(chatId: string): Chat | undefined {
        return this.chats.get(chatId);
    }

    public getChats(): Map<string, Chat> {
        return this.chats;
    }

    public setChat(chatId: string, chat: Chat): void {
        this.chats.set(chatId, chat);
        this.saveChats();
    }

    public deleteChat(chatId: string): void {
        this.chats.delete(chatId);
        if (chatId === this.currentChatId) {
            this.currentChatId = "default";
        }
        this.saveChats();
    }

    private loadChats(): void {

        const saved = this.context.globalState.get<Record<string, Chat>>("localLLM.chats");

        if (!saved) {
            return;
        }

        this.chats.clear();

        for (const [id, chat] of Object.entries(saved)) {
            this.chats.set(id, chat);
        }
    }

    private async saveChats(): Promise<void> {

        const serialized = Object.fromEntries(this.chats);

        await this.context.globalState.update("localLLM.chats", serialized);
    }

    public hasChat(chatId: string): boolean {
        return this.chats.has(chatId);
    }

    public createChat(chatId: string): Chat {

        const chat: Chat = {
            id: chatId,
            title: "New Chat",
            messages: []
        };

        this.chats.set(chatId, chat);
        this.saveChats();

        return chat;
    }

    public addMessage(chatId: string, message: ChatMessage): void {

        let chat = this.chats.get(chatId);

        if (!chat) {
            chat = this.createChat(chatId);
        }

        chat.messages.push(message);

        this.saveChats();
    }

    public getAllChats(): Record<string, Chat> {
        return Object.fromEntries(this.chats);
    }

    public currentChatExists(): boolean {
        return this.chats.has(this.currentChatId);
    }

    public setTitle(chatId: string, title: string): void {

        const chat = this.chats.get(chatId);

        if (!chat) {
            return;
        }

        chat.title = title;

        this.saveChats();
    }
}