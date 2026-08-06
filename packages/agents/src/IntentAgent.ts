import { BaseAgent } from "./BaseAgent";
import {
    AgentRequest,
    AgentResponse,
    AgentType,
    ChatMessage
} from "../../../packages/shared/src/types";

export class IntentAgent extends BaseAgent {

    async execute(request: AgentRequest): Promise<AgentResponse> {

        const systemMessage: ChatMessage = {
            role: "system",
            content: `
You are an intent classification agent for a software development assistant.

Determine what the user wants from their request.

Return ONLY one of these values:

CHAT
EDIT
CREATE
TEST
REFACTOR

Definitions:

CHAT
The user wants an explanation, answer, conversation, code review, debugging advice, information, or general assistance without asking the assistant to directly modify a file.

EDIT
The user explicitly wants existing code modified, fixed, changed, rewritten, renamed, updated, or otherwise altered.

CREATE
The user explicitly wants a new file or new code file created.

TEST
The user explicitly wants tests created, modified, or run.

REFACTOR
The user explicitly wants existing code refactored or reorganized.

When uncertain, choose CHAT.

Return ONLY the classification.
`
        };

        const messages: ChatMessage[] = [
            systemMessage,
            {
                role: "user",
                content: request.prompt
            }
        ];

        const reply = await this.chat(messages);

        const intent = reply
            .trim()
            .toUpperCase();

        const validIntents = [
            "CHAT",
            "EDIT",
            "CREATE",
            "TEST",
            "REFACTOR"
        ];

        if (!validIntents.includes(intent)) {
            return {
                success: true,
                message: AgentType.CHAT
            };
        }

        return {
            success: true,
            message: intent
        };
    }
}