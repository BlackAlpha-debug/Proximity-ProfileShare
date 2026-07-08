import net from 'net'

// Electron-free handshake protocol engine so the choreography (including the
// simultaneous-tap tie-break) can be unit-tested with two engines over real
// sockets. handshake.js wires this to electron (store + BrowserWindow + ipc).
//
// Wire protocol — newline-delimited JSON:
//   share-request { deviceId, displayName }   initiator → receiver
//   share-accept  { deviceId, displayName }   receiver  → initiator
//   share-decline { deviceId, reason }        receiver  → initiator
//   share-cancel  { deviceId }                initiator → receiver (gave up)

export function createHandshakeEngine({
  ownId,
  ownName,
  emit,
  receiverTimeoutMs = 20000,
  initiatorTimeoutMs = 25000
}) {
  let server = null
  let serverPort = null
  const outgoing = new Map() // peerDeviceId -> { socket, timer, peer }
  const incoming = new Map() // peerDeviceId -> { socket, timer, name }

  function send(socket, message) {
    try {
      socket.write(JSON.stringify(message) + '\n')
    } catch {
      /* socket already gone */
    }
  }

  function attachReader(socket, onMessage) {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        onMessage(message)
      }
    })
  }

  function clearOutgoing(peerId) {
    const entry = outgoing.get(peerId)
    if (!entry) return
    clearTimeout(entry.timer)
    try {
      entry.socket.destroy()
    } catch {
      /* ignore */
    }
    outgoing.delete(peerId)
  }

  function clearIncoming(peerId) {
    const entry = incoming.get(peerId)
    if (!entry) return
    clearTimeout(entry.timer)
    try {
      entry.socket.end()
    } catch {
      /* ignore */
    }
    incoming.delete(peerId)
  }

  // ---- Server side ----

  function ensureServer() {
    return new Promise((resolve) => {
      if (server && serverPort) {
        resolve(serverPort)
        return
      }
      server = net.createServer((socket) => handleConnection(socket))
      server.on('error', () => {})
      server.listen(0, () => {
        serverPort = server.address().port
        resolve(serverPort)
      })
    })
  }

  function handleConnection(socket) {
    socket.on('error', () => {})
    attachReader(socket, (message) => {
      if (message.type === 'share-request') {
        onShareRequest(socket, message)
      } else if (message.type === 'share-cancel') {
        const peerId = String(message.deviceId || '')
        if (incoming.has(peerId)) {
          clearIncoming(peerId)
          emit({ type: 'incoming-cancelled', peer: { deviceId: peerId } })
        }
      }
    })
  }

  function onShareRequest(socket, message) {
    const me = ownId()
    const peerId = String(message.deviceId || '')
    const name = message.displayName || 'Someone'
    if (!peerId || peerId === me) return

    // Simultaneous tap: we already sent this peer a request. Break the tie by
    // comparing deviceIds — the smaller id is the sole initiator.
    if (outgoing.has(peerId)) {
      if (me < peerId) {
        // We are the initiator. Ignore the peer's redundant request and keep
        // waiting for our outgoing to be accepted. We deliberately do NOT close
        // this socket — the peer tears it down when it cancels its own outgoing,
        // which avoids a close/emit race on their side.
        return
      }
      // Peer is the initiator (smaller id). Drop our own outgoing and treat the
      // peer's incoming request as an implicit accept.
      clearOutgoing(peerId)
      send(socket, { type: 'share-accept', deviceId: me, displayName: ownName() })
      emit({ type: 'completed', peer: { deviceId: peerId, name }, role: 'accepter', tieBroken: true })
      socket.end()
      return
    }

    if (incoming.has(peerId)) return // ignore duplicates while one is pending

    // Normal case: prompt the user to Accept / Decline.
    const timer = setTimeout(() => {
      send(socket, { type: 'share-decline', deviceId: me, reason: 'timeout' })
      incoming.delete(peerId)
      try {
        socket.end()
      } catch {
        /* ignore */
      }
      emit({ type: 'incoming-cancelled', peer: { deviceId: peerId }, reason: 'timeout' })
    }, receiverTimeoutMs)

    incoming.set(peerId, { socket, timer, name })
    emit({ type: 'incoming-request', peer: { deviceId: peerId, name } })
  }

  function acceptIncoming(peerId) {
    const entry = incoming.get(peerId)
    if (!entry) return { ok: false }
    clearTimeout(entry.timer)
    send(entry.socket, { type: 'share-accept', deviceId: ownId(), displayName: ownName() })
    incoming.delete(peerId)
    emit({ type: 'completed', peer: { deviceId: peerId, name: entry.name }, role: 'accepter' })
    try {
      entry.socket.end()
    } catch {
      /* ignore */
    }
    return { ok: true }
  }

  function declineIncoming(peerId) {
    const entry = incoming.get(peerId)
    if (!entry) return { ok: false }
    clearTimeout(entry.timer)
    send(entry.socket, { type: 'share-decline', deviceId: ownId(), reason: 'declined' })
    incoming.delete(peerId)
    try {
      entry.socket.end()
    } catch {
      /* ignore */
    }
    return { ok: true }
  }

  // ---- Client side ----

  function requestShare(peer) {
    const me = ownId()
    const peerId = String(peer?.deviceId || '')
    if (!peerId || peerId === me) return { ok: false, reason: 'invalid-peer' }
    if (!peer.ip || !peer.port) {
      emit({ type: 'cancelled', peer, reason: 'unreachable' })
      return { ok: false, reason: 'unreachable' }
    }
    if (outgoing.has(peerId)) return { ok: true, already: true }

    const socket = net.createConnection({ host: peer.ip, port: peer.port })

    const timer = setTimeout(() => {
      send(socket, { type: 'share-cancel', deviceId: me })
      clearOutgoing(peerId)
      emit({ type: 'cancelled', peer, reason: 'timeout' })
    }, initiatorTimeoutMs)

    outgoing.set(peerId, { socket, timer, peer })

    socket.on('connect', () => {
      send(socket, { type: 'share-request', deviceId: me, displayName: ownName() })
      emit({ type: 'outgoing-pending', peer })
    })

    attachReader(socket, (message) => {
      if (message.type === 'share-accept') {
        clearOutgoing(peerId)
        emit({ type: 'completed', peer, role: 'initiator' })
      } else if (message.type === 'share-decline') {
        clearOutgoing(peerId)
        emit({ type: 'declined', peer, reason: message.reason || 'declined' })
      }
    })

    socket.on('error', () => {
      if (outgoing.has(peerId)) {
        clearOutgoing(peerId)
        emit({ type: 'cancelled', peer, reason: 'unreachable' })
      }
    })

    return { ok: true }
  }

  function cancelOutgoing(peerId) {
    const entry = outgoing.get(peerId)
    if (!entry) return { ok: false }
    send(entry.socket, { type: 'share-cancel', deviceId: ownId() })
    clearOutgoing(peerId)
    return { ok: true }
  }

  function close() {
    for (const peerId of [...outgoing.keys()]) clearOutgoing(peerId)
    for (const peerId of [...incoming.keys()]) clearIncoming(peerId)
    if (server) {
      try {
        server.close()
      } catch {
        /* ignore */
      }
      server = null
      serverPort = null
    }
  }

  return {
    ensureServer,
    requestShare,
    acceptIncoming,
    declineIncoming,
    cancelOutgoing,
    close,
    getPort: () => serverPort
  }
}
