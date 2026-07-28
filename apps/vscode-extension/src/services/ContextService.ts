import * as vscode from "vscode";

export interface CursorPosition {
    line: number;
    character: number;
    offset: number;
}

export interface SelectionContext {
    text: string;
    start: number;
    end: number;
    isEmpty: boolean;
}

export interface EditorContext {
    fileName: string;
    language: string;
    content: string;

    cursor: CursorPosition;

    selection: SelectionContext;
}

export class ContextService {

    public getCurrentContext(): EditorContext | undefined {

        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return undefined;
        }

        const document = editor.document;
        const selection = editor.selection;

        return {
            fileName: document.fileName,
            language: document.languageId,
            content: document.getText(),

            cursor: {
                line: selection.active.line,
                character: selection.active.character,
                offset: document.offsetAt(selection.active)
            },

            selection: {
                text: document.getText(selection),
                start: document.offsetAt(selection.start),
                end: document.offsetAt(selection.end),
                isEmpty: selection.isEmpty
            }
        };
    }
}