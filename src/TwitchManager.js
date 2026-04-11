export class TwitchManager {
    constructor(onCommandCallback) {
        this.onCommand = onCommandCallback;
        this.ws = null;
        this.connectedChannel = null;
        this.botUsername = null;
    }

    connect(channelName) {
        if (!channelName) {
            console.error("No Twitch Channel provided.");
            return;
        }

        const safeChannel = channelName.trim().toLowerCase();
        this.connectedChannel = safeChannel;
        this.botUsername = safeChannel; 

        console.log(`Connecting seamlessly to Twitch Read-Only API: ${safeChannel}`);
        
        this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.ws.onopen = () => {
             // Request Twitch capabilities (tags) to get colors and user info
             this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');

             // Anonymous login for perfectly safe read-only parsing 
             this.ws.send(`PASS SCHMOOPIIE`);
             this.ws.send(`NICK justinfan` + Math.floor(Math.random() * 80000 + 1000));

             this.ws.send(`JOIN #${safeChannel}`);
        };

        this.ws.onmessage = (event) => {
            const rawMessage = event.data;
            
            // Twitch requires a PONG for every PING to keep the connection alive
            if (rawMessage.startsWith('PING')) {
                this.ws.send('PONG :tmi.twitch.tv');
                return;
            }

            // Standardize parser to handle messages with or without Twitch tags
            let tagsStr = '';
            let parseStr = rawMessage;
            
            if (parseStr.startsWith('@')) {
                const firstSpace = parseStr.indexOf(' ');
                tagsStr = parseStr.substring(1, firstSpace);
                parseStr = parseStr.substring(firstSpace + 1);
            }

            const privmsgRegex = /:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.+)/;
            const match = parseStr.match(privmsgRegex);

            if (match) {
                const username = match[1];
                const message = match[2].trim();

                // Extract color from tags if they exist
                let hexColor = '#fbbf24';
                if (tagsStr) {
                    const colorMatch = tagsStr.match(/color=([^; ]+)/);
                    if (colorMatch && colorMatch[1]) {
                        hexColor = colorMatch[1];
                    }
                }

                // We don't want the bot triggering its own commands
                if (username === this.botUsername && message.startsWith('⛳')) {
                    return; 
                }

                console.log(`[CHAT] ${username}: ${message}`);
                this.parseMessage(username, message, hexColor);
            } else if (rawMessage.includes(`JOIN #${safeChannel}`)) {
                console.log(`Successfully joined #${safeChannel}!`);
            }
        };

        this.ws.onerror = (error) => {
            console.error("Native WebSocket Error:", error);
        };
        
        this.ws.onclose = () => {
            console.warn("Twitch WebSocket disconnected.");
        };
    }

    say(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.connectedChannel) {
            this.ws.send(`PRIVMSG #${this.connectedChannel} :${message}`);
        }
    }

    parseMessage(username, message, hexColor) {
        const parts = message.split(' ');
        let commandStr = parts[0].toLowerCase();
        
        let isCommand = false;
        let command = '';
        let args = [];
        
        const compassMap = { 'n': 0, 'ne': 45, 'e': 90, 'se': 135, 's': 180, 'sw': 225, 'w': 270, 'nw': 315 };
        
        if (commandStr.startsWith('!')) {
            command = commandStr.substring(1);
            isCommand = true;
            args = parts.slice(1);
        } else if (['play', 'join', 'shoot', 'shot', 'repeat'].includes(commandStr)) {
            command = commandStr;
            isCommand = true;
            args = parts.slice(1);
        } else if (parts.length >= 2 && (compassMap.hasOwnProperty(commandStr) || !isNaN(parseFloat(commandStr))) && !isNaN(parseFloat(parts[1]))) {
            command = 'shoot';
            isCommand = true;
            args = parts;
        }

        if (isCommand) {
            this.onCommand(username, command, args, hexColor);
        }
    }
}
