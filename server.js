const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace(/__BASE_PATH__/g, BASE_PATH);

app.get(['/', '/index.html'], (req, res) => {
  res.type('html').send(indexHtml);
});
app.use(express.static(__dirname));

const rooms = new Map();
const ROOM_TTL_MS = 10 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeName(s) {
  return String(s || '').trim().slice(0, 20) || 'Player';
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    faces: room.faces,
    diceCount: room.diceCount,
    maxPlayers: room.maxPlayers,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      dudo: p.dudo,
      connected: p.connected,
      diceCount: p.diceCount,
      rolledCount: p.dice ? p.dice.length : 0
    }))
  };
}

function emitState(room) {
  io.to(room.code).emit('roomState', publicRoom(room));
}

function rollDice(count, faces) {
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * faces));
}

function connectedPlayers(room) {
  return Array.from(room.players.values()).filter(p => p.connected);
}

function checkAllReady(room) {
  const active = connectedPlayers(room).filter(p => p.diceCount > 0);
  return active.length >= 2 && active.every(p => p.ready);
}

function checkAllDudo(room) {
  const active = connectedPlayers(room).filter(p => p.dice && p.dice.length > 0);
  return active.length > 0 && active.every(p => p.dudo);
}

function startRound(room) {
  room.phase = 'rolled';
  for (const p of room.players.values()) {
    p.dice = p.diceCount > 0 ? rollDice(p.diceCount, room.faces) : [];
    p.ready = false;
    p.dudo = false;
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit('yourDice', { dice: p.dice });
    }
  }
  emitState(room);
}

function buildReveal(room) {
  const counts = {};
  for (let f = 1; f <= room.faces; f++) counts[f] = 0;
  const allDice = [];
  for (const p of room.players.values()) {
    if (!p.dice) continue;
    for (const v of p.dice) counts[v]++;
    allDice.push({ playerId: p.id, name: p.name, dice: p.dice });
  }
  return { counts, allDice, faces: room.faces };
}

function reveal(room) {
  room.phase = 'revealed';
  io.to(room.code).emit('revealed', buildReveal(room));
  emitState(room);
}

function resetRound(room) {
  room.phase = 'lobby';
  for (const p of room.players.values()) {
    p.ready = false;
    p.dudo = false;
    p.dice = null;
  }
  emitState(room);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!connectedPlayers(room).length && now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}, 60_000);

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentPlayerId = null;

  const touch = () => { if (currentRoom) currentRoom.lastActivity = Date.now(); };

  socket.on('createRoom', ({ name, faces, diceCount, maxPlayers, playerId } = {}, cb) => {
    const code = genCode();
    const pid = playerId || crypto.randomUUID();
    const room = {
      code,
      hostId: pid,
      phase: 'lobby',
      faces: Math.max(2, Math.min(100, parseInt(faces) || 6)),
      diceCount: Math.max(1, Math.min(10, parseInt(diceCount) || 5)),
      maxPlayers: Math.max(2, Math.min(8, parseInt(maxPlayers) || 6)),
      players: new Map(),
      lastActivity: Date.now()
    };
    room.players.set(pid, {
      id: pid, name: sanitizeName(name), socketId: socket.id,
      connected: true, ready: false, dudo: false, dice: null,
      diceCount: room.diceCount
    });
    rooms.set(code, room);
    socket.join(code);
    currentRoom = room;
    currentPlayerId = pid;
    cb && cb({ ok: true, code, playerId: pid });
    emitState(room);
  });

  socket.on('joinRoom', ({ code, name, playerId } = {}, cb) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'Stanza non trovata' });

    let player = playerId && room.players.get(playerId);
    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      if (name) player.name = sanitizeName(name);
    } else {
      if (connectedPlayers(room).length >= room.maxPlayers) {
        return cb && cb({ ok: false, error: 'Stanza piena' });
      }
      const pid = playerId || crypto.randomUUID();
      player = {
        id: pid, name: sanitizeName(name), socketId: socket.id,
        connected: true, ready: false, dudo: false, dice: null,
        diceCount: room.phase === 'lobby' ? room.diceCount : 0
      };
      room.players.set(pid, player);
    }
    socket.join(code);
    currentRoom = room;
    currentPlayerId = player.id;
    touch();
    cb && cb({ ok: true, code, playerId: player.id });
    if (player.dice && room.phase === 'rolled') {
      socket.emit('yourDice', { dice: player.dice });
    }
    if (room.phase === 'revealed') {
      socket.emit('revealed', buildReveal(room));
    }
    emitState(room);
  });

  socket.on('setDiceCount', (n) => {
    if (!currentRoom || currentRoom.phase !== 'lobby') return;
    const p = currentRoom.players.get(currentPlayerId);
    if (!p) return;
    p.diceCount = Math.max(0, Math.min(10, parseInt(n) || 0));
    if (p.diceCount === 0) p.ready = false;
    touch();
    if (checkAllReady(currentRoom)) startRound(currentRoom);
    else emitState(currentRoom);
  });

  socket.on('setReady', (ready) => {
    if (!currentRoom || currentRoom.phase !== 'lobby') return;
    const p = currentRoom.players.get(currentPlayerId);
    if (!p || p.diceCount === 0) return;
    p.ready = !!ready;
    touch();
    if (checkAllReady(currentRoom)) startRound(currentRoom);
    else emitState(currentRoom);
  });

  socket.on('dudo', () => {
    if (!currentRoom || currentRoom.phase !== 'rolled') return;
    const p = currentRoom.players.get(currentPlayerId);
    if (!p) return;
    p.dudo = true;
    touch();
    if (checkAllDudo(currentRoom)) reveal(currentRoom);
    else emitState(currentRoom);
  });

  socket.on('newRound', () => {
    if (!currentRoom || currentRoom.phase !== 'revealed') return;
    if (currentRoom.hostId !== currentPlayerId) return;
    resetRound(currentRoom);
  });

  socket.on('leave', () => handleLeave());

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const p = currentRoom.players.get(currentPlayerId);
    if (p) { p.connected = false; p.socketId = null; }
    touch();
    if (currentRoom.phase === 'lobby' && checkAllReady(currentRoom)) startRound(currentRoom);
    else if (currentRoom.phase === 'rolled' && checkAllDudo(currentRoom)) reveal(currentRoom);
    else emitState(currentRoom);
  });

  function handleLeave() {
    if (!currentRoom) return;
    const room = currentRoom;
    const wasHost = room.hostId === currentPlayerId;
    room.players.delete(currentPlayerId);
    socket.leave(room.code);
    if (wasHost && room.players.size > 0) {
      room.hostId = room.players.keys().next().value;
    }
    if (room.players.size === 0) rooms.delete(room.code);
    else emitState(room);
    currentRoom = null;
    currentPlayerId = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dice room server on :${PORT}`));
