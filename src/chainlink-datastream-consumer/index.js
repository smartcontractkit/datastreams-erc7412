import { WebSocket as _WebSocket } from 'ws'
import { AbiCoder } from 'ethers'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import { base16, bytes } from '@scure/base'

const encoder = new TextEncoder()

const WebSocket = _WebSocket || globalThis.WebSocket

class EventEmitter {

    listeners = {}

    on = (event, callback) => {
        this.listeners[event] ??= new Set()
        this.listeners[event].add(callback)
        return this
    }

    off = (event, callback) => {
        if (this.listeners[event]) {
            this.listeners[event].delete(callback)
        }
        return this
    }

    once = (event, callback) => {
        const onceCallback = (...args) => {
            callback(...args)
            this.off(event, onceCallback)
        }
        this.on(event, onceCallback)
        return this
    }

}

export default class LOLSDK extends EventEmitter {

    constructor({
        hostname,
        wsHostname,
        clientID,
        clientSecret,
        feeds
    } = {}) {
        super()
        if (!clientID) throw new Error('Client ID not passed to LOLSDK constructor.')
        Object.assign(this, { hostname, wsHostname, clientID })
        this.setClientSecret(clientSecret)
        this.setConnectedFeeds(feeds)
    }

    // Set and hide secret
    setClientSecret(secret) {
        if (!secret) console.warn('Setting empty client secret.')
        Object.defineProperty(this, 'clientSecret', {
            enumerable: true,
            configurable: true,
            get() {
                return secret
            },
            set(secret) {
                this.setClientSecret(secret)
                return secret
            }
        })
    }

    fetchFeed = ({ timestamp, feed }) => this.fetch('/api/v1/reports', {
        timestamp, feedID: feed,
    }).then(
        Report.fromAPIResponse
    )

    fetchLatestFeedRaw = ({ feed }) => this.fetch('/api/v1/reports/latest', {
        feedID: feed,
    }).then(
        response => {
            if (response.error) throw new Error(response.error)
            return response.report.fullReport
        }
    );

    fetchFeeds = ({ timestamp, feeds }) => this.fetch('/api/v1/reports/bulk', {
        timestamp, feedIDs: feeds.join(','),
    }).then(
        Report.fromBulkAPIResponse
    )

    fetchFeedsRaw = ({ timestamp, feeds }) => this.fetch('/api/v1/reports/bulk', {
        timestamp, feedIDs: feeds.join(','),
    }).then(
        response => {
            if (response.error) throw new Error(response.error)
            const fullRawReports = response.reports.map(report => report.fullReport);
            return fullRawReports
        }
    )

    async fetch(path, params = {}) {
        if (!this.hostname) {
            throw new Error('Hostname was not passed to LOLSDK constructor.')
        }
        const url = new URL(path, `${this.hostname}`)
        url.search = new URLSearchParams(params).toString()
        const headers = this.generateHeaders('GET', path, url.search);
        const response = await fetch(url, { headers });
        const data = await response.json()
        return data
    }

    generateHeaders(method, path, search, timestamp = +new Date()) {
        if (!this.clientID) {
            throw new Error('Client ID was not passed to LOLSDK constructor')
        }
        if (!this.clientSecret) {
            throw new Error('client secret not set')
        }
        if (!search.startsWith('?')) {
            search = `?${search}`
        }
        const signed = [
            method,
            `${path}${search}`,
            base16.encode(sha256.create().update('').digest()).toLowerCase(),
            this.clientID,
            String(timestamp)
        ]
        return {
            'Authorization': this.clientID,
            'X-Authorization-Timestamp': timestamp.toString(),
            'X-Authorization-Signature-SHA256': base16.encode(
                hmac(sha256, encoder.encode(this.clientSecret), signed.join(' '))
            ).toLowerCase()
        }
    }

    disconnect = () => {
        const { ws } = this
        if (ws) {
            ws.off('message', this.decodeAndEmit)
            if (ws.readyState === WebSocket.CONNECTING) {
                ws.on('open', () => ws.close())
            } else if (ws.readyState === WebSocket.OPEN) {
                ws.close()
            }
            this.ws = null
        } else {
            console.warn('Already disconnected.')
        }
    }

    decodeAndEmit = message => {
        if (this.listeners['report']) {
            for (const callback of this.listeners['report']) {
                callback.call(this, Report.fromSocketMessage(message))
            }
        }
    }

    subscribeTo = feeds => {
        if (typeof feeds === 'string') {
            feeds = [feeds]
        }
        for (const feed of new Set(feeds)) {
            if (!this.feeds.has(feed)) {
                return this.setConnectedFeeds([...this.feeds, feeds])
            }
        }
    }

