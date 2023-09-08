const tmi = require('tmi.js');
const express = require('express');
const axios = require('axios');
const {spawn} = require('child_process');
const natural = require('natural');
const fs = require('fs');
const app = express();

// Twitch-Konfiguration
const clientID = 'clientid';
const clientSecret = 'clientsecret';
const redirectURI = 'http://localhost:3000/callback';
const scopes = ['chat:read', 'chat:edit'];
let lastGiftedUser = '';
let giftCount = 0;
const channel = 'channel';
const giftedUsers = new Set();
let quizStarted = false;
const wordsToGuess = [
    "wordstoGuessArray,"
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
                username: 'twitchBot',
                password: `oauth:${accessToken}`
            },
            channels: [channel]
        });


        // Funktion zum Schreiben der Chatnachrichten in die Datei "chatlog.txt"
        function writeChatMessageToFile(tags, message) {
            const username = tags.username;
            const timestamp = new Date().toLocaleString();
            const logEntry = `[${timestamp}] ${username}: ${message}\n`;
            let currentDate = new Date().toJSON().slice(0.10)
            fs.appendFile(currentDate, logEntry, (err) => {
                if (err) {
                    console.error('Fehler beim Schreiben der Chatnachricht in die Datei:', err);
                }
            });
        }

        // Funktion zur Berechnung der Ähnlichkeit von Wörtern
        function calculateSimilarity(word1, word2) {
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

        // Funktion zur Verarbeitung von Twitch-Chat-Nachrichten
        function handleMessage(channel, tags, message, self) {
            if (self) return;

            // Überprüfen, ob das richtige Wort geschrieben wurde (mit Rechtschreibfehlerprüfung)
            const targetWord = wordsToGuess[currentWordIndex];
            const similarity = calculateSimilarity(targetWord, message);
            const username = tags.username;

            if (!quizStarted && message.toLowerCase() === '!startquiz') {
                quizStarted = true; // Quiz wird gestartet
                twitchClient.say(channel, 'Quiz wurde gestartet! Viel Spaß beim Raten!');
                return; // Beende die Funktion, um keine weiteren Nachrichten zu verarbeiten
            }


                if (similarity > 0.8 && quizStarted) {
                    console.log(similarity, username + ": ", message)
                    const username = tags.username;
                    twitchClient.say(channel, `Das richtige Wort wurde von ${username} geschrieben: "${message}" das Gesuchte Wort war: ${targetWord}`);

                    // Increment  aktuellen Wortindex.
                    currentWordIndex++;

                    // Prüfen ob schon alle Wörter geraten wurden
                    if (currentWordIndex === wordsToGuess.length) {
                        // Disconnect wenn alle Wörter geraten wurden
                        twitchClient.disconnect();
                    }
                }


        }

        // Twitch-Client-Event: Nachricht erhalten
        twitchClient.on('message', handleMessage);
        // Twitch-Client-Event: Subscriptions
        twitchClient.on('subscription', (channel, username, method, message, userstate) => {
            twitchClient.say(channel,`${username} Danke für den Sub! beeentVdance `);
        });

        twitchClient.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
            giftedUsers.add(recipient);

            if (username === lastGiftedUser) {
                giftCount++;
            } else {
                lastGiftedUser = username;
                giftCount = 1;
            }

            if (giftCount === 1) {
                twitchClient.say(channel, `${username} danke für ${giftedUsers.size} verschenkte Sub(s)  beeentVdance`);
            }
        });

        // Twitch-Client-Event: Resubscriptions
        twitchClient.on('resub', (channel, username, months, message, userstate, methods) => {
            const cumulativeMonths = userstate['msg-param-cumulative-months'];
            twitchClient.say(channel, `${username} Danke für den Sub seit ${cumulativeMonths} Monat(e). ! beeentVdance `)
        });

        // Twitch-Client starten
        twitchClient.connect().catch(console.error);

    } catch (error) {
        console.error('Fehler beim Abrufen des Tokens:', error);
        res.status(500).send('Fehler beim Abrufen des Tokens.');
    }
});

// Server starten
app.listen(3000, () => {
    console.log('Server gestartet. Öffne http://localhost:3000 in deinem Browser.');
});
