const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const format = require("date-fns/format");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const verificationQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDb = await db.get(verificationQuery);
  if (userDb === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO 
                                user(username,password,name,gender)
                                VALUES(
                                    '${username}',
                                    '${hashedPassword}',
                                    '${name}',
                                    '${gender}'
                                )`;
      const dbResponse = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.send("User already exists");
    response.status(400);
  }
});

// API 2 Login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const verificationQuery = `SELECT * FROM user WHERE username = "${username}"`;
  const userDb = await db.get(verificationQuery);
  if (userDb !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, userDb.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwToken });
    } else {
      response.send("Invalid password");
      response.status(400);
    }
  } else {
    response.send("Invalid user");
    response.status(400);
  }
});

// Authentication Middleware

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// Returning tweets API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
  const userId = await db.get(userIdQuery);

  const tweetsQuery = `SELECT 
        user.username AS username,
        tweet.tweet AS tweet,
        tweet.date_time AS dateTime
        FROM follower
        INNER JOIN user ON follower.follower_user_id = user.user_id
        INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        WHERE follower.following_user_id = ${userId.user_id}
        GROUP BY follower.following_user_id
        LIMIT 4

        
        `;

  const tweetDb = await db.all(tweetsQuery);

  response.send(tweetDb);
});

// User followings API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
  const userId = await db.get(userIdQuery);

  const followingQuery = `SELECT 
            user.name
            FROM follower 
            INNER JOIN user ON follower.following_user_id = user.user_id
            WHERE follower.follower_user_id = ${userId.user_id}
     `;

  const tweetDb = await db.all(followingQuery);
  response.send(tweetDb);
});

// User followers ~ API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
  const userId = await db.get(userIdQuery);

  const followingQuery = `SELECT 
            user.name
            FROM follower 
            INNER JOIN user ON follower.follower_user_id = user.user_id
            WHERE follower.following_user_id = ${userId.user_id}
     `;

  const tweetDb = await db.all(followingQuery);
  response.send(tweetDb);
});

// Requesting a tweet ~ API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const gettingUserQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
  const userIdDB = await db.get(gettingUserQuery);
  const followedUserId = userIdDB.user_id;
  const followingUserIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
  const followingUserIdDB = await db.get(followingUserIdQuery);
  const followingUserId = followingUserIdDB.user_id;
  const verifyingFollowQuery = `SELECT * FROM follower WHERE 
                                follower_user_id = ${followingUserId} AND following_user_id = ${followedUserId}`;
  const followStatus = await db.get(verifyingFollowQuery);
  if (followStatus !== undefined) {
    const tweetDataQuery = `
        SELECT tweet.tweet,
        count(like.like_id) AS likes,
        count(reply.reply_id) AS replies,
        tweet.date_time AS dateTime
        FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
        LEFT JOIN like ON reply.tweet_id = like.tweet_id
        WHERE tweet.tweet_id = ${tweetId}
      `;
    const tweetData = await db.all(tweetDataQuery);
    response.send(tweetData);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
// Getting likes ~ API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const gettingUserQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
    const userIdDB = await db.get(gettingUserQuery);
    const followedUserId = userIdDB.user_id;
    const followingUserIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
    const followingUserIdDB = await db.get(followingUserIdQuery);
    const followingUserId = followingUserIdDB.user_id;
    const verifyingFollowQuery = `SELECT * FROM follower WHERE 
                                follower_user_id = ${followingUserId} AND following_user_id = ${followedUserId}`;
    const followStatus = await db.get(verifyingFollowQuery);
    if (followStatus !== undefined) {
      const likedMembersQuery = `SELECT user.name FROM user INNER JOIN like ON  user.user_id = like.user_id
                                WHERE like.tweet_id = ${tweetId}`;
      const likedNames = await db.all(likedMembersQuery);
      let likedNamesArray = [];
      for (let obj of likedNames) {
        likedNamesArray.push(obj.name);
      }
      response.send({ likes: likedNamesArray });
    } else {
      response.send("Error");
    }
  }
);

// Getting replies ~ API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const gettingUserQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
    const userIdDB = await db.get(gettingUserQuery);
    const followedUserId = userIdDB.user_id;
    const followingUserIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
    const followingUserIdDB = await db.get(followingUserIdQuery);
    const followingUserId = followingUserIdDB.user_id;
    const verifyingFollowQuery = `SELECT * FROM follower WHERE 
                                follower_user_id = ${followingUserId} AND following_user_id = ${followedUserId}`;
    const followStatus = await db.get(verifyingFollowQuery);
    if (followStatus !== undefined) {
      const repliesQuery = `SELECT user.name,reply.reply FROM reply INNER JOIN user ON user.user_id = reply.user_id 
      WHERE reply.tweet_id = ${tweetId}
      `;
      const replies = await db.all(repliesQuery);
      let repliesArray = [];
      for (let obj of replies) {
        repliesArray.push(obj);
      }
      response.send({
        replies: repliesArray,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// Getting tweets of the user ~ API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
  const userId = await db.get(userIdQuery);

  const userTweetsDataQuery = `
    SELECT tweet.tweet,
    COUNT(like.like_id) AS likes,
    COUNT(reply.reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM tweet  INNER JOIN reply  ON tweet.tweet_id = reply.tweet_id INNER JOIN like  ON 
    reply.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId.user_id}
    GROUP BY tweet.tweet_id
  `;
  const tweetsData = await db.all(userTweetsDataQuery);
  response.send(tweetsData);
});

// Creating new tweet ~ API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
  const userId = await db.get(userIdQuery);
  const currentDate = format(new Date(2022, 11, 25), "yyyy/MM/dd/");
  const createTweetQuery = `INSERT INTO tweet (tweet_id,tweet,user_id,date_time) 
  values(50,"${tweet}",${userId.user_id},"${currentDate}")`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// Deleting tweet API ~ 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}"`;
    const userId = await db.get(userIdQuery);
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
    const tweetUserId = await db.get(tweetUserIdQuery);
    if (tweetUserId.user_id === userId.user_id) {
      const delteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
