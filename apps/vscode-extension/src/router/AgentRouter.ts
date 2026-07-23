import { AgentType, AgentRequest, AgentResponse } from "../../../packages/shared/src/types";
import { ChatAgent } from "../../../packages/agents/src/ChatAgent";

export class AgentRouter {

    private readonly chatAgent = new ChatAgent(
        "qwen2.5-coder:7b",
        "http://localhost:11434"
    );

    async route(
        agent: AgentType,
        request: AgentRequest
    ): Promise<AgentResponse> {

        switch (agent) {

            case AgentType.CHAT:
                return this.chatAgent.execute(request);
            default:
                throw new Error(`Unknown agent ${agent}`);

        }
    }

    async generateTitle(firstMessage: string): Promise<string> {

        const response = await this.chatAgent.execute({
            prompt:
                `Create a concise 4-6 word chat title.

Return ONLY the title.

User:
${firstMessage.substring(0, 300)}`
        });

        return response.message;
    }

}