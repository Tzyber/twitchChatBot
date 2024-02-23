const tmi = require('tmi.js');
const express = require('express');
const axios = require('axios');
let lastGiftTime = Date.now();
let lastGiftUser = '';
const {spawn} = require('child_process');
const natural = require('natural');
const fs = require('fs');
const {reconnect} = require("tmi.js/lib/client");
let userPoints = {};
// Twitch-Konfiguration
const clientID = 'n0lshifpy683p5m1wpva2e3j1ru2fo';
const clientSecret = 'x2bww9zs564r3z2tx7fa6ttthiyojd';
const redirectURI = 'http://localhost:3000/callback';
const scopes = ['chat:read', 'chat:edit'];
let lastGiftedUser = '';
let giftCount = 0;
const channel = 'beeentv';
const giftedUsers = new Set();
let quizStarted = false;
const wordsToGuess = [
    "1",
    "2",
    "3",
];
let currentWordIndex = 0; // Index des aktuellen zu erratenden Wortes
let twitchClient;
const app = express();

// Funktion zum Schreiben der Chatnachrichten in die Datei "chatlog.txt"
function writeChatMessageToFile(tags, message) {
    const username = tags.username;
    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] ${username}: ${message}\n`;
    const currentDate = new Date().toISOString().slice(0, 10); // Aktuelles Datum als YYYY-MM-DD

    // Das Verzeichnis erstellen, wenn es nicht existiert
    if (!fs.existsSync(currentDate)) {
        fs.mkdirSync(currentDate);
    }

    const filePath = `${currentDate}/Chaatlog.txt`;

    fs.appendFile(filePath, logEntry, (err) => {
        if (err) {
            console.error('Fehler beim Schreiben der Chatnachricht in die Datei:', err);
        }
    });
}

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

module.exports = { calculateSimilarity, displayPoints, handleMessage };
