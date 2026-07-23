import { AgentRequest, AgentResponse, ChatMessage } from "../../shared/src/types";

export abstract class BaseAgent {

    constructor(
        protected readonly model: string,
        protected readonly endpoint: string
    ) {}

    abstract execute(request: AgentRequest): Promise<AgentResponse>;

    protected async generate(prompt: string): Promise<string> {

        const response = await fetch(`${this.endpoint}/api/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: this.model,
                prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}`);
        }

        const json = await response.json();

        return json.response ?? "";
    }

    protected async chat(messages: ChatMessage[]): Promise<string> {

        const response = await fetch(`${this.endpoint}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: this.model,
                stream: false,
                temperature: 0,
                messages
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}`);
        }

        const json = await response.json();

        return json.message?.content ?? "";
    }

}