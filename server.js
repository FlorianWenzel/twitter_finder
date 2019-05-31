"use strict";
const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const MongoClient = require('mongodb').MongoClient
const Twit = require('twit')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const chalk = require('chalk')
const credentials = require('./credentials.js')

let db, users, stream, tweets, last_tweet_timestamp, power_timestamp = Date.now()
const Twitter = new Twit(credentials);

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'public/index.html'))
})

const PORT = 7777
http.listen(PORT, function () {
    console.log(chalk.green('App started on port ' + PORT))
})

const db_url = 'mongodb://' + process.env.DB_USR + ':' +  process.env.DB_PW + '@localhost:27017?authMechanism=DEFAULT&authSource=hyrule'
MongoClient.connect(db_url, { useNewUrlParser: true }, async function(err, client) {
    console.log(chalk.green('connected to mongodb'))

    db = await client.db('hyrule')
    users = db.collection('users')
    tweets = db.collection('tweets')
})

io.on('connection', (socket) => {
    socket.on('login', async (username, password) => {
        const token = !password ? username : undefined
        let valid = false
        if(token){
            valid = !!(await users.findOne({token: token}))
        }else{
            const user =  await users.findOne({username: username})
            const hash = user ? user.password : false
            valid =  !hash ? false : await bcrypt.compare(password, hash)
        }

        if(valid){
            socket.join('loggedIn')
            socket.emit('power_timestamp', !!stream, power_timestamp)
            socket.emit('tweet', last_tweet_timestamp)
            socket.emit('login', (await users.findOne({$or: [{username: username}, {token: token}]})).token, (await users.findOne({$or: [{username: username}, {token: token}]})).enabled_languages)
        }else{
            socket.emit('login', false)
        }
    })
    socket.on('getKeys', async (token) => {
        const user = await users.findOne({token: token});
        if(!user){
            socket.emit('login', false);
            return;
        }
        socket.emit('getKeys', user.keys);
    })
    socket.on('addKey', async (token, key) => {
        const user = await users.findOne({token: token});
        if(!user){
            socket.emit('login', false);
            return;
        }
        const keys = (user.keys ? user.keys : []);
        keys.push(key);
        await users.updateOne({token: token}, {$set: {keys: keys}})
        socket.emit('getKeys', keys);
    })
    socket.on('delKey', async (token, key) => {
        const user = await users.findOne({token: token});
        if(!user){
            socket.emit('login', false);
            return;
        }
        let keys = (user.keys ? user.keys : []);
        const i = keys.indexOf(key);
        if(i > -1)
            keys.splice(i, 1)
        await users.updateOne({token: token}, {$set: {keys: keys}})
        socket.emit('getKeys', keys);
    })
    socket.on('change_languages', async (token, enabled_languages) => {
        const user = await users.findOne({token: token});
        if(!user){
            socket.emit('login', false);
            return;
        }
        await users.updateOne(user, {$set: {enabled_languages: enabled_languages}})
        socket.emit('change_languages', enabled_languages)
    })
    socket.on('download', async (token, time, format) => {
        const user = await users.findOne({token: token});
        if(!user){
            socket.emit('login', false);
            return;
        }
        let relevant_data
        let language_filter = {}
        if(!user.enabled_languages.includes('an')){
            language_filter.$or = [];
            for(const lang of user.enabled_languages){
                if(lang === 'in'){
                    language_filter.$or.push({lang: 'und'})
                }else{
                    language_filter.$or.push({lang: lang})
                }
            }
        }
        if(language_filter.$or && language_filter.$or.length === 0){
            socket.emit('no_tweets')
        }
        if(time === '10' || time === '100')
            relevant_data = await tweets.find({...language_filter}).sort({$natural:1}).limit(parseInt(time)).toArray()

        if(time === '24h')
            relevant_data = await tweets.find({...language_filter, timestamp: {$gt: Date.now() - 24 * 60 * 60 * 1000}}).toArray()
        if(time === '7d')
            relevant_data = await tweets.find({...language_filter, timestamp: {$gt: Date.now() - 7 * 24 * 60 * 60 * 1000}}).toArray()
        if(time === '30d')
            relevant_data = await tweets.find({...language_filter, timestamp: {$gt: Date.now() - 30 * 24 * 60 * 60 * 1000}}).toArray()
        if(time === 'all')
            relevant_data = await tweets.find().toArray()
        if(relevant_data.length === 0){
            socket.emit('no_tweets')
            return
        }
        let rows = [['Date', 'Name', 'Profile', 'Tweet']]
        for(let tweet of relevant_data){
            rows.push([timeConverter(tweet.timestamp), tweet.user.name, 'https://twitter.com/' + tweet.user.screen_name, 'https://twitter.com/statuses/' + tweet.id_str])
        }
        socket.emit('download', format, 'file', rows)
    })
    socket.on('stream', token => toggleStream(token, socket))
})

async function toggleStream(token, socket){
    const user = await users.findOne({token: token})
    power_timestamp = Date.now()
    if(!user){
        socket.emit('login', false)
        return;
    }
    //if already streaming stop streaming
    if(stream){
        stream.stop()
        console.log(chalk.red('tweet stream stopeed'))
        stream = null
        socket.emit('stream', false)
        io.to('loggedIn').emit('power_timestamp', false, power_timestamp)
        return
    }
    stream = Twitter.stream('statuses/filter', { track: user.keys });
    stream.on('tweet', async (tweet) => {
        last_tweet_timestamp = Date.now()
        io.to('loggedIn').emit('tweet', last_tweet_timestamp)
        //check if tweeter is already in database
        const known_tweeter = !!(await tweets.findOne({"user.id": tweet.user.id}))
        if(known_tweeter)
            return
        tweets.insertOne({...tweet, timestamp: Date.now()})
    });
    stream.on('connected', () => {
        console.log(chalk.green('tweet stream started'))
        io.to('loggedIn').emit('power_timestamp', true, power_timestamp)
    })
    await users.updateOne(user, {$set: {streaming: Date.now()}});
}

function timeConverter(UNIX_timestamp){
    const a = new Date(UNIX_timestamp * 1000);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const year = a.getFullYear();
    const month = months[a.getMonth()];
    const date = a.getDate();
    const hour = a.getHours();
    const min = a.getMinutes();
    const sec = a.getSeconds();
    return date + ' ' + month + ' ' + (hour > 9 ? hour : '0' + hour) + ':' + (min > 9 ? min : '0' + min);
}
