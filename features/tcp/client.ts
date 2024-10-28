import { pki, tls } from 'node-forge'
import TcpSocket from 'react-native-tcp-socket'

import { assert } from '@/archmage/errors'

import { ArchmageConnectTcpConnection } from './server'

export class ArchmageConnectTcpClient {
  static connect(endpoint: string, certificate: pki.PEM) {
    const [host, port] = endpoint.split(':')
    const socket = TcpSocket.createConnection(
      {
        port: Number(port),
        host,
        reuseAddress: true
      },
      () => {}
    )

    let instance: ArchmageConnectTcpConnection

    const tlsConnection = tls.createConnection({
      server: false,
      verify: function (connection, verified, depth, certs) {
        return verified
      },
      getCertificate(conn: tls.Connection, hint: tls.CertificateRequest | string[]) {
        return certificate
      },
      connected: function (connection) {
        console.log('[tls] connected')
      },
      tlsDataReady: function (connection) {
        // encrypted data is ready to be sent to the server
        const data = connection.tlsData.getBytes()
        socket.write(data, 'binary')
      },
      dataReady: function (connection) {
        // clear data from the server is ready
        const data = connection.data.getBytes()
        instance.receive(Buffer.from(data, 'binary'))
      },
      error: function (connection, error) {
        console.log(`An error occurred: ${error}`)
      },
      closed: function () {}
    })

    socket.on('connect', () => {
      tlsConnection.handshake()
    })

    socket.on('data', function (data) {
      assert(typeof data === 'object')
      tlsConnection.process(data.toString('binary'))
    })

    socket.on('error', function (error) {
      console.log(`An error occurred: ${error}`)
      tlsConnection.close()
    })

    instance = new ArchmageConnectTcpConnection(tlsConnection, socket)
    return instance
  }
}
