// Copyright © 2020-2022 Truestamp Inc. All rights reserved.

import { DateTime } from 'luxon'

import {
  array,
  define,
  enums,
  Infer,
  optional,
  object,
  number,
  string,
} from 'superstruct'

import { SHA1_REGEX, SHA256_REGEX, SIGNATURE_REGEX } from './constants'

// A valid ISO 8601 date string in UTC timezone Z or with no offset +00:00
const iso8601UTC = () =>
  define<string>('iso8601UTC', (value) => {
    try {
      if (typeof value === 'string') {
        if (!value.endsWith('Z') && !value.endsWith('+00:00')) {
          return false
        }

        const d = DateTime.fromISO(value, { zone: 'utc' })
        return d.isValid && d.offsetNameShort === 'UTC'
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

export const sha1Hash = () =>
  define<string>('sha1Hash', (value) => {
    try {
      if (typeof value === 'string') {
        return SHA1_REGEX.test(value)
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

const sha256Hash = () =>
  define<string>('sha1Hash', (value) => {
    try {
      if (typeof value === 'string') {
        return SHA256_REGEX.test(value)
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

const signature = () =>
  define<string>('signature', (value) => {
    try {
      if (typeof value === 'string') {
        return SIGNATURE_REGEX.test(value)
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  })

export const EntryStruct = object({
  entropy: sha256Hash(),
  for: optional(string()),
})

export type Entry = Infer<typeof EntryStruct>

export const EntriesStruct = array(EntryStruct)

export type Entries = Infer<typeof EntriesStruct>

export const JsonFileStruct = object({
  hash: string(),
  hashType: string(),
  name: string(),
})

export type JsonFile = Infer<typeof JsonFileStruct>

export const EntropyStruct = object({
  id: optional(sha1Hash()),
  createdAt: iso8601UTC(),
  files: array(JsonFileStruct),
  hash: sha256Hash(),
  hashIterations: number(),
  hashType: enums(['sha256']),
  prevHash: optional(sha256Hash()),
  signature: optional(signature()),
  forCommit: optional(sha1Hash()),
})

export type Entropy = Infer<typeof EntropyStruct>

export const SignedEntropyStruct = object({
  createdAt: iso8601UTC(),
  files: array(JsonFileStruct),
  hash: sha256Hash(),
  hashIterations: number(),
  hashType: enums(['sha256']),
  prevHash: sha256Hash(),
  signature: signature(),
})

export type SignedEntropy = Infer<typeof SignedEntropyStruct>

export const GetEntriesRespStruct = array(sha256Hash())

export type GetEntriesResp = Infer<typeof GetEntriesRespStruct>
