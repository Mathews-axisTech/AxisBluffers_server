const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Allow cross-origin requests

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // TODO: update origin for deployment
    methods: ['GET', 'POST']
  }
});

let rooms = {}; // Store the rooms and their players,currentround,rounddata

// let players = [];
// let currentRound = 0;
// let roundData = [];
// let factsSubmitted = 0;  // Count how many players have submitted their facts
// let guessesMade = 0; // Track guesses made by players in the current round

app.use(express.static('public'));

function generateRoomNumber(){
  let roomNumber;
  do {
    roomNumber = Math.floor(100000 + Math.random() * 900000).toString();
  }while (rooms[roomNumber]); //if there is a roomnumber already present then generate a new roomnumber
  return roomNumber;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create a new room
  socket.on('createRoom',(playerName)=>{
    const roomNumber = generateRoomNumber();
    socket.join(roomNumber);

    rooms[roomNumber] = {
      players: [{ id: socket.id, name: playerName, score: 0 }],
      currentRound: 0,
      factsSubmitted: 0,
      guessesMade: 0
    };
    socket.emit('roomCreated', roomNumber);
    console.log('Room created:', roomNumber);
    console.log('Rooms:', rooms);
  })

  socket.on('joinRoom', (roomNumber, playerName) => {
    console.log('Joining room:', roomNumber);
    if(rooms[roomNumber]){
      socket.join(roomNumber);
      rooms[roomNumber].players.push({ id: socket.id, name: playerName, score: 0,facts:[] });
      socket.emit('roomJoined', roomNumber);
      console.log('Room joined:', roomNumber);

      io.to(roomNumber).emit('playerJoined', rooms[roomNumber].players);

    }
    else{
      socket.emit('roomNotFound');
    }
  });

  // // Register a new player - before the room integration
  // socket.on('registerPlayer', (playerData) => {
  //   players.push({ id: socket.id, ...playerData, score: 0 });
  //   console.log('Player registered:', playerData.name);

  //   // Check if all players have joined and submitted their facts
  //   if (players.length >= 2) {
  //     // Wait for all players to submit facts
  //     if (factsSubmitted === players.length) {
  //       io.emit('startGame', players);
  //       startNextRound();
  //     }
  //   }
  // });

  // When a player submits their facts - before the room integration
  // socket.on('submitFacts', (facts) => {
  //   const player = players.find(p => p.id === socket.id);
  //   if (player) {
  //     player.facts = facts;
  //     player.wrongFact = facts.wrongFactIndex;
  //     factsSubmitted++;  // Increment fact submission count

  //     console.log(`Facts submitted by ${player.name}`);

  //     // Start the game if all players have submitted facts
  //     if (factsSubmitted === players.length) {
  //       startNextRound();
  //       io.emit('startGame', players);
  //     }
  //   }
  // });

  socket.on('submitFacts', (roomNumber,facts,wrongFactIndex) => {
    const room = rooms[roomNumber];
    if(room){
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.facts = facts;
        player.wrongFact = wrongFactIndex;
        room.factsSubmitted++;  // Increment fact submission count
        console.log(`Facts submitted by ${player.name} in room ${roomNumber}`);

        // Start the game if all players have submitted facts
        // if (room.factsSubmitted === room.players.length) {
        //   io.to(roomNumber).emit('startGame', room.players);
        //   startNextRound(roomNumber);
        // }
      }
    }


  // Handle a player's guess on which fact is incorrect
  socket.on('guessWrongFact', ( roomNumber, playerId, factIndex ) => {
    const room = rooms[roomNumber];
    if (room) {
      console.log('Guessing wrong fact', factIndex,roomNumber,playerId);
      const player = room.players.find(p => p.id === playerId);
      if (player && player.wrongFact === factIndex) {
        const guessingPlayer = room.players.find(p => p.id === socket.id);
        guessingPlayer.score+=10;
      }

      room.guessesMade++;

      // // Proceed to the next round after all players have made their guesses
      // if (room.guessesMade === room.players.length) {
      //   room.guessesMade = 0; // Reset guess count for the next round
      //   console.log("went to next round");
      //   startNextRound(roomNumber);
      // }
    }
  });
});

  socket.on('startGameEarly', (roomNumber) => {
    const room = rooms[roomNumber];
    if (room && socket.id === room.players[0].id) { // Only the room creator can start the game early
      io.to(roomNumber).emit('startGame', room.players);
      startNextRound(roomNumber);
    }
  });

  socket.on ('forceNextRound',(roomNumber)=>{
    const room = rooms[roomNumber];
    if(room){
      room.guessesMade=0;
      console.log("forced ROund");
      startNextRound(roomNumber)
    }
  })

  // Handle player disconnect
  socket.on('disconnect', () => {
    for (const roomNumber in rooms) {
      const room = rooms[roomNumber];
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) {
        delete rooms[roomNumber]; // Delete room if empty
      }
    }
    console.log('A user disconnected:', socket.id);
  });
});


function startNextRound(roomNumber) {
  const room = rooms[roomNumber];
  if (room) {
    if (room.currentRound >= room.players.length) {
      // Game over, calculate winners
      const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
      io.to(roomNumber).emit('gameOver', {players: sortedPlayers});
    } else {
      // Show next player's facts
      const player = room.players[room.currentRound];
      io.to(roomNumber).emit('showPlayerFacts', { playerId: player.id,playerName:player.name, facts: player.facts });
      room.currentRound++;
    }
  }
}

server.listen(3001, () => {
  console.log('Server is running on port 3001');
});
