import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim()
  if (!key) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is not set')
  }
  if (key.length !== 64) {
    throw new Error(`CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters), got ${key.length}`)
  }
  return Buffer.from(key, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const payload = {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export function decrypt(encryptedPayload: string): string {
  const key = getKey()
  const payload = JSON.parse(Buffer.from(encryptedPayload, 'base64').toString('utf8'))
  const iv = Buffer.from(payload.iv, 'base64')
  const authTag = Buffer.from(payload.authTag, 'base64')
  const data = Buffer.from(payload.data, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}
