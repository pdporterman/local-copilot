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

The CURRENT FILE supplied by the user is the source of truth.

Rules:

• NEVER invent code.
• NEVER recreate the file from memory.
• SEARCH blocks MUST exist exactly inside the supplied file.
• If they do not, return CANNOT_EDIT.

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

        if (request.activeFile && this.isEditRequest(request.prompt)) {

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