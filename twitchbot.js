const tmi = require('tmi.js');
const express = require('express');
const axios = require('axios');
const {spawn} = require('child_process');
const natural = require('natural');

const app = express();

// Twitch-Konfiguration
const clientID = 'client-id';
const clientSecret = 'client secret ';
const redirectURI = 'http://localhost:3000/callback';
const scopes = ['chat:read', 'chat:edit'];
const channel = 'channel';
const wordsToGuess = ['Blume', 'Hund', 'Katze', 'Tisch', 'Stuhl', 'Haus', 'Auto', 'Baum', 'Buch', 'Schule', 'Computer', 'Handy', 'Kaffee', 'Pizza', 'Musik', 'Sonne', 'Mond', 'Berge', 'Meer', 'Stern'];

let twitchClient; // Twitch-Client-Instanz
let currentWordIndex = 0; // Index des aktuellen zu erratenden Wortes

// Routen für den oauth
app.get('/', (req, res) => {
    const authorizeURL = `https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectURI)}&response_type=code&scope=${scopes.join(' ')}`;
    spawn(/^win/.test(process.platform) ? 'explorer' : 'xdg-open', [authorizeURL]);
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
                username: 'BeensQuizBot',
                password: `oauth:${accessToken}`
            },
            channels: [channel]
        });

        // Funktion zur Berechnung der Ähnlichkeit von Wörtern
        //natural language processing
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
            console.log(similarity)
            if (similarity > 0.8) {
                // Nachricht im Chat senden
                const username = tags.username;
                twitchClient.say(channel, `Das richtige Wort wurde von ${username} geschrieben: '${message}' das Gesuchte Wort war: ${targetWord}`);

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
