export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AgentRequest {
    prompt: string;

    messages?: ChatMessage[];

    activeFile?: {
        fileName: string;
        language: string;
        content: string;
    };
}

export interface AgentResponse {
    success: boolean;
    message: string;
    metadata?: Record<string, unknown>;
}

export enum AgentType {
    CHAT = "chat",
    EDIT = "edit",
    TEST = "test",
    REFACTOR = "refactor"
}