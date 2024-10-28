import { pki, tls } from 'node-forge'
import TcpSocket from 'react-native-tcp-socket'

import { assert } from '@/archmage/errors'

export class ArchmageConnectTcpServer {
  tlsConnections = new Map<number, ArchmageConnectTcpConnection>()

  constructor(private server: TcpSocket.Server) {}

  static listen(address: string, privateKey: pki.PEM, certificate: pki.PEM) {
    const [host, port] = address.split(':')

    let instance: ArchmageConnectTcpServer

    const server = TcpSocket.createServer(function (socket) {
      let conn: ArchmageConnectTcpConnection

      const tlsConnection = tls.createConnection({
        server: true,
        caStore: [pki.certificateFromPem(certificate)], // `certificate` is the root CA
        sessionCache: {},
        // supported cipher suites in order of preference
        cipherSuites: [
          tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
          tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA
        ],
        verifyClient: false,
        connected: function (connection) {
          console.log(`Connected with client ${socket.address()}`)
        },
        getCertificate: function (connection, hint) {
          return certificate
        },
        getPrivateKey: function (connection, cert) {
          return privateKey
        },
        tlsDataReady: function (connection) {
          // TLS data (encrypted) is ready to be sent to the client
          socket.write(connection.tlsData.getBytes())
        },
        dataReady: function (connection) {
          // clear data from the client is ready
          const data = connection.data.getBytes()
          conn.receive(Buffer.from(data, 'binary'))
        },
        error: function (connection, error) {
          console.log(`An error occurred with client ${socket.address()}: ${error}`)
          connection.close()
          instance.tlsConnections.delete(socket._id)
        },
        closed: function (connection) {
          console.log(`Closed connection with client ${socket.address()}`)
          instance.tlsConnections.delete(socket._id)
        }
      })

      conn = new ArchmageConnectTcpConnection(tlsConnection, socket)
      instance.tlsConnections.set(socket._id, conn)

      socket.on('data', (data) => {
        assert(typeof data === 'object')
        tlsConnection.process(data.toString('binary'))
      })

      socket.on('error', (error) => {
        console.log(`An error occurred with client ${socket.address()}: ${error}`)
        tlsConnection.close()
        instance.tlsConnections.delete(socket._id)
      })

      socket.on('close', (error) => {
        console.log(`Closed connection with client ${socket.address()}`)
        instance.tlsConnections.delete(socket._id)
      })
    }).listen({ port: Number(port), host })

    server.on('error', (error) => {
      console.log(`An error occurred with the server: ${error}`)
    })

    server.on('close', () => {
      console.log('Server closed')
    })

    instance = new ArchmageConnectTcpServer(server)
    return instance
  }

  close() {
    this.server.close()
  }
}

export class ArchmageConnectTcpConnection {
  constructor(
    private tlsConnection: tls.Connection,
    private socket: TcpSocket.Socket
  ) {}

  send(data: Buffer) {
    this.tlsConnection.prepare(data.toString('binary'))
  }

  receive(data: Buffer) {}

  close() {
    this.tlsConnection.close()
    this.socket.destroy()
  }
}
