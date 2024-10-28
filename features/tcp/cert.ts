import crypto from 'crypto'
import { useAtom } from 'jotai'
import forge, { pki } from 'node-forge'
import { useCallback, useEffect } from 'react'

import { atomWithSecureLocalStore, storeKey } from '@/archmage/store'

const SELF_SIGNED_CERT_AND_KEY_KEY = storeKey('currentCurrency')
const selfSignedCertAndKey = atomWithSecureLocalStore(
  SELF_SIGNED_CERT_AND_KEY_KEY,
  {} as {
    privateKey?: string
    certificate?: string
  }
)

export function useSelfSignedCertAndKey(): {
  privateKey?: pki.PEM
  certificate?: pki.PEM
  regenerate: () => void
} {
  const [ck, setCk] = useAtom(selfSignedCertAndKey)

  useEffect(() => {
    if (ck?.certificate) {
      const cert = pki.certificateFromPem(ck.certificate)
      const now = new Date()
      if (cert.validity.notBefore > now || +now + 24 * 3600 * 1000 > +cert.validity.notAfter) {
        // invalid or expired, so clear it
        setCk({})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ck])

  const regenerate = useCallback(async () => {
    await setCk(await createSelfSignedCertAndKey())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    privateKey: ck?.privateKey,
    certificate: ck?.certificate,
    regenerate
  }
}

async function createSelfSignedCertAndKey() {
  const keys = await generateKeyPair()
  const cert = createSelfSignedCertificate(keys)
  const privateKeyPerm = pki.privateKeyToPem(keys.privateKey)
  const certPerm = pki.certificateToPem(cert)
  // const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, null)
  // const p12Der = forge.asn1.toDer(p12Asn1).getBytes()
  /*
  const fingerprint = forge.util.encode64(
    pki.getPublicKeyFingerprint(keys.publicKey, {
      type: 'SubjectPublicKeyInfo',
      md: forge.md.sha256.create(),
      encoding: 'binary'
    })
  )
  */

  return {
    privateKey: privateKeyPerm,
    certificate: certPerm
  }
}

async function generateKeyPair(): Promise<pki.rsa.KeyPair> {
  return new Promise((resolve, reject) => {
    pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, keypair) => {
      if (err) {
        reject(err)
      } else {
        resolve(keypair)
      }
    })
  })
}

function createSelfSignedCertificate(keys: pki.rsa.KeyPair): pki.Certificate {
  const cert = pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = crypto.randomUUID().replace(/-/g, '')
  const notBefore = new Date()
  notBefore.setDate(notBefore.getDate() - 1)
  cert.validity.notBefore = notBefore
  const notAfter = new Date()
  notAfter.setFullYear(notAfter.getFullYear() + 1)
  cert.validity.notAfter = notAfter
  const attrs = [
    {
      name: 'commonName',
      value: 'archmage.live'
    },
    {
      name: 'countryName',
      value: 'SG'
    },
    {
      shortName: 'ST',
      value: 'Singapore'
    },
    {
      name: 'localityName',
      value: 'Singapore'
    },
    {
      name: 'organizationName',
      value: 'Archmage'
    },
    {
      shortName: 'OU',
      value: 'Archmage'
    }
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    },
    {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          value: '*.archmage.live'
        },
        {
          type: 7, // IP
          ip: '127.0.0.1'
        },
        {
          type: 7, // IP
          ip: '::1'
        },
        {
          type: 7, // IP
          ip: '0.0.0.0'
        },
        {
          type: 7, // IP
          ip: '::'
        }
      ]
    },
    {
      name: 'subjectKeyIdentifier'
    }
  ])

  // self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return cert
}
