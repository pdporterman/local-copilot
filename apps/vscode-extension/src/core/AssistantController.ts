import { AgentRouter } from "../router/AgentRouter";
import { AgentRequest, AgentResponse } from "../agents/Agent";
import { AgentType } from "../agents/AgentType";

export class AssistantController {
    constructor(
        private readonly router: AgentRouter
    ) {}

    async sendMessage(
        agent: AgentType,
        request: AgentRequest
    ): Promise<AgentResponse> {
        return this.router.route(agent, request);
    }

    async generateTitle(firstMessage: string): Promise<string> {
        return this.router.generateTitle(firstMessage);
    }
}