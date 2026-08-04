import { BaseAgent } from "./BaseAgent";
import {
    AgentRequest,
    AgentResponse,
    ChatMessage
} from "../../shared/src/types";

export class ChatAgent extends BaseAgent {

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

    async execute(request: AgentRequest): Promise<AgentResponse> {

        const systemMessage: ChatMessage = {
            role: "system",
            content: `
You are an expert software engineer.

The CURRENT FILE is the source of truth.

There are TWO kinds of requests.

1. Questions
If the user is asking a question, explain the code normally.
DO NOT output EDIT FILE or WRITE TO FILE.

2. Editing requests
If the user explicitly asks you to modify code, return ONLY:


When editing return ONLY

EDIT FILE: filename

\`\`\`search-replace
<<<<<<< SEARCH
...
=======
...
>>>>>>> REPLACE
\`\`\`

For creating a new file return

WRITE TO FILE: filename

\`\`\`
full file
\`\`\`
`
        };

        const messages: ChatMessage[] = [
            systemMessage
        ];

        if (request.messages) {
            messages.push(...request.messages);
        }

        if (request.activeFile) {

            messages.push({
                role: "user",
                content:
                    `CURRENT FILE

Filename: ${request.activeFile.fileName}

Language: ${request.activeFile.language}

\`\`\`${request.activeFile.language}
${request.activeFile.content}
\`\`\`
`
            });

        }

        messages.push({
            role: "user",
            content: request.prompt
        });

        const reply = await this.chat(messages);

        return {
            success: true,
            message: reply
        };

    }

}