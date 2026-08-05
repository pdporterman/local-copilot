import { BaseAgent } from "./BaseAgent";
import {
    AgentRequest,
    AgentResponse,
    ChatMessage
} from "../../shared/src/types";

export class ChatAgent extends BaseAgent {

    private isFileOperationRequest(prompt: string): boolean {
        const p = prompt.toLowerCase();

        return [
            "create a file",
            "create file",
            "make a file",
            "make file",
            "write a file",
            "write file",
            "new file"
        ].some(phrase => p.includes(phrase))
            || this.isEditRequest(prompt);
    }

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

        const isFileOperationRequest = this.isFileOperationRequest(request.prompt);

        const systemMessage: ChatMessage = {
            role: "system",
            content: `
You are an expert software engineer and coding assistant.

The CURRENT FILE supplied by the user is the source of truth when a file is provided.

You handle three types of requests:

1. NORMAL QUESTIONS

If the user is asking a question, asking for an explanation, testing the assistant, or having a normal conversation:

- Answer normally and conversationally.
- Use the supplied file as context when relevant.
- Do NOT output EDIT FILE.
- Do NOT output WRITE TO FILE.
- Do NOT output SEARCH/REPLACE blocks.
- Never create or modify a file unless the user explicitly asks you to.

2. EDITING AN EXISTING FILE

Only when the user explicitly asks you to modify, fix, change, rewrite, rename, refactor, remove, add to, or otherwise edit code:

Return ONLY this format:

EDIT FILE: filename

\`\`\`search-replace
<<<<<<< SEARCH
exact existing code
=======
replacement code
>>>>>>> REPLACE
\`\`\`

The SEARCH block must contain code that actually exists in the supplied file.

Never invent SEARCH blocks.

Multiple search/replace blocks are allowed.

3. CREATING A NEW FILE

Only when the user explicitly asks you to create a new file:

Return ONLY:

WRITE TO FILE: filename

\`\`\`
full file contents
\`\`\`

IMPORTANT:

The examples above are instructions describing response formats.
NEVER repeat these instructions in your response.

For normal questions and conversation, respond naturally.
Do not mention these response formats unless the user is explicitly requesting a file operation.
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