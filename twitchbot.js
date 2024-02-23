const tmi = require('tmi.js');
const express = require('express');
const axios = require('axios');
let lastGiftTime = Date.now();
let lastGiftUser = '';
const {spawn} = require('child_process');
const natural = require('natural');
const fs = require('fs');
const {reconnect} = require("tmi.js/lib/client");
const app = express();
let userPoints = {};
// Twitch-Konfiguration
const clientID = 'clientid';
const clientSecret = 'clientsecret';
const redirectURI = 'redirect';
const scopes = ['chat:read', 'chat:edit'];
let lastGiftedUser = '';
let giftCount = 0;
const channel = 'channel';
const giftedUsers = new Set();
let quizStarted = false;
const wordsToGuess = [
    "1",
    "2",
    "3",
];
let twitchClient; // Twitch-Client-Instanz
let currentWordIndex = 0; // Index des aktuellen zu erratenden Wortes

// Routen für den oauth
app.get('/', (req, res) => {
    const authorizeURL = `https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectURI)}&response_type=code&scope=${scopes.join(' ')}`;

    if (/^win/.test(process.platform)) {
        spawn('explorer', [authorizeURL]);
    } else {
        spawn('xdg-open', [authorizeURL]);
    }

    res.send('Öffne deinen Browser und melde dich bei Twitch an.');
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const tokenURL = 'https://id.twitch.tv/oauth2/token';
    const params = new URLSearchParams({
        client_id: clientID,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectURI
    });

    try {
        const response = await axios.post(tokenURL, params);
        const accessToken = response.data.access_token;
        console.log('OAuth-Token:', accessToken);
        res.send('OAuth-Token erhalten! Du kannst das Fenster jetzt schließen.');

        // Twitch-Client konfigurieren
        twitchClient = new tmi.Client({
            connection: {
                secure: true,
                reconnect: true
            },
            identity: {
                username: 'TzybernautBot',
                password: `oauth:${accessToken}`
            },
            channels: [channel]
        });


        // Funktion zum Schreiben der Chatnachrichten in die Datei "chatlog.txt"
        // function writeChatMessageToFile(tags, message) {
        //     const username = tags.username;
        //     const timestamp = new Date().toLocaleString();
        //     const logEntry = `[${timestamp}] ${username}: ${message}\n`;
        //     const currentDate = new Date().toISOString().slice(0, 10); // Aktuelles Datum als YYYY-MM-DD
        //
        //     // Das Verzeichnis erstellen, wenn es nicht existiert
        //     if (!fs.existsSync(currentDate)) {
        //         fs.mkdirSync(currentDate);
        //     }
        //
        //     const filePath = `${currentDate}/Chaatlog.txt`;
        //
        //     fs.appendFile(filePath, logEntry, (err) => {
        //         if (err) {
        //             console.error('Fehler beim Schreiben der Chatnachricht in die Datei:', err);
        //         }
        //     });
        // }


        // Funktion zur Berechnung der Ähnlichkeit von Wörtern
        function calculateSimilarity(word1, word2) {
            if (quizStarted) {
                const lowercaseWord1 = word1.toLowerCase();
                const lowercaseWord2 = word2.toLowerCase();

                if (lowercaseWord1 === lowercaseWord2) {
                    return 1;
                }

                const length1 = lowercaseWord1.length;
                const length2 = lowercaseWord2.length;
                const maxLength = Math.max(length1, length2);
                const distance = natural.LevenshteinDistance(lowercaseWord1, lowercaseWord2);
                const similarity = 1 - distance / maxLength;

                return similarity;
            }
        }

        function displayPoints(channel) {
            let pointsMessage = 'Endstand: ';
            for (let user in userPoints) {
                pointsMessage += `${user}: ${userPoints[user]} Punkte `;
            }
            twitchClient.say(channel, `${pointsMessage}`);
            quizStarted = false;
            currentWordIndex = 0;
            userPoints = [];
        }

        // Funktion zur Verarbeitung von Twitch-Chat-Nachrichten
        function handleMessage(channel, tags, message, self) {
            if (self) return;

            const username = tags.username;
            const targetWord = wordsToGuess[currentWordIndex];
            const similarity = calculateSimilarity(targetWord, message);

            if (!quizStarted && message.toLowerCase() === '!startquiz') {
                quizStarted = true;
                twitchClient.say(channel, 'Quiz wurde gestartet! Viel Spaß beim Raten!');
                return;
            }
            if (message.toLowerCase() === '!punkte') {
                let pointsMessage = 'Punktestand: ';
                for (let user in userPoints) {
                    pointsMessage += `${user}: ${userPoints[user]} Punkte, `;
                }
                twitchClient.say(channel, pointsMessage);
                return;
            }

            if (quizStarted) {
                console.log(username, message, similarity)
            }

            if (similarity > 0.8 && quizStarted) {
                // Fügen Sie Punkte zum Benutzer hinzu
                if (username in userPoints) {
                    userPoints[username]++;
                } else {
                    userPoints[username] = 1;
                }

                twitchClient.say(channel, `@BeeenTV - Das richtige Wort wurde von ${username} geschrieben: "${message}" das Gesuchte Wort war: ${targetWord}. ${username} hat jetzt ${userPoints[username]} Punkt(e).`);

                currentWordIndex++;
                if (currentWordIndex === wordsToGuess.length) {
                    displayPoints(channel);

                }
            }
        }

        // Twitch-Client-Event: Nachricht erhalten
        twitchClient.on('message', handleMessage);
        // Twitch-Client-Event: Subscriptions
        twitchClient.on('subscription', (channel, username, method, message, userstate) => {
            twitchClient.say(channel, `${username} Danke für den Sub! beeentSpin `);
        });

        twitchClient.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
            giftedUsers.add(recipient);

            // Überprüfen, ob das letzte 'subgift'-Event vom selben Benutzer ausgelöst wurde und ob seitdem weniger als 1 Sekunde vergangen ist
            if (username === lastGiftUser && Date.now() - lastGiftTime < 1000) {
                return; // Wenn ja, senden keine Nachricht
            }

            lastGiftTime = Date.now(); // Aktualisieren  die Zeit des letzten 'subgift'-Events
            lastGiftUser = username; // Aktualisiere den Benutzer des letzten 'subgift'-Events

            twitchClient.say(channel, `${username} hat Sub(s) verschenkt. Danke!  beeentSpin`);
        });

        // Twitch-Client-Event: Resubscriptions
        twitchClient.on('resub', (channel, username, months, message, userstate, methods) => {
            const cumulativeMonths = userstate['msg-param-cumulative-months'];
            let monthMessage = cumulativeMonths > 1 ? 'Monate' : 'Monat';
            twitchClient.say(channel, `${username} Danke für den Sub seit ${cumulativeMonths} ${monthMessage}!  beeentSpin `);
        });

        twitchClient.on('cheer', (channel, userstate, message) => {
            console.log(`${userstate.username} hat ${userstate.bits} Bits gecheert!`);
            twitchClient.say(channel, `${userstate.username}, danke für die ${userstate.bits} Bits!  beeentSpin`);
        });

        // Twitch-Client starten
        twitchClient.connect().then(() => {
        }).catch(console.error);

    } catch (error) {
        console.error('Fehler beim Abrufen des Tokens:', error);
        res.status(500).send('Fehler beim Abrufen des Tokens.');
    }
});

// Server starten
app.listen(3000, () => {
    console.log('Server gestartet. Öffne http://localhost:3000 in deinem Browser.');
});
