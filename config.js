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
const channel = 'tzyber';
const giftedUsers = new Set();
let quizStarted = false;
const wordsToGuess = [
    "1",
    "2",
    "3",
];
let currentWordIndex = 0; // Index des aktuellen zu erratenden Wortes
let twitchClient;


const TwitchConfig = {
    authorize: (req, res) => {
        const authorizeURL = `https://id.twitch.tv/oauth2/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectURI)}&response_type=code&scope=${scopes.join(' ')}`;

        if (/^win/.test(process.platform)) {
            spawn('explorer', [authorizeURL]);
        } else {
            spawn('xdg-open', [authorizeURL]);
        }

        res.send('Öffne deinen Browser und melde dich bei Twitch an.');
    },
    callback: async (req, res) => {
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

        } catch (error) {
            console.error('Fehler beim Abrufen des Tokens:', error);
            res.status(500).send('Fehler beim Abrufen des Tokens.');
        }
    },
    handleSubscription: (channel, username, method, message, userstate) => {
        twitchClient.say(channel, `${username} Danke für den Sub! beeentVdance `);
    },
    handleGift: (channel, username, streakMonths, recipient, methods, userstate) => {
        giftedUsers.add(recipient);

        // Überprüfen, ob der letzte 'subgift'-Event vom selben Benutzer ausgelöst wurde und ob seitdem weniger als 5 Sekunden vergangen sind
        if (username === lastGiftUser && Date.now() - lastGiftTime < 5000) {
            return; // Wenn ja, senden Sie keine Nachricht
        }

        lastGiftTime = Date.now(); // Aktualisieren  die Zeit des letzten 'subgift'-Events
        lastGiftUser = username; // Aktualisieren  den Benutzer des letzten 'subgift'-Events

        twitchClient.say(channel, `${username} hat Sub(s) verschenkt. Danke! beeentVdance`);
    },
    handleResub: (channel, username, months, message, userstate, methods) => {
        const cumulativeMonths = userstate['msg-param-cumulative-months'];
        let monthMessage = cumulativeMonths > 1 ? 'Monate' : 'Monat';
        twitchClient.say(channel, `${username} Danke für den Sub seit ${cumulativeMonths} ${monthMessage}! beeentVdance `);
    },
    initialMessage: () => {
        twitchClient.say(channel, 'Initialisiere den tzybers-Bot...');
        twitchClient.say(channel, 'Hallo! Ich bin der tzybers-Bot und ich bin derzeit in Entwicklung Bitte beachte, dass ich möglicherweise nicht stabil bin.');
    }
};

const ServerConfig = {
    port: 3000,
    startMessage: () => {
        console.log('Server gestartet. Öffne http://localhost:3000 in deinem Browser.');
    }
};

module.exports = { TwitchConfig, ServerConfig };
