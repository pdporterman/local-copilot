import * as vscode from "vscode";

export class FileOperationService {

    async handle(
        responseText: string,
        webviewView: vscode.WebviewView
    ): Promise<boolean> {

        const writeMatch = responseText.match(
            /WRITE TO FILE:\s*([^\r\n]+)/i
        );

        if (writeMatch) {
            return this.handleWrite(
                writeMatch[1].trim(),
                responseText,
                webviewView
            );
        }

        const editMatch = responseText.match(
            /EDIT FILE:\s*([^\r\n]+)/i
        );

        if (editMatch) {
            return this.handleEdit(
                editMatch[1].trim(),
                responseText,
                webviewView
            );
        }

        return false;
    }

    private async handleWrite(
        rawPath: string,
        responseText: string,
        webviewView: vscode.WebviewView
    ): Promise<boolean> {

        const codeBlockMatch = responseText.match(
            /```[\w]*\s*\n([\s\S]*?)\n```/
        );

        if (!codeBlockMatch) {
            this.sendResponse(
                webviewView,
                "❌ File creation response was missing a code block."
            );

            return true;
        }

        return this.writeFullFile(
            rawPath,
            codeBlockMatch[1],
            webviewView
        );
    }

    private async handleEdit(
        rawPath: string,
        responseText: string,
        webviewView: vscode.WebviewView
    ): Promise<boolean> {

        const edits = this.extractSearchReplaceBlocks(responseText);

        if (edits.length === 0) {
            this.sendResponse(
                webviewView,
                "❌ Edit response did not contain any search/replace blocks."
            );

            return true;
        }

        return this.applyEdits(
            rawPath,
            edits,
            webviewView
        );
    }

    private async writeFullFile(
        rawPath: string,
        content: string,
        webviewView: vscode.WebviewView
    ): Promise<boolean> {

        try {
            const targetPath = this.resolvePath(rawPath);
            const uri = vscode.Uri.file(targetPath);

            await vscode.workspace.fs.writeFile(
                uri,
                new TextEncoder().encode(content)
            );

            this.sendResponse(
                webviewView,
                `✅ Wrote full file: ${targetPath}`
            );

            return true;

        } catch (error: any) {

            this.sendResponse(
                webviewView,
                `❌ Write failed: ${error.message}`
            );

            return true;
        }
    }

    private extractSearchReplaceBlocks(
        text: string
    ): Array<{ search: string; replace: string }> {

        const blocks: Array<{ search: string; replace: string }> = [];

        const regex =
            /<<<<<<<\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> *REPLACE/g;

        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            blocks.push({
                search: match[1],
                replace: match[2]
            });
        }

        return blocks;
    }

    private async applyEdits(
        rawPath: string,
        edits: Array<{ search: string; replace: string }>,
        webviewView: vscode.WebviewView
    ): Promise<boolean> {

        try {
            const targetPath = this.resolvePath(rawPath);
            const uri = vscode.Uri.file(targetPath);

            const document =
                await vscode.workspace.openTextDocument(uri);

            const editor =
                await vscode.window.showTextDocument(document);

            let success = true;

            await editor.edit(editBuilder => {

                for (const { search, replace } of edits) {

                    const text = document.getText();

                    let startIdx = text.indexOf(search);

                    if (startIdx === -1) {
                        const normalizedDoc =
                            text.replace(/\r\n/g, "\n");

                        const normalizedSearch =
                            search.replace(/\r\n/g, "\n");

                        startIdx =
                            normalizedDoc.indexOf(normalizedSearch);
                    }

                    if (startIdx !== -1) {

                        const startPos =
                            document.positionAt(startIdx);

                        const endPos =
                            document.positionAt(
                                startIdx + search.length
                            );

                        editBuilder.replace(
                            new vscode.Range(startPos, endPos),
                            replace
                        );

                    } else {

                        success = false;

                        console.warn(
                            `Search block not found: ${search.substring(0, 100)}...`
                        );
                    }
                }
            });

            const message = success
                ? `✅ Applied edits to ${targetPath}`
                : `⚠️ Partially applied edits to ${targetPath} (some blocks not found)`;

            this.sendResponse(webviewView, message);

            await document.save();

            return true;

        } catch (error: any) {

            this.sendResponse(
                webviewView,
                `❌ Edit failed: ${error.message}`
            );

            return true;
        }
    }

    private resolvePath(rawPath: string): string {

        if (
            rawPath.includes(":") ||
            rawPath.startsWith("/")
        ) {
            return rawPath;
        }

        const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (workspaceRoot) {
            return vscode.Uri.joinPath(
                vscode.Uri.file(workspaceRoot),
                rawPath
            ).fsPath;
        }

        return rawPath;
    }

    private sendResponse(
        webviewView: vscode.WebviewView,
        text: string
    ): void {

        webviewView.webview.postMessage({
            command: "response",
            text
        });
    }
}