    unsubscribeFrom = feeds => {
        if (typeof feeds === 'string') {
            feeds = [feeds]
        }
        let changed = false
        const updatedFeeds = new Set(this.feeds)
        for (const feed of new Set(feeds)) {
            if (updatedFeeds.has(feed)) {
                updatedFeeds.delete(feed)
                changed = true
            }
        }
        if (changed) {
            return this.setConnectedFeeds(updatedFeeds)
        }
    }

    setConnectedFeeds(feeds) {
        if (!this.wsHostname) {
            throw new Error('WebSocket hostname was not passed to LOLSDK constructor.')
        }
        return new Promise((resolve, reject) => {
            feeds = feeds || []
            const readOnly = () => {
                throw new Error('The set of feeds is read-only; clone it to mutate.')
            }
            feeds = Object.assign(new Set(feeds), {
                add: readOnly, delete: readOnly, clear: readOnly
            })
            if (!this.feeds || !compareSets(this.feeds, feeds)) {
                Object.defineProperty(this, 'feeds', {
                    enumerable: true,
                    configurable: true,
                    get() {
                        return feeds
                    },
                    set(feeds) {
                        this.setConnectedFeeds(feeds)
                        return feeds
                    }
                })
                if (feeds.size < 1) {
                    if (this.ws) this.disconnect()
                    return resolve()
                }
                if (feeds.size > 0) {
                    const path = '/api/v1/ws'
                    const search = new URLSearchParams({ feedIDs: [...feeds].join(',') }).toString()
                    const url = Object.assign(new URL(path, `wss://${this.wsHostname}`), { search })
                    const headers = this.generateHeaders('GET', path, search)
                    if (this.ws) this.disconnect()
                    const ws = this.ws = new WebSocket(url.toString(), { headers })
                    const onerror = error => {
                        unbind()
                        reject(error)
                    }
                    const onopen = () => {
                        unbind()
                        resolve(this.ws)
                    }
                    const unbind = () => {
                        ws.off('error', onerror)
                        ws.off('open', onopen)
                    }
                    ws.on('error', onerror)
                    ws.on('open', onopen)
                    ws.on('message', this.decodeAndEmit)
                }
            }
        })
    }
}

const compareSets = (xs, ys) => xs.size === ys.size && [...xs].every((x) => ys.has(x));

export class Report {

    static fromAPIResponse = response => {
        try {
            if (response.error) throw new Error(response.error)
            const { report } = response
            if (report.fullReport.startsWith('0x')) {
                report.fullReport = this.decodeFullReportHex(report.fullReport)
            } else {
                report.fullReport = this.decodeFullReportBase64(report.fullReport)
            }
            return new this(report)
        } catch (error) {
            const message = `failed to parse API response: ${error.message}`
            console.debug('Report.fromAPIResponse error:', { message, response, error })
            throw Object.assign(new Error(message), { response, error })
        }
    }

    static fromBulkAPIResponse = response => {
        try {
            if (response.error) throw new Error(response.error)
            const reports = {}
            for (let report of response.reports) {
                report = this.fromAPIResponse({ report })
                reports[report.feedId] = report
            }
            return reports
        } catch (error) {
            const message = `failed to parse bulk API response: ${error.message}`
            console.debug('Report.fromBulkAPIResponse error:', { message, response, error })
            throw Object.assign(new Error(message), { response, error })
        }
    }

    static fromSocketMessage = message => {
        try {
            const { report: { feedID, fullReport } } = JSON.parse(message)
            return new this({
                fullReport: this.decodeFullReportHex(fullReport)
            })
        } catch (error) {
            const message = `failed to parse socket message: ${error.message}`
            console.debug('Report.fromSocketMessage error:', { message, response, error })
            throw Object.assign(new Error(message), { response, error })
        }
    }

    static decodeFullReportBase64 = base64String => {
        const decoded = this.decodeABIResponseBase64(this.fullReportAbiSchema, base64String)
        decoded.reportBlob = this.decodeReportBlobHex(decoded.reportBlob)
        return decoded
    }

    static decodeABIResponseBase64 = (schema, data) =>
        this.decodeABIResponseHex(schema, bytes('base64', data))

    static decodeABIResponseHex = (schema, data) => {
        const decoded = AbiCoder.defaultAbiCoder().decode(schema, data)
        if (schema.length !== decoded.length) {
            throw new Error(
                `length of schema (${schema.length}) and decoded data (${decoded.length}) should be equal`
            )
        }
        const result = {}
        for (const index in schema) {
            result[schema[index].name] = decoded[index]
        }
        return result
    }

