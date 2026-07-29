import { EditorContext } from "./ContextService";
import { ChatMessage } from "../models/ChatMessage";

export class ContextMessageBuilder {

    public static fromEditorContext(context: EditorContext): ChatMessage {

        const fileName =
            context.fileName.split(/[/\\]/).pop() ?? "file";

        return {
            role: "user",
            content:
                `Here is the content of the currently open file "${fileName}":

**File:** ${context.fileName}

\`\`\`${context.language}
${context.content}
\`\`\`

What would you like to know or do with it?`,
            timestamp: Date.now()
        };
    }
}