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

let db, users, stream, tweets, last_tweets = [];
const Twitter = new Twit(credentials);

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

const PORT = 7777
http.listen(PORT, function() {
  console.log(chalk.green('App started on port ' + PORT))
})

const db_url = 'mongodb://localhost:27017?authSource=hyrule'
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
    if (token) {
      valid = !!(await users.findOne({ token }))
    } else {
      const user = await users.findOne({ username: username })
      const hash = user ? user.password : false
      valid = !hash ? false : await bcrypt.compare(password, hash)
    }

    if (!valid) {
      socket.emit('login', false)
      return;
    }
    socket.join('loggedIn')
    for (const tweet of last_tweets) {
      socket.emit('tweet', tweet)
    }
    socket.emit('power', !!stream)
    socket.emit('login', (await users.findOne({ $or: [{ username }, { token }] })).token, (await users.findOne({ $or: [{ username }, { token }] })).enabled_languages)
  })
  socket.on('getKeys', async (token) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    socket.emit('getKeys', user.keys);
  })
  socket.on('getBannedKeys', async (token) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    socket.emit('getBannedKeys', user.bans ? user.bans : []);
  })
  socket.on('addKey', async (token, key) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    const keys = (user.keys ? user.keys : []);
    keys.push(key);
    await users.updateOne({ token }, { $set: { keys } })
    socket.emit('getKeys', keys);
  })
  socket.on('delKey', async (token, key) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    let keys = (user.keys ? user.keys : []);
    const i = keys.indexOf(key);
    if (i > -1)
      keys.splice(i, 1)
    await users.updateOne({ token }, { $set: { keys } })
    socket.emit('getKeys', keys);
  })
  socket.on('addBannedKey', async (token, key) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    const bans = (user.bans ? user.bans : []);
    bans.push(key);
    await users.updateOne({ token }, { $set: { bans } })
    socket.emit('getBannedKeys', bans);
  })
  socket.on('delBannedKey', async (token, key) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    let bans = (user.bans ? user.bans : []);
    const i = bans.indexOf(key);
    if (i > -1)
      bans.splice(i, 1)
    await users.updateOne({ token }, { $set: { bans } })
    socket.emit('getBannedKeys', bans);
  })
  socket.on('change_languages', async (token, enabled_languages) => {
    const user = await users.findOne({ token });
    if (!user) {
      socket.emit('login', false);
      return;
    }
    await users.updateOne(user, { $set: { enabled_languages: enabled_languages } })
    socket.emit('change_languages', enabled_languages)
  })
  socket.on('download', (token, from, to, format) => {
    users.findOne({ token })
      .then((user) => {
        if (!user) {
          socket.emit('login', false);
          return;
        }
        return user;
      })
      .then(async (user) => {
        let language_filter = {}
        if (!user.enabled_languages.includes('an')) {
          language_filter.$or = [];
          for (const lang of user.enabled_languages) {
            if (lang === 'in') {
              language_filter.$or.push({ lang: 'und' })
            } else {
              language_filter.$or.push({ lang: lang })
            }
          }
        }
        let rows = [
          ['Time', 'Name', 'Description', 'Follower', 'Following', 'Retweet', 'Original tweeter', 'Text', 'Profile', 'Tweet']
        ]
        const count = await tweets.find({ $and: [{ ...language_filter, timestamp: { $gt: from } }, { timestamp: { $lt: to } }] }).count();
        if (count > 50000) {
          socket.emit('too_many_results', count)
          return;
        } else {
          socket.emit('prepareing_download', count, 0)
        }
        let index = 0;
        tweets.find({ $and: [{ ...language_filter, timestamp: { $gt: from } }, { timestamp: { $lt: to } }] })
          .forEach((tweet) => {
            index++
            if (index % 50 === 0)
              socket.emit('prepareing_download', count, index);
            const is_retweet = !!tweet.retweeted_status
            const text = (is_retweet ? (tweet.retweeted_status.extended_tweet ? tweet.retweeted_status.extended_tweet.full_text : tweet.retweeted_status.text) : (tweet.extended_tweet ? tweet.extended_tweet.full_text : tweet.text)).replace(/\r?\n|\r/g, ' ')
            const description = tweet.user.description ? tweet.user.description.replace(/\r?\n|\r/g, ' ') : ''
            rows.push([new Date(tweet.timestamp).toLocaleDateString(), tweet.user.name, description, tweet.user.followers_count, tweet.user.friends_count, is_retweet, is_retweet ? tweet.retweeted_status.user.screen_name : '-', text, 'https://twitter.com/' + tweet.user.screen_name, 'https://twitter.com/statuses/' + tweet.id_str])
          })
          .then(() => {
            socket.emit('download', format, 'file', rows)
          })
      })

  })
  socket.on('stream', token => toggleStream(token, socket))
})

async function toggleStream(token, socket) {
  const user = await users.findOne({ token: token })
  if (!user) {
    socket.emit('login', false)
    return;
  }
  //if already streaming stop streaming
  if (stream) {
    stream.stop()
    console.log(chalk.red('tweet stream stopeed'))
    stream = null
    socket.emit('stream', false)
    socket.emit('power', !!stream)
    return
  }
  stream = Twitter.stream('statuses/filter', { track: user.keys });
  stream.on('tweet', async (tweet) => {
    //check if tweeter is already in database
    const known_tweeter = !!(await tweets.findOne({ "user.id": tweet.user.id }))
    if (tweet.lang !== 'de') return
    if (known_tweeter) return
    //check if tweet contians blocked keywords
    let contains_blocked_key = false;
    for (const key of user.bans)
      if (tweet.text.includes(key)) {
        contains_blocked_key = true
        break
      }
    if (contains_blocked_key) return
    tweets.insertOne({ ...tweet, timestamp: Date.now() })
    last_tweets.push(tweet)
    if (last_tweets.length > 10) last_tweets.shift();
    io.to('loggedIn').emit('tweet', tweet)
  });
  stream.on('connected', () => {
    console.log(chalk.green('tweet stream started'))
  })
  await users.updateOne(user, { $set: { streaming: Date.now() } });
  socket.emit('power', !!stream)
}

function timeConverter(UNIX_timestamp) {
  const a = new Date(UNIX_timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = a.getFullYear();
  const month = months[a.getMonth()];
  const date = a.getDate();
  const hour = a.getHours();
  const min = a.getMinutes();
  const sec = a.getSeconds();
  return date + ' ' + month + ' ' + (hour > 9 ? hour : '0' + hour) + ':' + (min > 9 ? min : '0' + min);
}