    static decodeFullReportHex = hexString => {
        const decoded = this.decodeABIResponseHex(this.fullReportAbiSchema, hexString)
        decoded.reportBlob = this.decodeReportBlobHex(decoded.reportBlob)
        return decoded
    }

    static fullReportAbiSchema = [
        { name: "reportContext", type: "bytes32[3]" },
        { name: "reportBlob", type: "bytes" },
        { name: "rawRs", type: "bytes32[]" },
        { name: "rawSs", type: "bytes32[]" },
        { name: "rawVs", type: "bytes32" },
    ]

    static decodeReportBlobHex = hexString => {
        const { feedId } = this.decodeABIResponseHex([{ name: 'feedId', type: 'bytes32' }], hexString)
        const version = this.feedIdToVersion(feedId)
        const decoded = this.decodeABIResponseHex(this.reportBlobAbiSchema[version], hexString)
        return { version, decoded }
    }

    static reportBlobAbiSchema = {
        v1: [
            { name: "feedId", type: "bytes32" },
            { name: "observationsTimestamp", type: "uint32" },
            { name: "benchmarkPrice", type: "int192" },
            { name: "bid", type: "int192" },
            { name: "ask", type: "int192" },
            { name: "currentBlockNum", type: "uint64" },
            { name: "currentBlockHash", type: "bytes32" },
            { name: "validFromBlockNum", type: "uint64" },
            { name: "currentBlockTimestamp", type: "uint64" },
        ],
        v2: [
            { name: "feedId", type: "bytes32" },
            { name: "validFromTimestamp", type: "uint32" },
            { name: "observationsTimestamp", type: "uint32" },
            { name: "nativeFee", type: "uint192" },
            { name: "linkFee", type: "uint192" },
            { name: "expiresAt", type: "uint32" },
            { name: "benchmarkPrice", type: "int192" },
        ],
        v3: [
            { name: "feedId", type: "bytes32" },
            { name: "validFromTimestamp", type: "uint32" },
            { name: "observationsTimestamp", type: "uint32" },
            { name: "nativeFee", type: "uint192" },
            { name: "linkFee", type: "uint192" },
            { name: "expiresAt", type: "uint32" },
            { name: "benchmarkPrice", type: "int192" },
            { name: "bid", type: "int192" },
            { name: "ask", type: "int192" },
        ]
    }

    static feedIdToVersion = feedId => {
        if (!(feedId.startsWith('0x') && feedId.length === 66)) {
            throw Object.assign(new Error(
                'feed ID must be 32 bytes hex string starting with "0x"'
            ), {
                feedId
            })
        }
        if (legacyV1FeedIDs.has(feedId)) {
            return 'v1'
        }
        const decoded = feedId.slice(2).match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
        const version = new DataView(Uint8Array.from(decoded).buffer).getUint16(0)
        switch (version) {
            case 1: return 'v1'
            case 2: return 'v2'
            case 3: return 'v3'
            default: throw new Error(`Unsupported version ${version} from feed ID ${feedId}`)
        }
    }

    constructor({ feedID, validFromTimestamp, observationsTimestamp, fullReport }) {
        const { reportContext, reportBlob: { version, decoded }, rawRs, rawSs, rawVs } = fullReport
        Object.assign(this, {
            validFromTimestamp, observationsTimestamp, reportContext, rawRs, rawSs, rawVs,
        })
        Object.defineProperty(this, 'version', {
            enumerable: false,
            configurable: false,
            get() { return version }
        })
        for (const { name } of Report.reportBlobAbiSchema[this.version]) {
            this[name] = decoded[name]
        }
    }

    get [Symbol.toStringTag]() {
        return this.version
    }

}

