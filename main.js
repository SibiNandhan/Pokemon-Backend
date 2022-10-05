const { MongoClient } = require("mongodb");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { createServer } = require("http");
const dotenv = require("dotenv").config();
const app = express();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE", "PUT"],
    allowedHeaders: [],
    credentials: true,
  },
});

app.use(cors());
const mongoClient = new MongoClient(process.env.MONGOBURL);
let collections = {};
let changeBattles;

app.get("/pokemon", async (req, res, next) => {
  try {
    let result = await collections.pokemon.find({}).toArray();
    return res.status(200).send({ result });
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
});
app.get("/battles", async (req, res, next) => {
  try {
    let result = await collections.battles.find({}).toArray();
    return res.status(200).send({ result });
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
});

io.on("connection", (socket) => {
  console.log("A client has connected!");
  changeBattles.on("change", (next) => {
    io.to(socket.activeRoom).emit("refresh", next.fullDocument);
  });
  socket.on("join", async (battleId) => {
    try {
      let result = await collections.battles.findOne({ _id: battleId });
      if (result) {
        socket.emit("refresh", result);
      } else {
        let newBattle = await collections.battles.insertOne({
          _id: battleId,
          playerOne: {
            pokemon: {},
          },
          playerTwo: {
            pokemon: {},
          },
        });
        console.log("new Battle", newBattle.insertedId);
        const battle = await collections.battles.findOne({
          _id: newBattle.insertedId,
        });
        console.log(battle);
        socket.emit("refresh", battle);
      }
      socket.join(battleId);
      socket.activeRoom = battleId;
    } catch (err) {
      console.log(err);
    }
  });
  socket.on("select", async (player, pokemon) => {
    console.log("select");
    console.log(player, pokemon);
    try {
      if (player === 1) {
        let x = await collections.battles.updateOne(
          {
            _id: socket.activeRoom,
          },
          {
            $set: {
              playerOne: {
                pokemon: pokemon,
              },
            },
          }
        );
        console.log(x);
      } else {
        await collections.battles.updateOne(
          {
            _id: socket.activeRoom,
          },
          {
            $set: {
              playerTwo: {
                pokemon: pokemon,
              },
            },
          }
        );
      }
    } catch (err) {}
  });
  socket.on("attack", async (player, move) => {
    try {
      if (player == 1) {
        await collections.battles.updateOne(
          {
            _id: socket.activeRoom,
          },
          {
            $inc: {
              "playerOne.pokemon.pp": -move.pp,
              "playerTwo.pokemon.hp": -move.damage,
            },
          }
        );
      } else {
        await collections.battles.updateOne(
          {
            _id: socket.activeRoom,
          },
          {
            $inc: {
              "playerTwo.pokemon.pp": -move.pp,
              "playerOne.pokemon.hp": -move.damage,
            },
          }
        );
      }
    } catch (err) {
      console.log(err);
    }
  });
});

httpServer.listen(4000, async () => {
  try {
    await mongoClient.connect();
    collections.pokemon = await mongoClient.db("game").collection("pokemon");
    collections.battles = await mongoClient.db("game").collection("battle");
    changeBattles = await collections.battles.watch(
      [
        {
          $match: {
            operationType: "update",
          },
        },
      ],
      { fullDocument: "updateLookup" }
    );
    console.log("Listening to port 4000");
  } catch (err) {
    console.log(err);
  }
});
