const vscode = acquireVsCodeApi();

        let currentChatId = 'default';

        function showMenu() {
            document.getElementById('menu').style.display = 'flex';
            document.getElementById('chat-screen').style.display = 'none';
        }

        function showChat() {
            document.getElementById('menu').style.display = 'none';
            document.getElementById('chat-screen').style.display = 'flex';
        }

        function renderChatList(chats) {
            const container = document.getElementById('chat-list');

            container.innerHTML = '';

            const chatIds = Object.keys(chats);

            chatIds.sort((a, b) => {
                const timeA = parseInt(a.replace('chat-', '')) || 0;
                const timeB = parseInt(b.replace('chat-', '')) || 0;

                return timeB - timeA;
            });

            chatIds.forEach(id => {
                const chat = chats[id];

                const item = document.createElement('div');

                item.className = 'chat-item';

                item.textContent = chat.title || 'Untitled Chat';

                item.addEventListener('click', () => {
                    currentChatId = id;

                    vscode.postMessage({
                        command: 'loadChat',
                        chatId: id
                    });
                });

                container.appendChild(item);
            });
        }

        function addMessage(role, content) {
            const container = document.getElementById('chat-container');

            const div = document.createElement('div');

            div.className = `message ${role}`;

            div.textContent = content;

            container.appendChild(div);

            container.scrollTop = container.scrollHeight;
        }

        function newChat() {
            vscode.postMessage({
                command: 'newChat'
            });
        }

        function deleteCurrentChat() {
            vscode.postMessage({
                command: 'deleteChat',
                chatId: currentChatId
            });

            showMenu();
        }

        window.addEventListener('message', (event) => {
            const msg = event.data;

            if (msg.command === 'response') {

                addMessage(
                    'assistant',
                    msg.text
                );

            } else if (msg.command === 'loadChat') {

                currentChatId = msg.chatId;

                document.getElementById(
                    'chat-container'
                ).innerHTML = '';

                (msg.messages || []).forEach(m => {
                    addMessage(
                        m.role,
                        m.content
                    );
                });

                showChat();

            } else if (msg.command === 'newChat') {

                currentChatId = msg.chatId;

                document.getElementById(
                    'chat-container'
                ).innerHTML = '';

                showChat();

            } else if (msg.command === 'renderChats') {

                renderChatList(msg.chats);
            }
        });

        function sendPrompt() {
            const input = document.getElementById('prompt');

            if (input.value.trim()) {

                addMessage(
                    'user',
                    input.value
                );

                vscode.postMessage({
                    command: 'sendPrompt',
                    prompt: input.value
                });

                input.value = '';
            }
        }

        document
            .getElementById('send')
            .addEventListener('click', sendPrompt);

        document
            .getElementById('prompt')
            .addEventListener('keydown', e => {

                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendPrompt();
                }

            });

        const readFileBtn =
            document.getElementById('read-file');

        if (readFileBtn) {

            readFileBtn.addEventListener('click', () => {

                vscode.postMessage({
                    command: 'readActiveFile'
                });

            });
        }

        vscode.postMessage({
            command: 'refreshMenu'
        });