export const legacyV1FeedIDs = new Set([

    // Arbitrum mainnet (prod)
    "0xb43dc495134fa357725f93539511c5a4febeadf56e7c29c96566c825094f0b20",
    "0xe65b31c6d5b9bdff43a8194dc5b2edc6914ddbc5e9f9e9521f605fc3738fabf5",
    "0x30f9926cdef3de98995fb38a100d5c582ae025ebbb8f9a931500596ce080280a",
    "0x0f49a4533a64c7f53bfdf5e86d791620d93afdec00cfe1896548397b0f4ec81c",
    "0x2cdd4aea8298f5d2e7f8505b91e3313e3aa04376a81f401b4a48c5aab78ee5cf",
    "0x5f82d154119f4251d83b2a58bf61c9483c84241053038a2883abf16ed4926433",
    "0x74aca63821bf7ead199e924d261d277cbec96d1026ab65267d655c51b4536914",
    "0x64ee16b94fdd72d0b3769955445cc82d6804573c22f0f49b67cd02edd07461e7",
    "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
    "0x297cc1e1ee5fc2f45dff1dd11a46694567904f4dbc596c7cc216d6c688605a1b",

    // Arbitrum mainnet (staging)
    "0x62ce6a99c4bebb150191d7b72f7a0c0206af00baca480ab007caa4b5bf4bf02a",
    "0x984126712e6a8b5b4fe138c49b29483a12e77b5cb3213a0769252380c57480e4",
    "0xb74f650d9cae6259ab4212f76abe746600be3a4926947725ed107943915346c1",
    "0xa0098c4c06cbab05b2598aecad0cbf49d44780c56d40514e09fd7a9e76a2db00",
    "0x2206b467d04656a8a83af43a428d6b66f787162db629f9caed0c12b54a32998e",
    "0x55488e61b59ea629df66698c8eea1390f0aedc24942e074a6d565569fb90afde",
    "0x98d66aab30d62d044cc55ffccb79ae35151348f40ff06a98c92001ed6ec8e886",
    "0x2e768c0eca65d0449ee825b8a921349501339a2487c02146f77611ae01c31a50",
    "0xb29931d9fe1e9fc023b4d2f0f1789c8b5e21aabf389f86f9702241a0178345dd",
    "0xd8b8cfc1e2dd75116e5792d11810d830ef48843fd44e1633385e81157f8da6b5",
    "0x09f8d0caff8cecb7f5e493d4de2ab98b4392f6d07923cd19b2cb524779301b85",
    "0xe645924bbf507304dc4bd37f02c8dac73da3b7eb67378de98cfc59f17ba6774a",

    // Arbitrum testnet (production)
    "0x695be66b6a7979f2b3ed33a3d718eabebaf0a881f1f6598b5530875b7e8150ab",
    "0x259b566b9d3c64d1e4a8656e2d6fd4c08e19f9fa9637ae76d52e428d07cca8e9",
    "0x26c16f2054b7a1d77ae83a0429dace9f3000ba4dbf1690236e8f575742e98f66",
    "0x4254432d5553442d415242495452554d2d544553544e45540000000000000000",
    "0xbf1febc8c335cb236c1995c1007a928a3f7ae8307a1a20cb31334e6d316c62d1",
    "0x4ce52cf28e49f4673198074968aeea280f13b5f897c687eb713bcfc1eeab89ba",
    "0xb21d58dccab05dcea22ab780ca010c4bec34e61ce7310e30f4ad0ff8c1621d27",
    "0x5ad0d18436dd95672e69903efe95bdfb43a05cb55e8965c5af93db8170c8820c",
    "0x4554482d5553442d415242495452554d2d544553544e45540000000000000000",
    "0x14e044f932bb959cc2aa8dc1ba110c09224e639aae00264c1ffc2a0830904a3c",
    "0x555344432d5553442d415242495452554d2d544553544e455400000000000000",
    "0x12be1859ee43f46bab53750915f20855f54e891f88ddd524f26a72d6f4deed1d",

    // Arbitrum testnet (staging)
    "0x8837f28f5172f18071f164b8540fe8c95162dc0051e31005023fadc1cd9c4b50",
    "0xd130b5acd88b47eb7c372611205d5a9ca474829a2719e396ab1eb4f956674e4e",
    "0x6d2f5a4b3ba6c1953b4bb636f6ad03aec01b6222274f8ca1e39e53ee12a8cdf3",
    "0x6962e629c3a0f5b7e3e9294b0c283c9b20f94f1c89c8ba8c1ee4650738f20fb2",
    "0x557b817c6be7392364cef0dd11007c43caea1de78ce42e4f1eadc383e7cb209c",
    "0x3250b5dd9491cb11138048d070b8636c35d96fff29671dc68b0723ad41f53433",
    "0x3781c2691f6980dc66a72c03a32edb769fe05a9c9cb729cd7e96ecfd89450a0a",
    "0xbbbf52c5797cc86d6bd9413d59ec624f07baf5045290ecd5ac6541d5a7ffd234",
    "0xf753e1201d54ac94dfd9334c542562ff7e42993419a661261d010af0cbfd4e34",
    "0x2489ce4577e814d6794218a13ef3c04cac976f991305400a4c0a1ddcffb90357",
    "0xa5b07943b89e2c278fc8a2754e2854316e03cb959f6d323c2d5da218fb6b0ff8",
    "0x1c2c0dfac0eb2aae2c05613f0d677daae164cdd406bd3dd6153d743302ce56e8"

])
